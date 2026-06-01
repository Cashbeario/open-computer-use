import Link from "next/link"
import {
  ArrowRight,
  ArrowUpRight,
  Monitor,
  Globe,
  Terminal,
  MousePointer2,
  FileText,
  Mail,
  Search,
  ShoppingCart,
  Users,
  BarChart3,
  Shield,
  Zap,
} from "lucide-react"
import { LandingHeader } from "@/app/components/landing/landing-header"
import { LandingFooter } from "@/app/components/landing/landing-footer"
import { SectionDivider } from "@/app/components/landing/guide-lines"
import { JsonLd } from "@/app/components/seo/json-ld"
import { getSeoPages } from "@/lib/blog/api"

const CAPABILITIES = [
  { icon: Monitor, label: "Desktop Automation", desc: "Control any desktop application — click, type, scroll, drag" },
  { icon: Globe, label: "Browser Automation", desc: "Navigate websites, fill forms, extract data, handle logins" },
  { icon: Terminal, label: "Terminal Operations", desc: "Run shell commands, install packages, manage files" },
  { icon: MousePointer2, label: "UI Interaction", desc: "See the screen, understand context, take intelligent actions" },
  { icon: FileText, label: "Document Processing", desc: "Read, write, edit documents and spreadsheets" },
  { icon: Mail, label: "Email Automation", desc: "Compose, send, and manage emails autonomously" },
  { icon: Search, label: "Web Research", desc: "Search, scrape, and compile information from the web" },
  { icon: ShoppingCart, label: "E-commerce Tasks", desc: "Price monitoring, order management, product research" },
  { icon: Users, label: "CRM & Outreach", desc: "Manage leads, send personalized outreach, update records" },
  { icon: BarChart3, label: "Data Extraction", desc: "Scrape structured data from any website or application" },
  { icon: Shield, label: "QA Testing", desc: "Test user flows, find bugs, generate reports" },
  { icon: Zap, label: "Workflow Automation", desc: "Chain multi-step workflows across applications" },
]

const COMPARE_LINKS = [
  { slug: "anthropic-computer-use", label: "Anthropic Computer Use" },
  { slug: "openai-operator", label: "OpenAI Operator" },
  { slug: "adept-ai", label: "Adept AI" },
  { slug: "multion", label: "Multion" },
  { slug: "browserbase", label: "Browserbase" },
  { slug: "induced-ai", label: "Induced AI" },
  { slug: "uipath", label: "UiPath" },
  { slug: "automation-anywhere", label: "Automation Anywhere" },
  { slug: "devin-ai", label: "Devin AI" },
]

export const revalidate = 300

// ─── Shared landing-language chrome (static; no client JS) ───────────────────
// The landing's card recipe minus the mouse-tracking spotlight (which needs a
// client handler) — kept server-renderable so this SEO hub stays fully in the
// first-paint HTML. Hover lift + sheen are pure CSS.
const CARD_CHROME =
  "group relative overflow-hidden rounded-2xl border border-foreground/10 bg-card/40 backdrop-blur-[2px] " +
  "transition-[border-color,box-shadow,transform] duration-500 " +
  "hover:border-foreground/20 hover:-translate-y-0.5 " +
  "hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_18px_44px_-22px_rgba(0,0,0,0.18)] " +
  "dark:hover:shadow-[0_1px_2px_rgba(0,0,0,0.3),0_18px_44px_-22px_rgba(0,0,0,0.5)]"

const PRIMARY_PILL =
  "group inline-flex items-center justify-center gap-2 rounded-full font-medium bg-foreground text-background " +
  "shadow-[0_1px_0_0_rgba(255,255,255,0.08)_inset,0_6px_18px_-10px_rgba(0,0,0,0.22)] " +
  "dark:shadow-[0_1px_0_0_rgba(0,0,0,0.10)_inset,0_6px_18px_-10px_rgba(0,0,0,0.40)] " +
  "transition-[box-shadow,transform] duration-300 hover:scale-[1.012] active:scale-[0.985] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"

const OUTLINE_PILL =
  "group inline-flex items-center justify-center gap-2 rounded-full font-medium " +
  "border border-foreground/15 dark:border-white/15 text-foreground dark:text-white " +
  "bg-foreground/[0.025] dark:bg-white/[0.03] backdrop-blur-[2px] " +
  "hover:bg-foreground/[0.05] hover:border-foreground/25 dark:hover:bg-white/[0.06] dark:hover:border-white/25 " +
  "transition-[background,border-color,transform] duration-300 active:scale-[0.985] " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"

// Section heading — solid foreground (NOT clip-text, so no descender clip),
// matching LandingSectionHeader's type. Static so it renders for crawlers.
function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-10 text-center sm:mb-14">
      <h2 className="font-semibold tracking-tight text-foreground text-[28px] leading-[1.1] sm:text-4xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">{subtitle}</p>
      )}
    </header>
  )
}

// Top sheen hairline used on every glass card.
function TopSheen() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-foreground/15 to-transparent"
    />
  )
}

/**
 * Computer-Use SEO hub — Server Component, restyled in the landing's design
 * language (Geist Sans/Mono, monochrome, hairlines, glass-card chrome,
 * gradient hero). Kept fully server-rendered (no client JS) so AI search bots
 * and lightweight crawlers see every link target on first paint. Emits
 * TechArticle JSON-LD for schema.org consumers.
 */
export default async function ComputerUseHub() {
  const seoPages = await getSeoPages()

  const techArticleJsonLd = {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: "Computer-Use AI: Coasty Platform",
    description:
      "Coasty is the #1 ranked computer-use AI agent on OSWorld. Automate desktop, browser, and terminal tasks with an autonomous AI that sees the screen and takes intelligent actions.",
    proficiencyLevel: "Beginner",
    dependencies: "Web browser, API key (free tier available)",
    author: { "@type": "Organization", name: "Coasty" },
    datePublished: "2026-05-05",
    mainEntityOfPage: "https://coasty.ai/computer-use",
    publisher: {
      "@type": "Organization",
      name: "Coasty",
      url: "https://coasty.ai",
      logo: {
        "@type": "ImageObject",
        url: "https://coasty.ai/logo_dark.svg",
      },
    },
  }

  return (
    <div className="relative min-h-screen overflow-x-clip bg-background text-foreground">
      <JsonLd data={techArticleJsonLd} />
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
              Computer Use AI Agent
            </p>
            <h1
              className={
                "font-semibold tracking-[-0.045em] text-balance pb-1 sm:pb-2 " +
                "bg-clip-text text-transparent " +
                "bg-gradient-to-b from-foreground to-foreground/85 dark:from-white dark:to-white/82 " +
                "text-[2.1rem] leading-[1.1] sm:text-5xl sm:leading-[1.08] lg:text-[3.25rem]"
              }
            >
              The #1 Computer Use Agent
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-[15px] leading-[1.55] text-foreground/65 dark:text-white/65 sm:text-base">
              Coasty is the best computer use AI agent — ranked #1 on OSWorld with 82% accuracy.
              It controls desktops, browsers, and terminals like a human, automating any task you can do on a computer.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
              <Link href="/auth" className={PRIMARY_PILL + " px-7 py-3 text-[14.5px]"}>
                Try Computer Use Free
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 ease-out group-hover:translate-x-0.5" />
              </Link>
              <Link href="/results" className={OUTLINE_PILL + " px-6 py-3 text-[14px]"}>
                Watch Demos
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
          </div>
        </section>

        <SectionDivider />

        {/* ─── Capabilities ─────────────────────────────────────────────── */}
        <section className="px-5 py-20 sm:px-10 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-6xl">
            <SectionHeading title="What Can Computer Use Do?" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CAPABILITIES.map((cap) => (
                <div key={cap.label} className={CARD_CHROME + " p-5 sm:p-6"}>
                  <TopSheen />
                  <cap.icon
                    className="h-5 w-5 text-foreground/40 transition-colors duration-500 group-hover:text-foreground/70"
                    strokeWidth={1.8}
                  />
                  <h3 className="mt-3 text-sm font-semibold tracking-tight text-foreground">{cap.label}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground/70">{cap.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Dynamic SEO pages grid ───────────────────────────────────── */}
        {seoPages.length > 0 && (
          <>
            <SectionDivider />
            <section className="px-5 py-20 sm:px-10 sm:py-24 lg:py-28">
              <div className="mx-auto max-w-6xl">
                <SectionHeading
                  title="Computer Use for Every Task"
                  subtitle="Explore how Coasty's computer use agent handles specific tasks across industries and workflows."
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {seoPages.map((page) => (
                    <Link key={page.slug} href={`/computer-use/${page.slug}`} className={CARD_CHROME + " block p-5 sm:p-6"}>
                      <TopSheen />
                      <div className="mb-3 flex items-center justify-between">
                        {page.hero_stat && (
                          <span className="text-2xl font-semibold tracking-tight tabular-nums text-foreground/90">
                            {page.hero_stat}
                          </span>
                        )}
                        <ArrowUpRight className="ml-auto h-4 w-4 text-foreground/25 transition-all duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground/60" />
                      </div>
                      <h3 className="text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-foreground/80">
                        {page.title}
                      </h3>
                      {page.hero_stat_label && (
                        <p className="mt-1 text-xs text-muted-foreground/55">{page.hero_stat_label}</p>
                      )}
                    </Link>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        <SectionDivider />

        {/* ─── Comparison links ─────────────────────────────────────────── */}
        <section className="px-5 py-20 sm:px-10 sm:py-24 lg:py-28">
          <div className="mx-auto max-w-5xl">
            <SectionHeading
              title="Best Computer Use Agent Comparison"
              subtitle="See how Coasty compares to other computer use and AI agent platforms."
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {COMPARE_LINKS.map((comp) => (
                <Link
                  key={comp.slug}
                  href={`/compare/${comp.slug}`}
                  className="group flex items-center justify-between rounded-xl border border-foreground/10 bg-card/40 px-4 py-3 backdrop-blur-[2px] transition-[border-color,background-color] duration-300 hover:border-foreground/20 hover:bg-foreground/[0.02]"
                >
                  <span className="text-sm text-foreground/70 transition-colors group-hover:text-foreground">
                    Coasty vs {comp.label}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-foreground/30 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-foreground/60" />
                </Link>
              ))}
            </div>
          </div>
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
              Start Using AI Computer Use Today
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-[15px] leading-[1.55] text-foreground/65 dark:text-white/65 sm:text-base">
              Join thousands of teams using Coasty to automate desktop, browser, and terminal tasks with the #1 ranked computer use AI agent.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4">
              <Link href="/auth" className={PRIMARY_PILL + " px-8 py-3 text-[14.5px]"}>
                Try Coasty Free
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 ease-out group-hover:translate-x-0.5" />
              </Link>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-foreground/35">
                No credit card required
              </p>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  )
}
