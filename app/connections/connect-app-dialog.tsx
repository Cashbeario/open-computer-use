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
import type {
  ComposioToolkit,
  ComposioConnection,
} from "@/lib/composio-store/types";
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
  const connect = store.connect;
  const storeLoading = store.loading;

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const preselectCardRef = useRef<HTMLButtonElement>(null);

  // Reset internal state on close so reopen feels fresh.
  useEffect(() => {
    if (!open) {
      setSearch("");
      setCategory("all");
      setSelectedSlug(null);
      setError(null);
      setConnecting(false);
    }
  }, [open]);

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

  const handleConnect = async (slug: string) => {
    if (connecting) return;
    setSelectedSlug(slug);
    setConnecting(true);
    setError(null);
    try {
      await connect(slug);
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : t("errors.failedToStart");
      setError(msg);
      toast.error(msg);
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
        {/* ── Glass header (fixed at top) ──────────────────────────────── */}
        <div className="shrink-0 relative px-5 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b border-border/30 dark:border-white/[0.05]">
          {/* Soft sheen on the very top edge — premium chrome cue. */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
          />
          <DialogHeader className="space-y-1 text-left">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-[17px] sm:text-[18px] font-semibold tracking-[-0.01em]">
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
              className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40"
              aria-hidden
            />
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              autoFocus
              inputMode="search"
              className={cn(
                "pl-9 pr-9 h-10 sm:h-9 rounded-xl text-[13.5px] sm:text-[13px]",
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-foreground/[0.05] transition-colors"
                  aria-label={t("clearSearchAria")}
                  type="button"
                >
                  <X className="h-3 w-3" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Category chips — horizontal scroll on mobile to avoid wrapping. */}
          {visibleCategories.length > 1 && (
            <div
              className={cn(
                "mt-3 -mx-1 flex items-center gap-1.5 overflow-x-auto",
                "scrollbar-invisible scroll-smooth snap-x snap-mandatory",
                "px-1 pb-0.5",
              )}
            >
              {visibleCategories.map((rule) => {
                const active = category === rule.id;
                return (
                  <button
                    key={rule.id}
                    type="button"
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
                  onPick={handleConnect}
                  connecting={connecting}
                  selectedSlug={selectedSlug}
                />
              )}

              {/* Section header for the full grid. */}
              {featured.length > 0 && (
                <div className="mt-5 mb-2.5 flex items-center gap-2">
                  <p className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground/55">
                    All apps
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
                      onClick={() => !isConnected && handleConnect(tk.slug)}
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
          <span className="text-[10.5px] sm:text-[11px] text-muted-foreground/50">
            {t("footer.poweredBy")}
          </span>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={connecting}
            className={cn(
              "h-8 px-3.5 rounded-lg text-[12.5px] font-medium",
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
      </DialogContent>
    </Dialog>
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
                // eslint-disable-next-line react/no-array-index-key
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
  return (
    <div className="mb-2.5 flex items-center gap-2">
      <Sparkles
        className="h-3 w-3 text-foreground/45"
        strokeWidth={2}
        aria-hidden
      />
      <p className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground/55">
        Featured
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
          "text-[9px] sm:text-[10px] font-medium line-clamp-1 leading-tight max-w-full px-0.5",
          isConnected
            ? "text-emerald-700/85 dark:text-emerald-400/85"
            : "text-foreground/70",
        )}
      >
        {tk.name}
      </span>
      {isConnected && (
        <Check
          className="absolute top-1 right-1 h-2.5 w-2.5 text-emerald-500"
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
      whileHover={
        disabled ? undefined : { y: -2, transition: { duration: 0.15 } }
      }
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
        "group relative text-left rounded-xl border bg-card/50 px-3 py-3 sm:px-3.5 sm:py-3.5",
        "transition-[border-color,background-color,box-shadow] duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        "disabled:cursor-not-allowed",
        isConnected
          ? "border-emerald-500/25 bg-emerald-500/[0.025] opacity-80"
          : "border-border/35",
        !disabled &&
          "hover:border-border/80 hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)] hover:bg-card",
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
