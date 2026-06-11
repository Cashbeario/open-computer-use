/**
 * public-docs.test.tsx — the public /docs page, its LLM-friendly /docs/llms.txt
 * version, the landing-header link, and the prompt + discovery references.
 *
 * Node env (no render): the markdown is imported directly; everything else is
 * source-level anti-drift (the <DeveloperDocs/> reuse is render-tested in
 * developer-docs.test.tsx).
 */
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { API_DOCS_MARKDOWN } from "@/lib/coasty-api-docs-md"

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

describe("API_DOCS_MARKDOWN — the highest-detail LLM-friendly reference", () => {
  it("is a substantial, single-document reference", () => {
    expect(API_DOCS_MARKDOWN.length).toBeGreaterThan(15000)
    expect(API_DOCS_MARKDOWN).toMatch(/^#\s+Coasty/m)
  })
  it("carries base URL + auth + key env var", () => {
    expect(API_DOCS_MARKDOWN).toContain("https://coasty.ai/v1")
    expect(API_DOCS_MARKDOWN).toContain("X-API-Key")
    expect(API_DOCS_MARKDOWN).toContain("COASTY_API_KEY")
  })
  it("documents core + runs + workflows endpoints", () => {
    for (const ep of ["/v1/predict", "/v1/sessions", "/v1/ground", "/v1/parse",
                      "/v1/runs", "/v1/runs/{id}/events", "/v1/workflows", "/v1/workflows/runs"]) {
      expect(API_DOCS_MARKDOWN, `documents ${ep}`).toContain(ep)
    }
  })
  it("includes the full workflow DSL vocabulary", () => {
    for (const t of ["task", "assert", "loop", "parallel", "human_approval", "retry", "succeed", "fail"]) {
      expect(API_DOCS_MARKDOWN, `DSL step ${t}`).toContain(t)
    }
    for (const op of ["eq", "ne", "contains", "truthy", "exists"]) {
      expect(API_DOCS_MARKDOWN, `condition op ${op}`).toContain(op)
    }
  })
  it("states the correct workflow validation limits (matches the backend)", () => {
    expect(API_DOCS_MARKDOWN).toContain("200 steps")        // WORKFLOWS_MAX_STEPS = 200
    expect(API_DOCS_MARKDOWN).toContain("8 levels")         // WORKFLOWS_MAX_NESTING_DEPTH = 8
    expect(API_DOCS_MARKDOWN).toContain("16 branches")      // parallel <= 16
  })
  it("prices in USD with the documented figures", () => {
    expect(API_DOCS_MARKDOWN).toContain("$0.05")
    expect(API_DOCS_MARKDOWN).toContain("$0.01")  // internal granularity stated once
  })
  it("documents the error codes + the MCP server", () => {
    expect(API_DOCS_MARKDOWN).toContain("INSUFFICIENT_CREDITS")
    expect(API_DOCS_MARKDOWN).toContain("@coasty/mcp")
  })
})

describe("/docs/llms.txt route handler", () => {
  const ROUTE = read("app/docs/llms.txt/route.ts")
  it("serves API_DOCS_MARKDOWN as cached plain text via GET + HEAD", () => {
    expect(ROUTE).toContain('import { API_DOCS_MARKDOWN } from "@/lib/coasty-api-docs-md"')
    expect(ROUTE).toMatch(/Content-Type":\s*"text\/plain; charset=utf-8"/)
    expect(ROUTE).toMatch(/export const dynamic = "force-static"/)
    expect(ROUTE).toMatch(/export async function GET\(\)/)
    expect(ROUTE).toMatch(/export async function HEAD\(\)/)
    expect(ROUTE).toMatch(/Cache-Control/)
  })
})

describe("/docs public page — reuses the developer docs in public chrome", () => {
  const PAGE = read("app/docs/page.tsx")
  const LAYOUT = read("app/docs/layout.tsx")
  it("composes LandingHeader + <DeveloperDocs/> + LandingFooter", () => {
    expect(PAGE).toMatch(/import \{ LandingHeader \}/)
    expect(PAGE).toMatch(/import \{ LandingFooter \}/)
    expect(PAGE).toMatch(/import \{ DeveloperDocs \}/)
    expect(PAGE).toMatch(/<LandingHeader/)
    expect(PAGE).toMatch(/<DeveloperDocs/)
    expect(PAGE).toMatch(/<LandingFooter/)
  })
  it("offsets the reused sticky sidebar to clear the fixed header", () => {
    expect(PAGE).toMatch(/sidebarStickyClassName="top-24"/)
    expect(PAGE).toMatch(/sidebarMaxHeight="calc\(100dvh - 8rem\)"/)
  })
  it("links to the LLM-friendly plain-text version", () => {
    expect(PAGE).toMatch(/href="\/docs\/llms\.txt"/)
    expect(PAGE).toMatch(/plain text for LLMs/i)
  })
  it("sets SEO metadata with a canonical /docs URL", () => {
    expect(LAYOUT).toMatch(/export const metadata/)
    expect(LAYOUT).toMatch(/canonical:\s*"https:\/\/coasty\.ai\/docs"/)
  })
  it("DeveloperDocs sidebar caps its height via an INLINE STYLE (Tailwind drops the arbitrary calc) and scrolls reliably", () => {
    const DOCS = read("app/components/developers/developer-docs.tsx")
    // max-height MUST be an inline style — Tailwind does not emit a rule for an
    // arbitrary `max-h-[calc(100dvh-...)]` (verified: class lands in DOM but
    // computed max-height stays `none`), which left the nav uncapped + unscrollable.
    expect(DOCS).toMatch(/sidebarMaxHeight\s*=\s*"calc\(100dvh - var\(--spacing-app-header, 56px\) - 1\.25rem\)"/)
    expect(DOCS).toMatch(/style=\{\{ maxHeight: sidebarMaxHeight \}\}/)
    // The max-height must NOT be a Tailwind arbitrary class (it gets dropped).
    expect(DOCS).not.toMatch(/className=[^\n]*max-h-\[calc/)
    // The sticky element is ITSELF the single scroll container (a single
    // overflow-y-auto + max-height box always scrolls when content overflows).
    expect(DOCS).toMatch(/sticky overflow-y-auto overscroll-contain docs-nav-scroll/)
    expect(DOCS).not.toMatch(/flex-1/)
    // The title is pinned inside the scroll container.
    expect(DOCS).toMatch(/sticky top-0 z-10/)
  })
  it("the docs nav has a visible, overscroll-contained scrollbar (the app hides scrollbars globally)", () => {
    const CSS = read("app/globals.css")
    expect(CSS).toMatch(/\.docs-nav-scroll\s*\{[\s\S]*overscroll-behavior:\s*contain/)
    expect(CSS).toMatch(/\.docs-nav-scroll::-webkit-scrollbar\s*\{[\s\S]*display:\s*block/)
    expect(CSS).toMatch(/\.docs-nav-scroll::-webkit-scrollbar-thumb/)
  })
})

describe("landing header + references", () => {
  it("the landing header links to /docs (desktop nav + mobile drawer), unconditionally", () => {
    const HEADER = read("app/components/landing/landing-header.tsx")
    // navItemsDef
    expect(HEADER).toMatch(/href:\s*"\/docs",\s*labelKey:\s*"docs",\s*label:\s*"Docs"/)
    // mobile resourceLinks
    expect(HEADER).toMatch(/href:\s*"\/docs",\s*label:\s*"Docs"/)
    // The navbar carries NO separate "API" item: the developer story lives
    // behind the landing hero's Product/Developers toggle, and /docs is the
    // only reference link in the header (desktop nav + mobile drawer).
    expect(HEADER).not.toContain("/api-docs")
    expect(HEADER).not.toContain("DEVELOPERS_API_ENABLED")
  })
  it("the Copy-for-AI prompt points at the public docs + llm version", () => {
    const PROMPT = read("lib/coasty-ai-prompt.ts")
    expect(PROMPT).toContain("https://coasty.ai/docs/llms.txt")
    expect(PROMPT).toContain("Human docs: https://coasty.ai/docs")
  })
  it("the sitemap + discovery manifest list the new docs URLs", () => {
    const SITEMAP = read("app/sitemap.ts")
    expect(SITEMAP).toMatch(/\/docs`/)
    expect(SITEMAP).toMatch(/'\/docs\/llms\.txt'/)
    const DISCOVERY = read("app/api/discovery/route.ts")
    expect(DISCOVERY).toMatch(/apiReference:\s*`\$\{ORIGIN\}\/docs`/)
    expect(DISCOVERY).toMatch(/apiReferenceLlms:\s*`\$\{ORIGIN\}\/docs\/llms\.txt`/)
  })
})
