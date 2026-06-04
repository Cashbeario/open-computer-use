"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// ── ToolkitLogo (shared) ────────────────────────────────────────────────────
// Renders a catalog logo image with a clean letter-tile fallback when the
// URL is missing, empty, or fails to load. The fallback is driven by React
// state — never DOM mutation — so re-renders (locale changes, theme flips,
// strict-mode double-mounts) cannot resurrect a broken <img> or throw
// NotFoundError on a node React no longer owns.
//
// Two visual variants preserve the original sizing of the two call sites
// that previously each held their own copy of this primitive:
//   • "dialog"   — connect-app-dialog featured strip + alphabetical grid
//   • "showcase" — empty-state popular integrations grid
// Both variants share the same fallback semantics; only tailwind sizing
// classes and the tile radius differ.

export type ToolkitLogoSize = "sm" | "md" | "lg";
export type ToolkitLogoVariant = "dialog" | "showcase";

interface ToolkitLogoProps {
  /** Catalog logo URL. Null / undefined / empty string → letter fallback. */
  src: string | null | undefined;
  /** Toolkit display name. First letter is the fallback glyph. */
  name: string;
  /** Translated alt text for the logo image. */
  alt: string;
  size?: ToolkitLogoSize;
  variant?: ToolkitLogoVariant;
}

const DIALOG_SIZES: Record<
  ToolkitLogoSize,
  { box: string; img: string; text: string }
> = {
  sm: { box: "h-6 w-6", img: "h-5 w-5", text: "text-[10px]" },
  md: {
    box: "h-8 w-8 sm:h-9 sm:w-9",
    img: "h-6 w-6 sm:h-7 sm:w-7",
    text: "text-[11px]",
  },
  lg: { box: "h-12 w-12", img: "h-9 w-9", text: "text-[13px]" },
};

const SHOWCASE_SIZES: Record<
  ToolkitLogoSize,
  { box: string; img: string; text: string }
> = {
  sm: { box: "h-7 w-7", img: "h-4 w-4", text: "text-[9px]" },
  md: {
    box: "h-9 w-9 sm:h-10 sm:w-10",
    img: "h-5 w-5 sm:h-6 sm:w-6",
    text: "text-[11px]",
  },
  lg: { box: "h-12 w-12", img: "h-7 w-7", text: "text-[13px]" },
};

export function ToolkitLogo({
  src,
  name,
  alt,
  size = "md",
  variant = "dialog",
}: ToolkitLogoProps) {
  const sizes = variant === "showcase" ? SHOWCASE_SIZES[size] : DIALOG_SIZES[size];
  // The two original variants differ in tile radius — dialog used rounded-md,
  // showcase used rounded-lg. Preserve that mapping.
  const radius = variant === "showcase" ? "rounded-lg" : "rounded-md";

  // React-owned fallback flag. Reset whenever the src changes so a new URL
  // gets a fresh attempt instead of being permanently locked to the letter.
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [src]);

  // Trim and treat empty / whitespace-only URLs as missing. We must not
  // render <img src=""> — browsers resolve "" to the current document URL
  // and re-fetch the page as an image, which both wastes bandwidth and
  // never fires onError in some engines.
  const trimmed = typeof src === "string" ? src.trim() : "";
  const hasValidSrc = trimmed.length > 0;

  if (!hasValidSrc || imgFailed) {
    return (
      <span
        className={cn(
          sizes.box,
          radius,
          "bg-foreground/[0.05] flex items-center justify-center font-medium text-foreground/55",
          sizes.text,
        )}
        aria-hidden
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={trimmed}
      alt={alt}
      loading="lazy"
      decoding="async"
      // Neutral plate behind transparent logos so white-on-white or
      // black-on-black assets stay legible across themes.
      style={{ backgroundColor: "transparent" }}
      className={cn(sizes.img, "object-contain")}
      onError={() => setImgFailed(true)}
    />
  );
}
