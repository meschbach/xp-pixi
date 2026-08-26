import { defineConfig } from 'vitest/config';

export default defineConfig({
  // `||` (not `??`) so an empty CDN_BASE — as emitted for PR builds — still
  // falls back to the root base.
  base: process.env.CDN_BASE || '/',
  server: {
    forwardConsole: {
      logLevels: ['log', 'warn', 'error', 'debug', 'info'],
      unhandledErrors: true,
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
