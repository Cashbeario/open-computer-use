"use client"

/**
 * UnlimitedSmoke — sleek amber smoke background for surfaces that show
 * the Unlimited plan.  Uses the GPU-accelerated keyframes already defined
 * in app/globals.css (smoke-optimized-1/2/3) for organic, slow drift.
 *
 * Usage: drop as the FIRST child of a container that has BOTH
 *   `relative overflow-hidden`
 * Any sibling content needs `relative` (or `relative z-10`) to render
 * above the smoke layer.
 *
 *   <div className="relative overflow-hidden rounded-xl border ...">
 *     <UnlimitedSmoke variant="stat" />
 *     <div className="relative ...">my content</div>
 *   </div>
 *
 * Variants tuned for different card footprints:
 *   stat   ~ 200×130   top-row stat cards
 *   hero   ~ 720×220   wide hero card (Auto-Refill replacement)
 *   card   ~ 280×420   landing pricing card
 *   wide   ~ 720×600   /pricing main selected-plan card
 */

import { cn } from "@/lib/utils"

type Variant = "stat" | "hero" | "card" | "wide"

interface Blob {
  /** Full Tailwind utility string — kept inline so each blob's position +
   *  size + color + animation read in one place. */
  className: string
}

const VARIANTS: Record<Variant, Blob[]> = {
  // Compact stat card — two cross-corner blobs, no center accent.
  stat: [
    {
      className:
        "-top-1/3 -left-1/4 w-[120%] h-[180%] bg-amber-500/55 blur-3xl " +
        "animate-smoke-1-optimized will-change-transform",
    },
    {
      className:
        "-bottom-1/3 -right-1/4 w-[110%] h-[170%] bg-orange-400/40 blur-3xl " +
        "animate-smoke-3-optimized will-change-transform",
    },
  ],

  // Hero — three blobs spread horizontally across the wide footprint.
  hero: [
    {
      className:
        "-top-1/2 -left-[10%] w-[55%] h-[220%] bg-amber-500/45 blur-3xl " +
        "animate-smoke-1-optimized will-change-transform",
    },
    {
      className:
        "-bottom-1/2 -right-[10%] w-[55%] h-[220%] bg-orange-500/35 blur-3xl " +
        "animate-smoke-2-optimized will-change-transform",
    },
    {
      className:
        "-top-[20%] left-[35%] w-[40%] h-[180%] bg-amber-300/30 blur-3xl " +
        "animate-smoke-3-optimized will-change-transform",
    },
  ],

  // Landing pricing card (tall, narrow column).
  card: [
    {
      className:
        "-top-[15%] -left-[20%] w-[80%] h-[60%] bg-amber-500/50 blur-3xl " +
        "animate-smoke-1-optimized will-change-transform",
    },
    {
      className:
        "-bottom-[15%] -right-[20%] w-[80%] h-[60%] bg-orange-400/40 blur-3xl " +
        "animate-smoke-2-optimized will-change-transform",
    },
    {
      className:
        "top-[40%] left-[10%] w-[60%] h-[40%] bg-amber-300/30 blur-3xl " +
        "animate-smoke-3-optimized will-change-transform",
    },
  ],

  // /pricing main card (wide, lots of area).
  wide: [
    {
      className:
        "-top-[25%] -left-[10%] w-[60%] h-[120%] bg-amber-500/40 blur-3xl " +
        "animate-smoke-1-optimized will-change-transform",
    },
    {
      className:
        "-bottom-[25%] -right-[10%] w-[55%] h-[120%] bg-orange-400/35 blur-3xl " +
        "animate-smoke-2-optimized will-change-transform",
    },
    {
      className:
        "top-[15%] left-[40%] w-[45%] h-[90%] bg-amber-300/25 blur-3xl " +
        "animate-smoke-3-optimized will-change-transform",
    },
  ],
}

export function UnlimitedSmoke({ variant = "stat" }: { variant?: Variant }) {
  const blobs = VARIANTS[variant]
  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none overflow-hidden"
    >
      {blobs.map((blob, i) => (
        <div
          key={i}
          className={cn("absolute rounded-full", blob.className)}
        />
      ))}
    </div>
  )
}
