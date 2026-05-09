"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { ArrowUpRight } from "lucide-react"
import { useState } from "react"
import type { CSSProperties } from "react"
import type { BlogPostListItem } from "@/lib/blog/types"
import { PostThumbnail, FeaturedThumbnail } from "@/components/blog/post-thumbnail"

interface BlogListClientProps {
  posts: BlogPostListItem[]
}

/**
 * Blog index — client island.
 *
 * Receives the full post list from the Server Component (so initial HTML
 * already contains every post — good for SEO and AI crawlers) and only
 * handles in-page filtering by category.
 *
 * ─── Why the markup is structured the way it is ─────────────────────────
 *
 * Earlier versions wrapped each <Link> in a `<div className="blog-card-enter">`
 * for the staggered fade-in animation. That pattern is hostile to iOS
 * Safari: the keyframe animates `transform: translateY(...)` with
 * `animation-fill-mode: both`, so the wrapper retains `transform:
 * translateY(0)` permanently after the animation ends, which promotes it
 * to a GPU compositor layer. Tapping a <Link> whose ancestor is a
 * transformed compositor layer hits a documented iOS hit-testing
 * subpixel bug — the first tap misses the link, the second tap lands.
 * Users had to double-tap to navigate. Removing framer-motion didn't
 * help (CSS keyframes have the same compositor side-effect); adding
 * `touch-action: manipulation` didn't help (that fights the 300ms zoom
 * delay, not subpixel hit-testing).
 *
 * The current structure:
 *   1. The <Link> IS the card. No wrapper div between the user's tap
 *      and the navigation handler. The `.blog-card-enter` class is on
 *      the Link itself; on touch devices, globals.css disables the
 *      animation outright (no transform, no compositor layer).
 *   2. Hover and transition classes are gated `sm:` so they only apply
 *      at >= 640px. Combined with Tailwind v4's hover-only-when-supported
 *      gating, this means a touch device gets no hover styles even if it
 *      mis-reports `hover: hover`. Defense in depth.
 *   3. PostThumbnail / FeaturedThumbnail wrap their decorative children
 *      in `pointer-events-none` so taps pass straight through to the
 *      Link with no descendant hit-test contention.
 *
 * Reduced-motion + touch-device animation suppression lives in
 * app/globals.css — see the `@media (hover: none), (max-width: 639px)`
 * block in that file.
 */
export function BlogListClient({ posts }: BlogListClientProps) {
  const [activeCategory, setActiveCategory] = useState("All")

  const categories = ["All", ...Array.from(new Set(posts.map((p) => p.category)))]

  const featured = posts.find((p) => p.featured)
  const filtered =
    activeCategory === "All"
      ? posts.filter((p) => !p.featured)
      : posts.filter((p) => p.category === activeCategory && !p.featured)

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

  return (
    <>
      {/* Category Filter */}
      <div className="max-w-5xl mx-auto px-5 sm:px-10 mb-8 sm:mb-12">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "rounded-full text-sm font-medium px-4 py-1.5 touch-manipulation transition-colors duration-200",
                activeCategory === cat
                  ? "bg-foreground text-background"
                  : "text-muted-foreground/60 sm:hover:text-foreground border border-border/40 sm:hover:border-border/60",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* ── Featured Post ─────────────────────────────────────────────
          Link is the card; no transformed wrapper between the tap
          target and the navigation. Hover/transition gated `sm:`. */}
      {featured && activeCategory === "All" && (
        <div className="max-w-5xl mx-auto px-5 sm:px-10 mb-8 sm:mb-12">
          <Link
            href={`/blog/${featured.id}`}
            aria-label={`Read featured post: ${featured.title}`}
            className={cn(
              "blog-featured-enter group block touch-manipulation rounded-2xl overflow-hidden border border-border/40 bg-card",
              "sm:hover:border-border/60 sm:transition-colors sm:duration-300",
            )}
          >
            <FeaturedThumbnail postId={featured.id} />
            <div className="p-6 sm:p-10">
              <div className="flex items-start justify-between mb-4 sm:mb-6">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/40">
                    {featured.category}
                  </span>
                  <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/30 bg-foreground/5 px-2 py-0.5 rounded-full">
                    Featured
                  </span>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/20 sm:group-hover:text-foreground/50 sm:transition-all sm:duration-200 sm:group-hover:-translate-y-0.5 sm:group-hover:translate-x-0.5" />
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-2 sm:mb-3 sm:group-hover:text-foreground/70 sm:transition-colors sm:duration-200 leading-tight">
                {featured.title}
              </h2>
              <p className="text-muted-foreground text-base sm:text-lg leading-relaxed mb-4 sm:mb-6 max-w-2xl">
                {featured.excerpt}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground/50">
                <span>{featured.author}</span>
                <span aria-hidden="true" className="text-muted-foreground/20">·</span>
                <span>{formatDate(featured.date)}</span>
                <span aria-hidden="true" className="text-muted-foreground/20">·</span>
                <span>{featured.read_time}</span>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* ── Post Grid ─────────────────────────────────────────────────
          Single grid that renders one column on phones, two on small
          tablets+, three on lg+. Each cell IS a <Link> — no wrapper.
          The `--blog-card-i` custom property powers the desktop
          stagger; on touch devices, the animation is short-circuited
          by the `@media (hover: none)` rule in globals.css. */}
      <div className="max-w-5xl mx-auto px-5 sm:px-10 mb-20 sm:mb-28">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-5">
          {filtered.map((post, i) => (
            <Link
              key={post.id}
              href={`/blog/${post.id}`}
              aria-label={`Read post: ${post.title}`}
              style={{ ["--blog-card-i" as string]: i } as CSSProperties}
              className={cn(
                "blog-card-enter group flex flex-col h-full touch-manipulation rounded-xl overflow-hidden border border-border/30 bg-card",
                "sm:hover:border-border/60 sm:transition-colors sm:duration-300",
              )}
            >
              <PostThumbnail postId={post.id} />
              <div className="flex flex-col flex-1 p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/40">
                    {post.category}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/20 sm:group-hover:text-foreground/50 sm:transition-all sm:duration-200 sm:group-hover:-translate-y-0.5 sm:group-hover:translate-x-0.5" />
                </div>
                <h3 className="font-semibold text-foreground sm:group-hover:text-foreground/70 sm:transition-colors sm:duration-200 mb-2 line-clamp-2 leading-snug">
                  {post.title}
                </h3>
                <p className="text-sm text-muted-foreground/70 leading-relaxed mb-3 sm:mb-4 line-clamp-3 flex-1">
                  {post.excerpt}
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground/40 mt-auto pt-3 sm:pt-4 border-t border-border/20">
                  <span>{post.author}</span>
                  <span aria-hidden="true" className="text-muted-foreground/15">·</span>
                  <span>{formatDate(post.date)}</span>
                  <span aria-hidden="true" className="text-muted-foreground/15">·</span>
                  <span>{post.read_time}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground/50 text-sm">No posts in this category yet.</p>
            <button
              type="button"
              onClick={() => setActiveCategory("All")}
              className="mt-3 text-sm text-foreground/60 hover:text-foreground transition-colors underline underline-offset-4 touch-manipulation"
            >
              View all posts
            </button>
          </div>
        )}
      </div>
    </>
  )
}
