import Link from "next/link"
import { LandingHeader } from "@/app/components/landing/landing-header"
import { LandingFooter } from "@/app/components/landing/landing-footer"
import { SectionDivider } from "@/app/components/landing/guide-lines"
import { ArrowRight, ArrowUpRight } from "lucide-react"
import { getBlogPosts } from "@/lib/blog/api"
import { JsonLd } from "@/app/components/seo/json-ld"
import { BlogListClient } from "./blog-list-client"

// Revalidate every 5 minutes — posts are upserted infrequently and the
// underlying Supabase fetch already has its own short cache, so 300s gives
// crawlers near-fresh content without round-tripping on every request.
export const revalidate = 300

/**
 * Blog index — Server Component, restyled in the landing's design language
 * (Geist Sans/Mono, strict monochrome, hairlines, gradient hero). The page
 * shell is static (no client JS) so the gradient hero + JSON-LD land in the
 * first-paint HTML for crawlers and AI search bots.
 *
 * Data is fetched directly from the Supabase data layer (no internal HTTP
 * round-trip) so post titles, excerpts, dates, and authors land in the
 * initial HTML for SEO crawlers and AI search bots (Claude web_search,
 * Perplexity-User, Bingbot). The interactive search + category filter +
 * pagination is delegated to <BlogListClient />, a small client island.
 */
export default async function BlogPage() {
  const posts = await getBlogPosts()

  const blogJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Coasty Blog",
    url: "https://coasty.ai/blog",
    publisher: {
      "@type": "Organization",
      name: "Coasty",
      url: "https://coasty.ai",
    },
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      description: p.excerpt,
      author: { "@type": "Person", name: p.author },
      datePublished: p.date,
      url: `https://coasty.ai/blog/${p.id}`,
      articleSection: p.category,
    })),
  }

  return (
    <div className="relative isolate min-h-screen overflow-x-clip bg-background text-foreground">
      <JsonLd data={blogJsonLd} />
      <LandingHeader />

      <main className="relative">
        {/* ─── Hero ─────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden px-5 pt-32 pb-10 sm:px-10 sm:pt-40 sm:pb-14">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div
              className="absolute left-1/2 top-0 h-[460px] w-[760px] max-w-[120vw] -translate-x-1/2"
              style={{
                background:
                  "radial-gradient(ellipse at center, color-mix(in oklab, var(--foreground) 5%, transparent), transparent 70%)",
              }}
            />
          </div>

          <div className="relative mx-auto max-w-3xl text-center">
            <p className="mb-5 font-mono text-[11px] uppercase tracking-[0.24em] text-foreground/45">
              Blog
            </p>
            <h1
              className={
                "font-semibold tracking-[-0.045em] text-balance pb-1 sm:pb-2 " +
                "bg-clip-text text-transparent " +
                "bg-gradient-to-b from-foreground to-foreground/85 dark:from-white dark:to-white/82 " +
                "text-[2.1rem] leading-[1.1] sm:text-5xl sm:leading-[1.08] lg:text-[3.25rem]"
              }
            >
              Insights &amp; Updates
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.55] text-foreground/65 dark:text-white/65 sm:text-base">
              Deep dives into autonomous AI agents, real case studies, engineering decisions, and where the industry is heading.
            </p>
          </div>
        </section>

        <SectionDivider />

        {/* Filter + grid — client island for search, category interaction,
            and pagination. The client component still renders server-side
            under RSC, so every post (title, excerpt, author, date, category)
            lands in the initial HTML for crawlers/AI search bots. */}
        <section className="px-5 pt-16 sm:px-10 sm:pt-20">
          <BlogListClient posts={posts} />
        </section>

        <SectionDivider />

        {/* ─── Final CTA ────────────────────────────────────────────────── */}
        <section className="px-5 py-20 sm:px-10 sm:py-28">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              className={
                "font-semibold tracking-[-0.03em] text-balance pb-1 sm:pb-2 " +
                "bg-clip-text text-transparent " +
                "bg-gradient-to-b from-foreground to-foreground/85 dark:from-white dark:to-white/82 " +
                "text-[1.75rem] leading-[1.15] sm:text-4xl"
              }
            >
              Want to see Coasty in action?
            </h2>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/auth"
                className={
                  "group inline-flex items-center justify-center gap-2 rounded-full font-medium bg-foreground text-background " +
                  "shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_6px_18px_-10px_rgba(0,0,0,0.22)] " +
                  "dark:shadow-[0_1px_0_0_rgba(0,0,0,0.10)_inset,0_6px_18px_-10px_rgba(0,0,0,0.40)] " +
                  "transition-[box-shadow,transform] duration-300 hover:scale-[1.012] active:scale-[0.985] " +
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
                  "px-7 py-3 text-[14.5px]"
                }
              >
                Try Coasty Free
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 ease-out group-hover:translate-x-0.5" />
              </Link>
              <Link
                href="/results"
                className={
                  "group inline-flex items-center justify-center gap-2 rounded-full font-medium " +
                  "border border-foreground/15 dark:border-white/15 text-foreground dark:text-white " +
                  "bg-foreground/[0.025] dark:bg-white/[0.03] backdrop-blur-[2px] " +
                  "hover:bg-foreground/[0.05] hover:border-foreground/25 dark:hover:bg-white/[0.06] dark:hover:border-white/25 " +
                  "transition-[background,border-color,transform] duration-300 active:scale-[0.985] " +
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
                  "px-6 py-3 text-[14px]"
                }
              >
                View Case Studies
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
            <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/35">
              No credit card required
            </p>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
