# Client identity (Aquilux / POS.V1)

| Field | Value |
|-------|--------|
| **Client** | Aquilux POS (repo **POS.V1**) |
| **Supabase project ref** | `qamzrijkhjduktcokzjj` |
| **Production domain** | [aquilux-pos.online](https://aquilux-pos.online) (and `www.aquilux-pos.online`) |
| **Cloudflare Worker** | `aquilux-pos` |

Do not point this repo at VHM (`slrakslfyxbihbivzrhn`, `vhm-pos.com`). Builds and `npm run db:push` run `scripts/check-client.mjs` to enforce this.

After cloning, run once:

```bash
git config merge.ours.driver true
```

See `.gitattributes` for files that stay client-specific during merges.
