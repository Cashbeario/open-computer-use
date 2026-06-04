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
  /** Auth flow this toolkit uses (e.g. "OAUTH2", "API_KEY"). */
  auth_type?: string | null
}

/**
 * Shape returned by `POST /api/composio/connect/{slug}`. The client is
 * expected to navigate the browser to `redirect_url` to complete OAuth.
 */
export interface ComposioConnectResponse {
  redirect_url: string
  connected_account_id: string
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
