"use client";

import { motion } from "framer-motion";
import {
  ShieldCheck,
  Sparkles,
  Boxes,
  ArrowRight,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ComposioToolkit } from "@/lib/composio-store/types";
import { ToolkitLogo } from "./toolkit-logo";

interface EmptyStateProps {
  onConnect: (slug?: string) => void;
  popularToolkits?: ComposioToolkit[];
}

// Curated featured app slugs prioritised for the empty-state showcase.
// We match against the live catalog; missing entries are backfilled with
// any catalog entry that has a logo, then with hardcoded placeholders.
const FEATURED_SLUGS = [
  "gmail",
  "slack",
  "github",
  "notion",
  "linear",
  "googlecalendar",
  "googledrive",
  "hubspot",
];

const FALLBACK_TILES: Array<Pick<ComposioToolkit, "slug" | "name" | "logo_url">> = [
  { slug: "gmail", name: "Gmail", logo_url: null },
  { slug: "slack", name: "Slack", logo_url: null },
  { slug: "github", name: "GitHub", logo_url: null },
  { slug: "notion", name: "Notion", logo_url: null },
  { slug: "linear", name: "Linear", logo_url: null },
  { slug: "googlecalendar", name: "Google Calendar", logo_url: null },
  { slug: "googledrive", name: "Google Drive", logo_url: null },
  { slug: "hubspot", name: "HubSpot", logo_url: null },
];

// Signature quintic ease-out — matches the rest of the app's motion system.
const EASE = [0.22, 1, 0.36, 1] as const;

type ShowcaseTile = Pick<ComposioToolkit, "slug" | "name" | "logo_url">;

export function EmptyState({ onConnect, popularToolkits = [] }: EmptyStateProps) {
  const t = useTranslations("connections");
  // Build the featured 8: try curated slugs first, backfill from logo-bearing
  // catalog entries, fall back to hardcoded labels if the catalog is empty.
  const bySlug = new Map(
    popularToolkits.map((t) => [t.slug.toLowerCase(), t]),
  );
  const picked: ComposioToolkit[] = [];
  for (const slug of FEATURED_SLUGS) {
    const hit = bySlug.get(slug);
    if (hit) picked.push(hit);
  }
  if (picked.length < 8) {
    for (const t of popularToolkits) {
      if (picked.find((p) => p.slug === t.slug)) continue;
      if (!t.logo_url && !t.logo) continue;
      picked.push(t);
      if (picked.length >= 8) break;
    }
  }
  const showFallback = picked.length === 0;
  const tiles: ShowcaseTile[] = showFallback
    ? FALLBACK_TILES
    : picked.slice(0, 8).map((t) => ({
        slug: t.slug,
        name: t.name,
        logo_url: t.logo_url ?? t.logo ?? null,
      }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.05, ease: EASE }}
      className="relative rounded-2xl border border-border/30 bg-card/30 backdrop-blur-sm overflow-hidden"
    >
      {/* Ambient depth — soft radial blobs at opposite corners. */}
      <div className="pointer-events-none absolute -top-32 -left-24 h-80 w-80 rounded-full bg-foreground/[0.025] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-24 h-80 w-80 rounded-full bg-foreground/[0.02] blur-3xl" />
      {/* Hairline sheen at the top — matches landing glass cards. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-12 top-0 z-10 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent"
      />

      <div className="relative px-4 py-10 sm:px-8 sm:py-14 lg:py-16">
        {/* Hero block */}
        <div className="text-center mb-10 sm:mb-12">
          <motion.h2
            data-testid="connections-empty-headline"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.18, ease: EASE }}
            className="text-2xl sm:text-3xl font-medium tracking-tight mb-3"
          >
            {t("emptyState.headline")}
          </motion.h2>
          <motion.p
            data-testid="connections-empty-subheadline"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.22, ease: EASE }}
            className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto leading-relaxed px-2"
          >
            {t("emptyState.subheadline")}
          </motion.p>
        </div>

        {/* Featured showcase grid: 4 across on phones (two rows), 8 across on
            large screens (single row). Touch targets stay ≥44px even on the
            tightest layout. */}
        <div className="max-w-3xl mx-auto mb-10 sm:mb-12">
          <motion.p
            data-testid="connections-empty-eyebrow"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.28, ease: EASE }}
            className="text-[10px] sm:text-[10.5px] font-medium uppercase tracking-[0.2em] rtl:tracking-[0.08em] [:lang(zh)_&]:tracking-[0.08em] [:lang(ja)_&]:tracking-[0.08em] [:lang(ko)_&]:tracking-[0.08em] text-muted-foreground/55 text-center mb-5"
          >
            {t("emptyState.popularIntegrationsEyebrow")}
          </motion.p>
          <div className="grid grid-cols-4 lg:grid-cols-8 gap-2 sm:gap-3">
            {tiles.map((tile, i) => (
              <ShowcaseTile
                key={tile.slug}
                tile={tile}
                index={i}
                disabled={showFallback}
                onSelect={() => onConnect(tile.slug)}
              />
            ))}
          </div>
        </div>

        {/* Feature trio — stacks on mobile, three-up on tablet+. */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl mx-auto mb-8 sm:mb-10">
          {[
            {
              icon: Sparkles,
              title: t("emptyState.features.toolsInEveryChat.title"),
              desc: t("emptyState.features.toolsInEveryChat.desc"),
            },
            {
              icon: ShieldCheck,
              title: t("emptyState.features.secureOauth.title"),
              desc: t("emptyState.features.secureOauth.desc"),
            },
            {
              icon: Boxes,
              title: t("emptyState.features.hundredsOfApps.title"),
              desc: t("emptyState.features.hundredsOfApps.desc"),
            },
          ].map(({ icon: Icon, title, desc }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.4,
                delay: 0.55 + i * 0.06,
                ease: EASE,
              }}
              className="rounded-xl border border-border/30 bg-background/30 backdrop-blur-sm px-4 py-3.5 text-start"
            >
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-foreground/[0.05]">
                <Icon
                  className="h-4 w-4 text-foreground/65"
                  strokeWidth={1.75}
                />
              </div>
              <p className="text-[13px] font-medium mb-0.5">{title}</p>
              <p className="text-[11.5px] text-muted-foreground leading-relaxed">
                {desc}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Primary CTA — full-width on mobile, content-width on desktop. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.78, ease: EASE }}
          className="flex justify-center"
        >
          <Button
            data-testid="connections-empty-browse-apps-cta"
            onClick={() => onConnect()}
            size="lg"
            className="group gap-2 rounded-xl h-11 px-6 w-full sm:w-auto max-w-xs"
          >
            {t("emptyState.browseAppsCta")}
            <ArrowRight className="h-4 w-4 transition-transform duration-200 rtl:rotate-180 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}

// ── ShowcaseTile ────────────────────────────────────────────────────────────
// Square logo tile with graceful fallback to the first letter when the
// logo image fails to load (or is absent from the catalog).

function ShowcaseTile({
  tile,
  index,
  disabled,
  onSelect,
}: {
  tile: ShowcaseTile;
  index: number;
  disabled: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("connections");
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 10, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        duration: 0.4,
        delay: 0.32 + index * 0.04,
        ease: EASE,
      }}
      // Hover lift moved to CSS (`hover:-translate-y-0.5`) so Tailwind v4's
      // `@media (hover: hover)` gate keeps it from firing on iOS touch.
      // whileTap stays — it's a press, not a hover.
      whileTap={disabled ? undefined : { scale: 0.96 }}
      onClick={onSelect}
      disabled={disabled}
      title={tile.name}
      aria-label={disabled ? tile.name : `Connect ${tile.name}`}
      className={cn(
        "group relative aspect-square rounded-2xl border border-border/40 bg-background/60 backdrop-blur-sm",
        "flex flex-col items-center justify-center gap-1.5 sm:gap-2 p-2 sm:p-3",
        "transition-[border-color,background-color,box-shadow,transform] duration-200 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        !disabled &&
          "hover:border-border/80 hover:bg-background/90 hover:shadow-[0_4px_18px_-8px_rgba(0,0,0,0.18)] hover:-translate-y-0.5 cursor-pointer",
        disabled && "cursor-default",
      )}
    >
      <ToolkitLogo
        src={tile.logo_url ?? null}
        name={tile.name}
        size="md"
        variant="showcase"
        alt={t("emptyState.toolkitLogoAlt", { name: tile.name })}
      />
      <span className="text-[10px] sm:text-[10.5px] [:lang(zh)_&]:text-[11px] [:lang(zh)_&]:sm:text-[11.5px] [:lang(ja)_&]:text-[11px] [:lang(ja)_&]:sm:text-[11.5px] [:lang(ko)_&]:text-[11px] [:lang(ko)_&]:sm:text-[11.5px] font-medium text-foreground/75 line-clamp-1 leading-tight px-0.5">
        {tile.name}
      </span>
    </motion.button>
  );
}

// ToolkitLogo now lives in ./toolkit-logo and is shared with the connect
// dialog so both surfaces render logos identically.
