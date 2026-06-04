import type { Page, Route } from '@playwright/test'

/**
 * Deterministic Composio API fixtures for visual-fit / i18n-overflow tests.
 *
 * Covers every status the connections UI renders so that whichever filter pill
 * or card variant a test surfaces gets a real, measurable label:
 *   - ACTIVE     (green dot, optional Disconnect)
 *   - INITIATED  (amber dot, "Connecting…" copy)
 *   - EXPIRED    (red dot, Reconnect CTA)
 *   - FAILED     (red dot, Reconnect CTA)
 *   - INACTIVE   (gray dot, paused)
 *
 * Toolkits cover every category rule in connect-app-dialog.tsx
 * (all/popular/communication/productivity/calendar/dev/crm) so every
 * `chips-cat-*` filter has at least one match.
 */

export type ComposioConnectionStatus =
  | 'ACTIVE'
  | 'INITIATED'
  | 'EXPIRED'
  | 'FAILED'
  | 'INACTIVE'

export interface MockConnection {
  id: string
  app_slug: string
  app_name: string
  account_label: string
  status: ComposioConnectionStatus
  created_at: string
  last_used_at?: string
  logo_url?: string
}

export interface MockToolkit {
  slug: string
  name: string
  logo_url: string
  description: string
  categories: string[]
  popular?: boolean
}

export const MOCK_CONNECTIONS: MockConnection[] = [
  {
    id: 'conn_gmail_active',
    app_slug: 'gmail',
    app_name: 'Gmail',
    account_label: 'e2e@coasty.test',
    status: 'ACTIVE',
    created_at: '2026-05-01T10:00:00Z',
    last_used_at: '2026-05-01T10:00:00Z',
    logo_url: 'https://logo.clearbit.com/google.com',
  },
  {
    id: 'conn_slack_initiated',
    app_slug: 'slack',
    app_name: 'Slack',
    account_label: 'coasty-workspace',
    status: 'INITIATED',
    created_at: '2026-05-02T12:30:00Z',
    last_used_at: '2026-05-02T12:30:00Z',
    logo_url: 'https://logo.clearbit.com/slack.com',
  },
  {
    id: 'conn_notion_expired',
    app_slug: 'notion',
    app_name: 'Notion',
    account_label: 'workspace-x',
    status: 'EXPIRED',
    created_at: '2026-04-10T09:00:00Z',
    last_used_at: '2026-05-15T09:00:00Z',
    logo_url: 'https://logo.clearbit.com/notion.so',
  },
  {
    id: 'conn_gcal_failed',
    app_slug: 'gcal',
    app_name: 'Google Calendar',
    account_label: 'primary',
    status: 'FAILED',
    created_at: '2026-04-15T08:00:00Z',
    last_used_at: '2026-05-20T08:00:00Z',
    logo_url: 'https://logo.clearbit.com/google.com',
  },
  {
    id: 'conn_github_active',
    app_slug: 'github',
    app_name: 'GitHub',
    account_label: 'PrateekJannu',
    status: 'ACTIVE',
    created_at: '2026-03-01T14:00:00Z',
    last_used_at: '2026-03-01T14:00:00Z',
    logo_url: 'https://logo.clearbit.com/github.com',
  },
  {
    id: 'conn_hubspot_inactive',
    app_slug: 'hubspot',
    app_name: 'HubSpot',
    account_label: 'sales-team',
    status: 'INACTIVE',
    created_at: '2026-02-12T16:45:00Z',
    last_used_at: '2026-05-25T16:45:00Z',
    logo_url: 'https://logo.clearbit.com/hubspot.com',
  },
]

export const MOCK_TOOLKITS: MockToolkit[] = [
  // Communication
  {
    slug: 'gmail',
    name: 'Gmail',
    logo_url: 'https://logo.clearbit.com/google.com',
    description: 'Send, read, and organize email from your Gmail account.',
    categories: ['communication', 'popular'],
    popular: true,
  },
  {
    slug: 'slack',
    name: 'Slack',
    logo_url: 'https://logo.clearbit.com/slack.com',
    description: 'Post messages, react, and search across Slack channels.',
    categories: ['communication', 'popular'],
    popular: true,
  },
  {
    slug: 'discord',
    name: 'Discord',
    logo_url: 'https://logo.clearbit.com/discord.com',
    description: 'Send and read messages across Discord servers.',
    categories: ['communication'],
  },
  {
    slug: 'outlook',
    name: 'Outlook',
    logo_url: 'https://logo.clearbit.com/microsoft.com',
    description: 'Microsoft Outlook mail and contacts.',
    categories: ['communication'],
  },

  // Productivity
  {
    slug: 'notion',
    name: 'Notion',
    logo_url: 'https://logo.clearbit.com/notion.so',
    description: 'Read and write pages, databases, and blocks in Notion.',
    categories: ['productivity', 'popular'],
    popular: true,
  },
  {
    slug: 'linear',
    name: 'Linear',
    logo_url: 'https://logo.clearbit.com/linear.app',
    description: 'Create issues, manage projects, and triage in Linear.',
    categories: ['productivity', 'popular'],
    popular: true,
  },
  {
    slug: 'asana',
    name: 'Asana',
    logo_url: 'https://logo.clearbit.com/asana.com',
    description: 'Track tasks and projects across Asana workspaces.',
    categories: ['productivity'],
  },
  {
    slug: 'trello',
    name: 'Trello',
    logo_url: 'https://logo.clearbit.com/trello.com',
    description: 'Boards, lists, and cards for Trello.',
    categories: ['productivity'],
  },
  {
    slug: 'gdocs',
    name: 'Google Docs',
    logo_url: 'https://logo.clearbit.com/google.com',
    description: 'Create and edit Google Docs.',
    categories: ['productivity'],
  },
  {
    slug: 'gsheets',
    name: 'Google Sheets',
    logo_url: 'https://logo.clearbit.com/google.com',
    description: 'Read and write spreadsheet data in Google Sheets.',
    categories: ['productivity'],
  },

  // Calendar
  {
    slug: 'gcal',
    name: 'Google Calendar',
    logo_url: 'https://logo.clearbit.com/google.com',
    description: 'List, create, and update Google Calendar events.',
    categories: ['calendar', 'popular'],
    popular: true,
  },
  {
    slug: 'calendly',
    name: 'Calendly',
    logo_url: 'https://logo.clearbit.com/calendly.com',
    description: 'Schedule meetings via Calendly links.',
    categories: ['calendar', 'popular'],
    popular: true,
  },
  {
    slug: 'outlook-calendar',
    name: 'Outlook Calendar',
    logo_url: 'https://logo.clearbit.com/microsoft.com',
    description: 'Manage events in Microsoft Outlook Calendar.',
    categories: ['calendar'],
  },

  // Developer
  {
    slug: 'github',
    name: 'GitHub',
    logo_url: 'https://logo.clearbit.com/github.com',
    description: 'Work with repos, issues, and pull requests on GitHub.',
    categories: ['dev', 'popular'],
    popular: true,
  },
  {
    slug: 'gitlab',
    name: 'GitLab',
    logo_url: 'https://logo.clearbit.com/gitlab.com',
    description: 'Read and write issues, MRs, and pipelines on GitLab.',
    categories: ['dev'],
  },
  {
    slug: 'sentry',
    name: 'Sentry',
    logo_url: 'https://logo.clearbit.com/sentry.io',
    description: 'Triage errors and releases in Sentry.',
    categories: ['dev'],
  },
  {
    slug: 'vercel',
    name: 'Vercel',
    logo_url: 'https://logo.clearbit.com/vercel.com',
    description: 'List projects and deployments on Vercel.',
    categories: ['dev'],
  },

  // CRM
  {
    slug: 'hubspot',
    name: 'HubSpot',
    logo_url: 'https://logo.clearbit.com/hubspot.com',
    description: 'Manage contacts, deals, and pipelines in HubSpot.',
    categories: ['crm', 'popular'],
    popular: true,
  },
  {
    slug: 'salesforce',
    name: 'Salesforce',
    logo_url: 'https://logo.clearbit.com/salesforce.com',
    description: 'Query and update Salesforce records.',
    categories: ['crm'],
  },
  {
    slug: 'pipedrive',
    name: 'Pipedrive',
    logo_url: 'https://logo.clearbit.com/pipedrive.com',
    description: 'Track deals through your Pipedrive pipeline.',
    categories: ['crm'],
  },
  {
    slug: 'attio',
    name: 'Attio',
    logo_url: 'https://logo.clearbit.com/attio.com',
    description: 'CRM and customer data in Attio.',
    categories: ['crm'],
  },
]

const jsonResponse = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  })

/**
 * Install Composio API mocks on the given page. Must be called BEFORE
 * `page.goto(...)` so the route handlers are in place for the first request.
 *
 * Routes intercepted (matched broadly so any base path / query string works):
 *   GET    /api/composio/connections                  → { enabled, connections }
 *   GET    /api/composio/toolkits                     → { enabled, toolkits }
 *   POST   /api/composio/connect/<toolkit_slug>       → { redirect_url, connected_account_id }
 *   DELETE /api/composio/disconnect/<connection_id>   → { success: true }
 *
 * Any other /api/composio/* request gets a generic 200 { ok: true } so a
 * stray fetch during a screenshot won't 500 the page.
 */
export async function installComposioMock(page: Page): Promise<void> {
  // ── ORDERING CRITICAL ──────────────────────────────────────────────────
  // Playwright matches routes in REVERSE registration order — the LAST
  // registered route handler is tried first. So we register the broad
  // catch-all FIRST and the specific handlers LAST. With this order, a
  // request for /api/composio/toolkits hits the specific toolkits handler
  // (registered last) instead of the catch-all that returns { ok: true }.
  // Inverted order silently breaks every specific handler — the consumer
  // ends up reading data?.toolkits as undefined and rendering empty state.

  // 1) Catch-all — registered FIRST so specific handlers below win.
  await page.route(/\/api\/composio\/.*/i, async (route) => {
    return jsonResponse(route, { ok: true })
  })

  // 2) Initiate OAuth flow — both /connect/<slug> and /initiate forms.
  await page.route(/\/api\/composio\/(connect|initiate)\/[^/?#]+(\?.*)?$/i, async (route) => {
    return jsonResponse(route, {
      redirect_url: 'http://localhost:3000/__test/oauth',
      connected_account_id: 'conn_pending_test',
      status: 'INITIATED',
    })
  })

  // 3) Disconnect — DELETE /api/composio/disconnect/<connection_id>.
  await page.route(/\/api\/composio\/disconnect\/[^/?#]+(\?.*)?$/i, async (route) => {
    if (route.request().method() !== 'DELETE') {
      return jsonResponse(route, { ok: true })
    }
    return jsonResponse(route, { success: true })
  })

  // 4) Single connection lookup by id — GET returns the single record.
  // (DELETE for an individual connection is handled by /disconnect/:id above,
  // which matches the real consumer at lib/composio-store/use-composio.ts:186.)
  await page.route(/\/api\/composio\/connections\/[^/?#]+(\?.*)?$/i, async (route) => {
    const url = route.request().url()
    const idMatch = url.match(/\/connections\/([^/?#]+)/i)
    const id = idMatch ? decodeURIComponent(idMatch[1]) : ''
    const match = MOCK_CONNECTIONS.find((c) => c.id === id)
    if (!match) return jsonResponse(route, { error: 'not_found' }, 404)
    return jsonResponse(route, match)
  })

  // 5) Toolkits list — must be after the catch-all so it wins.
  await page.route(/\/api\/composio\/toolkits(\?.*)?$/i, async (route) => {
    return jsonResponse(route, { enabled: true, toolkits: MOCK_TOOLKITS })
  })

  // 6) Connections list — GET only at this exact path. Registered LAST so
  // it has the highest precedence among the connections-prefixed handlers.
  await page.route(/\/api\/composio\/connections(\?.*)?$/i, async (route) => {
    if (route.request().method() !== 'GET') {
      return jsonResponse(route, { ok: true })
    }
    return jsonResponse(route, { enabled: true, connections: MOCK_CONNECTIONS })
  })
}
