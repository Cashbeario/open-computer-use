"use client";

import { useMemo, useState } from "react";
import {
  MoreVertical,
  LogOut,
  Loader2,
  RefreshCw,
  Link2Off,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { formatDistanceToNow, parseISO, isValid } from "date-fns";
import type { Locale } from "date-fns";
import {
  ar as dfArabic,
  cs as dfCzech,
  da as dfDanish,
  de as dfGerman,
  el as dfGreek,
  enUS as dfEnglish,
  es as dfSpanish,
  fi as dfFinnish,
  fr as dfFrench,
  he as dfHebrew,
  hi as dfHindi,
  hu as dfHungarian,
  id as dfIndonesian,
  it as dfItalian,
  ja as dfJapanese,
  ko as dfKorean,
  ms as dfMalay,
  nl as dfDutch,
  nb as dfNorwegian,
  pl as dfPolish,
  pt as dfPortuguese,
  ro as dfRomanian,
  ru as dfRussian,
  sv as dfSwedish,
  th as dfThai,
  tr as dfTurkish,
  uk as dfUkrainian,
  vi as dfVietnamese,
  zhCN as dfChinese,
} from "date-fns/locale";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  useComposioToolkits,
  useConnectApp,
} from "@/lib/composio-store/use-composio";
import type {
  ComposioConnection,
  ComposioToolkit,
  ConnectionStatus,
} from "@/lib/composio-store/types";

interface ConnectionCardProps {
  connection: ComposioConnection;
  onDisconnect: () => void | Promise<void>;
}

// ── Thumbnail palette (mirrors machine-card-thumbnail.tsx hash logic) ──────
const PALETTES = [
  { a: "#6366f1", b: "#a78bfa", c: "#818cf8" },
  { a: "#3b82f6", b: "#8b5cf6", c: "#60a5fa" },
  { a: "#06b6d4", b: "#6366f1", c: "#22d3ee" },
  { a: "#8b5cf6", b: "#ec4899", c: "#c084fc" },
  { a: "#f43f5e", b: "#f97316", c: "#fb7185" },
  { a: "#10b981", b: "#06b6d4", c: "#34d399" },
  { a: "#f59e0b", b: "#ef4444", c: "#fbbf24" },
  { a: "#ec4899", b: "#8b5cf6", c: "#f9a8d4" },
  { a: "#14b8a6", b: "#3b82f6", c: "#2dd4bf" },
  { a: "#a855f7", b: "#f43f5e", c: "#d946ef" },
];

function ConnectionThumbnail({
  connection,
  toolkitLogo,
}: {
  connection: ComposioConnection;
  toolkitLogo?: string | null;
}) {
  const t = useTranslations("connections");
  const [imgFailed, setImgFailed] = useState(false);
  // Deterministic logo fallback when toolkit catalog hasn't loaded or is missing
  // the slug — composio publishes per-slug logos at this stable URL.
  const resolvedLogo =
    toolkitLogo ||
    (connection.app_slug
      ? `https://logos.composio.dev/api/${connection.app_slug}`
      : null);
  const letter = (connection.app_name || connection.app_slug || "?")
    .slice(0, 1)
    .toUpperCase();
  const { palette, blobPos, uid, isActive, isTransitioning } = useMemo(() => {
    const id = connection.id || connection.app_slug || "anon";
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const r = (seed: number) => {
      const x = Math.sin(seed * 9301 + 49297) * 49297;
      return x - Math.floor(x);
    };
    return {
      palette: PALETTES[Math.abs(hash) % PALETTES.length],
      blobPos: {
        x1: 15 + r(hash + 1) * 30,
        y1: 20 + r(hash + 2) * 30,
        x2: 55 + r(hash + 3) * 30,
        y2: 30 + r(hash + 4) * 40,
      },
      uid: id.slice(0, 8).replace(/[^a-z0-9]/gi, "x"),
      isActive: connection.status === "ACTIVE",
      isTransitioning: connection.status === "INITIATED",
    };
  }, [connection.id, connection.app_slug, connection.status]);

  const isDim = connection.status === "INACTIVE";
  const isError =
    connection.status === "EXPIRED" || connection.status === "FAILED";

  return (
    <div
      className={cn(
        "relative h-24 w-full overflow-hidden transition-all duration-700",
        isDim && "opacity-40 saturate-[0.3]",
      )}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
        @keyframes cc-drift-${uid} {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(8px, -6px) scale(1.05); }
          66% { transform: translate(-6px, 8px) scale(0.97); }
        }
        @keyframes cc-drift2-${uid} {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-10px, 6px) scale(1.04); }
        }
        @keyframes cc-shimmer-${uid} {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `,
        }}
      />

      <div
        className="absolute inset-0"
        style={{
          background: `linear-gradient(135deg, ${palette.a}15 0%, transparent 50%, ${palette.b}10 100%)`,
        }}
      />

      <div
        className="absolute will-change-transform rounded-full"
        style={{
          width: "70%",
          height: "140%",
          left: `${blobPos.x1}%`,
          top: `${blobPos.y1 - 40}%`,
          background: `radial-gradient(ellipse at center, ${palette.a}30, transparent 70%)`,
          filter: "blur(24px)",
          animation:
            isActive || isTransitioning
              ? `cc-drift-${uid} ${isTransitioning ? "4s" : "10s"} ease-in-out infinite`
              : "none",
        }}
      />

      <div
        className="absolute will-change-transform rounded-full"
        style={{
          width: "60%",
          height: "120%",
          left: `${blobPos.x2}%`,
          top: `${blobPos.y2 - 30}%`,
          background: `radial-gradient(ellipse at center, ${palette.b}25, transparent 70%)`,
          filter: "blur(20px)",
          animation:
            isActive || isTransitioning
              ? `cc-drift2-${uid} ${isTransitioning ? "3s" : "8s"} ease-in-out infinite`
              : "none",
        }}
      />

      {isActive && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(105deg, transparent 40%, ${palette.c}08 50%, transparent 60%)`,
            animation: `cc-shimmer-${uid} 6s ease-in-out infinite`,
          }}
        />
      )}

      {isTransitioning && (
        <div
          className="absolute inset-x-0 h-px pointer-events-none"
          style={{
            background: `linear-gradient(90deg, transparent 10%, ${palette.c}60 50%, transparent 90%)`,
            boxShadow: `0 0 8px 1px ${palette.c}30`,
            animation: `cc-shimmer-${uid} 2s ease-in-out infinite`,
          }}
        />
      )}

      {/* Toolkit logo with letter-tile fallback */}
      <div className="absolute top-3 start-4 flex items-center gap-2">
        <div
          className={cn(
            "h-9 w-9 rounded-xl bg-background/80 backdrop-blur-sm border border-border/40 flex items-center justify-center overflow-hidden",
            isError && "border-red-500/30",
          )}
        >
          {resolvedLogo && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={resolvedLogo}
              alt={t("card.logoAlt", { appName: connection.app_name })}
              loading="lazy"
              decoding="async"
              className="h-5 w-5 object-contain"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span
              className="text-[12px] font-medium text-foreground/60 select-none"
              aria-hidden
            >
              {letter}
            </span>
          )}
        </div>
      </div>

      {/* Rose wash overlay for error states */}
      {isError && (
        <div className="absolute inset-0 bg-gradient-to-b from-rose-500/[0.06] via-transparent to-background pointer-events-none" />
      )}

      <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-card to-transparent" />
    </div>
  );
}

// ── Time helpers ────────────────────────────────────────────────────────────
// Map next-intl locale codes to date-fns Locale objects so relative-time
// strings ("5 minutes ago") render in the user's language. Filipino has no
// date-fns equivalent and falls through to the English default.
const DATE_FNS_LOCALES: Record<string, Locale> = {
  ar: dfArabic,
  cs: dfCzech,
  da: dfDanish,
  de: dfGerman,
  el: dfGreek,
  en: dfEnglish,
  es: dfSpanish,
  fi: dfFinnish,
  fr: dfFrench,
  he: dfHebrew,
  hi: dfHindi,
  hu: dfHungarian,
  id: dfIndonesian,
  it: dfItalian,
  ja: dfJapanese,
  ko: dfKorean,
  ms: dfMalay,
  nl: dfDutch,
  no: dfNorwegian,
  pl: dfPolish,
  pt: dfPortuguese,
  ro: dfRomanian,
  ru: dfRussian,
  sv: dfSwedish,
  th: dfThai,
  tr: dfTurkish,
  uk: dfUkrainian,
  vi: dfVietnamese,
  zh: dfChinese,
};

function resolveDateFnsLocale(locale: string): Locale {
  return (
    DATE_FNS_LOCALES[locale] ||
    DATE_FNS_LOCALES[locale.split("-")[0]] ||
    dfEnglish
  );
}

function formatRelative(
  input?: string | null,
  locale?: Locale,
): string | null {
  if (!input) return null;
  try {
    const d = typeof input === "string" ? parseISO(input) : (input as Date);
    if (!isValid(d)) return null;
    return formatDistanceToNow(d, { addSuffix: true, locale });
  } catch {
    return null;
  }
}

function formatDate(input?: string | null): string | null {
  if (!input) return null;
  try {
    const d = typeof input === "string" ? parseISO(input) : (input as Date);
    if (!isValid(d)) return null;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return null;
  }
}

// ── Status pill ────────────────────────────────────────────────────────────
const STATUS_PRESENT: Record<
  ConnectionStatus,
  { labelKey: string; dot: string; text: string }
> = {
  ACTIVE: {
    labelKey: "status.active",
    dot: "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.4)]",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  INITIATED: {
    labelKey: "status.initiated",
    dot: "bg-blue-500 animate-pulse shadow-[0_0_6px_rgba(59,130,246,0.4)]",
    text: "text-blue-600 dark:text-blue-400",
  },
  EXPIRED: {
    labelKey: "status.expired",
    dot: "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.4)]",
    text: "text-amber-600 dark:text-amber-400",
  },
  FAILED: {
    labelKey: "status.failed",
    dot: "bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]",
    text: "text-red-500",
  },
  INACTIVE: {
    labelKey: "status.inactive",
    dot: "bg-foreground/20",
    text: "text-muted-foreground/40",
  },
};

export function ConnectionCard({ connection, onDisconnect }: ConnectionCardProps) {
  const t = useTranslations("connections");
  const locale = useLocale();
  const dateLocale = useMemo(() => resolveDateFnsLocale(locale), [locale]);
  const { data: toolkits } = useComposioToolkits();
  const { connect } = useConnectApp();
  const [busy, setBusy] = useState<"disconnect" | "reconnect" | null>(null);
  const [showDisconnect, setShowDisconnect] = useState(false);

  const toolkit = useMemo(
    (): ComposioToolkit | undefined =>
      toolkits.find((tk: ComposioToolkit) => tk.slug === connection.app_slug),
    [toolkits, connection.app_slug],
  );

  // Prefer a logo carried by the connection itself (propagated through
  // `use-composio.ts`). Fall back to the toolkit catalog join when the
  // backend has not populated the field — this keeps the thumbnail
  // working even on stale builds where `/connections` omits logos.
  const toolkitLogo =
    connection.logo_url ?? connection.logo ?? toolkit?.logo_url ?? null;

  const status = STATUS_PRESENT[connection.status] ?? STATUS_PRESENT.INACTIVE;
  const isError =
    connection.status === "EXPIRED" || connection.status === "FAILED";
  const accountLabel =
    connection.account_label ||
    connection.app_name ||
    t("card.fallbackAccountLabel");
  const connectedOn = formatDate(connection.created_at);
  const lastUsed = formatRelative(connection.last_used_at, dateLocale);

  const handleReconnect = async () => {
    setBusy("reconnect");
    try {
      await connect(connection.app_slug);
    } catch (err: any) {
      toast.error(err?.message || t("card.toast.reconnectFailed"));
      setBusy(null);
    }
  };

  const handleDisconnect = async () => {
    setBusy("disconnect");
    try {
      await onDisconnect();
      toast.success(
        t("card.toast.disconnected", { appName: connection.app_name }),
      );
    } catch (err: any) {
      toast.error(err?.message || t("card.toast.disconnectFailed"));
    } finally {
      setBusy(null);
      setShowDisconnect(false);
    }
  };

  return (
    <>
      <div
        className={cn(
          "relative group h-full flex flex-col rounded-2xl overflow-hidden",
          "bg-card border border-border/40",
          "transition-all duration-300 ease-out",
          "hover:border-border/80 hover:shadow-lg hover:shadow-black/[0.04] dark:hover:shadow-black/[0.12]",
          isError && "border-red-500/20",
        )}
      >
        {/* Gradient thumbnail header with logo */}
        <div className="shrink-0">
          <ConnectionThumbnail
            connection={connection}
            toolkitLogo={toolkitLogo}
          />
        </div>

        {/* Card body */}
        <div className="flex flex-col flex-1 px-5 pb-4 pt-0.5 relative">
          {/* Name row */}
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn("h-2 w-2 rounded-full shrink-0", status.dot)} />
              <h3 className="text-[15px] font-semibold truncate text-foreground tracking-[-0.01em]">
                {connection.app_name}
              </h3>
            </div>

            {isError ? (
              // Prominent Reconnect — no dropdown when expired/revoked
              <Button
                size="sm"
                onClick={handleReconnect}
                disabled={busy !== null}
                className={cn(
                  "h-7 rounded-lg px-2.5 text-[11px] font-medium gap-1 shrink-0",
                  "whitespace-nowrap overflow-hidden",
                  "bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300",
                  "hover:bg-amber-500/15 hover:border-amber-500/50",
                )}
                variant="ghost"
                data-testid="card-action-reconnect"
              >
                {busy === "reconnect" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3" />
                    {t("card.actions.reconnect")}
                  </>
                )}
              </Button>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-lg text-muted-foreground/30 hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 transition-all shrink-0"
                    aria-label={t("card.actions.menuAriaLabel")}
                    data-testid="card-action-menu-trigger"
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onClick={handleReconnect}
                    disabled={busy !== null || connection.status === "INITIATED"}
                    data-testid="menu-action-reconnect"
                  >
                    <RefreshCw className="me-2 h-4 w-4" />
                    {t("card.actions.reconnect")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowDisconnect(true)}
                    disabled={busy !== null}
                    className="text-destructive focus:text-destructive"
                    data-testid="menu-action-disconnect"
                  >
                    <LogOut className="me-2 h-4 w-4" />
                    {t("card.actions.disconnect")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>

          {/* Status meta line */}
          <div className="flex items-center gap-1.5 text-[11px] mb-4 min-w-0">
            <span
              className={cn("font-medium shrink-0", status.text)}
              data-testid={`status-pill-${connection.status.toLowerCase()}`}
            >
              {t(status.labelKey as any)}
            </span>
            <span className="text-muted-foreground/20 shrink-0">·</span>
            <span className="text-muted-foreground/40 truncate min-w-0">
              {accountLabel}
            </span>
          </div>

          {/* Timestamp rows */}
          <div className="space-y-1.5 text-[11px] mb-3">
            {connectedOn && (
              <div className="flex items-center gap-2 text-muted-foreground/45">
                <CheckCircle2 className="h-3 w-3 opacity-60" />
                <span>{t("card.connectedOn", { date: connectedOn })}</span>
              </div>
            )}
            {lastUsed && (
              <div className="flex items-center gap-2 text-muted-foreground/45">
                <span className="h-3 w-3" />
                <span>{t("card.lastUsed", { time: lastUsed })}</span>
              </div>
            )}
          </div>

          {/* Error notice */}
          {isError && (
            <div className="flex items-start gap-2 rounded-xl border border-red-500/10 bg-red-500/[0.03] px-3 py-2 mb-3">
              <AlertTriangle
                className="h-3.5 w-3.5 text-red-500/50 shrink-0 mt-px"
                strokeWidth={1.75}
              />
              <p className="text-[11px] text-red-500/60 leading-relaxed">
                {connection.status === "EXPIRED"
                  ? t("card.error.expired")
                  : t("card.error.revoked")}
              </p>
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />
        </div>
      </div>

      {/* Disconnect confirmation dialog */}
      <AlertDialog open={showDisconnect} onOpenChange={setShowDisconnect}>
        <AlertDialogContent
          className={cn("p-0 overflow-hidden gap-0 sm:max-w-md", "border-border/60")}
        >
          {/* Thumbnail with rose wash */}
          <div className="relative">
            <ConnectionThumbnail
              connection={connection}
              toolkitLogo={toolkitLogo}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-rose-500/[0.06] via-transparent to-background pointer-events-none" />
          </div>

          {/* Heading */}
          <div className="px-6 pt-5 pb-4">
            <AlertDialogHeader className="gap-1.5 text-start space-y-0">
              <AlertDialogTitle className="text-[17px] font-semibold tracking-[-0.01em]">
                {t("card.disconnectDialog.title", {
                  appName: connection.app_name,
                })}
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="text-[13px] text-muted-foreground/70 leading-relaxed">
                  <span className="font-medium text-foreground/85 truncate block">
                    {accountLabel}
                  </span>
                  {connectedOn && (
                    <span className="tabular-nums text-[11.5px]">
                      {t("card.disconnectDialog.connectedOn", {
                        date: connectedOn,
                      })}
                    </span>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
          </div>

          {/* Consequences */}
          <div className="border-t border-border/30 dark:border-white/[0.05]">
            <div className="flex items-center gap-3 px-6 py-3 text-[12.5px]">
              <Link2Off
                className="h-3.5 w-3.5 text-rose-500/60 shrink-0"
                strokeWidth={1.75}
              />
              <span className="text-foreground/75 leading-snug">
                {t("card.disconnectDialog.consequence.revokeOauth")}
              </span>
            </div>
            <div className="flex items-center gap-3 px-6 py-3 text-[12.5px] border-t border-border/30 dark:border-white/[0.05]">
              <AlertTriangle
                className="h-3.5 w-3.5 text-rose-500/60 shrink-0"
                strokeWidth={1.75}
              />
              <span className="text-foreground/75 leading-snug">
                {t("card.disconnectDialog.consequence.toolsStop")}
              </span>
            </div>
          </div>

          {/* Footer — inverted emphasis */}
          <AlertDialogFooter className="border-t border-border/30 dark:border-white/[0.05] px-6 py-4 flex items-center justify-end gap-2 sm:gap-2">
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDisconnect();
              }}
              disabled={busy !== null}
              className={cn(
                "order-1 h-9 px-4 rounded-lg text-[13px] font-medium",
                "bg-transparent border border-rose-500/25 text-rose-500",
                "hover:bg-rose-500/[0.06] hover:border-rose-500/40 hover:text-rose-500",
                "disabled:opacity-50",
              )}
            >
              {busy === "disconnect" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                t("card.disconnectDialog.confirm")
              )}
            </AlertDialogAction>
            <AlertDialogCancel
              className={cn(
                "order-2 mt-0 h-9 px-4 rounded-lg text-[13px] font-medium border-transparent",
                "bg-foreground text-background hover:bg-foreground/90",
              )}
            >
              {t("card.disconnectDialog.cancel")}
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
