# Cloudflare deployment (Aquilux POS / POS.V1)

Aquilux POS (repo **POS.V1**) is a **client-side React + Vite SPA**. Supabase is the backend. The local Windows print agent is separate and is **not** deployed to Cloudflare. This is not the VHM product.

## Architecture

```
React / Vite SPA
    ↓
Cloudflare Workers Static Assets (@cloudflare/vite-plugin)
    ↓
Supabase (Auth + Postgres + RPCs)

Cashier PC → local print agent → cashier printer
Depot PC  → local print agent → depot printer
```

### Input config (repository)

| File | Role |
|------|------|
| `vite.config.ts` | `@vitejs/plugin-react` + `@cloudflare/vite-plugin` |
| `wrangler.jsonc` | Worker name, `compatibility_date`, SPA `not_found_handling` |

**Do not** set `assets.directory` in input `wrangler.jsonc` — the Vite plugin writes the client asset path into the **generated** build-output Wrangler config.

**Do not** add a Worker `main`, `worker/index.ts`, `/api` routes, or API Worker. Supabase remains the backend.

### Expected `wrangler.jsonc`

```jsonc
{
  "name": "aquilux-pos",
  "compatibility_date": "2026-09-18",
  "workers_dev": true,
  "preview_urls": true,
  "assets": {
    "not_found_handling": "single-page-application"
  },
  "routes": [
    { "pattern": "aquilux-pos.online", "custom_domain": true },
    { "pattern": "www.aquilux-pos.online", "custom_domain": true },
    { "pattern": "vhm-pos.com", "custom_domain": true }
  ]
}
```

## Local commands

```bash
npm run build      # tsc -b && vite build (Cloudflare plugin emits deploy config)
npm run preview    # Cloudflare-aware Workers preview of the build
npm run deploy     # build + wrangler deploy (requires Cloudflare auth — do not run until ready)
```

`vite preview` uses the Cloudflare Vite plugin Workers runtime (not a plain static file server).

Wrangler deploy uses the **generated** output config from the Vite build.

## Automatic deploy (GitHub → Cloudflare)

Repo **POS.V1**, workflow `.github/workflows/deploy-cloudflare.yml`:

- Triggers on **push to `main`** (and manual `workflow_dispatch`)
- Builds with `VITE_*` secrets, then `wrangler deploy` to Worker `aquilux-pos`

Required GitHub Actions secrets on `Mhmdachkar/POS.V1`:

| Secret | Purpose |
|--------|---------|
| `CLOUDFLARE_API_TOKEN` | API token with Workers edit (and account read) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |
| `VITE_SUPABASE_URL` | Production Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Production anon key |
| `VITE_APP_NAME` | e.g. `Aquilux POS` |

## Build-time environment variables

Set these for production builds (CI or Cloudflare build settings / secrets for `VITE_*` at build time):

| Variable | Notes |
|----------|--------|
| `VITE_SUPABASE_URL` | Public Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Public anon key (RLS-protected) |
| `VITE_ENABLE_QUERY_DEVTOOLS` | Use `false` in production |
| `VITE_APP_NAME` | Optional display name |

**Never** put these in the frontend / `VITE_*`:

- `SUPABASE_SERVICE_ROLE_KEY`
- database password
- JWT secret
- any private API credential

`SUPABASE_SERVICE_ROLE_KEY` may exist only inside Supabase Edge Functions (server), never in the SPA.

## Post-deploy checklist (manual — after real Cloudflare hostname)

Do **not** invent a hostname. After Cloudflare assigns one (e.g. `*.workers.dev` or a custom domain):

1. Supabase Dashboard → Authentication → URL Configuration
2. Set **Site URL** to `https://<your-cloudflare-hostname>`
3. Add **Redirect URLs** for that origin (and any auth callback paths you use)
4. Confirm production build was produced with the correct `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
5. Smoke-test login, POS, nested routes (refresh must not 404)

## Print agent

Cashiers/depot PCs still run `print-agent` locally. The SPA may call `http://127.0.0.1:9277/wake`; under HTTPS that wake may be blocked (mixed content). Job polling via Supabase still works without wake. Keep `127.0.0.1` for local print-agent communication.
