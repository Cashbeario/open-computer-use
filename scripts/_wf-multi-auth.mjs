export const meta = {
  name: 'composio-multi-auth-support',
  description: 'Audit Composio auth schemes (OAuth2, API_KEY, Bearer, Basic, NO_AUTH), fix "Unknown toolkit: perplexityai", redesign backend + frontend + UI to handle every auth scheme dynamically, plus heavy testing.',
  phases: [
    { title: 'Audit', detail: '7 parallel readers' },
    { title: 'Spec', detail: 'captain decides architecture' },
    { title: 'BuildBackend', detail: 'parallel backend service + route + tests' },
    { title: 'BuildFrontend', detail: 'parallel frontend store + dialog + i18n + tests' },
    { title: 'Verify', detail: 'type-check + targeted tests' },
    { title: 'FixLoop', detail: 'fix any failures' },
    { title: 'Summary', detail: 'report' },
  ],
}

const AUDIT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['layer', 'summary', 'findings'],
  properties: {
    layer: { type: 'string' },
    summary: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
    auth_schemes_supported: { type: 'array', items: { type: 'string' } },
    code_excerpts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'lines', 'content', 'note'],
        properties: {
          file: { type: 'string' },
          lines: { type: 'string' },
          content: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
    suggested_fix: { type: 'string' },
  },
}

const SPEC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['backend_changes', 'frontend_changes', 'ui_changes', 'i18n_keys', 'test_cases', 'rationale'],
  properties: {
    backend_changes: { type: 'array', items: { type: 'string' } },
    frontend_changes: { type: 'array', items: { type: 'string' } },
    ui_changes: { type: 'array', items: { type: 'string' } },
    i18n_keys: { type: 'array', items: { type: 'string' } },
    test_cases: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' },
  },
}

const BUILD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['file', 'status', 'change_summary'],
  properties: {
    file: { type: 'string' },
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    change_summary: { type: 'string' },
    notes: { type: 'string' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['all_clean', 'type_check', 'frontend_tests', 'backend_tests', 'issues'],
  properties: {
    all_clean: { type: 'boolean' },
    type_check: { type: 'object', additionalProperties: false, required: ['passed', 'output'], properties: { passed: { type: 'boolean' }, output: { type: 'string' } } },
    frontend_tests: { type: 'object', additionalProperties: false, required: ['passed', 'output'], properties: { passed: { type: 'boolean' }, output: { type: 'string' } } },
    backend_tests: { type: 'object', additionalProperties: false, required: ['passed', 'output'], properties: { passed: { type: 'boolean' }, output: { type: 'string' } } },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['file', 'description', 'fix_hint'],
        properties: {
          file: { type: 'string' },
          line: { type: 'string' },
          description: { type: 'string' },
          fix_hint: { type: 'string' },
        },
      },
    },
  },
}

phase('Audit')

const audits = await parallel([
  () =>
    agent(
      'WebFetch Composio docs for EVERY auth scheme they support. Try:\n' +
        '- https://docs.composio.dev/auth-providers/oauth-providers\n' +
        '- https://docs.composio.dev/auth-providers/api-key\n' +
        '- https://docs.composio.dev/auth-providers/bearer-token\n' +
        '- https://docs.composio.dev/auth-providers/basic\n' +
        '- https://docs.composio.dev/auth-providers/no-auth\n' +
        '- https://docs.composio.dev/sdk/python/connections\n' +
        '- https://docs.composio.dev/sdk/python/initiating-connections\n\n' +
        'Also WebSearch "composio python SDK connected_accounts create api_key auth_scheme".\n\n' +
        'Document per auth scheme: the EXACT name returned by SDK (e.g. OAUTH2, API_KEY, BEARER_TOKEN, BASIC, NO_AUTH), what credential fields it needs, the EXACT Python SDK call to create vs initiate, the EXACT SDK method to fetch a toolkit auth_scheme.\n\n' +
        'List representative toolkits per scheme. Specifically: what is the official slug for Perplexity? "perplexityai"? "perplexity"? "perplexity_ai"?\n\n' +
        'Return auth_schemes_supported + findings + suggested_fix.',
      { label: 'audit-composio-docs', phase: 'Audit', schema: AUDIT_SCHEMA }
    ),
  () =>
    agent(
      'Read backend/app/services/composio_tools.py in FULL.\n\n' +
        'Document every function and what Composio SDK method it wraps. Focus on initiate_connection: does it assume OAuth? Does any function fetch toolkit auth info? Does the module gracefully handle unknown toolkits?\n\n' +
        'Capture verbatim excerpts of initiate_connection + any toolkit-info function.\n\n' +
        'Suggested fix: detail new functions needed (get_toolkit_auth_scheme, create_api_key_connection, create_bearer_connection, create_basic_connection, create_no_auth_connection).',
      { label: 'audit-backend-service', phase: 'Audit', schema: AUDIT_SCHEMA }
    ),
  () =>
    agent(
      'Read backend/app/api/routes/composio.py in FULL.\n\n' +
        'Document every endpoint + the POST /connect/{toolkit_slug} request/response shape. Does it accept credentials, or only callback_url? What happens when toolkit is API_KEY auth?\n\n' +
        'Capture verbatim excerpts. Suggest new endpoints or modifications needed.',
      { label: 'audit-backend-route', phase: 'Audit', schema: AUDIT_SCHEMA }
    ),
  () =>
    agent(
      'Read lib/composio-store/types.ts, lib/composio-store/use-composio.ts, lib/composio-store/provider.tsx in FULL.\n\n' +
        'Document the connect/startConnect mutation, the ComposioToolkit type, ComposioConnectResponse type, and error handling path. Does the type include auth_scheme?\n\n' +
        'Capture verbatim excerpts. Suggest extensions for credentials + non-redirect outcomes.',
      { label: 'audit-frontend-store', phase: 'Audit', schema: AUDIT_SCHEMA }
    ),
  () =>
    agent(
      'Read app/connections/connect-app-dialog.tsx in FULL.\n\n' +
        'Document the browse-then-confirm two-step view + the Connect button + openAuthTab helper. Where does the click flow lead?\n\n' +
        'Design how to handle API_KEY auth: after click Connect on a non-OAuth toolkit, show an inline input form for the API key, then POST to /api/composio/connect/<slug> with body {credentials: {api_key}}.\n\n' +
        'Capture verbatim excerpts + propose precise dialog changes covering: OAUTH2, API_KEY, BEARER_TOKEN, BASIC, NO_AUTH, UNKNOWN fallback.',
      { label: 'audit-dialog-ui', phase: 'Audit', schema: AUDIT_SCHEMA }
    ),
  () =>
    agent(
      'Find where "Unknown toolkit: perplexityai" actually originates.\n\n' +
        'grep BACKEND for "Unknown toolkit" or "perplexityai" or "perplexity". Check composio_tools.py, composio.py route, and the installed Composio SDK in backend/.venv if accessible.\n\n' +
        'grep FRONTEND same way.\n\n' +
        'Document: source location, exact error string, exact slug passed when it fires.\n\n' +
        'Also WebFetch https://composio.dev/integrations to find the OFFICIAL Composio slug for Perplexity.\n\n' +
        'Suggested fix: confirm the right slug + describe whether we need to normalize or update the catalog source.',
      { label: 'audit-unknown-toolkit-error', phase: 'Audit', schema: AUDIT_SCHEMA }
    ),
  () =>
    agent(
      'Audit how toolkit slugs flow end-to-end: Composio catalog API → backend list_toolkits → Next.js /api/composio/toolkits → frontend useComposioToolkits → ConnectAppDialog click handler → backend /connect/{slug} → Composio SDK initiate.\n\n' +
        'At every step, capture: what slug is passed in, what slug comes out, any normalization (lowercase, hyphen→underscore, regex replace).\n\n' +
        'Identify when the user clicks Connect on a Perplexity card whose SDK slug is "perplexityai", what slug actually reaches the Composio SDK at the backend. If transformed, that may be the bug.\n\n' +
        'Capture verbatim excerpts of every transformation point. Suggest the fix.',
      { label: 'audit-slug-flow', phase: 'Audit', schema: AUDIT_SCHEMA }
    ),
])

const auditJson = JSON.stringify(audits.filter(Boolean), null, 2)
log('Audit: ' + audits.filter(Boolean).length + ' reports')

phase('Spec')

const spec = await agent(
  'You are the captain. Synthesize 7 audit reports into a precise build spec for multi-auth support.\n\n' +
    '## Audit reports\n```json\n' + auditJson + '\n```\n\n' +
    'Decide:\n\n' +
    'A. Architecture: where auth-scheme detection lives, how the frontend learns it, whether the catalog includes auth_scheme per item or requires a per-toolkit fetch.\n\n' +
    'B. Backend changes: new service functions per auth scheme, route modifications, new endpoints, slug normalization rules.\n\n' +
    'C. Frontend changes: type extensions (auth_scheme on ComposioToolkit, no-redirect on ComposioConnectResponse), mutation extension to accept optional credentials, error path for unknown_toolkit / missing_credentials.\n\n' +
    'D. UI changes (connect-app-dialog.tsx): branch the confirm step on toolkit.auth_scheme to render the appropriate input form for each scheme, plus an UNKNOWN fallback that links to the Composio dashboard.\n\n' +
    'E. i18n keys: list every new key with English text covering apiKeyLabel, apiKeyPlaceholder, bearerTokenLabel, bearerTokenPlaceholder, basicAuthUsername, basicAuthPassword, basicAuthUsernamePlaceholder, basicAuthPasswordPlaceholder, connectWithApiKey, connectWithBearerToken, connectWithBasic, connectNoAuth, unsupportedAuthTitle, unsupportedAuthBody, openComposioDashboard, credentialsRequired, credentialsErrorPrefix.\n\n' +
    'F. Test cases: backend pytest + frontend vitest + locale budget assertions.\n\n' +
    'G. Specific Perplexity fix: confirm official slug, describe correction.\n\n' +
    'Return structured spec.',
  { label: 'spec-captain', phase: 'Spec', schema: SPEC_SCHEMA }
)

const specJson = JSON.stringify(spec, null, 2)
log('Spec: ' + (spec.backend_changes && spec.backend_changes.length) + ' backend / ' + (spec.frontend_changes && spec.frontend_changes.length) + ' frontend / ' + (spec.ui_changes && spec.ui_changes.length) + ' UI / ' + (spec.i18n_keys && spec.i18n_keys.length) + ' i18n / ' + (spec.test_cases && spec.test_cases.length) + ' tests')

const specHeader = 'THE BUILD SPEC (follow exactly):\n\n' + specJson + '\n\n'

phase('BuildBackend')

const backendResults = await parallel([
  () =>
    agent(
      specHeader +
        'Modify backend/app/services/composio_tools.py per the spec.\n\n' +
        'Add: get_toolkit_auth_scheme(slug), create_api_key_connection(user_id, slug, api_key), create_bearer_connection, create_basic_connection, create_no_auth_connection. Extend list_toolkits to include auth_scheme per item. Modify initiate_connection to detect non-OAuth toolkits and raise a clear error. Add try/except around toolkit lookups so unknown slugs return a structured error envelope instead of crashing.\n\n' +
        'Keep all existing functions backward compatible.\n\n' +
        'Use Read + Edit. Return structured report.',
      { label: 'backend-service', phase: 'BuildBackend', schema: BUILD_SCHEMA }
    ),
  () =>
    agent(
      specHeader +
        'Modify backend/app/api/routes/composio.py per the spec.\n\n' +
        'Extend POST /connect/{toolkit_slug} body to accept optional {auth_scheme, credentials: {api_key?, bearer_token?, username?, password?}}. Dispatch per auth_scheme: OAUTH2 → initiate_connection, API_KEY → create_api_key_connection, BEARER_TOKEN → create_bearer_connection, BASIC → create_basic_connection, NO_AUTH → create_no_auth_connection.\n\n' +
        'Add GET /toolkit-info/{toolkit_slug} → returns toolkit auth_scheme + required credential fields. Ensure /toolkits list response includes auth_scheme per item. Surface clear errors: 404 unknown toolkit, 422 missing credentials.\n\n' +
        'Use Read + Edit. Return structured report.',
      { label: 'backend-route', phase: 'BuildBackend', schema: BUILD_SCHEMA }
    ),
  () =>
    agent(
      specHeader +
        'Create backend/tests/test_composio_multi_auth.py with pytest tests:\n' +
        '1. list_toolkits returns auth_scheme on every item\n' +
        '2. get_toolkit_auth_scheme returns correct value for OAUTH2 + API_KEY toolkits (mock SDK)\n' +
        '3. create_api_key_connection invokes SDK with correct args\n' +
        '4. initiate_connection raises clear error when called for API_KEY toolkit\n' +
        '5. Unknown toolkit returns clean error envelope (not crash)\n' +
        '6. POST /connect/{slug} dispatches correctly per auth_scheme (FastAPI TestClient + mocked composio_tools)\n' +
        '7. POST /connect/{slug} returns 422 when API_KEY required but credentials missing\n' +
        '8. GET /toolkit-info/{slug} returns expected shape\n\n' +
        'Mirror conventions from backend/tests/test_composio_tools.py.\n\n' +
        'Use Write. Return structured report.',
      { label: 'backend-tests', phase: 'BuildBackend', schema: BUILD_SCHEMA }
    ),
])
log('BuildBackend: ' + backendResults.filter(Boolean).length + ' / 3 done')

phase('BuildFrontend')

const frontendResults = await parallel([
  () =>
    agent(
      specHeader +
        'Modify lib/composio-store/types.ts and lib/composio-store/use-composio.ts.\n\n' +
        'Type changes: add auth_scheme to ComposioToolkit, extend ComposioConnectResponse to support no-redirect (connection_created, status), add ComposioConnectCredentials type.\n\n' +
        'Mutation changes: extend startConnect/connect to accept optional credentials; when response has connection_created=true and no redirect_url, treat as success and invalidate the connections query; surface clean errors for unknown_toolkit / missing_credentials backend responses.\n\n' +
        'Use Read + Edit. Return structured report.',
      { label: 'frontend-store', phase: 'BuildFrontend', schema: BUILD_SCHEMA }
    ),
  () =>
    agent(
      specHeader +
        'Modify app/connections/connect-app-dialog.tsx to support multi-auth UX.\n\n' +
        'Branch the confirm step on toolkit.auth_scheme:\n' +
        '- OAUTH2 (or undefined): keep existing flow\n' +
        '- API_KEY: render Input for the key, label + placeholder, Connect button → startConnect(slug, {api_key})\n' +
        '- BEARER_TOKEN: same as API_KEY but Bearer Token label\n' +
        '- BASIC: two inputs (username + password)\n' +
        '- NO_AUTH: single Connect button → startConnect(slug)\n' +
        '- UNKNOWN: graceful "Manage from Composio dashboard" message + outbound link\n\n' +
        'Add proper loading + error states. Use existing AnimatePresence pattern + shadcn Input components.\n\n' +
        'Use Read + Edit. Return structured report.',
      { label: 'frontend-dialog', phase: 'BuildFrontend', schema: BUILD_SCHEMA }
    ),
  () =>
    agent(
      specHeader +
        'Add i18n keys for the new multi-auth UX strings under connections.connectDialog.confirm (spec lists all of them).\n\n' +
        'For messages/en.json, add keys directly with the spec English text. For each of the 29 other locales, produce natural translations matching each locale formality conventions.\n\n' +
        'Use a bulk Node script (write to scripts/_add-multi-auth-i18n.mjs then node it then rm it) to deep-merge keys into every locale file.\n\n' +
        'Return structured report listing locales updated.',
      { label: 'frontend-i18n', phase: 'BuildFrontend', schema: BUILD_SCHEMA }
    ),
  () =>
    agent(
      specHeader +
        'Extend tests/composio-store.test.ts with:\n' +
        '1. ComposioToolkit type accepts auth_scheme\n' +
        '2. connect mutation with credentials → POST body includes credentials\n' +
        '3. connect handling no-redirect response\n' +
        '4. Unknown toolkit error surfacing\n' +
        '5. Missing credentials error surfacing\n\n' +
        'Update tests/i18n-connections-budget.test.ts to include budget assertions for the new keys across all 30 locales.\n\n' +
        'Return structured report.',
      { label: 'frontend-tests', phase: 'BuildFrontend', schema: BUILD_SCHEMA }
    ),
])
log('BuildFrontend: ' + frontendResults.filter(Boolean).length + ' / 4 done')

phase('Verify')

const verifyPrompt = (iter) =>
  'Verification iter ' + iter + '. Run via Bash:\n' +
  '1. JSON validity for all 30 locale files\n' +
  '2. npm run type-check\n' +
  '3. Backend service tests: cd backend && python -m pytest tests/test_composio_tools.py tests/test_composio_multi_auth.py -x --tb=short 2>&1 | tail -30\n' +
  '4. Backend integration tests: cd backend && python -m pytest tests/test_composio_integration.py -x --tb=short 2>&1 | tail -30\n' +
  '5. Frontend store tests: npx vitest run tests/composio-store.test.ts 2>&1 | tail -10\n' +
  '6. Frontend i18n budget: npx vitest run tests/i18n-connections-budget.test.ts 2>&1 | tail -10\n' +
  '7. Frontend RTL lint: npx vitest run tests/i18n-connections-rtl-lint.test.ts 2>&1 | tail -10\n\n' +
  'Truncate huge outputs. Report issues. all_clean only if every step passes.'

let verifyResult = await agent(verifyPrompt(1), {
  label: 'verify-iter-1',
  phase: 'Verify',
  schema: VERIFY_SCHEMA,
})
log('Verify iter 1: all_clean=' + (verifyResult && verifyResult.all_clean))

phase('FixLoop')

let fixIter = 0
while (verifyResult && !verifyResult.all_clean && fixIter < 2 && verifyResult.issues && verifyResult.issues.length > 0) {
  fixIter += 1
  log('Fix iter ' + fixIter + ': ' + verifyResult.issues.length + ' issues.')
  await parallel(
    verifyResult.issues.map((issue, idx) => () =>
      agent(
        'Fix this verification failure:\n' +
          'File: ' + (issue.file || '(unknown)') + '\n' +
          'Line: ' + (issue.line || '(unknown)') + '\n' +
          'Description: ' + issue.description + '\n' +
          'Hint: ' + issue.fix_hint + '\n\n' +
          'Read, fix minimally. Return one sentence.',
        { label: 'fix-' + fixIter + '-' + idx, phase: 'FixLoop' }
      )
    )
  )
  verifyResult = await agent(verifyPrompt(fixIter + 1), {
    label: 'verify-iter-' + (fixIter + 1),
    phase: 'FixLoop',
    schema: VERIFY_SCHEMA,
  })
  log('Verify after fix iter ' + fixIter + ': all_clean=' + (verifyResult && verifyResult.all_clean))
}

phase('Summary')

const summary = await agent(
  'Compile a Markdown summary for the user.\n\n' +
    '## What was broken\nBrief: Perplexity uses API_KEY auth; our code assumed OAuth2 for every toolkit.\n\n' +
    '## Auth schemes now supported\nTable: Scheme | Example apps | UI shows | Backend dispatches to\n\n' +
    '## Backend changes\nBulleted list of new functions + endpoint changes.\n\n' +
    '## Frontend changes\nBulleted list of type extensions + store mutation changes + dialog UX.\n\n' +
    '## i18n additions\nBrief: N new keys × 30 locales.\n\n' +
    '## Test coverage\nBulleted list of new test cases by surface.\n\n' +
    '## Verification\nTable: Check | Result.\n\n' +
    '## How to try it\n5-step manual flow.\n\n' +
    'Inputs:\n\n' +
    '## Spec\n' + specJson.slice(0, 4000) + '\n\n' +
    '## Backend builds\n' + JSON.stringify(backendResults.filter(Boolean), null, 2).slice(0, 4000) + '\n\n' +
    '## Frontend builds\n' + JSON.stringify(frontendResults.filter(Boolean), null, 2).slice(0, 4000) + '\n\n' +
    '## Verify\n' + JSON.stringify(verifyResult, null, 2),
  { label: 'summary', phase: 'Summary' }
)

return summary
