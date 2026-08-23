import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.CDN_BASE ?? '/',
});
