"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Search,
  Check,
  Loader2,
  AlertCircle,
  X,
  Sparkles,
  ArrowLeft,
  ShieldCheck,
  ExternalLink,
  Link2,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useComposio } from "@/lib/composio-store/provider";
import { useToolkitInfo } from "@/lib/composio-store/use-composio";
import { openAuthTab } from "@/lib/composio-store/open-auth-tab";
import type {
  ComposioToolkit,
  ComposioConnection,
} from "@/lib/composio-store/types";
import { ComposioConnectError } from "@/lib/composio-store/types";
import { ToolkitLogo } from "./toolkit-logo";

interface ConnectAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  toolkits?: ComposioToolkit[];
  connections?: ComposioConnection[];
  /** When set, the dialog scrolls to this toolkit and pulses its card. */
  preselectSlug?: string | null;
}

// Signature easing — matches the rest of the app.
const EASE = [0.22, 1, 0.36, 1] as const;

// ── Category buckets ──────────────────────────────────────────────────────
// Composio's catalog returns categories on each toolkit, but they're verbose
// (~30 categories) and many overlap. We coalesce into a small fixed-row set
// matched primarily by slug, with category-name as a fallback signal. Order
// here = display order in the chip row.
const CATEGORY_RULES: Array<{
  id: string;
  label: string;
  labelKey?: string;
  match: RegExp;
}> = [
  { id: "all", label: "All", labelKey: "categories.all", match: /.*/ },
  {
    id: "popular",
    label: "Popular",
    // Synthetic; rendered via FEATURED_SLUGS not this regex.
    match: /^$/,
  },
  {
    id: "communication",
    label: "Communication",
    labelKey: "categories.communication",
    match:
      /(gmail|outlook|slack|discord|telegram|whatsapp|mail|sms|twilio|zoom|teams|webex|signal)/i,
  },
  {
    id: "productivity",
    label: "Productivity",
    labelKey: "categories.productivity",
    match:
      /(notion|google_?drive|google_?docs|google_?sheets|airtable|asana|trello|todoist|linear|jira|monday|clickup|coda|miro|figma|dropbox|onedrive|evernote)/i,
  },
  {
    id: "calendar",
    label: "Calendar",
    labelKey: "categories.calendar",
    match: /(calendar|cal_|calendly|google_?calendar|outlook_?calendar)/i,
  },
  {
    id: "dev",
    label: "Developer",
    labelKey: "categories.developer",
    match:
      /(github|gitlab|bitbucket|vercel|netlify|sentry|datadog|pagerduty|cloudflare|supabase|posthog|render|aws|azure|gcp|stripe|linear)/i,
  },
  {
    id: "crm",
    label: "CRM & Sales",
    labelKey: "categories.crmSales",
    match:
      /(salesforce|hubspot|pipedrive|zoho|copper|attio|close|intercom|drift|outreach|apollo)/i,
  },
];

// Featured slugs prioritized inside the "Popular" view + as a pinned strip.
const FEATURED_SLUGS = [
  "gmail",
  "slack",
  "github",
  "notion",
  "linear",
  "googlecalendar",
  "googledrive",
  "hubspot",
  "discord",
  "figma",
  "calendly",
  "trello",
];

// ── Auth-scheme normalisation ─────────────────────────────────────────────
// The catalog wire format exposes Composio's full auth-scheme vocabulary
// (OAUTH2, OAUTH1, OAUTH1A, API_KEY, BEARER_TOKEN, BASIC, BASIC_WITH_JWT,
// NO_AUTH, GOOGLE_SERVICE_ACCOUNT). The confirm panel only branches on a
// small visual vocabulary, so we collapse the wire value into a `AuthKind`:
//   - All OAuth variants → 'OAUTH' (Composio-managed popup hand-off)
//   - API_KEY → render single `api_key` input
//   - BEARER_TOKEN → render single `token` input
//   - BASIC / BASIC_WITH_JWT → render username + password inputs
//   - NO_AUTH → one-click confirm, no inputs
//   - GOOGLE_SERVICE_ACCOUNT → render single `api_key` input (the user pastes
//     the service-account JSON as one blob; the backend forwards it via
//     credentials.api_key when the scheme is non-canonical)
//
// **Never returns UNKNOWN.** Composio-managed OAuth is *always* preferred
// when the toolkit supports it (the backend sorts auth_schemes so OAuth is
// position 0). When the toolkit only supports non-OAuth schemes, we map to
// the cleanest inline form. When the catalog is silent (both auth_schemes
// and auth_type missing — should not happen in practice, but defensive)
// we default to **OAUTH**: the original Composio-managed behaviour the
// product was built around. The backend's initiate_connection raises an
// actionable error when the toolkit truly cannot do OAuth, so the user
// still gets a real response — never a dead-end "we haven't wired up" UI.
export type AuthKind =
  | "OAUTH"
  | "API_KEY"
  | "BEARER_TOKEN"
  | "BASIC"
  | "NO_AUTH";

function mapSchemeToKind(scheme: string | null | undefined): AuthKind | null {
  const raw = (scheme ?? "").toString().toUpperCase().trim();
  if (!raw) return null;
  if (raw === "OAUTH2" || raw === "OAUTH1" || raw === "OAUTH1A") return "OAUTH";
  if (raw === "API_KEY") return "API_KEY";
  if (raw === "BEARER_TOKEN") return "BEARER_TOKEN";
  if (raw === "BASIC" || raw === "BASIC_WITH_JWT") return "BASIC";
  if (raw === "NO_AUTH") return "NO_AUTH";
  // GOOGLE_SERVICE_ACCOUNT (single JSON blob) is handled as API_KEY at the
  // UX layer — one input, the backend forwards via credentials.api_key.
  if (raw === "GOOGLE_SERVICE_ACCOUNT") return "API_KEY";
  return null;
}

export function authKind(tk: ComposioToolkit | null | undefined): AuthKind {
  // Prefer auth_schemes[0] — the backend sorts so OAuth (Composio-managed)
  // is always first when the toolkit supports it. This matches the product
  // intent: use Composio-managed auth wherever possible; only ask the user
  // for a credential when no OAuth path exists.
  const fromSchemes = (tk?.auth_schemes ?? [])
    .map(mapSchemeToKind)
    .find((k): k is AuthKind => k !== null);
  if (fromSchemes) return fromSchemes;
  // Fall back to the legacy single-value auth_type field.
  const fromLegacy = mapSchemeToKind(tk?.auth_type ?? null);
  if (fromLegacy) return fromLegacy;
  // Final default: OAUTH. The Composio-managed path is the right
  // assumption whenever the catalog doesn't tell us otherwise — that's
  // the behaviour the product was built around. If a toolkit truly
  // cannot do OAuth, the backend's initiate_connection will reject with
  // a specific error and the UI surfaces it. We do NOT default to a
  // credential form here, because asking every user for an API key when
  // the toolkit might actually be OAuth-capable is the regression the
  // user just flagged.
  return "OAUTH";
}

// Returns true when the locally-collected credential shape is non-empty and
// satisfies the minimum-field contract for `kind`. Pure — used by the CTA
// disabled-state and by handleConfirmConnect to short-circuit the POST.
export function credentialsValid(
  kind: AuthKind,
  creds: Record<string, string>,
): boolean {
  switch (kind) {
    case "OAUTH":
      return true;
    case "API_KEY":
      return !!creds.api_key && creds.api_key.trim().length > 0;
    case "BEARER_TOKEN":
      return !!creds.token && creds.token.trim().length > 0;
    case "BASIC":
      return (
        !!creds.username &&
        creds.username.trim().length > 0 &&
        !!creds.password &&
        creds.password.trim().length > 0
      );
    case "NO_AUTH":
      return true;
  }
}

// Shared frozen empty object for `credentials` / `credentialErrors` defaults.
// Frozen so a stray mutation in a downstream consumer fails loudly instead
// of leaking state across confirm sessions.
const EMPTY_CREDS: Record<string, string> = Object.freeze({});

// Help-link map keyed by toolkit slug — used by the API_KEY branch to point
// the user at the exact "where do I find my key" page on the toolkit's
// dashboard. Keys are canonical (lowercase, underscore-normalised) slugs;
// values are absolute, https-only URLs. Add toolkit-specific links here as
// they become a meaningful UX nudge — leave the map sparse otherwise; the
// fallback is "no link", not a broken /undefined navigation.
const API_KEY_HELP_LINKS: Record<string, string> = {
  perplexityai: "https://www.perplexity.ai/account/api/keys",
  openai: "https://platform.openai.com/api-keys",
  anthropic: "https://console.anthropic.com/settings/keys",
  cohere: "https://dashboard.cohere.com/api-keys",
  mistralai: "https://console.mistral.ai/api-keys/",
  deepseek: "https://platform.deepseek.com/api_keys",
};

// Exported for unit testing — see tests/composio-category-match.test.ts.
// Internal callers should treat this as a private helper.
export function inferCategoryMatch(tk: ComposioToolkit, ruleId: string): boolean {
  if (ruleId === "all") return true;
  if (ruleId === "popular") return FEATURED_SLUGS.includes((tk.slug ?? "").toLowerCase());
  const rule = CATEGORY_RULES.find((r) => r.id === ruleId);
  if (!rule) return false;
  if (rule.match.test(tk.slug ?? "")) return true;
  // Defensive: categories may be undefined/null/non-array from older backend
  // versions or malformed catalog data. Treat anything non-array as empty so
  // a single bad entry doesn't crash the dialog.
  const cats = Array.isArray(tk.categories) ? tk.categories : [];
  for (const c of cats) {
    if (typeof c !== "string") continue;
    if (rule.match.test(c)) return true;
  }
  return false;
}

export function ConnectAppDialog({
  open,
  onOpenChange,
  toolkits: toolkitsProp,
  connections: connectionsProp,
  preselectSlug,
}: ConnectAppDialogProps) {
  const t = useTranslations("connections.connectDialog");
  const store = useComposio();
  const toolkits = toolkitsProp ?? store.toolkits;
  const connections = connectionsProp ?? store.connections;
  const startConnect = store.startConnect;
  const storeLoading = store.loading;

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  // Two-step dialog: "browse" the catalogue → "confirm" the chosen app (the
  // Composio + app-logo hand-off screen) → Connect opens a new tab.
  const [view, setView] = useState<"browse" | "confirm">("browse");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Tracks whether the last connect attempt's error is transient (e.g. an
  // upstream Composio outage like the Cloudflare 520 their X/Twitter
  // toolkit currently throws). When true, the inline error pill renders a
  // "Try again" button that re-invokes handleConfirmConnect.
  const [errorRetryable, setErrorRetryable] = useState(false);
  // Set only when the browser blocked the synchronously-opened auth tab; the
  // confirm panel then surfaces a manual "Open authorization" anchor.
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null);
  // Inline credential form state — only populated for non-OAUTH auth kinds.
  // Reset alongside view/selectedSlug on close + on `handleBack` so a fresh
  // confirm screen never inherits a stale half-typed value (also matters
  // for security: secrets must not survive a slug change).
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  // Field-level error map keyed by credential field name (e.g. {api_key:
  // "An API key is required."}). Populated from the local pre-flight
  // validation and from backend `missing_credentials` responses.
  const [credentialErrors, setCredentialErrors] = useState<Record<string, string>>(
    {},
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const preselectCardRef = useRef<HTMLButtonElement>(null);

  // Reset internal state on close so reopen feels fresh.
  useEffect(() => {
    if (!open) {
      setSearch("");
      setCategory("all");
      setSelectedSlug(null);
      setView("browse");
      setError(null);
      setErrorRetryable(false);
      setBlockedUrl(null);
      setConnecting(false);
      setCredentials({});
      setCredentialErrors({});
    }
  }, [open]);

  const selectedToolkitRaw = useMemo(
    () =>
      selectedSlug
        ? toolkits.find((t: ComposioToolkit) => t.slug === selectedSlug) ?? null
        : null,
    [toolkits, selectedSlug],
  );

  // Lazy per-toolkit auth-scheme fetch — only fires on the confirm step
  // for a single toolkit, so it stays out of the browse-grid render path.
  // The catalog's `auth_schemes` field is often empty for non-OAuth
  // toolkits (Perplexity, OpenAI, …) because Composio's lightweight
  // `toolkits.list()` SDK call doesn't always populate it. The lazy
  // backend route calls `get_toolkit_auth_scheme(slug)` which hits the
  // per-toolkit detail endpoint, so the response is authoritative.
  const toolkitInfoSlug =
    view === "confirm" && selectedToolkitRaw ? selectedToolkitRaw.slug : "";
  const toolkitInfo = useToolkitInfo(toolkitInfoSlug);

  // Overlay the lazily-fetched auth scheme info on the catalog snapshot
  // so authKind() reads from the authoritative source whenever the lazy
  // fetch has resolved. We never STRIP catalog-side schemes — only add
  // schemes the catalog didn't surface, so failure modes (network blip,
  // backend 503) gracefully fall back to whatever the catalog knew.
  const selectedToolkit: ComposioToolkit | null = useMemo(() => {
    if (!selectedToolkitRaw) return null;
    const fetched = toolkitInfo.data;
    if (!fetched) return selectedToolkitRaw;
    const fetchedModes = (fetched.authSchemes ?? [])
      .map((s) => (s.mode || "").toString().toUpperCase().trim())
      .filter((m): m is string => m.length > 0);
    const fetchedAuthScheme =
      typeof fetched.authScheme === "string" && fetched.authScheme.trim()
        ? fetched.authScheme.toUpperCase().trim()
        : null;
    const catalogModes = (selectedToolkitRaw.auth_schemes ?? []).map((m) =>
      (m || "").toString().toUpperCase().trim(),
    );
    const merged = [
      ...catalogModes,
      ...fetchedModes.filter((m) => !catalogModes.includes(m)),
    ];
    return {
      ...selectedToolkitRaw,
      // Cast through unknown — the AuthScheme union narrows on string match;
      // any future scheme the SDK adds will still flow through as `string`
      // and the authKind() default catches it.
      auth_schemes: merged as ComposioToolkit["auth_schemes"],
      auth_type:
        (selectedToolkitRaw.auth_type ??
          (fetchedAuthScheme as ComposioToolkit["auth_type"]) ??
          null) || null,
    };
  }, [selectedToolkitRaw, toolkitInfo.data]);

  // When opened with a pre-selected slug, scroll to it once it renders.
  useEffect(() => {
    if (!open || !preselectSlug) return;
    // Wait for the AnimatePresence enter animation to finish before scrolling.
    const id = window.setTimeout(() => {
      preselectCardRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 220);
    return () => window.clearTimeout(id);
  }, [open, preselectSlug]);

  const connectedSet = useMemo(
    () =>
      new Set(
        connections
          .filter(
            (c: ComposioConnection) =>
              c.status === "ACTIVE" || c.status === "INITIATED",
          )
          .map((c: ComposioConnection) =>
            (c.toolkitSlug ?? c.app_slug ?? "").toLowerCase(),
          ),
      ),
    [connections],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = toolkits.filter((t: ComposioToolkit) =>
      inferCategoryMatch(t, category),
    );
    if (q) {
      list = list.filter(
        (t: ComposioToolkit) =>
          t.slug.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          (t.description?.toLowerCase().includes(q) ?? false),
      );
    }
    // Stable, friendly ordering: featured first, then alpha.
    const featuredIdx = (slug: string) => {
      const i = FEATURED_SLUGS.indexOf(slug.toLowerCase());
      return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...list].sort((a, b) => {
      const fa = featuredIdx(a.slug);
      const fb = featuredIdx(b.slug);
      if (fa !== fb) return fa - fb;
      return a.name.localeCompare(b.name);
    });
  }, [toolkits, search, category]);

  // Top showcase: featured toolkits with logos, shown only when not searching
  // and when the "All" category is active (so the strip doesn't fight a
  // narrow filter the user just chose).
  const featured = useMemo(() => {
    if (search.trim() || (category !== "all" && category !== "popular"))
      return [] as ComposioToolkit[];
    const bySlug = new Map(
      toolkits.map((t: ComposioToolkit) => [t.slug.toLowerCase(), t]),
    );
    const picks: ComposioToolkit[] = [];
    for (const slug of FEATURED_SLUGS) {
      const hit = bySlug.get(slug);
      if (hit) picks.push(hit);
      if (picks.length >= 8) break;
    }
    return picks;
  }, [toolkits, search, category]);

  const visibleCategories = useMemo(() => {
    if (toolkits.length === 0) return CATEGORY_RULES.slice(0, 1);
    return CATEGORY_RULES.filter((rule) => {
      if (rule.id === "all" || rule.id === "popular") return true;
      return toolkits.some((t: ComposioToolkit) =>
        inferCategoryMatch(t, rule.id),
      );
    });
  }, [toolkits]);

  // Step 1 — picking an app no longer fires the OAuth flow. It surfaces the
  // in-dialog confirmation screen so the user sees the Composio hand-off
  // before anything opens.
  const handleSelect = (slug: string) => {
    if (connecting) return;
    setSelectedSlug(slug);
    setError(null);
    setErrorRetryable(false);
    setBlockedUrl(null);
    setCredentials({});
    setCredentialErrors({});
    setView("confirm");
  };

  const handleBack = () => {
    if (connecting) return;
    setView("browse");
    setSelectedSlug(null);
    setError(null);
    setErrorRetryable(false);
    setBlockedUrl(null);
    setCredentials({});
    setCredentialErrors({});
  };

  // Step 2 — the confirm screen's "Connect" button. Branches on auth kind:
  //   - OAUTH: synchronously open a blank tab inside the click (so popup
  //     blockers see a genuine user gesture), POST, then point that tab at
  //     the Composio URL. If blocked, fall back to a manual anchor.
  //   - API_KEY / BEARER_TOKEN / BASIC / NO_AUTH: skip the popup entirely,
  //     validate the local credential shape, POST credentials synchronously.
  //     Success → toast + close. Failure → inline error (or field-level
  //     errors if the backend returned `missing_credentials`).
  const handleConfirmConnect = async () => {
    if (connecting || !selectedToolkit) return;
    const kind = authKind(selectedToolkit);

    // Non-OAuth branches first — they skip the popup machinery entirely so a
    // non-OAuth flow never spawns a stray blank tab that the user would have
    // to close manually.
    if (kind !== "OAUTH") {
      // Local pre-flight: surface field-level errors before any roundtrip so
      // the user gets immediate feedback on a missing required field.
      if (!credentialsValid(kind, credentials)) {
        const next: Record<string, string> = {};
        if (kind === "API_KEY" && !credentials.api_key?.trim()) {
          next.api_key = t("errors.failedToStart");
        }
        if (kind === "BEARER_TOKEN" && !credentials.token?.trim()) {
          next.token = t("errors.failedToStart");
        }
        if (kind === "BASIC") {
          if (!credentials.username?.trim()) next.username = t("errors.failedToStart");
          if (!credentials.password?.trim()) next.password = t("errors.failedToStart");
        }
        setCredentialErrors(next);
        return;
      }

      setConnecting(true);
      setError(null);
      setErrorRetryable(false);
      setCredentialErrors({});
      try {
        // `startConnect` will be extended in lib/composio-store/use-composio.ts
        // to accept a second `{ credentials }` argument as part of the
        // multi-auth pipeline; the call is shaped to that contract here so the
        // UI ships with the right signature once the store lands. Until then
        // the call is forward-compatible: extra args are ignored by the
        // current mutationFn.
        const startConnectWithCreds = startConnect as unknown as (
          slug: string,
          extra?: { credentials?: Record<string, string> },
        ) => Promise<{ redirect_url?: string | null }>;
        const payload =
          kind === "NO_AUTH" ? undefined : { credentials };
        const data = await startConnectWithCreds(selectedToolkit.slug, payload);

        // Backend may transitionally still return a redirect_url for non-OAuth
        // kinds (defensive); honour it only if explicitly present and absolute.
        if (data?.redirect_url && /^https:\/\//i.test(data.redirect_url)) {
          window.location.href = data.redirect_url;
          return;
        }
        toast.success(
          t("confirm.title", { name: selectedToolkit.name }),
        );
        onOpenChange(false);
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : t("errors.failedToStart");
        const retryable = err instanceof ComposioConnectError && err.retryable;
        setError(msg);
        setErrorRetryable(retryable);
        toast.error(msg);
      } finally {
        setConnecting(false);
      }
      return;
    }

    // OAUTH branch — preserves the existing synchronously-opened-blank-tab
    // pattern. Any await before openAuthTab() consumes the user-activation
    // and the popup blocker rejects the open.
    setConnecting(true);
    setError(null);
    setErrorRetryable(false);
    setBlockedUrl(null);
    const authTab = openAuthTab();
    try {
      const { redirect_url } = await startConnect(selectedToolkit.slug);
      if (!redirect_url) throw new Error(t("errors.failedToStart"));
      if (authTab.blocked) {
        // Popup blocked — keep the dialog open and let the user click through.
        setBlockedUrl(redirect_url);
      } else {
        authTab.navigate(redirect_url);
        onOpenChange(false);
      }
    } catch (err: unknown) {
      authTab.close();
      const msg =
        err instanceof Error ? err.message : t("errors.failedToStart");
      const retryable = err instanceof ComposioConnectError && err.retryable;
      setError(msg);
      setErrorRetryable(retryable);
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  };

  const isLoading = storeLoading && toolkits.length === 0;
  const isEmpty = !isLoading && filtered.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // Mobile-first flex column: header + scrollable body + sticky footer
        // share the dialog's max-height so nothing ever pokes past the rounded
        // corners. Body uses `flex-1 min-h-0` so it claims the remaining
        // space and gets the overflow rules — never the parent.
        className={cn(
          "p-0 gap-0 overflow-hidden border-border/60",
          "w-[calc(100vw-1rem)] sm:w-full sm:max-w-[640px]",
          "max-h-[92vh] sm:max-h-[85vh]",
          "rounded-2xl",
          "flex flex-col",
        )}
      >
        {view === "confirm" && selectedToolkit ? (
          <ConnectConfirm
            toolkit={selectedToolkit}
            connecting={connecting}
            error={error}
            blockedUrl={blockedUrl}
            credentials={credentials}
            credentialErrors={credentialErrors}
            onCredentialsChange={(next) => {
              setCredentials(next);
              // Clear field errors as the user types — re-validation runs on
              // the next confirm click. Keeps the form from staying angry
              // after the user has obviously fixed the field.
              if (Object.keys(credentialErrors).length > 0) {
                setCredentialErrors({});
              }
            }}
            onConnect={handleConfirmConnect}
            onBack={handleBack}
            onCancel={() => onOpenChange(false)}
            onDismissError={() => {
              setError(null);
              setErrorRetryable(false);
            }}
            onRetry={errorRetryable ? handleConfirmConnect : undefined}
          />
        ) : (
          <>
        {/* ── Glass header (fixed at top) ──────────────────────────────── */}
        <div className="shrink-0 relative px-5 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b border-border/30 dark:border-white/[0.05]">
          {/* Soft sheen on the very top edge — premium chrome cue. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
          />
          <DialogHeader className="space-y-1 text-start">
            <div className="flex items-center gap-2">
              <DialogTitle
                data-testid="connect-dialog-title"
                className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.01em] max-w-[calc(100%-2rem)] truncate"
              >
                {t("title")}
              </DialogTitle>
            </div>
            <DialogDescription className="text-[12.5px] text-muted-foreground/70 leading-snug">
              {t("description")}
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative mt-4">
            <Search
              className="absolute start-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40"
              aria-hidden
            />
            <Input
              ref={inputRef}
              data-testid="connect-dialog-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              autoFocus
              inputMode="search"
              className={cn(
                "ps-9 pe-9 h-10 sm:h-9 rounded-xl text-[13.5px] sm:text-[13px]",
                "border-border/40 focus-visible:border-border/80",
                "bg-background/70",
              )}
            />
            <AnimatePresence>
              {search && (
                <motion.button
                  key="clear"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => {
                    setSearch("");
                    inputRef.current?.focus();
                  }}
                  className="absolute end-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
                  aria-label={t("clearSearchAria")}
                  type="button"
                >
                  <X className="h-3 w-3" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Category chips — horizontal scroll on mobile to avoid wrapping.
              A subtle trailing-edge fade mask reveals scrollability when
              longer localized labels (ar/hu/sv/pl/th crmSales, productivity,
              developer) overflow the visible width. */}
          {visibleCategories.length > 1 && (
            <div
              className={cn(
                "mt-3 -mx-1 flex items-center gap-1.5 overflow-x-auto",
                "scrollbar-invisible scroll-smooth snap-x snap-mandatory",
                "px-1 pb-0.5",
                "[mask-image:linear-gradient(to_right,transparent_0,black_8px,black_calc(100%-24px),transparent_100%)] rtl:[mask-image:linear-gradient(to_left,transparent_0,black_8px,black_calc(100%-24px),transparent_100%)]",
              )}
            >
              {visibleCategories.map((rule) => {
                const active = category === rule.id;
                return (
                  <button
                    key={rule.id}
                    type="button"
                    data-testid={`chips-cat-${rule.id}`}
                    onClick={() => setCategory(rule.id)}
                    className={cn(
                      "relative shrink-0 snap-start px-3 py-1.5 rounded-lg text-[12px] font-medium",
                      "transition-colors duration-200",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                      active
                        ? "text-background"
                        : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.05]",
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="composio-cat-active"
                        className="absolute inset-0 rounded-lg bg-foreground"
                        transition={{ duration: 0.25, ease: EASE }}
                      />
                    )}
                    <span className="relative">
                      {rule.labelKey ? t(rule.labelKey) : rule.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Body — featured carousel + grid ──────────────────────────── */}
        <div
          className={cn(
            "flex-1 min-h-0 overflow-y-auto overflow-x-hidden scrollbar-invisible",
            "px-4 sm:px-5 py-4 sm:py-5",
          )}
        >
          {isLoading ? (
            <ToolkitSkeletonGrid />
          ) : isEmpty ? (
            <EmptyToolkitState query={search} category={category} />
          ) : (
            <>
              {/* Featured strip — only when not searching, "All" category. */}
              {featured.length > 0 && (
                <FeaturedStrip
                  toolkits={featured}
                  connectedSet={connectedSet}
                  onPick={handleSelect}
                  connecting={connecting}
                  selectedSlug={selectedSlug}
                />
              )}

              {/* Section header for the full grid. */}
              {featured.length > 0 && (
                <div className="mt-5 mb-2.5 flex items-center gap-2">
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground/55 [&:lang(zh)]:text-[11.5px] [&:lang(ja)]:text-[11.5px] [&:lang(ko)]:text-[11.5px] [&:lang(zh)]:tracking-[0.08em] [&:lang(ja)]:tracking-[0.08em] [&:lang(ko)]:tracking-[0.08em]">
                    {t("sections.allApps")}
                  </p>
                  <span className="text-[10.5px] tabular-nums text-muted-foreground/40">
                    · {filtered.length}
                  </span>
                </div>
              )}

              <div
                className={cn(
                  "grid gap-2 sm:gap-2.5",
                  "grid-cols-2 sm:grid-cols-3",
                )}
              >
                {filtered.map((tk: ComposioToolkit, i: number) => {
                  const isConnected = connectedSet.has(tk.slug.toLowerCase());
                  const isSelected = selectedSlug === tk.slug;
                  const inFlight = isSelected && connecting;
                  const isPreselected =
                    !!preselectSlug &&
                    tk.slug.toLowerCase() === preselectSlug.toLowerCase();
                  return (
                    <ToolkitCard
                      key={tk.slug}
                      ref={isPreselected ? preselectCardRef : undefined}
                      tk={tk}
                      index={i}
                      isConnected={isConnected}
                      inFlight={inFlight}
                      disabled={isConnected || connecting}
                      highlight={isPreselected}
                      onClick={() => !isConnected && handleSelect(tk.slug)}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* ── Inline error footer (only when present) ──────────────────── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.2 }}
              className="shrink-0 border-t border-red-500/15 bg-red-500/[0.04] px-5 py-3 sm:px-6 flex items-start gap-2"
            >
              <AlertCircle
                className="h-3.5 w-3.5 text-red-500/70 shrink-0 mt-0.5"
                strokeWidth={1.75}
              />
              <p className="text-[12px] text-red-500/80 leading-relaxed flex-1">
                {error}
              </p>
              <button
                onClick={() => setError(null)}
                aria-label="Dismiss error"
                type="button"
                className="h-5 w-5 shrink-0 rounded text-red-500/60 hover:text-red-500 hover:bg-red-500/[0.06] flex items-center justify-center transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Sticky footer (fixed at bottom) ──────────────────────────── */}
        <div
          className={cn(
            "shrink-0 border-t border-border/30 dark:border-white/[0.05]",
            "px-5 py-3 sm:px-6 sm:py-3.5",
            "flex items-center justify-between gap-3",
            "bg-background/60 backdrop-blur-sm",
          )}
        >
          <span
            data-testid="connect-dialog-powered-by"
            className="text-[10.5px] sm:text-[11px] text-muted-foreground/50"
          >
            {t("footer.poweredBy")}
          </span>
          <button
            type="button"
            data-testid="connect-dialog-cancel"
            onClick={() => onOpenChange(false)}
            disabled={connecting}
            className={cn(
              "h-8 px-3.5 rounded-lg text-[12.5px] font-medium whitespace-nowrap",
              "border border-border/40 bg-background/60 text-muted-foreground",
              "hover:bg-foreground/[0.04] hover:text-foreground",
              "transition-colors duration-150",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
            )}
          >
            {t("footer.cancel")}
          </button>
        </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Connect confirmation (the Composio hand-off screen) ─────────────────────
// Shown after the user picks an app, BEFORE anything opens: a focused panel
// that makes the Composio brokerage explicit (app logo ↔ Composio) and then
// either hands off to a NEW TAB (OAUTH) or collects credentials inline
// (API_KEY / BEARER_TOKEN / BASIC / NO_AUTH). Exported for unit testing.
export function ConnectConfirm({
  toolkit,
  connecting,
  error,
  blockedUrl,
  credentials = EMPTY_CREDS,
  credentialErrors = EMPTY_CREDS,
  onCredentialsChange,
  onConnect,
  onBack,
  onCancel,
  onDismissError,
  onRetry,
}: {
  toolkit: ComposioToolkit;
  connecting: boolean;
  error: string | null;
  blockedUrl: string | null;
  /** Controlled credential map; absent props fall back to an empty object
   *  so the (OAUTH-only) callers from older tests/mounts keep working. */
  credentials?: Record<string, string>;
  credentialErrors?: Record<string, string>;
  onCredentialsChange?: (next: Record<string, string>) => void;
  onConnect: () => void;
  onBack: () => void;
  onCancel: () => void;
  onDismissError: () => void;
  /** Provided only when the current error is transient (upstream Composio
   *  outage like the X/Twitter Cloudflare 520). Renders a "Try again"
   *  button next to the dismiss X that re-invokes the connect flow. */
  onRetry?: () => void;
}) {
  const t = useTranslations("connections.connectDialog");
  // Parent-namespace translator for keys shared with the surrounding
  // connections page (e.g. "retry" used by the Try Again button).
  const tConn = useTranslations("connections");
  // next-intl 3.x's translator function exposes a `.has(key)` predicate, but
  // test mocks frequently provide a plain `(key, values) => string` stub.
  // Wrap the check so missing locale keys gracefully fall back to the
  // existing default label without crashing in tests.
  const tHas = (key: string): boolean => {
    const maybeHas = (t as unknown as { has?: (k: string) => boolean }).has;
    if (typeof maybeHas !== "function") return false;
    try {
      return maybeHas.call(t, key);
    } catch {
      return false;
    }
  };
  const kind = authKind(toolkit);
  const helpLink =
    kind === "API_KEY"
      ? API_KEY_HELP_LINKS[toolkit.slug.toLowerCase()] ?? null
      : null;

  // Form helpers — kept inside ConnectConfirm so they close over the
  // controlled `credentials` map and stay GC-eligible when the dialog closes.
  // `onCredentialsChange` is optional so older OAUTH-only call sites keep
  // working without supplying a noop themselves; the form branches that
  // actually need to write credentials are gated on `kind !== "OAUTH"` and
  // are only mounted from the new ConnectAppDialog wiring which always
  // supplies the handler.
  const setField = (name: string, value: string) =>
    onCredentialsChange?.({ ...credentials, [name]: value });

  const ctaDisabled = connecting || !credentialsValid(kind, credentials);

  // Auto-submit on Enter inside the credentials form for non-OAuth kinds —
  // matches the muscle memory of every other "sign in" form. Skip when the
  // CTA is disabled so an incomplete form doesn't fire a noisy validation.
  const onFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!ctaDisabled) onConnect();
  };

  return (
    <div className="flex flex-col" data-testid="connect-confirm" data-auth-kind={kind}>
      {/* Header with back */}
      <div className="shrink-0 relative px-5 pt-4 pb-3 sm:px-6 border-b border-border/30 dark:border-white/[0.05]">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
        />
        <button
          type="button"
          data-testid="connect-confirm-back"
          onClick={onBack}
          disabled={connecting}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg py-1 pe-2 ps-1 text-[12.5px] font-medium",
            "text-muted-foreground hover:text-foreground transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
            "disabled:opacity-50 disabled:cursor-not-allowed",
          )}
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
          {t("confirm.back")}
        </button>
      </div>

      {/* Body — logo hand-off + copy */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-invisible px-6 py-7 sm:py-8 flex flex-col items-center text-center">
        {/* app ↔ Composio. items-start so the fixed-height connector centers
            against the tiles, not the labels hanging below them. */}
        <div className="flex items-start justify-center gap-2 sm:gap-3 mb-6">
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center overflow-hidden rounded-2xl border border-border/50 bg-background/70 shadow-sm backdrop-blur-sm">
              <ToolkitLogo
                src={toolkit.logo_url ?? toolkit.logo ?? null}
                name={toolkit.name}
                size="lg"
                alt={t("card.logoAlt", { name: toolkit.name })}
              />
            </div>
            <span className="max-w-[5rem] truncate text-[10.5px] font-medium text-foreground/70">
              {toolkit.name}
            </span>
          </div>

          <div
            className="flex h-14 sm:h-16 items-center gap-1 text-muted-foreground/35"
            aria-hidden
          >
            <span className="h-px w-3 sm:w-5 bg-gradient-to-r from-transparent to-border" />
            <Link2 className="h-3.5 w-3.5" />
            <span className="h-px w-3 sm:w-5 bg-gradient-to-l from-transparent to-border" />
          </div>

          <div className="flex flex-col items-center gap-1.5">
            <ComposioWordmark />
            <span className="text-[10.5px] font-medium text-foreground/70">
              {t("confirm.composioLabel")}
            </span>
          </div>
        </div>

        <h2
          data-testid="connect-confirm-title"
          className="mb-1.5 text-[18px] sm:text-[19px] font-semibold tracking-[-0.01em]"
        >
          {t("confirm.title", { name: toolkit.name })}
        </h2>
        <p className="max-w-[22rem] text-[12.5px] leading-relaxed text-muted-foreground/75">
          {kind === "NO_AUTH"
            ? tHas("confirm.noAuthHint")
              ? t("confirm.noAuthHint", { name: toolkit.name })
              : t("confirm.subtitle", { name: toolkit.name })
            : t("confirm.subtitle", { name: toolkit.name })}
        </p>

        <div className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-border/40 bg-background/60 px-3 py-1 text-[11px] font-medium text-muted-foreground/70">
          <ShieldCheck
            className="h-3.5 w-3.5 text-emerald-500/70"
            strokeWidth={1.75}
            aria-hidden
          />
          {t("confirm.secured")}
        </div>

        {/* ── Inline credential form (non-OAUTH kinds) ──────────────────
            The form is rendered for every non-OAUTH kind that needs input
            and is animated in alongside the existing hand-off graphics so
            the visual cohesion of the panel survives the branch. NO_AUTH
            renders no inputs (the subtitle copy handles it). Truly novel
            schemes are mapped to API_KEY at the authKind layer, so the
            single-input form is always rendered for anything we don't
            recognise — never a dead-end "manage from dashboard" message. */}
        <AnimatePresence initial={false} mode="wait">
          {kind !== "OAUTH" && kind !== "NO_AUTH" && (
            <motion.form
              key={`credential-form-${kind}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 6 }}
              transition={{ duration: 0.22, ease: EASE }}
              onSubmit={(e) => {
                e.preventDefault();
                if (!ctaDisabled) onConnect();
              }}
              onKeyDown={onFormKeyDown}
              className="mt-5 w-full max-w-[22rem] text-start"
              data-testid="connect-confirm-credential-form"
              // Autofill/password-manager nudges off for inline secret-prompt
              // UX; users paste a single secret, not a saved account login.
              autoComplete="off"
            >
              {kind === "API_KEY" && (
                <CredentialField
                  testId="connect-confirm-field-api-key"
                  name="api_key"
                  label={tHas("confirm.fields.apiKeyLabel") ? t("confirm.fields.apiKeyLabel") : "API key"}
                  placeholder={tHas("confirm.fields.apiKeyPlaceholder") ? t("confirm.fields.apiKeyPlaceholder") : "Paste your API key"}
                  value={credentials.api_key ?? ""}
                  onChange={(v) => setField("api_key", v)}
                  error={credentialErrors.api_key}
                  secret
                  helpText={tHas("confirm.apiKeyHelp") ? t("confirm.apiKeyHelp") : "Where do I find this?"}
                  helpHref={helpLink}
                  revealLabel={tHas("confirm.fields.revealSecret") ? t("confirm.fields.revealSecret") : "Show"}
                  hideLabel={tHas("confirm.fields.hideSecret") ? t("confirm.fields.hideSecret") : "Hide"}
                  autoFocus
                />
              )}

              {kind === "BEARER_TOKEN" && (
                <CredentialField
                  testId="connect-confirm-field-token"
                  name="token"
                  label={tHas("confirm.fields.bearerTokenLabel") ? t("confirm.fields.bearerTokenLabel") : "Bearer token"}
                  placeholder={tHas("confirm.fields.bearerTokenPlaceholder") ? t("confirm.fields.bearerTokenPlaceholder") : "Paste your bearer token"}
                  value={credentials.token ?? ""}
                  onChange={(v) => setField("token", v)}
                  error={credentialErrors.token}
                  secret
                  revealLabel={tHas("confirm.fields.revealSecret") ? t("confirm.fields.revealSecret") : "Show"}
                  hideLabel={tHas("confirm.fields.hideSecret") ? t("confirm.fields.hideSecret") : "Hide"}
                  autoFocus
                />
              )}

              {kind === "BASIC" && (
                <div className="flex flex-col gap-3">
                  <CredentialField
                    testId="connect-confirm-field-username"
                    name="username"
                    label={tHas("confirm.fields.basicAuthUsername") ? t("confirm.fields.basicAuthUsername") : "Username"}
                    placeholder={tHas("confirm.fields.basicAuthUsernamePlaceholder") ? t("confirm.fields.basicAuthUsernamePlaceholder") : "Your account username"}
                    value={credentials.username ?? ""}
                    onChange={(v) => setField("username", v)}
                    error={credentialErrors.username}
                    autoFocus
                  />
                  <CredentialField
                    testId="connect-confirm-field-password"
                    name="password"
                    label={tHas("confirm.fields.basicAuthPassword") ? t("confirm.fields.basicAuthPassword") : "Password"}
                    placeholder={tHas("confirm.fields.basicAuthPasswordPlaceholder") ? t("confirm.fields.basicAuthPasswordPlaceholder") : "Your account password"}
                    value={credentials.password ?? ""}
                    onChange={(v) => setField("password", v)}
                    error={credentialErrors.password}
                    secret
                    revealLabel={tHas("confirm.fields.revealSecret") ? t("confirm.fields.revealSecret") : "Show"}
                    hideLabel={tHas("confirm.fields.hideSecret") ? t("confirm.fields.hideSecret") : "Hide"}
                  />
                </div>
              )}

              {/* Submit button is the footer CTA; we keep a hidden submit so
                  Enter inside any field triggers form submit naturally for
                  assistive tech that depends on it. */}
              <button type="submit" aria-hidden tabIndex={-1} className="sr-only">
                submit
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Popup-blocked fallback — only relevant for OAUTH, where a popup
            blocker can intercept the synchronously-opened tab. Hidden for
            every non-OAUTH kind (which doesn't use a popup at all). */}
        {kind === "OAUTH" && blockedUrl && (
          <div className="mt-5 flex flex-col items-center gap-1.5">
            <a
              href={blockedUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="connect-confirm-manual-link"
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-[12px] font-medium text-amber-700 transition-colors hover:bg-amber-500/[0.1] dark:text-amber-300"
            >
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              {t("confirm.openManually")}
            </a>
            <p className="text-[11px] text-muted-foreground/55">
              {t("confirm.popupBlocked")}
            </p>
          </div>
        )}
      </div>

      {/* Inline error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 border-t border-red-500/15 bg-red-500/[0.04] px-5 py-3 sm:px-6 flex items-start gap-2"
          >
            <AlertCircle
              className="h-3.5 w-3.5 text-red-500/70 shrink-0 mt-0.5"
              strokeWidth={1.75}
            />
            <p
              data-testid="connect-confirm-error"
              className="text-[12px] text-red-500/80 leading-relaxed flex-1"
            >
              {error}
            </p>
            {onRetry && (
              <button
                onClick={onRetry}
                disabled={connecting}
                data-testid="connect-confirm-retry"
                type="button"
                className="shrink-0 rounded-md border border-red-500/25 bg-red-500/5 px-2 py-0.5 text-[11px] font-medium text-red-500/90 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {tConn("retry")}
              </button>
            )}
            <button
              onClick={onDismissError}
              aria-label={t("clearSearchAria")}
              type="button"
              className="h-5 w-5 shrink-0 rounded text-red-500/60 hover:text-red-500 hover:bg-red-500/[0.06] flex items-center justify-center transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer — Cancel + Connect (opens a new tab) */}
      <div
        className={cn(
          "shrink-0 border-t border-border/30 dark:border-white/[0.05]",
          "px-5 py-3 sm:px-6 sm:py-3.5",
          "flex items-center justify-between gap-3",
          "bg-background/60 backdrop-blur-sm",
        )}
      >
        <button
          type="button"
          onClick={onCancel}
          disabled={connecting}
          className={cn(
            "h-8 px-3.5 rounded-lg text-[12.5px] font-medium",
            "border border-border/40 bg-background/60 text-muted-foreground",
            "hover:bg-foreground/[0.04] hover:text-foreground transition-colors duration-150",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
          )}
        >
          {t("footer.cancel")}
        </button>
        <button
          type="button"
          data-testid={
            kind === "OAUTH"
              ? "connect-confirm-cta"
              : "connect-confirm-cta-credentials"
          }
          onClick={onConnect}
          disabled={ctaDisabled}
          className={cn(
            "h-9 px-5 rounded-lg text-[13px] font-medium inline-flex items-center gap-2",
            "bg-foreground text-background hover:bg-foreground/90 transition-colors",
            "disabled:opacity-60 disabled:cursor-not-allowed",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
          )}
        >
          {connecting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : kind === "OAUTH" ? (
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          ) : kind === "NO_AUTH" ? (
            <Link2 className="h-3.5 w-3.5" aria-hidden />
          ) : kind === "BASIC" ? (
            <Lock className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <KeyRound className="h-3.5 w-3.5" aria-hidden />
          )}
          {(() => {
            // CTA label branches by kind, with a fallback chain so a missing
            // locale key never leaves a blank button.
            if (connecting) {
              return tHas("confirm.cta.connecting")
                ? t("confirm.cta.connecting")
                : t("confirm.cta");
            }
            if (kind === "OAUTH") {
              return tHas("confirm.cta.connect")
                ? t("confirm.cta.connect")
                : t("confirm.cta");
            }
            if (kind === "API_KEY") {
              return tHas("confirm.cta.connectWithApiKey")
                ? t("confirm.cta.connectWithApiKey")
                : t("confirm.cta");
            }
            if (kind === "BEARER_TOKEN") {
              return tHas("confirm.cta.connectWithBearerToken")
                ? t("confirm.cta.connectWithBearerToken")
                : t("confirm.cta");
            }
            if (kind === "BASIC") {
              return tHas("confirm.cta.connectWithBasic")
                ? t("confirm.cta.connectWithBasic")
                : t("confirm.cta");
            }
            if (kind === "NO_AUTH") {
              return tHas("confirm.cta.connectNoAuth")
                ? t("confirm.cta.connectNoAuth")
                : t("confirm.cta");
            }
            // Defensive fallback for any future AuthKind variant added
            // without updating this switch. Never reached today because
            // authKind() maps everything to one of the 5 handled kinds.
            return tHas("confirm.cta.connect")
              ? t("confirm.cta.connect")
              : t("confirm.cta");
          })()}
        </button>
      </div>
    </div>
  );
}

// ── CredentialField ─────────────────────────────────────────────────────────
// Single labelled credential input, with optional reveal-toggle for secret
// values and an inline error slot. Mirrors the shadcn `Input` styling and
// keeps autofill/correct/spellcheck off (password-manager nudges are wrong
// for paste-an-API-key flows). All copy is supplied by the caller so the
// component itself is locale-agnostic.
function CredentialField({
  testId,
  name,
  label,
  placeholder,
  value,
  onChange,
  error,
  secret = false,
  helpText,
  helpHref,
  revealLabel = "Show",
  hideLabel = "Hide",
  autoFocus = false,
}: {
  testId: string;
  name: string;
  label: string;
  placeholder?: string;
  value: string;
  onChange: (next: string) => void;
  error?: string;
  secret?: boolean;
  helpText?: string;
  helpHref?: string | null;
  revealLabel?: string;
  hideLabel?: string;
  autoFocus?: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const inputType = secret && !revealed ? "password" : "text";
  const hasError = !!error;
  return (
    <label
      htmlFor={`composio-credential-${name}`}
      className="block text-start"
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11.5px] font-medium text-foreground/80">
          {label}
        </span>
        {helpHref && helpText && (
          <a
            href={helpHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-medium text-foreground/55 hover:text-foreground transition-colors"
          >
            {helpText}
          </a>
        )}
      </div>
      <div className="relative">
        <Input
          id={`composio-credential-${name}`}
          data-testid={testId}
          name={name}
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          // Password-manager hints — they pollute the inline-secret-prompt UX.
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          autoFocus={autoFocus}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? `composio-credential-${name}-error` : undefined}
          className={cn(
            "h-10 rounded-xl text-[13px]",
            "border-border/50 focus-visible:border-border/90 bg-background/70",
            secret && "pe-10",
            hasError && "border-red-500/50 focus-visible:border-red-500/70",
          )}
        />
        {secret && (
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            aria-label={revealed ? hideLabel : revealLabel}
            aria-pressed={revealed}
            className={cn(
              "absolute end-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md",
              "flex items-center justify-center",
              "text-muted-foreground/55 hover:text-foreground hover:bg-foreground/[0.05]",
              "transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
            )}
          >
            {revealed ? (
              <EyeOff className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Eye className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
        )}
      </div>
      {hasError && (
        <p
          id={`composio-credential-${name}-error`}
          data-testid="connect-confirm-credentials-error"
          className="mt-1 text-[11px] text-red-500/85 leading-snug"
        >
          {error}
        </p>
      )}
    </label>
  );
}

// Brand tile for Composio (the auth broker). The official Composio mark is
// inlined (not loaded from a remote asset) so it is deterministic, crisp,
// offline-testable, and — being monochrome — recolored via `currentColor` to
// read cleanly in both light and dark themes.
function ComposioWordmark() {
  return (
    <div
      data-testid="composio-wordmark"
      aria-label="Composio"
      className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-2xl border border-border/50 bg-gradient-to-br from-background/80 to-foreground/[0.04] shadow-sm backdrop-blur-sm"
    >
      <ComposioMark className="h-8 w-8 sm:h-9 sm:w-9 text-foreground/85" />
    </div>
  );
}

// Official Composio logo (source: logos.composio.dev), inlined. `fill`/`stroke`
// are `currentColor` so the mark inherits its colour from the surrounding text
// colour and stays legible across themes.
function ComposioMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M107.693 77.6012L20.3072 84.1247C16.029 84.4282 12.3575 81.0298 12.3575 76.7516V64.554V63.7044V51.5069C12.3575 47.1983 16.029 43.8 20.3072 44.1337L107.693 50.6573C111.971 50.9911 115.642 47.5927 115.642 43.2841V28.6592C115.642 25.7767 113.974 23.1369 111.334 21.9536L73.9522 4.68886C69.0368 2.44354 63.4538 6.02392 63.4538 11.3945V62.7942V65.4036V116.803C63.4538 122.204 69.0368 125.785 73.9522 123.509L111.303 106.275C113.913 105.061 115.612 102.451 115.612 99.5689V84.944C115.642 80.6657 111.971 77.2674 107.693 77.6012Z"
        stroke="currentColor"
        strokeWidth="3.54162"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M115.639 37.1854L45.7607 22.8942C41.179 21.9536 36.8704 25.4733 36.8704 30.146V63.2494V65.0092V98.1126C36.8704 102.785 41.179 106.305 45.7607 105.364L115.639 91.0732"
        stroke="currentColor"
        strokeWidth="3.54162"
        strokeMiterlimit="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M36.7388 80.0987V48.7041C36.7388 47.1712 35.5766 45.8881 34.0512 45.7369L16.374 43.9851C14.6196 43.8113 13.0983 45.1893 13.0983 46.9523V81.532C13.0983 83.2738 14.5849 84.6447 16.3209 84.504L33.9981 83.0707C35.5463 82.9451 36.7388 81.652 36.7388 80.0987Z"
        fill="currentColor"
      />
      <path
        d="M63.574 44.29V28.9518C63.574 27.4869 62.5099 26.239 61.0634 26.0076L41.3911 22.86C39.0618 22.4873 36.9518 24.2866 36.9518 26.6455V42.8026C36.9518 44.3662 38.1597 45.6643 39.7193 45.7766L60.3782 47.264C62.1048 47.3883 63.574 46.0211 63.574 44.29Z"
        fill="currentColor"
      />
      <path
        d="M36.9517 101.581V86.2429C36.9517 84.778 38.0158 83.5301 39.4623 83.2987L59.1346 80.1511C61.4639 79.7784 63.5739 81.5777 63.5739 83.9365V100.094C63.5739 101.657 62.366 102.955 60.8063 103.068L40.1475 104.555C38.4209 104.679 36.9517 103.312 36.9517 101.581Z"
        fill="currentColor"
      />
      <path
        d="M115.541 37.4841L63.5739 26.6223V13.3337C63.5739 7.11171 70.0272 2.9886 75.6731 5.6033L115.541 24.0665V37.4841Z"
        fill="currentColor"
      />
      <path
        d="M115.541 90.5157L63.5739 101.378V114.666C63.5739 120.888 70.0272 125.011 75.6731 122.396L115.541 103.933V90.5157Z"
        fill="currentColor"
      />
    </svg>
  );
}

// ── Featured carousel ───────────────────────────────────────────────────────
// Pinned curated row above the full alphabetical grid. A CSS-keyframe
// marquee that loops seamlessly by duplicating the items and translating
// the track by exactly one set-width (-50%). Pauses on hover/touch so users
// can read or click; respects `prefers-reduced-motion`. Tiles meet the
// dialog edge with a clean cut — no gradient shade.
//
// Speed-by-content: the loop duration scales with the number of items so
// the perceived pixel-per-second velocity stays constant across catalogs
// of different sizes. Empirically ~32px/sec feels elegant.

const MARQUEE_KEYFRAMES = `
  @keyframes composio-marquee {
    from { transform: translate3d(0, 0, 0); }
    to   { transform: translate3d(-50%, 0, 0); }
  }
  @keyframes composio-marquee-rtl {
    from { transform: translate3d(0, 0, 0); }
    to   { transform: translate3d(50%, 0, 0); }
  }
  [dir="rtl"] [data-composio-marquee-track="true"] {
    animation-name: composio-marquee-rtl !important;
  }
`;

// Approximate tile width + gap so duration calibration is content-aware.
// Tile is `w-[72px] sm:w-20` (80px) plus a `gap-2` (8px). We use the
// larger reference (88px) so the perceived speed never exceeds the
// elegant target.
const _CAROUSEL_ITEM_PX = 88;
const _CAROUSEL_SPEED_PX_PER_SEC = 32;

export function _computeMarqueeDuration(itemCount: number): number {
  // Single-set length in pixels; transform target is -50% of the doubled
  // track which equals exactly one set length.
  const trackPx = Math.max(itemCount, 1) * _CAROUSEL_ITEM_PX;
  // Floor at 14s so very short catalogs don't blur; ceil at 90s so the
  // catalog isn't perceived as static for huge sets.
  return Math.min(90, Math.max(14, trackPx / _CAROUSEL_SPEED_PX_PER_SEC));
}

// Exported for unit testing — see tests/composio-featured-carousel.test.tsx.
// Internal callers should treat this as a private helper.
export function FeaturedStrip({
  toolkits,
  connectedSet,
  onPick,
  connecting,
  selectedSlug,
}: {
  toolkits: ComposioToolkit[];
  connectedSet: Set<string>;
  onPick: (slug: string) => void;
  connecting: boolean;
  selectedSlug: string | null;
}) {
  const [paused, setPaused] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Duplicate the items so the loop is seamless. We translate the doubled
  // track by exactly -50%, which lands the second set on the exact frame
  // that the first set started — no perceptible reset.
  const doubled = useMemo(() => [...toolkits, ...toolkits], [toolkits]);
  const duration = useMemo(
    () => _computeMarqueeDuration(toolkits.length),
    [toolkits.length],
  );

  // ── Reduced-motion fallback ────────────────────────────────────────────
  // Render a static grid (no animation) — the SAME items in a 4/8-col grid
  // so the original semantic and visual hierarchy survive.
  if (prefersReducedMotion) {
    return (
      <div>
        <FeaturedHeader />
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {toolkits.map((tk) => {
            const isConnected = connectedSet.has(tk.slug.toLowerCase());
            const isSelected = selectedSlug === tk.slug;
            const inFlight = isSelected && connecting;
            return (
              <FeaturedTile
                key={tk.slug}
                tk={tk}
                isConnected={isConnected}
                inFlight={inFlight}
                disabled={isConnected || connecting}
                onClick={() => !isConnected && onPick(tk.slug)}
              />
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Inject keyframes once. Browsers dedupe identical @keyframes by
          name, so re-mounting the dialog doesn't add cost. */}
      <style>{MARQUEE_KEYFRAMES}</style>

      <FeaturedHeader />

      {/* Negative margins extend the carousel slightly past the dialog body
          padding so the track meets the dialog's actual border. */}
      <div
        className="relative -mx-4 sm:-mx-5 overflow-hidden"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        onTouchCancel={() => setPaused(false)}
        data-testid="composio-featured-carousel"
        data-paused={paused ? "true" : "false"}
      >
        {/* The track. `will-change-transform` hints the compositor; the
            actual transform is driven by a single CSS animation that runs
            on the GPU and pauses cleanly via animation-play-state. */}
        <div
          className="flex w-max gap-2 px-4 sm:px-5 will-change-transform"
          style={{
            animation: `composio-marquee ${duration}s linear infinite`,
            animationPlayState: paused ? "paused" : "running",
          }}
          aria-label="Featured apps"
          role="list"
          data-composio-marquee-track="true"
        >
          {doubled.map((tk, i) => {
            const isConnected = connectedSet.has(tk.slug.toLowerCase());
            const isSelected = selectedSlug === tk.slug;
            const inFlight = isSelected && connecting;
            // Each doubled instance gets a unique key. The second half is
            // marked aria-hidden so screen readers don't see two copies.
            const isClone = i >= toolkits.length;
            return (
              <FeaturedTile
                key={`${tk.slug}-${i}`}
                tk={tk}
                isConnected={isConnected}
                inFlight={inFlight}
                disabled={isConnected || connecting}
                onClick={() => !isConnected && onPick(tk.slug)}
                ariaHidden={isClone}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FeaturedHeader() {
  const t = useTranslations("connections.connectDialog");
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <Sparkles
        className="h-3 w-3 text-foreground/45"
        strokeWidth={2}
        aria-hidden
      />
      <p className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground/55 [&:lang(zh)]:text-[11.5px] [&:lang(ja)]:text-[11.5px] [&:lang(ko)]:text-[11.5px] [&:lang(zh)]:tracking-[0.08em] [&:lang(ja)]:tracking-[0.08em] [&:lang(ko)]:tracking-[0.08em]">
        {t("sections.featured")}
      </p>
    </div>
  );
}

// Single carousel item. Fixed width so the track length is deterministic
// and the keyframe -50% target lines up perfectly with one set.
function FeaturedTile({
  tk,
  isConnected,
  inFlight,
  disabled,
  onClick,
  ariaHidden = false,
}: {
  tk: ComposioToolkit;
  isConnected: boolean;
  inFlight: boolean;
  disabled: boolean;
  onClick: () => void;
  ariaHidden?: boolean;
}) {
  const t = useTranslations("connections.connectDialog");
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={
        isConnected
          ? `${tk.name} — already connected`
          : tk.description || tk.name
      }
      aria-label={
        isConnected ? `${tk.name} already connected` : `Connect ${tk.name}`
      }
      aria-hidden={ariaHidden}
      tabIndex={ariaHidden ? -1 : 0}
      role="listitem"
      className={cn(
        "group relative shrink-0 w-[72px] sm:w-20 aspect-square",
        "rounded-2xl border bg-card/50 backdrop-blur-sm",
        "flex flex-col items-center justify-center gap-1 sm:gap-1.5 p-2",
        "transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        isConnected
          ? "border-emerald-500/30 bg-emerald-500/[0.04]"
          : "border-border/35",
        !disabled &&
          "hover:border-border/80 hover:bg-card hover:scale-[1.04] hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)] active:scale-[0.97]",
        disabled && "cursor-not-allowed",
      )}
    >
      <ToolkitLogo
        src={tk.logo_url ?? tk.logo ?? null}
        name={tk.name}
        size="md"
        alt={t("card.logoAlt", { name: tk.name })}
      />
      <span
        className={cn(
          "text-[11px] sm:text-[11.5px] font-medium line-clamp-1 leading-tight max-w-full px-0.5 truncate",
          isConnected
            ? "text-emerald-700/85 dark:text-emerald-400/85"
            : "text-foreground/70",
        )}
      >
        {tk.name}
      </span>
      {isConnected && (
        <Check
          className="absolute top-1 end-1 h-2.5 w-2.5 text-emerald-500"
          strokeWidth={3}
          aria-hidden
        />
      )}
      {inFlight && (
        <span className="absolute inset-0 rounded-2xl bg-card/85 backdrop-blur-[1px] flex items-center justify-center">
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-foreground/70"
            aria-hidden
          />
        </span>
      )}
    </button>
  );
}

// ── ToolkitCard ─────────────────────────────────────────────────────────────
// Full grid card — used for the main alphabetical list. Larger than featured
// tiles so app names + 1-line descriptions both breathe.

import { forwardRef } from "react";

const ToolkitCard = forwardRef<
  HTMLButtonElement,
  {
    tk: ComposioToolkit;
    index: number;
    isConnected: boolean;
    inFlight: boolean;
    disabled: boolean;
    highlight: boolean;
    onClick: () => void;
  }
>(function ToolkitCard(
  { tk, index, isConnected, inFlight, disabled, highlight, onClick },
  ref,
) {
  const t = useTranslations("connections.connectDialog");
  return (
    <motion.button
      ref={ref}
      type="button"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.25,
        // Stagger lightly for the first ~24 items, flat after that.
        delay: Math.min(index, 24) * 0.012,
        ease: EASE,
      }}
      // Hover lift lives in the className (`hover:-translate-y-0.5`) so
      // Tailwind v4's `@media (hover: hover)` gate prevents it from firing
      // on iOS touch (where a hover-on-tap state causes the dreaded double-
      // tap-to-activate). whileTap stays — it's a tap interaction, not hover.
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      title={
        isConnected
          ? t("card.alreadyConnectedTooltip")
          : tk.description ?? tk.name
      }
      aria-label={isConnected ? `${tk.name} already connected` : `Connect ${tk.name}`}
      className={cn(
        "group relative text-start rounded-xl border bg-card/50 px-3 py-3 sm:px-3.5 sm:py-3.5",
        "transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        "disabled:cursor-not-allowed",
        isConnected
          ? "border-emerald-500/25 bg-emerald-500/[0.025] opacity-80"
          : "border-border/35",
        !disabled &&
          "hover:border-border/80 hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)] hover:bg-card hover:-translate-y-0.5",
        highlight && "ring-2 ring-foreground/15 ring-offset-2 ring-offset-background",
      )}
    >
      <div className="flex items-center gap-2.5 mb-2">
        <div
          className={cn(
            "h-9 w-9 sm:h-10 sm:w-10 rounded-lg border flex items-center justify-center overflow-hidden shrink-0",
            isConnected
              ? "border-emerald-500/30 bg-emerald-500/[0.05]"
              : "border-border/40 bg-background/60",
          )}
        >
          <ToolkitLogo
            src={tk.logo_url ?? tk.logo ?? null}
            name={tk.name}
            size="sm"
            alt={t("card.logoAlt", { name: tk.name })}
          />
        </div>
        <span className="text-[13px] sm:text-[13.5px] font-medium text-foreground truncate flex-1 tracking-[-0.005em]">
          {tk.name}
        </span>
        {isConnected && (
          <Check
            className="h-3.5 w-3.5 text-emerald-500 shrink-0"
            strokeWidth={2.5}
          />
        )}
      </div>
      <p
        className={cn(
          "text-[11.5px] leading-relaxed line-clamp-1",
          isConnected
            ? "text-emerald-700/70 dark:text-emerald-400/70"
            : "text-muted-foreground/60",
        )}
      >
        {isConnected
          ? t("card.connectedLabel")
          : tk.description ||
            t("card.connectFallbackDescription", { name: tk.name })}
      </p>

      {inFlight && (
        <span className="absolute inset-0 rounded-xl bg-card/85 backdrop-blur-[1px] flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-foreground/70" />
        </span>
      )}
    </motion.button>
  );
});

// ── Skeleton + empty subcomponents ──────────────────────────────────────────

function ToolkitSkeletonGrid() {
  return (
    <div className="space-y-5">
      {/* Featured row skeleton */}
      <div>
        <Skeleton className="h-2.5 w-20 mb-2.5 rounded" />
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="aspect-square rounded-2xl border border-border/30 bg-card/30 p-2 flex flex-col items-center justify-center gap-1.5"
            >
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-2 w-3/4 rounded" />
            </div>
          ))}
        </div>
      </div>
      {/* Grid skeleton */}
      <div>
        <Skeleton className="h-2.5 w-16 mb-2.5 rounded" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5">
          {Array.from({ length: 9 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border/30 bg-card/30 px-3 py-3 sm:py-3.5"
            >
              <div className="flex items-center gap-2.5 mb-2">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <Skeleton className="h-3 flex-1 rounded" />
              </div>
              <Skeleton className="h-2.5 w-3/4 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EmptyToolkitState({
  query,
  category,
}: {
  query: string;
  category: string;
}) {
  const t = useTranslations("connections.connectDialog");
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="h-10 w-10 rounded-xl border border-border/40 bg-background/60 flex items-center justify-center mb-3">
        <Search className="h-4 w-4 text-muted-foreground/40" />
      </div>
      <p className="text-[13px] font-medium text-foreground/80 mb-1">
        {query
          ? t("empty.noMatchTitle", { query })
          : category === "all"
            ? t("empty.noAppsTitle")
            : "No apps in this category"}
      </p>
      <p className="text-[11.5px] text-muted-foreground/55 max-w-[300px] leading-relaxed">
        {query
          ? t("empty.noMatchBody")
          : t("empty.noAppsBody")}
      </p>
    </div>
  );
}

// ToolkitLogo lives in ./toolkit-logo so the empty-state and the connect
// dialog can share one primitive and stay in lockstep on logo rendering.
