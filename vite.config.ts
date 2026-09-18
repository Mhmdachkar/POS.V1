import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { cloudflare } from '@cloudflare/vite-plugin'
import path from 'path'

/**
 * Cloudflare Vite plugin adapts this SPA for Workers Static Assets.
 * Do NOT set assets.directory in wrangler.jsonc — the plugin generates
 * the client asset path in the build output config.
 * Do NOT add a Worker main/API — Supabase remains the backend.
 */
export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
})
