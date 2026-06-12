export async function register() {
  // Only run on server side
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // --- OSS-mode secret bootstrap (must run before anything reads
    // CSRF_SECRET / ENCRYPTION_KEY) ---
    // Generates missing CSRF_SECRET / ENCRYPTION_KEY and persists them to
    // .env.local on first boot. No-op outside OSS mode — production deploys
    // must set these explicitly (see lib/auto-secrets.ts:57-86). Dynamic
    // import keeps node:fs / node:crypto out of the Edge instrumentation
    // bundle, same pattern as the machine-cleanup import below.
    try {
      const { ensureLocalSecrets } = await import("@/lib/auto-secrets");
      ensureLocalSecrets();
    } catch (error) {
      console.error('❌ Failed to bootstrap OSS-mode secrets:', error);
    }

    // Track services for graceful shutdown
    let cleanupService: { start: () => void; stop: () => void } | null = null;

    // --- Machine cleanup service (requires Supabase service role) ---
    try {
      if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE) {
        const { getMachineCleanupService } = await import("@/lib/services/machine-cleanup");
        cleanupService = getMachineCleanupService();
        cleanupService.start();
        console.log('✅ Machine cleanup service started successfully');
      } else {
        console.warn('⚠️  Supabase service role not configured - machine cleanup disabled');
      }
    } catch (error) {
      console.error('❌ Failed to start machine cleanup service:', error);
    }

    // Status check persistence is handled by the backend (periodic_status_check
    // in main.py), so no frontend status checker is needed.

    // Graceful shutdown handling
    const shutdown = () => {
      console.log('🛑 Shutting down services...');
      try {
        cleanupService?.stop();
        console.log('✅ Services shut down successfully');
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('beforeExit', shutdown);
  }
}
