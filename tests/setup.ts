/**
 * Vitest global test setup for frontend tests
 *
 * Sets up environment variables and mocks that are shared across all test suites.
 *
 * IMPORTANT — vitest 4.1.0's runner crashes if anything from "vitest" is
 * imported inside a setupFiles entry. The error reported on every test file
 * is: "Vitest failed to find the runner ... vitest is imported inside Vite
 * / Vitest config file." That kills the entire run before any test executes.
 * Keep this file import-free of vitest helpers. Per-test mocks (vi.mock,
 * vi.fn) belong in the individual .test.ts / .test.tsx files where the
 * runner is active.
 */

// Provide required env vars so modules that read them at import-time don't throw
process.env.ENCRYPTION_KEY = Buffer.from("a]b2c3d5e5f6a1b2c3d4e5f6a1b2c3d4").toString("base64") // 32 bytes
process.env.CSRF_SECRET = "test-csrf-secret"
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co"
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key"
process.env.INTERNAL_API_KEY = "test-internal-key"
process.env.PYTHON_BACKEND_URL = "http://localhost:8001"
