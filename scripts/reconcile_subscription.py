#!/usr/bin/env python3
"""
Reconcile a Stripe subscription against our DB.  Use this to recover when a
Stripe webhook silently failed (e.g., the 2026-05-26 22:57 UTC NEW-1 42702
incident for sub_1TbEA5Kk9kzNS1Sh6knJJINH).

Pulls truth from Stripe and applies it to our DB via the now-fixed
update_subscription_status RPC.  Falls back to a direct UPDATE in
emergency mode (in case migration 021 has not yet been applied to the
target database).

Usage:
    python scripts/reconcile_subscription.py sub_1TbEA5Kk9kzNS1Sh6knJJINH
    python scripts/reconcile_subscription.py --dry-run sub_xxx
    python scripts/reconcile_subscription.py --all-since 2026-05-26
    python scripts/reconcile_subscription.py --apply-emergency-fallback sub_xxx

Env vars required:
    STRIPE_API_KEY            Stripe secret key (sk_live_... or sk_test_...)
    SUPABASE_URL              https://<project>.supabase.co
    SUPABASE_SERVICE_ROLE     Service-role JWT (RLS bypass)

Exit codes:
    0  success
    1  CLI / env error
    2  Stripe error
    3  Supabase error
    4  Drift detected in --dry-run mode (informational, not failure)
"""

import argparse
import json
import logging
import os
import sys
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional


def _load_dotenv_files() -> None:
    """Load env vars from .env files at the repo root and at backend/.env.

    Falls back to a manual line-by-line parser if python-dotenv is not
    installed, so the script works in any environment without adding a
    hard dependency.  Existing os.environ values are NEVER overridden;
    .env only fills in missing keys.
    """
    here = Path(__file__).resolve().parent
    candidates = [
        here.parent / ".env",            # <repo-root>/.env
        here.parent / "backend" / ".env",  # <repo-root>/backend/.env
        Path.cwd() / ".env",             # current-working-directory .env
    ]
    seen: set[Path] = set()
    for path in candidates:
        if not path.exists() or path in seen:
            continue
        seen.add(path)
        try:
            from dotenv import load_dotenv  # type: ignore
            load_dotenv(path, override=False)
        except ImportError:
            # Fallback parser: KEY=VALUE per line, ignores blanks and
            # # comments.  Quotes around the value are stripped.
            try:
                for line in path.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if not line or line.startswith("#") or "=" not in line:
                        continue
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip().strip("\"").strip("'")
                    if key and key not in os.environ:
                        os.environ[key] = value
            except Exception:
                # Never let .env parsing break the script.
                pass


_load_dotenv_files()

try:
    import stripe
except ImportError as exc:
    sys.stderr.write(
        "ERROR: missing dependency 'stripe'. Install with: pip install stripe\n"
    )
    raise SystemExit(1) from exc

try:
    from supabase import Client, create_client
except ImportError as exc:
    sys.stderr.write(
        "ERROR: missing dependency 'supabase'. Install with: pip install supabase\n"
    )
    raise SystemExit(1) from exc


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("reconcile_subscription")


# Status values for which we treat the subscription as paid.  Must match
# v_paid_set in update_subscription_status (migrations 015, 021).
PAID_STATUS = frozenset({"active", "trialing", "past_due"})

# Stripe subscription events worth replaying in --all-since mode.
REPLAYABLE_EVENT_TYPES = (
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
)


# ---------------------------------------------------------------------------
# Data shapes
# ---------------------------------------------------------------------------


@dataclass
class StripeTruth:
    """Canonical state of a subscription, as Stripe sees it."""

    stripe_subscription_id: str
    status: str
    current_period_start: Optional[datetime]
    current_period_end: Optional[datetime]
    cancel_at_period_end: bool
    stripe_price_id: Optional[str]
    stripe_customer_id: str


@dataclass
class DbState:
    """Our DB's current view of the subscription."""

    user_id: Optional[str]
    status: Optional[str]
    current_period_start: Optional[str]
    current_period_end: Optional[str]
    cancel_at_period_end: Optional[bool]
    subscription_plan_id: Optional[str]
    stripe_customer_id: Optional[str]


# ---------------------------------------------------------------------------
# Env / client setup
# ---------------------------------------------------------------------------


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        log.error("missing required env var: %s", name)
        raise SystemExit(1)
    return value


def _stripe_client() -> None:
    stripe.api_key = _require_env("STRIPE_API_KEY")
    # Pin the API version so behavior is deterministic.  Latest stable as
    # of 2026 is a good default.  Stripe-py respects this attribute.
    stripe.api_version = os.environ.get("STRIPE_API_VERSION", "2025-04-30.basil")


def _supabase_client() -> Client:
    url = _require_env("SUPABASE_URL")
    key = _require_env("SUPABASE_SERVICE_ROLE")
    try:
        return create_client(url, key)
    except Exception as exc:
        log.error("failed to create Supabase client: %s", exc)
        raise SystemExit(3) from exc


# ---------------------------------------------------------------------------
# Stripe truth
# ---------------------------------------------------------------------------


def _sg(obj: Any, *path: Any, default: Any = None) -> Any:
    """Safely traverse a nested Stripe object or dict by string keys.

    Stripe's `StripeObject` is a dict subclass, but its `__getattr__`
    intercepts unknown attributes and raises `AttributeError`, which
    breaks bare `obj.get(...)` calls (`.get` is treated as a missing
    item rather than the dict method).  This helper uses subscript
    access (works for both StripeObject and dict) inside a try/except,
    so we never trip that footgun.

    Examples:
        items = _sg(sub, "items", "data", default=[])
        price_id = _sg(item, "price", "id")
        customer_id = _sg(sub, "customer", "id")
    """
    cur: Any = obj
    for key in path:
        if cur is None:
            return default
        try:
            cur = cur[key]
        except (KeyError, TypeError, AttributeError):
            return default
    return cur if cur is not None else default


def _ts_to_dt(ts: Optional[int]) -> Optional[datetime]:
    if ts is None:
        return None
    return datetime.fromtimestamp(int(ts), tz=timezone.utc)


def fetch_stripe_truth(sub_id: str) -> StripeTruth:
    log.info("fetching Stripe truth for %s", sub_id)
    try:
        sub = stripe.Subscription.retrieve(
            sub_id, expand=["customer", "items.data.price"]
        )
    except stripe.error.StripeError as exc:
        log.error("Stripe API error for %s: %s", sub_id, exc)
        raise SystemExit(2) from exc

    items = _sg(sub, "items", "data", default=[]) or []
    price_id: Optional[str] = _sg(items[0], "price", "id") if items else None

    # `customer` can be expanded (dict-like) or a bare string ID depending
    # on the SDK version and whether expand=["customer"] was honored.
    customer = _sg(sub, "customer")
    if customer is None:
        customer_id = ""
    elif isinstance(customer, str):
        customer_id = customer
    else:
        # StripeObject or dict; subscript-safe via _sg.
        customer_id = _sg(customer, "id", default="") or ""

    return StripeTruth(
        stripe_subscription_id=_sg(sub, "id", default=""),
        status=_sg(sub, "status", default=""),
        current_period_start=_ts_to_dt(_sg(sub, "current_period_start")),
        current_period_end=_ts_to_dt(_sg(sub, "current_period_end")),
        cancel_at_period_end=bool(_sg(sub, "cancel_at_period_end", default=False)),
        stripe_price_id=price_id,
        stripe_customer_id=customer_id,
    )


# ---------------------------------------------------------------------------
# Supabase reads
# ---------------------------------------------------------------------------


def fetch_db_state(sb: Client, sub_id: str) -> DbState:
    log.info("fetching DB state for %s", sub_id)
    try:
        res = (
            sb.table("user_subscriptions")
            .select(
                "user_id,status,current_period_start,current_period_end,"
                "cancel_at_period_end,subscription_plan_id,stripe_customer_id"
            )
            .eq("stripe_subscription_id", sub_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        log.error("Supabase select on user_subscriptions failed: %s", exc)
        raise SystemExit(3) from exc

    rows = res.data or []
    if not rows:
        log.warning("no DB row for stripe_subscription_id=%s", sub_id)
        return DbState(None, None, None, None, None, None, None)

    row = rows[0]
    return DbState(
        user_id=row.get("user_id"),
        status=row.get("status"),
        current_period_start=row.get("current_period_start"),
        current_period_end=row.get("current_period_end"),
        cancel_at_period_end=row.get("cancel_at_period_end"),
        subscription_plan_id=row.get("subscription_plan_id"),
        stripe_customer_id=row.get("stripe_customer_id"),
    )


def resolve_subscription_plan_id(sb: Client, price_id: Optional[str]) -> Optional[str]:
    """Map a Stripe price_id to our subscription_plans.id."""
    if not price_id:
        return None
    try:
        res = (
            sb.table("subscription_plans")
            .select("id,tier,stripe_price_id")
            .eq("stripe_price_id", price_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        log.error("Supabase select on subscription_plans failed: %s", exc)
        raise SystemExit(3) from exc

    rows = res.data or []
    if not rows:
        log.warning("no subscription_plans row for stripe_price_id=%s", price_id)
        return None
    return rows[0]["id"]


def fetch_user_credits(sb: Client, user_id: str) -> dict[str, Any]:
    try:
        res = (
            sb.table("user_credits")
            .select("user_id,balance,has_active_subscription,subscription_tier,updated_at")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return (res.data or [{}])[0]
    except Exception as exc:
        log.error("Supabase select on user_credits failed: %s", exc)
        raise SystemExit(3) from exc


def fetch_machine_limits(sb: Client, user_id: str) -> dict[str, Any]:
    try:
        res = (
            sb.table("machine_limits")
            .select("user_id,tier,updated_at")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return (res.data or [{}])[0]
    except Exception as exc:
        log.error("Supabase select on machine_limits failed: %s", exc)
        raise SystemExit(3) from exc


# ---------------------------------------------------------------------------
# Diff
# ---------------------------------------------------------------------------


def _fmt(value: Any) -> str:
    if value is None:
        return "(null)"
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def render_diff(truth: StripeTruth, db: DbState, target_plan_id: Optional[str]) -> bool:
    """Print a before/after table.  Returns True if any field drifted."""
    rows = [
        ("status", db.status, truth.status),
        (
            "current_period_start",
            db.current_period_start,
            truth.current_period_start,
        ),
        (
            "current_period_end",
            db.current_period_end,
            truth.current_period_end,
        ),
        (
            "cancel_at_period_end",
            db.cancel_at_period_end,
            truth.cancel_at_period_end,
        ),
        (
            "subscription_plan_id",
            db.subscription_plan_id,
            target_plan_id,
        ),
    ]

    width_field = max(len(r[0]) for r in rows)
    width_db = max(len(_fmt(r[1])) for r in rows) + 2
    width_st = max(len(_fmt(r[2])) for r in rows) + 2

    header = (
        f"  {'field'.ljust(width_field)}  "
        f"{'db (current)'.ljust(width_db)}  "
        f"{'stripe (truth)'.ljust(width_st)}  drift"
    )
    print(header)
    print("  " + "-" * (len(header) - 2))

    drifted = False
    for field, db_val, truth_val in rows:
        db_s = _fmt(db_val)
        truth_s = _fmt(truth_val)
        # Compare normalized strings.  This is safe because the DB returns
        # ISO timestamps and Stripe values were converted to datetime above
        # (whose str() form is also ISO).
        is_drift = (
            db_s.rstrip("+00:00").rstrip("Z") != truth_s.rstrip("+00:00").rstrip("Z")
        )
        if is_drift:
            drifted = True
        marker = "DRIFT" if is_drift else "ok"
        print(
            f"  {field.ljust(width_field)}  "
            f"{db_s.ljust(width_db)}  "
            f"{truth_s.ljust(width_st)}  {marker}"
        )
    return drifted


# ---------------------------------------------------------------------------
# Apply
# ---------------------------------------------------------------------------


def apply_via_rpc(
    sb: Client,
    truth: StripeTruth,
    target_plan_id: Optional[str],
) -> dict[str, Any]:
    """Call update_subscription_status RPC with Stripe truth values."""
    log.info("calling update_subscription_status RPC for %s", truth.stripe_subscription_id)
    payload = {
        "p_stripe_subscription_id": truth.stripe_subscription_id,
        "p_status": truth.status,
        "p_period_start": (
            truth.current_period_start.isoformat()
            if truth.current_period_start
            else None
        ),
        "p_period_end": (
            truth.current_period_end.isoformat() if truth.current_period_end else None
        ),
        "p_cancel_at_period_end": truth.cancel_at_period_end,
        "p_subscription_plan_id": target_plan_id,
    }
    try:
        res = sb.rpc("update_subscription_status", payload).execute()
    except Exception as exc:
        log.error("update_subscription_status RPC failed: %s", exc)
        raise SystemExit(3) from exc

    rows = res.data or []
    if not rows:
        log.warning(
            "RPC returned 0 rows. This usually means the subscription is not "
            "in our DB yet. Insert via the standard webhook code path first."
        )
        return {}
    row = rows[0]
    log.info(
        "RPC result: user_id=%s resolved_tier=%s is_paid=%s",
        row.get("out_user_id"),
        row.get("out_resolved_tier"),
        row.get("out_is_paid"),
    )
    return row


def apply_emergency_fallback(
    sb: Client,
    truth: StripeTruth,
    target_plan_id: Optional[str],
) -> None:
    """Bypass the RPC and UPDATE user_subscriptions directly.

    Use ONLY if migration 021 has not yet been applied to the target DB.
    This intentionally does NOT touch user_credits / machine_limits because
    that is the RPC's job and we do not want to half-apply tier changes.
    Operators should re-run without --apply-emergency-fallback as soon as
    migration 021 lands so the credit/tier projections converge.
    """
    log.warning(
        "EMERGENCY FALLBACK: bypassing RPC, writing user_subscriptions directly. "
        "Re-run without --apply-emergency-fallback once migration 021 is applied."
    )
    update_payload: dict[str, Any] = {
        "status": truth.status,
        "cancel_at_period_end": truth.cancel_at_period_end,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if truth.current_period_start is not None:
        update_payload["current_period_start"] = truth.current_period_start.isoformat()
    if truth.current_period_end is not None:
        update_payload["current_period_end"] = truth.current_period_end.isoformat()
    if target_plan_id is not None:
        update_payload["subscription_plan_id"] = target_plan_id
    if truth.status == "canceled":
        # Idempotent: only set on first transition.  Easier to do server-side
        # in SQL, but the supabase-py client does not expose a "COALESCE"
        # primitive.  Read, decide, write.
        try:
            existing = (
                sb.table("user_subscriptions")
                .select("canceled_at")
                .eq("stripe_subscription_id", truth.stripe_subscription_id)
                .limit(1)
                .execute()
            )
            row = (existing.data or [{}])[0]
            if not row.get("canceled_at"):
                update_payload["canceled_at"] = datetime.now(timezone.utc).isoformat()
        except Exception as exc:
            log.error("Supabase select for canceled_at failed: %s", exc)
            raise SystemExit(3) from exc

    try:
        sb.table("user_subscriptions").update(update_payload).eq(
            "stripe_subscription_id", truth.stripe_subscription_id
        ).execute()
    except Exception as exc:
        log.error("Emergency fallback UPDATE failed: %s", exc)
        raise SystemExit(3) from exc

    log.info("Emergency fallback UPDATE applied. user_credits/machine_limits NOT touched.")


# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------


def verify_post_apply(
    sb: Client,
    truth: StripeTruth,
    target_plan_id: Optional[str],
    rpc_result: dict[str, Any],
) -> None:
    user_id = rpc_result.get("out_user_id")
    if not user_id:
        log.warning("RPC returned no user_id; skipping verification step.")
        return

    credits = fetch_user_credits(sb, user_id)
    limits = fetch_machine_limits(sb, user_id)
    db = fetch_db_state(sb, truth.stripe_subscription_id)

    print("\n--- post-apply state ---")
    print(f"  user_id            : {user_id}")
    print(f"  user_subscriptions : status={db.status} plan={db.subscription_plan_id}")
    print(f"  user_credits       : {json.dumps(credits, default=str)}")
    print(f"  machine_limits     : {json.dumps(limits, default=str)}")
    print(f"  rpc result         : {json.dumps(rpc_result, default=str)}")

    expected_is_paid = truth.status in PAID_STATUS
    actual_is_paid = bool(credits.get("has_active_subscription"))
    if expected_is_paid != actual_is_paid:
        log.error(
            "post-apply verification: has_active_subscription mismatch "
            "(expected=%s actual=%s)",
            expected_is_paid,
            actual_is_paid,
        )
        raise SystemExit(3)
    log.info("post-apply verification passed.")


# ---------------------------------------------------------------------------
# Batch mode
# ---------------------------------------------------------------------------


def _iter_events_since(since: datetime) -> Iterable[stripe.Event]:
    since_ts = int(since.timestamp())
    log.info("listing Stripe events since %s (ts=%d)", since.isoformat(), since_ts)
    try:
        for event_type in REPLAYABLE_EVENT_TYPES:
            for event in stripe.Event.list(
                types=[event_type],
                created={"gte": since_ts},
                limit=100,
            ).auto_paging_iter():
                yield event
    except stripe.error.StripeError as exc:
        log.error("Stripe Event.list failed: %s", exc)
        raise SystemExit(2) from exc


def reconcile_all_since(sb: Client, since: datetime, dry_run: bool) -> None:
    seen: set[str] = set()
    count = 0
    for event in _iter_events_since(since):
        sub_id = _sg(event, "data", "object", "id")
        if not sub_id or sub_id in seen:
            continue
        seen.add(sub_id)
        count += 1
        print(
            f"\n=== reconciling {sub_id} "
            f"(event {_sg(event, 'id', default='?')} "
            f"type={_sg(event, 'type', default='?')}) ==="
        )
        try:
            reconcile_one(sb, sub_id, dry_run=dry_run, emergency=False)
        except SystemExit as exc:
            # Do not let one failure abort the batch.  Log and continue.
            log.error("reconcile of %s failed (exit=%s); continuing", sub_id, exc.code)
    log.info("batch reconcile complete: %d unique subscriptions processed", count)


# ---------------------------------------------------------------------------
# Single-subscription driver
# ---------------------------------------------------------------------------


def reconcile_one(
    sb: Client, sub_id: str, dry_run: bool, emergency: bool
) -> None:
    truth = fetch_stripe_truth(sub_id)
    db = fetch_db_state(sb, sub_id)
    target_plan_id = resolve_subscription_plan_id(sb, truth.stripe_price_id)

    print(f"\nReconciling {sub_id}")
    print(f"  stripe customer    : {truth.stripe_customer_id}")
    print(f"  stripe price_id    : {truth.stripe_price_id}")
    print(f"  target plan id     : {target_plan_id}")
    print(f"  db.user_id         : {db.user_id}")
    print()
    drifted = render_diff(truth, db, target_plan_id)

    if not drifted:
        print("\nNo drift. Nothing to do.")
        return

    if dry_run:
        print("\n--dry-run set. Stopping before write.")
        # Non-zero so CI can detect drift in scheduled jobs.
        raise SystemExit(4)

    if emergency:
        apply_emergency_fallback(sb, truth, target_plan_id)
        return

    rpc_result = apply_via_rpc(sb, truth, target_plan_id)
    verify_post_apply(sb, truth, target_plan_id, rpc_result)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_iso_date(s: str) -> datetime:
    # Accept "YYYY-MM-DD" or full ISO timestamp.  Always UTC.
    try:
        if len(s) == 10:
            return datetime.strptime(s, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"invalid date {s!r}: {exc}") from exc


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Reconcile a Stripe subscription against our DB. "
            "Reads truth from Stripe, applies via update_subscription_status RPC."
        )
    )
    parser.add_argument(
        "subscription_id",
        nargs="?",
        help="Stripe subscription id (e.g., sub_1TbEA5Kk9kzNS1Sh6knJJINH).",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print diff only. Do not write.",
    )
    parser.add_argument(
        "--all-since",
        type=_parse_iso_date,
        metavar="YYYY-MM-DD",
        help=(
            "Reconcile every Stripe subscription touched by an event since "
            "the given UTC date. Ignores subscription_id."
        ),
    )
    parser.add_argument(
        "--apply-emergency-fallback",
        action="store_true",
        help=(
            "Bypass the RPC and UPDATE user_subscriptions directly. "
            "Use ONLY if migration 021 has not yet been applied."
        ),
    )
    args = parser.parse_args(argv)

    if not args.all_since and not args.subscription_id:
        parser.error("either subscription_id or --all-since is required")

    if args.all_since and args.apply_emergency_fallback:
        parser.error("--apply-emergency-fallback is not supported in batch mode")

    _stripe_client()
    sb = _supabase_client()

    if args.all_since:
        reconcile_all_since(sb, args.all_since, dry_run=args.dry_run)
        return 0

    reconcile_one(
        sb,
        args.subscription_id,
        dry_run=args.dry_run,
        emergency=args.apply_emergency_fallback,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
