/**
 * Display formatting for Composio ("connections") tool calls.
 *
 * Composio exposes tools named `composio_<toolkit>_<ACTION>` — e.g.
 * `composio_gmail_send_email`, `composio_GITHUB_CREATE_AN_ISSUE`,
 * `composio_googlecalendar_create_event`. The UI must NEVER surface the raw
 * name or the word "composio": a connected-app call should read like any other
 * action ("Gmail · Send email", "Using GitHub to create an issue").
 *
 * These are pure string helpers (no React / no network) shared by every
 * surface that renders tool calls — the chat tool-invocation summary and the
 * project-navigator detail panel — so formatting stays identical and
 * generalizes across every toolkit/connection.
 */

// Brand-correct display names for toolkit slugs that don't title-case cleanly:
// concatenated words ("googlecalendar"), acronyms ("hubspot"→"HubSpot"),
// camelCase brands ("clickup"→"ClickUp"). Anything not listed falls back to a
// title-cased slug, so a brand-new toolkit still renders reasonably.
const TOOLKIT_LABELS: Record<string, string> = {
  gmail: "Gmail",
  googlecalendar: "Google Calendar",
  googledrive: "Google Drive",
  googledocs: "Google Docs",
  googlesheets: "Google Sheets",
  googlemeet: "Google Meet",
  googlemaps: "Google Maps",
  googletasks: "Google Tasks",
  outlook: "Outlook",
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  slack: "Slack",
  discord: "Discord",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  notion: "Notion",
  linear: "Linear",
  jira: "Jira",
  asana: "Asana",
  trello: "Trello",
  clickup: "ClickUp",
  todoist: "Todoist",
  airtable: "Airtable",
  coda: "Coda",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  pipedrive: "Pipedrive",
  zoho: "Zoho",
  intercom: "Intercom",
  zendesk: "Zendesk",
  stripe: "Stripe",
  shopify: "Shopify",
  figma: "Figma",
  miro: "Miro",
  dropbox: "Dropbox",
  onedrive: "OneDrive",
  calendly: "Calendly",
  zoom: "Zoom",
  microsoftteams: "Microsoft Teams",
  msteams: "Microsoft Teams",
  twilio: "Twilio",
  sendgrid: "SendGrid",
  mailchimp: "Mailchimp",
  youtube: "YouTube",
  twitter: "Twitter",
  linkedin: "LinkedIn",
  reddit: "Reddit",
  spotify: "Spotify",
  openai: "OpenAI",
  perplexityai: "Perplexity",
  posthog: "PostHog",
  sentry: "Sentry",
  datadog: "Datadog",
  pagerduty: "PagerDuty",
  cloudflare: "Cloudflare",
  vercel: "Vercel",
  netlify: "Netlify",
  supabase: "Supabase",
  aws: "AWS",
  azure: "Azure",
  gcp: "GCP",
}

function titleCaseSlug(slug: string): string {
  const s = slug.replace(/[_-]+/g, " ").trim()
  if (!s) return ""
  return s
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ")
}

/** "send_email"/"SEND_EMAIL" → "Send email"; "create_an_issue" → "Create an issue". */
function humanizeAction(action: string): string {
  const words = action.replace(/[_-]+/g, " ").trim().toLowerCase()
  if (!words) return ""
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export interface ParsedComposioTool {
  /** Lowercased toolkit slug, e.g. "gmail", "googlecalendar". */
  toolkitSlug: string
  /** Brand-correct display name, e.g. "Gmail", "Google Calendar". */
  toolkitLabel: string
  /** Raw action segment, e.g. "send_email" (may be ""). */
  actionSlug: string
  /** Humanized action, e.g. "Send email" (may be ""). */
  actionLabel: string
}

/**
 * Parse a `composio_*` tool name into clean, human pieces. Returns null for any
 * non-Composio tool so callers can fall through to their existing handling.
 * Detection is case-insensitive and tolerates a `-` separator after the prefix.
 */
export function parseComposioToolName(
  toolName: unknown,
): ParsedComposioTool | null {
  if (typeof toolName !== "string") return null
  const prefix = /^composio[_-]/i.exec(toolName)
  if (!prefix) return null
  const rest = toolName.slice(prefix[0].length)
  if (!rest) return null
  const us = rest.indexOf("_")
  const toolkitSlug = (us > 0 ? rest.slice(0, us) : rest).toLowerCase()
  if (!toolkitSlug) return null
  const actionSlug = us > 0 ? rest.slice(us + 1) : ""
  return {
    toolkitSlug,
    toolkitLabel: TOOLKIT_LABELS[toolkitSlug] ?? titleCaseSlug(toolkitSlug),
    actionSlug,
    actionLabel: humanizeAction(actionSlug),
  }
}

/** True for any `composio_*` tool name. */
export function isComposioToolName(toolName: unknown): boolean {
  return parseComposioToolName(toolName) !== null
}

/**
 * Compact label for a Composio tool: "Gmail · Send email" (or just "Gmail"
 * when there's no action segment). Null for non-Composio tools.
 */
export function composioToolLabel(toolName: unknown): string | null {
  const p = parseComposioToolName(toolName)
  if (!p) return null
  return p.actionLabel ? `${p.toolkitLabel} · ${p.actionLabel}` : p.toolkitLabel
}

/**
 * A sentence describing a Composio call, in the same present/past voice as the
 * other tool descriptions. Null for non-Composio tools.
 *   active=true  → "Using Gmail to send email"
 *   active=false → "Used Gmail to send email"
 * Falls back to "Using Gmail" / "Used Gmail" when there's no action segment.
 */
export function composioToolDescription(
  toolName: unknown,
  active: boolean,
): string | null {
  const p = parseComposioToolName(toolName)
  if (!p) return null
  const verb = active ? "Using" : "Used"
  return p.actionLabel
    ? `${verb} ${p.toolkitLabel} to ${p.actionLabel.toLowerCase()}`
    : `${verb} ${p.toolkitLabel}`
}
