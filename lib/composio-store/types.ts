/**
 * Composio store — TypeScript types matching backend API contracts.
 *
 * Field shape matches the FastAPI route responses in
 * backend/app/api/routes/composio.py and the Composio SDK normalisation
 * performed in backend/app/services/composio_tools.py.
 *
 * All slugs (app_slug, toolkit slug) are canonical: lowercase, hyphens
 * normalised to underscores. The backend enforces this; the frontend
 * should treat the values as opaque canonical identifiers.
 */

export type ConnectionStatus =
  | "ACTIVE"
  | "INITIATED"
  | "EXPIRED"
  | "FAILED"
  | "INACTIVE"

/**
 * Composio-supported authentication scheme identifiers. Mirrors the
 * `auth_schemes[]` strings emitted by the backend
 * (`backend/app/services/composio_tools.py`), which in turn come from
 * the Composio SDK's `toolkit.auth_schemes`.
 *
 * Frontend treats unknown strings as `"UNKNOWN"` at the use-site; the
 * type itself is intentionally not widened with `| string` so explicit
 * narrowing is forced on every consumer.
 */
export type AuthScheme =
  | "OAUTH2"
  | "OAUTH1"
  | "OAUTH1A"
  | "API_KEY"
  | "BEARER_TOKEN"
  | "BASIC"
  | "BASIC_WITH_JWT"
  | "NO_AUTH"
  | "GOOGLE_SERVICE_ACCOUNT"

/**
 * Whitelisted credential field names accepted by
 * `POST /api/composio/connect/{slug}`. The Next.js proxy
 * (`app/api/composio/connect/[app]/route.ts`) drops any key not in this
 * set before forwarding to FastAPI. Values are always strings on the
 * wire — JSON blobs (e.g. service-account JSON) are passed as a single
 * stringified field.
 */
export type ComposioConnectCredentials = Partial<{
  api_key: string
  token: string
  bearer_token: string
  username: string
  password: string
  jwt_token: string
  service_account_json: string
  client_id: string
  client_secret: string
}>

/**
 * A user's connected third-party account (e.g. their Gmail or Slack
 * authorization). Returned by `GET /api/composio/connections`.
 */
export interface ComposioConnection {
  /** Composio connected_account_id (nanoid). Pass to disconnect. */
  id: string
  /** Canonical app/toolkit slug (lowercase, underscore). */
  app_slug: string
  /** Human-readable app name (e.g. "Gmail"). */
  app_name: string
  /**
   * Optional human label for this specific account (e.g. the email
   * address). Composio v0.13.x does not always populate this; treat as
   * a hint rather than a stable identifier.
   */
  account_label: string | null
  /** Lifecycle state of the connection. */
  status: ConnectionStatus
  /** ISO-8601 timestamp of connection creation, or null when unknown. */
  created_at: string | null
  /** ISO-8601 timestamp of last successful tool invocation, or null. */
  last_used_at: string | null
  /** OAuth scopes granted, when available. Empty array otherwise. */
  scopes: string[]
  /**
   * Absolute URL to the toolkit's logo, propagated from the catalog or
   * the backend `/connections` payload if it carries a logo field.
   * Null when neither source supplies one — consumers should join
   * against `useComposioToolkits()` as a fallback before rendering a
   * generic icon.
   */
  logo_url?: string | null
  /** camelCase alias of `logo_url` for UI consumers. */
  logo?: string | null
  /** camelCase alias of `app_name` for UI consumers. */
  toolkitName?: string
  /** camelCase alias of `app_slug` for UI consumers. */
  toolkitSlug?: string
  /** camelCase alias of `created_at` for UI consumers. */
  createdAt?: string | null
  /** camelCase alias of `last_used_at` for UI consumers. */
  updatedAt?: string | null
  /**
   * Authentication scheme this connection was created with. Allows the
   * connections UI to render different "reconnect" affordances for OAuth
   * (popup / redirect) vs. API_KEY / BEARER_TOKEN / BASIC (inline form).
   * Optional because older payloads may pre-date the field.
   */
  auth_scheme?: AuthScheme
}

/**
 * A toolkit (app) available in the Composio catalogue. Returned by
 * `GET /api/composio/toolkits`. Used to populate the "Connect an app"
 * picker.
 */
export interface ComposioToolkit {
  /** Canonical slug (lowercase, underscore). */
  slug: string
  /** Display name (e.g. "Google Drive"). */
  name: string
  /** Short marketing description; may be empty. */
  description: string
  /** Absolute URL to the app's logo, or null if missing. */
  logo_url: string | null
  /** camelCase alias of `logo_url` for UI consumers. */
  logo?: string | null
  /**
   * Tag-style categories (e.g. ["productivity", "email"]).
   *
   * Always emitted as an array by the current backend, but older backend
   * versions and malformed catalog entries can produce `undefined`. Treat
   * with `Array.isArray()` before iterating.
   */
  categories?: string[]
  /**
   * Preferred / first authentication scheme this toolkit advertises.
   * Used by the connect dialog to decide between the OAuth popup flow
   * and an inline credentials form. `null` / `undefined` means the
   * backend did not surface a scheme (treat as `UNKNOWN`).
   */
  auth_type?: AuthScheme | null
  /**
   * Full list of authentication schemes the toolkit supports, in the
   * order the backend reported them. A toolkit may legitimately advertise
   * more than one (e.g. Linear supports both OAUTH2 and BEARER_TOKEN).
   * Empty / missing means only `auth_type` is known.
   */
  auth_schemes?: AuthScheme[]
}

/**
 * Discriminator for `POST /api/composio/connect/{slug}` responses.
 *
 * - `"redirect"`: the toolkit uses OAuth (1/1a/2) and the caller must
 *   navigate the browser to `redirect_url` to complete authorisation.
 * - `"connected"`: the toolkit uses a credential-based scheme
 *   (API_KEY / BEARER_TOKEN / BASIC / NO_AUTH / …); the connection
 *   was created synchronously and no navigation is required.
 */
export type ComposioConnectStatus = "redirect" | "connected"

/**
 * Discriminated union returned by `POST /api/composio/connect/{slug}`.
 *
 * For OAuth toolkits the response carries an absolute `redirect_url` the
 * caller must navigate to. For credential-based toolkits the response
 * has `redirect_url: null`, `connection_created: true`, and the
 * connection appears immediately in the connections list after a
 * `CONNECTIONS_KEY` invalidation.
 *
 * Callers should branch on `status` before reading `redirect_url`.
 */
export type ComposioConnectResponse =
  | {
      status: "redirect"
      auth_scheme: "OAUTH2" | "OAUTH1" | "OAUTH1A"
      redirect_url: string
      connected_account_id: string
      /** Always `false` for the redirect branch — the OAuth callback
       *  is what eventually creates the connection. */
      connection_created?: false
    }
  | {
      status: "connected"
      auth_scheme: Exclude<AuthScheme, "OAUTH2" | "OAUTH1" | "OAUTH1A">
      redirect_url: null
      connected_account_id: string
      /** Always `true` for the connected branch — the backend created
       *  the connection synchronously and it is now active. */
      connection_created: true
    }

/**
 * Envelope shape for the list endpoints, including the `enabled` flag
 * that the backend uses to signal "Composio not configured".
 */
export interface ComposioConnectionsResponse {
  enabled: boolean
  connections: ComposioConnection[]
}

export interface ComposioToolkitsResponse {
  enabled: boolean
  toolkits: ComposioToolkit[]
}

/**
 * Backend error taxonomy for the connect flow. Codes are emitted by
 * `backend/app/api/routes/composio.py` in the FastAPI HTTPException
 * detail under `detail.code`. The UI matches on `code` (not free-text)
 * so localised error messages don't drift with copy edits.
 */
export type ComposioConnectErrorCode =
  | "unknown_toolkit"
  | "unsupported_auth_scheme"
  | "missing_credentials"
  | "invalid_credentials"
  | "credential_validation_failed"
  | "invalid_credential_field"
  | "composio_disabled"
  | "rate_limited"
  | "upstream"
  /**
   * Composio's edge / origin returned an upstream 5xx (e.g. Cloudflare 520
   * from `backend.composio.dev` when their managed OAuth credentials for
   * a toolkit are broken — X/Twitter is the canonical case). Emitted by
   * the backend's `_is_upstream_outage` detector. UI should render a
   * "Composio is temporarily unavailable — please try again" message and
   * offer a Retry button. ALWAYS retryable.
   */
  | "upstream_unavailable"
  /**
   * Generic upstream Composio failure (non-transient or unclassified).
   * Older code emitted this when 5xx detection wasn't in place; new code
   * emits `upstream_unavailable` instead, but we keep this code mapped
   * for backwards compatibility with cached deploys. Treated as
   * retryable so the UI still offers the same affordance.
   */
  | "composio_unavailable"
  | "unknown"

/**
 * Per-field descriptor surfaced alongside a `missing_credentials` error.
 * Mirrors the backend `required_fields` array element shape.
 */
export interface ComposioRequiredField {
  name: string
  label: string
  type: string
  required: boolean
}

/**
 * Typed error thrown by `useConnectApp` / `useDisconnectApp` mutations.
 * UI consumers branch on `code` to render inline form errors vs. toast
 * banners. `retryable: true` flags transient backend states (rate
 * limit, upstream, composio_disabled) so callers can offer a "try
 * again" affordance without re-parsing the message.
 */
export class ComposioConnectError extends Error {
  readonly code: ComposioConnectErrorCode
  readonly status: number
  readonly requiredFields?: ComposioRequiredField[]
  readonly retryable: boolean

  constructor(params: {
    code: ComposioConnectErrorCode
    status: number
    message?: string
    requiredFields?: ComposioRequiredField[]
    retryable?: boolean
  }) {
    super(params.message ?? params.code)
    this.name = "ComposioConnectError"
    this.code = params.code
    this.status = params.status
    this.requiredFields = params.requiredFields
    // Parens required: TS/oxc forbid mixing `??` with `||` without explicit
    // grouping. Default to the transient-error heuristic when retryable is
    // not supplied; otherwise honour the caller's choice.
    this.retryable =
      params.retryable ??
      (params.code === "rate_limited" ||
        params.code === "upstream" ||
        params.code === "upstream_unavailable" ||
        params.code === "composio_unavailable" ||
        params.code === "composio_disabled")
  }
}

/**
 * Field shape returned by `GET /api/composio/toolkits/{slug}/auth-schema`.
 * Only fetched lazily for niche schemes (BASIC_WITH_JWT,
 * GOOGLE_SERVICE_ACCOUNT, UNKNOWN) — the common
 * API_KEY/BEARER_TOKEN/BASIC fast paths have fixed shapes the UI
 * knows statically.
 */
export interface ComposioAuthSchemaField {
  name: string
  label: string
  type: "text" | "password" | "url" | "textarea"
  required: boolean
  description?: string
  placeholder?: string
  secret?: boolean
}

export interface ComposioAuthSchemaEntry {
  mode: AuthScheme
  fields: ComposioAuthSchemaField[]
  composio_managed: boolean
}

export interface ComposioAuthSchema {
  canonical: string
  raw_slug: string
  auth_schemes: ComposioAuthSchemaEntry[]
}

/**
 * Shape of the lazy /api/composio/toolkit-info/{slug} response.
 *
 * The backend route emits camelCase per its Pydantic alias config
 * (`response_model_by_alias=True`), so we mirror that here rather than
 * snake-case-normalising in the hook. The dialog reads `auth_scheme` /
 * `auth_schemes[].mode` directly to overlay onto the catalog data when
 * the lightweight `toolkits.list()` response didn't carry per-scheme
 * info — which is the common case for non-OAuth toolkits like Perplexity.
 */
export interface ComposioToolkitInfoSchemeDescriptor {
  mode: AuthScheme
  fields: ComposioAuthSchemaField[]
  composioManaged: boolean
}

export interface ComposioToolkitInfo {
  enabled: boolean
  slug: string
  rawSlug?: string
  name?: string
  /** Primary scheme — OAuth-preferring per backend sort. */
  authScheme?: AuthScheme | null
  /** Full advertised set with per-scheme credential fields. */
  authSchemes: ComposioToolkitInfoSchemeDescriptor[]
}
