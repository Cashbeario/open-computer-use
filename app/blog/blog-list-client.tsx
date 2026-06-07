"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { ArrowUpRight, Search, X } from "lucide-react"
import { useDeferredValue, useEffect, useMemo, useState } from "react"
import type { CSSProperties } from "react"
import type { BlogPostListItem } from "@/lib/blog/types"
import { PostThumbnail, FeaturedThumbnail } from "@/components/blog/post-thumbnail"

interface BlogListClientProps {
  posts: BlogPostListItem[]
}

const INITIAL_PAGE_SIZE = 9
const PAGE_INCREMENT = 9

/**
 * Blog index — client island, restyled in the landing's design language
 * (strict monochrome, hairlines, glass-card chrome, mono metadata labels).
 *
 * Server delivers the full post list (great for SEO + AI crawlers — the
 * JSON-LD block in app/blog/page.tsx also enumerates every post). The
 * client adds three things on top:
 *
 *   1. **Search** — debounced via React 19's useDeferredValue. Matches
 *      against title, excerpt, author, and category. Combines with the
 *      category chips (AND, not OR).
 *   2. **Pagination** — only INITIAL_PAGE_SIZE cards mount on first
 *      paint; "Show more" reveals PAGE_INCREMENT more at a time. Keeps
 *      the DOM small on phones with 30+ posts.
 *   3. **content-visibility: auto** per card — cards scrolled off-screen
 *      skip paint/layout entirely. Combined with the cheaper
 *      PostThumbnail (no filter/backdrop-filter), scroll is smooth even
 *      on mid-range Android.
 *
 * ─── Hit-testing rationale (kept from the previous version) ─────────────
 *
 * The <Link> IS the card. No wrapper div between the user's tap and the
 * navigation. Hover/transition classes are gated `sm:` so touch devices
 * never get them. PostThumbnail/FeaturedThumbnail set
 * pointer-events-none on their decorative children. All three
 * mitigations together resolve the iOS Safari subpixel hit-test bug that
 * forced users to double-tap. See post-thumbnail.tsx and the
 * `@media (hover: none)` block in app/globals.css for details.
 */

// Glass-card chrome shared with the landing (border-color/box-shadow/transform
// transition + hover lift + shadow). Hover affordances are gated `sm:` so the
// iOS hit-test mitigation above stays intact on touch devices.
const CARD_CHROME = cn(
  "blog-card-enter group flex h-full flex-col touch-manipulation overflow-hidden rounded-2xl",
  "border border-foreground/10 bg-card/40 backdrop-blur-[2px]",
  "sm:transition-[border-color,box-shadow,transform] sm:duration-500",
  "sm:hover:-translate-y-0.5 sm:hover:border-foreground/20",
  "sm:hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_44px_-22px_rgba(0,0,0,0.18)]",
  "dark:sm:hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_18px_44px_-22px_rgba(0,0,0,0.5)]",
)

// Top-sheen hairline used on every glass card.
function TopSheen() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-6 top-0 z-10 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
    />
  )
}

export function BlogListClient({ posts }: BlogListClientProps) {
  const [activeCategory, setActiveCategory] = useState("All")
  const [query, setQuery] = useState("")
  const [visibleCount, setVisibleCount] = useState(INITIAL_PAGE_SIZE)

  // useDeferredValue lets the input stay responsive while filtering large
  // lists. React schedules the filter pass as a transition so keystrokes
  // never block.
  const deferredQuery = useDeferredValue(query)
  const isStale = query !== deferredQuery

  const categories = useMemo(
    () => ["All", ...Array.from(new Set(posts.map((p) => p.category)))],
    [posts],
  )

  const featured = posts.find((p) => p.featured)

  const matches = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return posts.filter((p) => {
      if (activeCategory !== "All" && p.category !== activeCategory) return false
      if (!q) return activeCategory === "All" ? !p.featured : true
      const haystack = `${p.title} ${p.excerpt} ${p.author} ${p.category}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [posts, activeCategory, deferredQuery])

  // Reset visible window whenever the filter set changes — otherwise a
  // user who scrolled "Show more" and then typed a query would see a
  // confusingly large or small result count.
  useEffect(() => {
    setVisibleCount(INITIAL_PAGE_SIZE)
  }, [activeCategory, deferredQuery])

  const visiblePosts = matches.slice(0, visibleCount)
  const hasMore = matches.length > visibleCount
  const showFeatured = featured && activeCategory === "All" && deferredQuery.trim() === ""

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

  return (
    <>
      {/* ── Search + filter row ─────────────────────────────────────── */}
      <div className="mx-auto mb-8 max-w-5xl sm:mb-10">
        <div className="flex flex-col gap-4 sm:gap-5">
          {/* Search box */}
          <label className="group relative block">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40 transition-colors group-focus-within:text-foreground/70"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search posts by title, topic, or author"
              aria-label="Search blog posts"
              className={cn(
                "w-full rounded-full border border-foreground/10 bg-card/40 backdrop-blur-[2px]",
                "py-3 pl-11 pr-11 text-[15px] text-foreground placeholder:text-foreground/40",
                "outline-none transition-colors focus-visible:border-foreground/25 focus-visible:ring-[3px] focus-visible:ring-foreground/[0.06]",
                "[&::-webkit-search-cancel-button]:hidden",
              )}
              autoComplete="off"
              spellCheck={false}
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-foreground/50 transition-colors hover:bg-foreground/[0.06] hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>

          {/* Category chips */}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "touch-manipulation rounded-full px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors duration-300",
                  activeCategory === cat
                    ? "bg-foreground text-background"
                    : "border border-foreground/12 text-foreground/55 sm:hover:border-foreground/25 sm:hover:text-foreground",
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Result meta — only render when there's signal: an active
              query, a non-All category, or zero matches. Keeps the
              default "All / no search" view uncluttered. */}
          {(deferredQuery.trim() !== "" || activeCategory !== "All" || matches.length === 0) && (
            <p
              className={cn(
                "text-[13px] text-foreground/55 transition-opacity",
                isStale ? "opacity-50" : "opacity-100",
              )}
              aria-live="polite"
            >
              {matches.length === 0 ? (
                <>No posts match your search.</>
              ) : (
                <>
                  {matches.length} {matches.length === 1 ? "post" : "posts"}
                  {deferredQuery.trim() !== "" && (
                    <> matching <span className="text-foreground/80">&ldquo;{deferredQuery.trim()}&rdquo;</span></>
                  )}
                  {activeCategory !== "All" && (
                    <> in <span className="text-foreground/80">{activeCategory}</span></>
                  )}
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {/* ── Featured post (only on the default view) ─────────────────── */}
      {showFeatured && (
        <div className="mx-auto mb-8 max-w-5xl sm:mb-12">
          <Link
            href={`/blog/${featured.id}`}
            aria-label={`Read featured post: ${featured.title}`}
            className={cn(
              "blog-featured-enter group relative block touch-manipulation overflow-hidden rounded-2xl",
              "border border-foreground/10 bg-card/40 backdrop-blur-[2px]",
              "sm:transition-[border-color,box-shadow,transform] sm:duration-500",
              "sm:hover:-translate-y-0.5 sm:hover:border-foreground/20",
              "sm:hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_44px_-22px_rgba(0,0,0,0.18)]",
              "dark:sm:hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_18px_44px_-22px_rgba(0,0,0,0.5)]",
            )}
          >
            <TopSheen />
            <FeaturedThumbnail postId={featured.id} />
            <div className="p-6 sm:p-10">
              <div className="mb-4 flex items-start justify-between sm:mb-6">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                    {featured.category}
                  </span>
                  <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                    Featured
                  </span>
                </div>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-foreground/25 sm:transition-all sm:duration-300 sm:group-hover:-translate-y-0.5 sm:group-hover:translate-x-0.5 sm:group-hover:text-foreground/60" />
              </div>
              <h2 className="mb-2 text-2xl font-semibold leading-tight tracking-tight text-foreground sm:mb-3 sm:text-3xl sm:transition-colors sm:duration-300 sm:group-hover:text-foreground/80">
                {featured.title}
              </h2>
              <p className="mb-4 max-w-2xl text-base leading-relaxed text-muted-foreground/70 sm:mb-6 sm:text-lg">
                {featured.excerpt}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-[0.14em] text-foreground/40">
                <span>{featured.author}</span>
                <span aria-hidden="true" className="text-foreground/20">·</span>
                <span>{formatDate(featured.date)}</span>
                <span aria-hidden="true" className="text-foreground/20">·</span>
                <span>{featured.read_time}</span>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* ── Post grid ────────────────────────────────────────────────── */}
      <div className="mx-auto mb-20 max-w-5xl sm:mb-28">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {visiblePosts.map((post, i) => (
            <Link
              key={post.id}
              href={`/blog/${post.id}`}
              aria-label={`Read post: ${post.title}`}
              style={{
                ["--blog-card-i" as string]: i,
                // Off-screen cards skip paint+layout. The intrinsic-size
                // hint keeps scrollbar/page height stable so the
                // reservation doesn't cause layout shift when cards
                // hydrate in.
                contentVisibility: "auto",
                containIntrinsicSize: "400px 380px",
              } as CSSProperties}
              className={cn(CARD_CHROME, "relative")}
            >
              <TopSheen />
              <PostThumbnail postId={post.id} />
              <div className="flex flex-1 flex-col p-4 sm:p-6">
                <div className="mb-3 flex items-center justify-between sm:mb-4">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground/40">
                    {post.category}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-foreground/25 sm:transition-all sm:duration-300 sm:group-hover:-translate-y-0.5 sm:group-hover:translate-x-0.5 sm:group-hover:text-foreground/60" />
                </div>
                <h3 className="mb-2 line-clamp-2 font-semibold leading-snug tracking-tight text-foreground sm:transition-colors sm:duration-300 sm:group-hover:text-foreground/80">
                  {post.title}
                </h3>
                <p className="mb-3 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground/70 sm:mb-4">
                  {post.excerpt}
                </p>
                <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-foreground/10 pt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/40 sm:pt-4">
                  <span>{post.author}</span>
                  <span aria-hidden="true" className="text-foreground/15">·</span>
                  <span>{formatDate(post.date)}</span>
                  <span aria-hidden="true" className="text-foreground/15">·</span>
                  <span>{post.read_time}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Empty state */}
        {matches.length === 0 && (
          <div className="py-16 text-center">
            <p className="mb-2 text-sm text-foreground/55">
              {deferredQuery.trim() !== ""
                ? `Nothing matched "${deferredQuery.trim()}".`
                : "No posts in this category yet."}
            </p>
            <button
              type="button"
              onClick={() => {
                setActiveCategory("All")
                setQuery("")
              }}
              className="mt-2 touch-manipulation text-sm text-foreground/70 underline underline-offset-4 transition-colors hover:text-foreground"
            >
              Reset filters
            </button>
          </div>
        )}

        {/* Pagination — Load more */}
        {hasMore && (
          <div className="mt-10 flex flex-col items-center gap-3 sm:mt-12">
            <button
              type="button"
              onClick={() => setVisibleCount((n) => n + PAGE_INCREMENT)}
              className={cn(
                "group inline-flex touch-manipulation items-center justify-center gap-2 rounded-full font-medium",
                "border border-foreground/15 dark:border-white/15 text-foreground dark:text-white",
                "bg-foreground/[0.025] dark:bg-white/[0.03] backdrop-blur-[2px]",
                "hover:border-foreground/25 hover:bg-foreground/[0.05] dark:hover:border-white/25 dark:hover:bg-white/[0.06]",
                "transition-[background,border-color,transform] duration-300 active:scale-[0.985]",
                "px-6 py-2.5 text-sm",
              )}
            >
              Show more
              <span className="text-foreground/45">
                ({matches.length - visibleCount} left)
              </span>
            </button>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground/40">
              Showing {visiblePosts.length} of {matches.length}
            </p>
          </div>
        )}
      </div>
    </>
  )
}
