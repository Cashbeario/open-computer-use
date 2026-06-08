"use client"

import { DeveloperDocs } from "@/app/components/developers/developer-docs"
import { DevPageShell, DevHeader } from "@/app/components/developers/developers-shared"

/* ===================================================================
   Docs page — a purpose-built, professional reference for the Computer
   Use API. <DeveloperDocs/> renders a prominent sticky section sidebar,
   high-detail prose per section, and language-tabbed code samples that
   are verified against the live v1 contract. DevPageShell supplies the
   same chrome (ambient orbs + scroll container) as every developer page;
   DeveloperDocs' scroll-spy uses IntersectionObserver, so the sidebar
   tracks correctly inside that scroll container.
   =================================================================== */

export function DocsContent() {
  return (
    <DevPageShell>
      <DevHeader
        title="Docs"
        description="Everything you need to integrate the Computer Use API: authentication, the core endpoints, action and response reference, errors, rate limits, and pricing."
      />
      <DeveloperDocs />
    </DevPageShell>
  )
}
