"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { ArrowUpRight } from "lucide-react"
import { useState } from "react"
import type { BlogPostListItem } from "@/lib/blog/types"
import { PostThumbnail, FeaturedThumbnail } from "@/components/blog/post-thumbnail"

interface BlogListClientProps {
  posts: BlogPostListItem[]
}

/**
 * Client island for the blog index. Receives the full post list from the
 * Server Component (so the initial HTML already contains every post — good
 * for SEO and AI crawlers) and only handles in-page filtering by category.
 *
 * Why no framer-motion: wrapping Next.js <Link> in motion.* causes a
 * mobile double-tap bug — motion's gesture system intercepts the first
 * pointerdown to disambiguate tap vs drag, swallowing the click. Users
 * had to tap twice to navigate to a post on phones. Replaced with a
 * pure-CSS entrance animation in globals.css (`.blog-card-enter` /
 * `.blog-featured-enter`), which respects `prefers-reduced-motion` and
 * leaves <Link>'s native tap behavior fully intact.
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
      <div className="max-w-5xl mx-auto px-7 sm:px-10 mb-12">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "rounded-full text-sm font-medium px-4 py-1.5 transition-colors duration-200",
                activeCategory === cat
                  ? "bg-foreground text-background"
                  : "text-muted-foreground/60 hover:text-foreground border border-border/40 hover:border-border/60"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Featured Post */}
      {featured && activeCategory === "All" && (
        <div className="max-w-5xl mx-auto px-7 sm:px-10 mb-12 blog-featured-enter">
          <Link
            href={`/blog/${featured.id}`}
            className="block touch-manipulation"
            aria-label={`Read featured post: ${featured.title}`}
          >
            <div className="group rounded-2xl overflow-hidden border border-border/40 bg-card hover:border-border/60 transition-all duration-300">
              <FeaturedThumbnail postId={featured.id} />
              <div className="p-8 sm:p-10">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/40">
                      {featured.category}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-foreground/30 bg-foreground/5 px-2 py-0.5 rounded-full">
                      Featured
                    </span>
                  </div>
                  <ArrowUpRight className="h-4 w-4 text-muted-foreground/20 group-hover:text-foreground/50 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </div>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3 group-hover:text-foreground/70 transition-colors duration-200">
                  {featured.title}
                </h2>
                <p className="text-muted-foreground text-base sm:text-lg leading-relaxed mb-6 max-w-2xl">
                  {featured.excerpt}
                </p>
                <div className="flex items-center gap-4 text-sm text-muted-foreground/50">
                  <span>{featured.author}</span>
                  <span className="text-muted-foreground/20">|</span>
                  <span>{formatDate(featured.date)}</span>
                  <span className="text-muted-foreground/20">|</span>
                  <span>{featured.read_time}</span>
                </div>
              </div>
            </div>
          </Link>
        </div>
      )}

      {/* Post Grid */}
      <div className="max-w-5xl mx-auto px-7 sm:px-10 mb-28">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {filtered.map((post, i) => (
            <div
              key={post.id}
              className="blog-card-enter"
              style={{ ["--blog-card-i" as string]: i }}
            >
              <Link
                href={`/blog/${post.id}`}
                className="block h-full touch-manipulation"
                aria-label={`Read post: ${post.title}`}
              >
                <div className="h-full rounded-xl overflow-hidden border border-border/30 bg-card hover:border-border/60 transition-colors duration-300 flex flex-col group">
                  <PostThumbnail postId={post.id} />
                  <div className="flex flex-col flex-1 p-5 sm:p-6">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/40">
                        {post.category}
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/20 group-hover:text-foreground/50 transition-all duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                    </div>
                    <h3 className="font-semibold text-foreground group-hover:text-foreground/70 transition-colors duration-200 mb-2 line-clamp-2 leading-snug">
                      {post.title}
                    </h3>
                    <p className="text-sm text-muted-foreground/70 leading-relaxed mb-4 line-clamp-3 flex-1">
                      {post.excerpt}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground/40 mt-auto pt-4 border-t border-border/20">
                      <span>{post.author}</span>
                      <span className="text-muted-foreground/15">|</span>
                      <span>{formatDate(post.date)}</span>
                      <span className="text-muted-foreground/15">|</span>
                      <span>{post.read_time}</span>
                    </div>
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-16">
            <p className="text-muted-foreground/50 text-sm">No posts in this category yet.</p>
            <button
              onClick={() => setActiveCategory("All")}
              className="mt-3 text-sm text-foreground/60 hover:text-foreground transition-colors underline underline-offset-4"
            >
              View all posts
            </button>
          </div>
        )}
      </div>
    </>
  )
}
