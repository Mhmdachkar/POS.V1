# VHM POS — Local print agent (Phase 18C)

Polls Supabase `claim_print_jobs` and sends tickets to a **named Windows printer** via the print spooler (`Out-Printer`). **Does not use `window.print()`.**

## Setup (each workstation)

1. Install Node 20+.
2. Copy `.env.example` to `.env` and fill in:
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY` (or staff session — see below)
   - `SUPABASE_EMAIL` / `SUPABASE_PASSWORD` — staff login for the workstation role
   - `ROLE=cashier` or `ROLE=depot`
   - `DEPOT_ID` — UUID (required for depot; cashier uses assigned depot)
   - `PRINTER_NAME` — exact name from Windows **Settings → Printers & scanners**
   - `AGENT_ID` — short label (e.g. `dakar-cashier-1`)
3. From this folder: `npm install` then `npm start`.

## Verify

1. Run the agent; open `http://127.0.0.1:9277/health`.
2. Complete a test sale on the cashier app.
3. Confirm the customer receipt job moves `queued` → `sent` in Sales detail (cashier job).
4. Confirm paper on the **physical** printer configured in `PRINTER_NAME`.

Depot workstation: same with `ROLE=depot` and the depot printer name.

## Reprint

Use **Reprint depot order** in Depot Sales (calls `requeue_print_job`). The agent picks up the job on the next poll.
