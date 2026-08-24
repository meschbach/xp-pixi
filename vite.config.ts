import { defineConfig } from 'vite';

export default defineConfig({
  // `||` (not `??`) so an empty CDN_BASE — as CI emits for PR builds — still
  // falls back to the root base.
  base: process.env.CDN_BASE || '/',
});
