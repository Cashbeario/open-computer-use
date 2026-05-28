#!/usr/bin/env python3
"""
deploy_readiness.py — check whether it's safe to deploy llmhub right now.

Reads CloudWatch + EC2 + ALB state to estimate active user sessions across:
  * SSE chat streams (long-lived ALB connections to llmhub-sse-tg)
  * WebSocket Electron / VM-control bridge (llmhub-ws-tg)
  * Public frontend (llmhub-tg)
  * API requests (llmhub-api-tg)
  * Running EC2 project instances (active VM automation sessions)

Prints a verdict and exits:
    0  SAFE     no active streams, deploy now
    1  WAIT     low activity, deploy in <2 min or watch
    2  ACTIVE   live chats or agent sessions in flight, do not deploy

Usage:
    python scripts/deploy_readiness.py
    python scripts/deploy_readiness.py --watch          # poll every 30s until SAFE
    python scripts/deploy_readiness.py --watch --interval 15
    python scripts/deploy_readiness.py --json           # machine-readable output
    python scripts/deploy_readiness.py --quiet          # only print verdict

Env vars (all optional, sensible defaults):
    AWS_REGION                  default us-east-1
    AWS_PROFILE                 standard boto3 resolution
    LLMHUB_ALB_NAME             default llmhub-alb
    LLMHUB_VM_TAG_KEY           default Project
    LLMHUB_VM_TAG_VALUE         default coasty (or override)

Exit codes are designed for CI scripting:
    if python scripts/deploy_readiness.py --quiet; then
        # SAFE: deploy
    fi
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass, asdict, field
from datetime import datetime, timedelta, timezone
from typing import Optional

try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
except ImportError:
    print("boto3 not installed. pip install boto3", file=sys.stderr)
    sys.exit(3)


REGION = os.environ.get("AWS_REGION", "us-east-1")
ALB_NAME = os.environ.get("LLMHUB_ALB_NAME", "llmhub-alb")
VM_TAG_KEY = os.environ.get("LLMHUB_VM_TAG_KEY", "Project")
VM_TAG_VALUE = os.environ.get("LLMHUB_VM_TAG_VALUE", "coasty")

# Target groups we care about. Keys are logical roles; values are the
# substring(s) we search for in TG name. The SSE TG is the deploy-safety
# critical one because mid-stream gunicorn kills break user chats.
TG_ROLE_MATCHERS: dict[str, list[str]] = {
    "sse":      ["llmhub-sse"],
    "ws":       ["llmhub-ws"],
    "api":      ["llmhub-api"],
    "frontend": ["llmhub-tg"],  # legacy public frontend
}


@dataclass
class TGStats:
    name: str
    arn_suffix: str
    request_count_60s: float = 0.0
    new_connection_count_60s: float = 0.0
    target_response_time_p95: float = 0.0
    healthy_target_count: int = 0


@dataclass
class Readiness:
    timestamp_utc: str
    alb_active_connections: float
    alb_new_connections_60s: float
    tg_stats: dict[str, TGStats] = field(default_factory=dict)
    running_vm_count: int = 0
    verdict: str = "UNKNOWN"
    reasons: list[str] = field(default_factory=list)

    def to_json(self) -> str:
        out = asdict(self)
        # dataclasses-in-dict are already serialized by asdict.
        return json.dumps(out, indent=2, default=str)


# -----------------------------------------------------------------------------
# AWS clients
# -----------------------------------------------------------------------------

def _clients() -> tuple:
    session = boto3.session.Session(region_name=REGION)
    return (
        session.client("cloudwatch"),
        session.client("elbv2"),
        session.client("ec2"),
    )


# -----------------------------------------------------------------------------
# ALB discovery
# -----------------------------------------------------------------------------

def discover_alb_and_tgs(elbv2) -> tuple[str, str, dict[str, TGStats]]:
    """Return (lb_arn, lb_arn_suffix, {role -> TGStats}).

    arn_suffix is the trailing token used by AWS/ApplicationELB metrics
    (e.g. app/llmhub-alb/c4fa15daf859f876).
    """
    lbs = elbv2.describe_load_balancers(Names=[ALB_NAME])["LoadBalancers"]
    if not lbs:
        raise RuntimeError(f"ALB {ALB_NAME!r} not found in {REGION}")
    lb = lbs[0]
    lb_arn = lb["LoadBalancerArn"]
    # arn_suffix is everything after :loadbalancer/
    lb_arn_suffix = lb_arn.split(":loadbalancer/")[-1]

    # All TGs attached to this LB (paginated to be safe)
    tgs: list[dict] = []
    paginator = elbv2.get_paginator("describe_target_groups")
    for page in paginator.paginate(LoadBalancerArn=lb_arn):
        tgs.extend(page["TargetGroups"])

    role_to_tg: dict[str, TGStats] = {}
    for role, needles in TG_ROLE_MATCHERS.items():
        for tg in tgs:
            name = tg["TargetGroupName"]
            if any(n in name for n in needles):
                arn = tg["TargetGroupArn"]
                arn_suffix = arn.split(":targetgroup/")[-1]
                role_to_tg[role] = TGStats(name=name, arn_suffix=arn_suffix)
                break

    return lb_arn, lb_arn_suffix, role_to_tg


# -----------------------------------------------------------------------------
# CloudWatch metric helpers
# -----------------------------------------------------------------------------

# CloudWatch ApplicationELB metrics have ~60-120s publish lag. We pull a
# wider window (240s) at Period=60 and use the MAX across the most recent
# 2 datapoints, so "did any minute in the last ~2 min have activity" is
# the question we answer — robust against the dead-zone at the leading edge.
_METRIC_WINDOW_SECONDS = 240
_LOOKBACK_DATAPOINTS = 2


def _recent_max(cw, namespace: str, metric: str, dims: list[dict],
                stat: str = "Sum") -> float:
    end = datetime.now(timezone.utc)
    start = end - timedelta(seconds=_METRIC_WINDOW_SECONDS)
    kwargs: dict = dict(
        Namespace=namespace, MetricName=metric, Dimensions=dims,
        StartTime=start, EndTime=end, Period=60,
    )
    if stat == "p95":
        kwargs["ExtendedStatistics"] = ["p95"]
    else:
        kwargs["Statistics"] = [stat]
    resp = cw.get_metric_statistics(**kwargs)
    pts = sorted(resp.get("Datapoints", []), key=lambda p: p["Timestamp"])
    recent = pts[-_LOOKBACK_DATAPOINTS:]
    if not recent:
        return 0.0
    if stat == "p95":
        return max(float(p["ExtendedStatistics"]["p95"]) for p in recent)
    return max(float(p[stat]) for p in recent)


# -----------------------------------------------------------------------------
# Sampling
# -----------------------------------------------------------------------------

def collect(quiet: bool = False) -> Readiness:
    cw, elbv2, ec2 = _clients()

    lb_arn, lb_arn_suffix, tg_stats = discover_alb_and_tgs(elbv2)
    if not quiet:
        print(f"[discover] ALB {lb_arn_suffix}")
        for role, s in tg_stats.items():
            print(f"[discover]   {role:<8} -> {s.name}")

    # LB-level: live long-running connections.
    lb_dims = [{"Name": "LoadBalancer", "Value": lb_arn_suffix}]
    active_conns = _recent_max(cw, "AWS/ApplicationELB", "ActiveConnectionCount",
                               lb_dims, stat="Average")
    new_conns = _recent_max(cw, "AWS/ApplicationELB", "NewConnectionCount",
                            lb_dims, stat="Sum")

    # Per-TG signals.
    for role, s in tg_stats.items():
        dims = [
            {"Name": "TargetGroup",  "Value": s.arn_suffix},
            {"Name": "LoadBalancer", "Value": lb_arn_suffix},
        ]
        s.request_count_60s = _recent_max(
            cw, "AWS/ApplicationELB", "RequestCount", dims, stat="Sum"
        )
        s.new_connection_count_60s = _recent_max(
            cw, "AWS/ApplicationELB", "NewConnectionCount", dims, stat="Sum"
        )
        try:
            s.target_response_time_p95 = _recent_max(
                cw, "AWS/ApplicationELB", "TargetResponseTime", dims, stat="p95"
            )
        except (BotoCoreError, ClientError):
            s.target_response_time_p95 = 0.0
        try:
            health = elbv2.describe_target_health(
                TargetGroupArn=(
                    f"arn:aws:elasticloadbalancing:{REGION}:"
                    f"{boto3.client('sts').get_caller_identity()['Account']}:"
                    f"targetgroup/{s.arn_suffix}"
                )
            )
            s.healthy_target_count = sum(
                1 for t in health["TargetHealthDescriptions"]
                if t["TargetHealth"]["State"] == "healthy"
            )
        except (BotoCoreError, ClientError, KeyError):
            s.healthy_target_count = 0

    # Active VM count (running EC2 instances tagged for this project).
    running_vms = 0
    try:
        paginator = ec2.get_paginator("describe_instances")
        for page in paginator.paginate(
            Filters=[
                {"Name": "instance-state-name", "Values": ["running"]},
                {"Name": f"tag:{VM_TAG_KEY}",   "Values": [VM_TAG_VALUE]},
            ]
        ):
            for r in page["Reservations"]:
                running_vms += len(r["Instances"])
    except (BotoCoreError, ClientError):
        running_vms = -1  # signal: tag query failed, ignore for verdict

    r = Readiness(
        timestamp_utc=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        alb_active_connections=active_conns,
        alb_new_connections_60s=new_conns,
        tg_stats=tg_stats,
        running_vm_count=running_vms,
    )
    r.verdict, r.reasons = _verdict(r)
    return r


# -----------------------------------------------------------------------------
# Verdict logic
# -----------------------------------------------------------------------------

# Thresholds tuned for a low-traffic SaaS where avg is ~40 RPS aggregate and
# SSE streams typically last 30-120s. Override via env if your steady-state
# differs.
SSE_BUSY_REQ_60S       = float(os.environ.get("DEPLOY_SSE_BUSY_REQ_60S",      "3"))
SSE_BUSY_NEW_CONN_60S  = float(os.environ.get("DEPLOY_SSE_BUSY_NEW_CONN_60S", "2"))
WS_BUSY_NEW_CONN_60S   = float(os.environ.get("DEPLOY_WS_BUSY_NEW_CONN_60S",  "5"))
API_QUIET_REQ_60S      = float(os.environ.get("DEPLOY_API_QUIET_REQ_60S",     "20"))
ALB_ACTIVE_QUIET       = float(os.environ.get("DEPLOY_ALB_ACTIVE_QUIET",      "10"))
VM_RUNNING_TOLERATED   = int(os.environ.get("DEPLOY_VM_RUNNING_TOLERATED",    "0"))


def _verdict(r: Readiness) -> tuple[str, list[str]]:
    """Three-state verdict.

    Per-TG request/connection counts are the primary signal because ALB-level
    ActiveConnectionCount can sit at 20-40 indefinitely (Cloudflare proxy
    keepalives) without any actual user traffic. We only consider the
    LB-level count as a tiebreaker when per-TG signals are also non-zero.
    """
    reasons: list[str] = []

    sse = r.tg_stats.get("sse")
    ws = r.tg_stats.get("ws")
    api = r.tg_stats.get("api")
    frontend = r.tg_stats.get("frontend")

    # ACTIVE — do not deploy.
    if sse and sse.request_count_60s >= SSE_BUSY_REQ_60S:
        reasons.append(
            f"SSE TG handled {sse.request_count_60s:.0f} req/min "
            f"(threshold {SSE_BUSY_REQ_60S:.0f}) — likely in-flight chat streams"
        )
    if sse and sse.new_connection_count_60s >= SSE_BUSY_NEW_CONN_60S:
        reasons.append(
            f"SSE TG opened {sse.new_connection_count_60s:.0f} new conns/min "
            f"(threshold {SSE_BUSY_NEW_CONN_60S:.0f})"
        )
    if ws and ws.new_connection_count_60s >= WS_BUSY_NEW_CONN_60S:
        reasons.append(
            f"WS TG opened {ws.new_connection_count_60s:.0f} new conns/min "
            f"(threshold {WS_BUSY_NEW_CONN_60S:.0f}) — agent bridges connecting"
        )
    if r.running_vm_count > VM_RUNNING_TOLERATED:
        reasons.append(
            f"{r.running_vm_count} project-tagged EC2 VMs running "
            f"(tolerated {VM_RUNNING_TOLERATED}) — active agent sessions"
        )

    if reasons:
        return "ACTIVE", reasons

    # WAIT — light activity, watch a moment. Driven by per-TG signals.
    soft_reasons: list[str] = []
    if sse and 0 < sse.request_count_60s < SSE_BUSY_REQ_60S:
        soft_reasons.append(
            f"SSE TG has {sse.request_count_60s:.0f} req/min (below busy "
            f"threshold but non-zero — a chat may be finishing)"
        )
    if api and api.request_count_60s >= API_QUIET_REQ_60S:
        soft_reasons.append(
            f"API TG saw {api.request_count_60s:.0f} req/min "
            f"(quiet threshold {API_QUIET_REQ_60S:.0f})"
        )
    if frontend and frontend.request_count_60s >= API_QUIET_REQ_60S:
        soft_reasons.append(
            f"Frontend TG saw {frontend.request_count_60s:.0f} req/min "
            f"(quiet threshold {API_QUIET_REQ_60S:.0f})"
        )

    if soft_reasons:
        return "WAIT", soft_reasons

    # SAFE — all per-TG signals quiet. LB-level ActiveConnectionCount is
    # noted for context (Cloudflare/CDN keepalives often sit at 20-50) but
    # is not a deploy blocker on its own.
    note = "no per-TG activity detected"
    if r.alb_active_connections >= ALB_ACTIVE_QUIET:
        note += (
            f" (ALB has {r.alb_active_connections:.0f} idle keepalives, "
            f"benign without per-TG traffic)"
        )
    return "SAFE", [note]


# -----------------------------------------------------------------------------
# Rendering
# -----------------------------------------------------------------------------

def _render_human(r: Readiness) -> str:
    lines: list[str] = []
    lines.append(f"=== Deploy readiness @ {r.timestamp_utc} ===")
    lines.append(
        f"ALB:  active_conns_avg={r.alb_active_connections:.1f}  "
        f"new_conns_60s={r.alb_new_connections_60s:.0f}"
    )
    for role in ("sse", "ws", "api", "frontend"):
        s = r.tg_stats.get(role)
        if not s:
            lines.append(f"  {role:<8} -> (TG not found)")
            continue
        lines.append(
            f"  {role:<8} -> req/60s={s.request_count_60s:>5.0f}  "
            f"new_conn/60s={s.new_connection_count_60s:>4.0f}  "
            f"p95_rt={s.target_response_time_p95:>5.2f}s  "
            f"healthy={s.healthy_target_count}  ({s.name})"
        )
    if r.running_vm_count >= 0:
        lines.append(f"VMs:  running={r.running_vm_count}")
    else:
        lines.append("VMs:  running=? (tag query failed)")

    icon = {"SAFE": "OK", "WAIT": "..", "ACTIVE": "!!"}.get(r.verdict, "??")
    lines.append("")
    lines.append(f"[{icon}] VERDICT: {r.verdict}")
    for why in r.reasons:
        lines.append(f"     - {why}")
    return "\n".join(lines)


# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------

EXIT_CODE = {"SAFE": 0, "WAIT": 1, "ACTIVE": 2}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--watch",    action="store_true", help="Poll until verdict is SAFE")
    ap.add_argument("--interval", type=int, default=30, help="Watch poll interval seconds (default 30)")
    ap.add_argument("--json",     action="store_true", help="Emit JSON instead of human output")
    ap.add_argument("--quiet",    action="store_true", help="Print only the verdict line")
    args = ap.parse_args()

    try:
        while True:
            r = collect(quiet=args.quiet or args.json)

            if args.json:
                print(r.to_json())
            elif args.quiet:
                print(r.verdict)
            else:
                print(_render_human(r))

            if not args.watch or r.verdict == "SAFE":
                return EXIT_CODE.get(r.verdict, 1)

            if not args.json and not args.quiet:
                print(f"\n[watch] sleeping {args.interval}s...\n")
            time.sleep(args.interval)

    except KeyboardInterrupt:
        print("\n[watch] interrupted", file=sys.stderr)
        return 130
    except (BotoCoreError, ClientError) as e:
        print(f"AWS error: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    sys.exit(main())
