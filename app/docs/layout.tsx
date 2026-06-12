import type { Metadata } from "next"

const TITLE = "API reference — Coasty Computer Use API"
const DESCRIPTION =
  "The full Coasty Computer Use API: stateless prediction, stateful sessions, autonomous task runs, and multi-step workflows. REST over HTTPS, with an LLM-friendly plain-text version at /docs/llms.txt."

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "Coasty API",
    "computer use API",
    "AI agent API",
    "browser automation API",
    "computer use agent docs",
    "autonomous agent API",
    "REST API documentation",
    "llms.txt",
  ],
  alternates: { canonical: "https://coasty.ai/docs" },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://coasty.ai/docs",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return children
}
