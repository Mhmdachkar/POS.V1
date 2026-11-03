# Production retest fixes

This is the record of the nine production findings and the fixes that were built for them. Nothing in this work deletes rows. Receipts MAIN-00000001 through MAIN-00000007 and MAIN-00000026 were not changed. The ELECTRO 2 stock backfill was not run again. No secrets were committed.

The shop clock stays Africa/Abidjan (UTC+0). That was not changed.

## What is already on the database

These files were pasted onto production during this work:

- `supabase/migrations/20261103120001_dashboard_partial_gp.sql` — dashboard margin matches the sales report.
- `supabase/migrations/20261103130001_audit_list_fields.sql` — new payments store the client name, and a converted proforma stores its id on the sale audit row.
- `supabase/migrations/20261103140001_print_jobs_skip_stale.sql` — queued print jobs older than five minutes are marked skipped when the agent returns. Rows are not deleted.
- `supabase/migrations/20261103150001_customer_payment_method.sql` — client payments store Espèces, Paiement mobile, or Banque. Only cash counts in the shift expected cash. Older client payments were marked cash because the register only accepted cash.

The payment file has to be the last of those two payment-related files. The audit file replaces `record_payment`. If it was pasted after the payment file, paste the payment file once more so new payments still store the method.

## Still to paste before merging pull request 65

https://raw.githubusercontent.com/Mhmdachkar/POS.V1/fix/list-rpc-stock-after/supabase/migrations/20261103160001_list_rpc_stock_after.sql

The inventory page and the sale drawer call the new functions. Paste this before that pull request is merged. It also adds `stock_after` for new stock movements only. Older movements stay empty. There is no backfill.

The linked Supabase CLI still returns 403, no privileges, so these files were not applied from this machine.

## 1. Slow screens

Cause: after a sale the app refreshed about sixteen caches at once, including every client, every proforma, and every print job. A cash movement reloaded the whole Services list. A supplier payment reloaded all of Achats. Opening Inventory loaded each product with its units and an exact count, and a search by serial number was a second query. Opening a sale ran four queries.

What changed:

- [Pull request 64](https://github.com/Mhmdachkar/POS.V1/pull/64) refreshes the catalog, that sale, that client, and that shift. Proformas refresh only when the sale converted one. A cash movement updates that one shift on screen and does not download the list again. A supplier payment updates that supplier's balance and reloads only that supplier's ledger and payments. Lists keep the previous rows on screen while the next page loads.
- [Pull request 65](https://github.com/Mhmdachkar/POS.V1/pull/65) loads the inventory page in one call (`list_inventory_page`) and a sale in one call (`get_sale_detail`). Depot staff still do not receive the payment rows on a sale.

Round trips, not a production stopwatch (the database could not be timed from here):

| Screen | Before | After |
| --- | --- | --- |
| Sale just completed, other screens open | About 16 cache refreshes | The catalog, that sale, that client, that shift |
| Cash movement | Full Services list plus the shift detail | No list download; that shift is updated in memory |
| Supplier payment | Every Achats query | That supplier's ledger and payments |
| Inventory first page | Counted product embed, plus a serial lookup when searching | 1 query |
| Sale drawer | 4 queries | 1 query |

A stock save already refreshes that product, the inventory list, and the register's product search.

## 2. Wording

[Pull request 57](https://github.com/Mhmdachkar/POS.V1/pull/57).

- The stock adjustment button reads Appliquer l'ajustement, with a real apostrophe.
- Piece is shown as Pièce in the purchase receipt, the adjustment dialog, and the transfer dialog. The stored unit name is unchanged.
- The close-shift dialog shows "Cette action est irréversible." once.

## 3. Dashboard margin

Cause: the dashboard hid the margin whenever any line had no cost. The sales report already showed the partial margin and a count of lines without a cost.

[Pull request 58](https://github.com/Mhmdachkar/POS.V1/pull/58). The dashboard now uses the same partial margin as the sales report and the same "N lignes sans marge" note. "Marge non calculable" appears only when the server sends no number. The SQL for this is already on production.

## 4. Retournée

Cause: a sale is marked Retournée when every piece has come back. The refund amount is not what decides the status. A full quantity return with a partial refund is Retournée on purpose. `partially_returned` means some pieces are still out.

[Pull request 59](https://github.com/Mhmdachkar/POS.V1/pull/59) documents that in `docs/qa/stock-only-returns.md`. The behavior was not changed. An avoir or zero-refund flow was not built.

## 5. Audit lines, Contrôle, and Fermé le

Cause: the audit list was only showing a short label. The data for the receipt, the amount, the adjustment reason, and the cash note was already on the row. The client name and the proforma flag are written only on rows created after the audit SQL. Contrôle defaulted to today, so yesterday's rows looked missing. Two "Service fermé" lines a minute apart were two shifts, listed under the day they opened.

[Pull request 60](https://github.com/Mhmdachkar/POS.V1/pull/60).

- Sales lines show the receipt and the amount, and "converti depuis proforma" when that sale converted one.
- Payment lines show the client and the amount.
- Adjustment lines show the reason. Cash movements show the note.
- Contrôle defaults to this week. Overview stays today.
- Services can filter to shifts closed today, and a closed row shows Fermé le.

## 6. Client payment method

Cause: Encaisser un paiement was cash only, and the shift expected cash added every client payment.

[Pull request 63](https://github.com/Mhmdachkar/POS.V1/pull/63). The dialog asks for Espèces, Paiement mobile, or Banque and stores it on the payment. Cash still increases Attendu. Mobile and bank reduce the client balance and stay out of the drawer. The payments list and the audit line show the method. The SQL is on production if the payment file was the later paste. See the note at the top.

## 7. Time zone

The shop is in Abidjan, UTC+0. Clocks were not moved. The one leak was the depot "picked today" bound, which sliced a UTC timestamp instead of using the named shop day.

[Pull request 61](https://github.com/Mhmdachkar/POS.V1/pull/61). Depot "today" uses the same Africa/Abidjan day as the reports, the dashboard, and the audit day bounds. No SQL.

## 8. Print agent

Cause: after a sale the register called `http://127.0.0.1:9277/wake` even when nothing was listening, so the browser logged a connection error. When the agent came back it printed every old queued ticket.

[Pull request 62](https://github.com/Mhmdachkar/POS.V1/pull/62).

- The register checks `/health` once. While the agent is offline it does not call `/wake`, and the register shows Agent d'impression hors ligne.
- When the agent returns, queued jobs older than five minutes are marked skipped. They are not deleted. Reprint still puts a skipped job back in the queue.
- A ticket from the last five minutes still prints.

The skip does not happen until `20261103140001_print_jobs_skip_stale.sql` is on the database. That file was pasted with the other two.

## 9. Stock 61 versus 60

Cause: the adjustment dialog estimated the next stock from the product row it already had on screen. The audit row is the stock that was actually saved. The movement list showed only the change, not the stock left afterward. `inventory_transactions` did not store that figure.

[Pull request 65](https://github.com/Mhmdachkar/POS.V1/pull/65).

- New movements store `stock_after`, taken from the product after the stock update and before the movement row is saved.
- Older movements are left empty. They were not rewritten.
- The movement list shows Stock après when the value is present.
- Saving a stock change still reloads that product, the inventory list, and the register search, so the next dialog starts from the saved stock.

ELECTRO 2 was not run. Named receipts were not touched.

## Pull requests

All of these target `main` on Mhmdachkar/POS.V1. They were opened and not merged from this work.

| Pull request | What it does |
| --- | --- |
| [57](https://github.com/Mhmdachkar/POS.V1/pull/57) | Apostrophe, Pièce, one close-shift warning |
| [58](https://github.com/Mhmdachkar/POS.V1/pull/58) | Dashboard partial margin |
| [59](https://github.com/Mhmdachkar/POS.V1/pull/59) | Retournée is based on quantity |
| [60](https://github.com/Mhmdachkar/POS.V1/pull/60) | Audit lines, Contrôle this week, Fermé le |
| [61](https://github.com/Mhmdachkar/POS.V1/pull/61) | Abidjan day bound on the depot |
| [62](https://github.com/Mhmdachkar/POS.V1/pull/62) | Print agent offline, skip stale tickets |
| [63](https://github.com/Mhmdachkar/POS.V1/pull/63) | Cash, mobile, or bank on a client payment |
| [64](https://github.com/Mhmdachkar/POS.V1/pull/64) | Refresh only the sale, shift, or supplier that changed |
| [65](https://github.com/Mhmdachkar/POS.V1/pull/65) | One query for inventory and a sale, stock after new movements |

## Tests run on these changes

- Wording and close-shift dialog: 70 tests passed.
- Audit lines and Services: 25 tests passed.
- Abidjan formatting: 10 tests passed.
- Print agent, job status, and the register tabs: 7 tests passed after the new files were saved as UTF-8.
- Client payment dialog and the payments page: 17 tests passed.
- Cache, shifts, sales, and the payment panel: 106 tests passed.
- Inventory page RPC, cache policy, and the sale drawer: 97 tests passed after a variable-name clash in the sale loader was fixed.

`tsc -b` passed on the payment-method branch check and again on the list-RPC change.
