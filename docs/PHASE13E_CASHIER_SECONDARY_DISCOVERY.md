# Phase 13E — Cashier Secondary Screens Discovery

**Status:** Discovery only — no implementation  
**Date:** 2026-09-15  
**Scope:** Sales, Sale Detail Drawer, Customers, Customer Detail Drawer, Payments, Shifts, Shift Detail Drawer  
**Out of scope:** Phase 13D POS terminal, Phase 9 transfers (frozen), Staff/Depots (13G), Inventory (13F)

---

## 1. Executive Summary

Phase 13E should be a **visual consistency refinement** of four cashier secondary list pages and their drawers, using Phase 13A foundations (`PageHeader`, `FilterBar`, `MoneyDisplay`, `SearchInput`) **without changing business workflows**.

What the repository actually shows today:

| Screen | Layout pattern | Foundations used | Money | Status |
|--------|----------------|------------------|-------|--------|
| Sales | Custom sticky CSS grid list | None | `formatCFA` | `SaleStatusBadge` (`returned` → **warning** already) |
| Customers | Same grid pattern | None | `formatCFA` + **danger when owed > 0** already | Active/Inactive badges |
| Payments | Same grid pattern; **non-clickable rows** | None | `formatCFA` (success / struck-through) | Recorded / Reversed |
| Shifts | Same grid + inline “Select for POS” | None | `formatCFA` | `ShiftStatusBadge` |

**Critical corrections vs the older Phase 13 plan (§19):**

1. **Customers list already highlights owed balances in danger color** (`text-danger` when `balance_owed_cfa > 0`). 13E should adopt `MoneyDisplay` for consistency, not invent danger coloring.
2. **Customer detail already has a prominent pooled-balance card** with danger styling and “Pooled balance — not allocated to individual sales.” 13E should swap to `MoneyDisplay` (medium), not redesign the section.
3. **Payments empty subtitle already says** “Standalone customer debt repayments.” When `totalCount > 0`, the subtitle becomes a count only — the debt-repayment meaning disappears from the header. That is the real wording gap.
4. **`MoneyDisplay` is unused** on all 13E target screens (used only in POS 13D + foundations tests).
5. **`PageHeader` / `FilterBar` are unused** by any production page (foundations tests only).
6. **`DataTable` is unused by any page.** It is a bordered overflow table without sticky full-bleed headers — **not appropriate** as a drop-in for these four list pages. Keep the existing sticky CSS-grid lists.
7. **Do not reopen Phase 13D POS** or touch Phase 9 transfers.

**Recommended 13E shape:** adopt `PageHeader` + `FilterBar` + selective `MoneyDisplay` on list rows and drawer financial heroes; keep custom lists; leave Return/Void/Record Payment/Open/Close Shift modals and hooks behaviorally untouched.

---

## 2. Current Repository State

### Phase completion (as given)

| Phase | State |
|-------|--------|
| Phase 12 | Complete (`6f12aed`) |
| Phase 13A | Complete (foundations exist) |
| Phase 13B–13D | Complete (POS terminal transformed) |
| Phase 13E | **Not started** |
| Phase 9 | **Uncommitted and frozen** |

### Foundations present (13A)

| Component | Path | Production usage on 13E screens |
|-----------|------|----------------------------------|
| `PageHeader` | `src/components/ui/PageHeader.tsx` | None |
| `FilterBar` | `src/components/ui/FilterBar.tsx` | None |
| `MoneyDisplay` | `src/components/ui/MoneyDisplay.tsx` | None |
| `SearchInput` | `src/components/ui/SearchInput.tsx` | None on these pages (raw `<input>` + Lucide `Search`) |
| `Select` / `Tabs` | `src/components/ui/Select.tsx`, `Tabs.tsx` | Not needed for 13E lists |
| `DataTable` | `src/components/ui/DataTable.tsx` | **Unused anywhere** |

### Dirty tree note (discovery context)

Working tree already contains Phase 13A–13D work and **frozen Phase 9** transfer files. This discovery task must create **only** this document and must not stage or edit those files.

---

## 3. Design-System Components Available

### 3.1 `PageHeader`

**Props:** `title`, `description?`, `actions?`, `icon?`, `className?`  
**Structure:** `px-6 py-4 border-b border-border bg-surface`, `h1.text-lg.font-bold`, optional description `text-sm text-text-secondary`.

**Fit for 13E:** High. All four pages already hand-roll an equivalent title band.

**Limitation:** No built-in filter/chip row. Composition should be:

```
<PageHeader title … actions={…} />
<div className="px-6 …">  <!-- or FilterBar with padding -->
  <FilterBar … />
</div>
```

Alternatively wrap both in a shared header container so the border remains one band (product decision — see §22).

### 3.2 `FilterBar`

**Props:** `chips?`, `activeChip?`, `onChipChange?`, `search?`, `onSearchChange?`, `searchPlaceholder?`, `count?`, `rightSlot?`.

**Chip values are strings.** Pages that use `null` for “All” (Sales, Shifts) must map `null ↔ 'all'` at the page boundary — do not change filter semantics.

**Search:** Uses `SearchInput` (`w-56`). Replaces duplicated Lucide+input markup on Sales/Customers/Payments.

**Count:** Optional numeric display. Today counts live in the subtitle (`N sales`). Moving count into `FilterBar` vs keeping in `PageHeader.description` is a product decision.

### 3.3 `MoneyDisplay`

**Sizes:** `display` → `text-financial-lg`, `large` → `text-financial-md`, `medium` → `text-financial-sm`, `small` → `text-sm` + `financial-value`.  
**Danger:** `danger` → `text-danger-foreground`.  
**Formatting:** Always `formatCFA(amount)` — same formatter as today; safe semantic swap.

**Limitation:** No built-in prefix (`−`), strikethrough, or success color. Payments success/struck amounts and sale discount “− …” need wrappers or `className`.

### 3.4 `SearchInput`, `Badge`, `Button`, `LoadingButton`, `EmptyState`, `Skeleton`, `Drawer`, `Modal`

Already used appropriately on these screens (except SearchInput). Reuse; do not invent new abstractions for 13E.

### 3.5 `DataTable`

Bordered `rounded-lg` table, optional row click, internal loading skeletons, no sticky header, no pagination slot, no CSS-grid density control.

**Verdict for 13E:** **Do not adopt** for Sales/Customers/Payments/Shifts. Current sticky full-height lists are better for cashier scan workflows. Defer DataTable to admin Staff/Depots (13G) if desired.

### 3.6 Status badges (do not modify `Badge.tsx` in 13E unless explicitly planned)

```ts
// SaleStatusBadge — src/components/ui/Badge.tsx
completed:          success / Completed
voided:             neutral / Voided
partially_returned: warning / Partially Returned
returned:           warning / Returned   // already updated (13D alignment)
```

`ShiftStatusBadge`: open → success; closed → neutral.  
Customers use inline `Badge` Active/Inactive (or could use `ActiveBadge`).  
Payments use Recorded (success) / Reversed (neutral).

**13E should not change badge variants.** Scanability gains come from layout/MoneyDisplay, not recoloring statuses.

---

## 4. Sales Audit

**File:** `src/pages/sales/SalesPage.tsx`  
**Hook:** `useSalesList` in `src/hooks/useSales.ts`  
**Drawer:** `SaleDetailDrawer`  
**Related (behavior-sensitive — keep):** `ReturnModal`, `VoidModal`

### 4.1 Current layout

- Full-height column: header band → scrollable list → optional pagination footer inside scroll area.
- Header: title **“Sales History”**, dynamic count subtitle, receipt search (`placeholder="Receipt number…"`), status chip row.
- List: sticky uppercase column header + `<button>` rows.
- Columns (cashier / admin with depot): Receipt | Status | [Depot if admin All Depots] | Customer | Total | Date.
- Row click → `setSelectedSaleId` → `SaleDetailDrawer`.
- Selected row: `bg-primary-subtle`.
- Page size: **30**. Debounce search: `SALES_SEARCH_DEBOUNCE_MS = 300`.
- Depot: cashier → `staff.depot_id`; admin → `useDepotStore.currentDepotId` (null = all, shows Depot column).

### 4.2 Query / data

`fetchSalesList` filters:

- `depot_id` eq when `filters.depotId` set  
- `status` eq when set  
- `receipt_number` ilike `%search%`  
- order `created_at` desc, range pagination, `count: 'exact'`  
- joins: `customers!customer_id(name)`, `staff!cashier_id(full_name)` → `customer_name`, `cashier_name`

**List fields used by UI:** `id`, `receipt_number`, `status`, `depot_id`, `customer_name`, `total_cfa`, `created_at`.

**Fetched but not shown in list:** `cashier_name` (join still runs). Showing cashier on the list is **optional** 13E scanability — not required for foundations adoption; do not treat as a behavior change if added.

### 4.3 UX findings

| Issue | Detail |
|-------|--------|
| Generic admin look | Hand-rolled header identical to other list pages; no shared PageHeader |
| Receipt scanability | `font-mono font-medium` — plan suggested `font-semibold`; reasonable 13E tweak |
| Total hierarchy | `font-semibold tabular-nums` via `formatCFA` — adopt `MoneyDisplay size="small"` |
| Status | Already clear via `SaleStatusBadge`; left-of-receipt vs current mid-column is optional |
| Density | `py-3` rows (~48–52px) — already near plan’s ~52px; avoid large whitespace increases |
| DataTable | Not recommended (loses sticky full-bleed pattern) |

### 4.4 Workflows (must remain)

- View sale → drawer  
- Return / Void only from drawer (**status-gated in UI only** — file comment says “role/status gated”, but `canReturn` / `canVoid` perform **no role check**; RPC/RLS enforce authorization)  
- Filters / pagination / depot scoping / debounce  

**No list-row actions** beyond open drawer.

---

## 5. Sale Detail Drawer Audit

**File:** `src/pages/sales/components/SaleDetailDrawer.tsx`  
**Hook:** `useSaleDetail(saleId)`  
**Width:** Drawer `lg`

### 5.1 Sections / fields

1. **Status + actions:** `SaleStatusBadge`; Print Receipt; Return (gated); Void (gated).  
2. **Sale Info:** receipt (mono), date, cashier, optional customer name/phone, **current** `customer_balance_owed_cfa` (danger if > 0).  
3. **Items table:** product, unit name, `quantity_in_unit`, `unit_price_cfa`, `line_total_cfa` (historical — never recalculated).  
4. **Financials:** subtotal, discount (if > 0), **Total** (bold), cash received (`amount_tendered_cfa`), amount applied, change, balance added.  
5. **Returns** (if any): refund / cash / balance adjustment.  
6. **Void** note if `status === 'voided'`.

**Note:** `SaleDetailData.payments` is fetched but **not rendered** in the drawer UI today. `VoidModal` consumes unrevesed payment presence for consequence copy. Do not invent a payments section in 13E without a product decision. Do not drop the payments fetch while VoidModal still depends on it.

**Items note:** drawer line totals use historical `line_total_cfa`. ReturnModal refund preview uses `net_line_total_cfa` (present on `SaleItemDetail` in the hook; not on base `SaleItem` in `database.ts` — type drift, not a 13E fix).

### 5.2 Action gating (behavior-sensitive)

```ts
canReturn =
  status ∈ { completed, partially_returned }
  && some item still has returnable qty (original qty − sum return items)

canVoid = status === 'completed'
```

`handleMutationSuccess` invalidates: sale detail, sales lists, `productKeys.all`, `customerKeys.all`.

Print receipt builds DOM `#vhm-receipt-drawer` with LOT, receipt number, optional customer, `formatCFA(total)`, “PAID” — tested in `saleDetailDrawer.test.tsx`.

### 5.3 MoneyDisplay recommendations (semantics unchanged)

| Value | Recommend |
|-------|-----------|
| Total | `MoneyDisplay` **medium** (or large if drawer space allows) |
| Customer current balance > 0 | `MoneyDisplay` small/medium + `danger` |
| Line totals / unit prices | Keep compact `formatCFA` or `MoneyDisplay` **small** |
| Subtotal, tendered, applied | small / plain |
| Discount, change | keep success color wrappers |
| Balance added | keep danger-foreground |
| Print receipt HTML | **keep `formatCFA`** (string template; do not force React MoneyDisplay) |

### 5.4 Must not touch

- Return/Void eligibility math  
- Modal open/close and RPC payloads  
- Historical price display  
- Print DOM contract (tests assert fields)

---

## 6. Customers Audit

**File:** `src/pages/customers/CustomersPage.tsx`  
**Hook:** `useCustomerList`  
**Modals:** `CustomerFormModal` (create), drawer for detail/edit/payment

### 6.1 Current layout

- Title **“Customers”**; count or “Manage customer accounts and balances”.  
- Search `Name or phone…` (**not debounced** at page level — every keystroke updates query params).  
- Chips: All | Active | With Balance | Inactive (**adminOnly**).  
- Action: **New Customer**.  
- Columns: Name | Phone | Balance Owed | Status | Since.  
- Balance: already `text-danger` + `formatCFA` when `balance_owed_cfa > 0`, else muted “—”.  
- Page size 30; alphabetical `order('name')`.

### 6.2 Data / hook notes

`CustomerListParams`: `page`, `pageSize`, `search`, `filter: 'all' | 'active' | 'inactive' | 'with_balance'`.

Filters applied in `fetchCustomerList`:

- search → `name.ilike` OR `phone.ilike`  
- active → `is_active = true`  
- inactive → `is_active = false`  
- with_balance → `balance_owed_cfa > 0`

**Known correctness risk (pre-existing):**

```ts
customerKeys.list = (page) => ['customers', 'list', page]
// useCustomerList queryKey uses ONLY page — not search/filter
```

Changing search/filter can reuse a cached page result until refetch races. **Documented for planning:** fixing the query key to include `{ page, search, filter }` is a low-risk correctness fix if CustomersPage is opened in 13E; it is **not** a visual requirement. Prefer fixing when touching the page; do not leave silently broken if tests start asserting filter results.

**Business model (immutable):** customers are **global**; `balance_owed_cfa` is **pooled**, RPC-maintained. Never recommend depot-scoped customer balance.

### 6.3 UX

- Danger owed balance already present — 13E = `MoneyDisplay size="small" danger`.  
- PageHeader + FilterBar fit naturally; put **New Customer** in `PageHeader.actions`.  
- Keep custom grid (not DataTable).  
- Optional: debounce search to match Sales (behavior-preserving UX polish).

---

## 7. Customer Detail Drawer Audit

**File:** `src/pages/customers/components/CustomerDetailDrawer.tsx`  
**Width:** `md`

### 7.1 Sections

1. **Customer Info:** name (+ Inactive badge), phone, address, since, deactivated date.  
2. **Balance card:** “Outstanding balance owed”, `text-2xl font-bold`, danger if > 0, pooled-balance caption.  
3. **Recent Sales:** last 10 via `useSalesList({ customerId, depotId: null, page: 0, pageSize: 10 })` — RLS scopes cashier. Shows receipt, date, total, optional credit hint via `balance_added_cfa`.  
4. **Payment History:** `useCustomerPayments` → `payment_type = 'customer_payment'`, query **`limit(50)`**. File header comment still says “last 10” — comment drift only; UI shows whatever the hook returns. Do not “fix” limit as part of visual 13E unless product asks.  
5. **Actions:** Record Payment (if balance > 0, **including inactive**); Edit; Deactivate/Reactivate (**admin only**).

**Record payment RPC (unchanged):** `rpc.recordPayment` → `record_payment` with `p_customer_id`, `p_amount_cfa`, optional `p_shift_id` / `p_note`. Server inserts `payment_type='customer_payment'`, `sale_id=NULL`, decrements pooled `balance_owed_cfa`. No `is_active` check (inactive may repay).

### 7.2 MoneyDisplay

| Placement | Recommend |
|-----------|-----------|
| Hero balance card | `MoneyDisplay size="medium"` or `large` + `danger` when > 0 — **best single upgrade** |
| Recent sale totals / payment amounts | small or keep `formatCFA` |
| Record Payment button label amount | keep compact `formatCFA` |

### 7.3 Must not touch

- Pooled balance semantics / caption meaning  
- Payment allowed for inactive with debt  
- Admin-only deactivate/reactivate  
- `RecordPaymentModal` / `CustomerFormModal` RPC contracts  
- Sales list query scope (`depotId: null` + RLS)

---

## 8. Payments Audit

**File:** `src/pages/payments/PaymentsPage.tsx`  
**Hook:** `usePaymentList` in `src/hooks/useCustomers.ts`

### 8.1 What this page is

**Confirmed from code comments and query:**

- Shows **only** `payment_type = 'customer_payment'`.  
- Does **not** show `sale_payment` POS cash mirrors.  
- Language: standalone **customer debt repayments** under the **pooled balance** model (no allocation to sales).  
- Depot isolation: **RLS only** — frontend applies no depot filter.  
- Cash-only; no payment method column.

### 8.2 Current UI

- Title: **“Customer Payments”**.  
- Subtitle: count if `totalCount > 0`, else **“Standalone customer debt repayments”**.  
- Search: customer name (two-step: resolve customer IDs then `in(customer_id)`).  
- Toggle chip: “Excluding reversed” / “Showing reversed” (`showReversed`).  
- Helper text about depot isolation.  
- Columns: Date | Customer | Amount | Status | Note.  
- **Rows are not buttons** — no detail drawer, no navigation.  
- Amount: success-foreground; reversed → line-through muted.  
- Empty: “No customer debt repayments have been recorded yet.”

### 8.3 Wording recommendation

Keep title “Customer Payments” (or shorten). Ensure **persistent** description such as:

> Customer debt repayments (pooled balance — not allocated to sales)

so the meaning remains when the list is non-empty. Exact string is a product decision (§22); “Customer debt repayments” alone is accurate per business model.

### 8.4 Must not reinterpret

Do not add sale allocation UI, sale_payment rows, or payment-method columns.

No create-payment action on this page (recording is from Customer Detail / POS flows).

---

## 9. Shifts Audit

**Files:**  
- `src/pages/shifts/ShiftsPage.tsx`  
- `src/pages/shifts/components/ShiftDetailDrawer.tsx`  
- Modals: `OpenShiftModal`, `CloseShiftModal`  
**Hook:** `src/hooks/useShifts.ts`

### 9.1 List page

- Title **“Shifts”**; Open Shift (admin/cashier).  
- Status chips: All | Open | Closed.  
- Columns: Status (+ Current), [Depot if admin All Depots], Cashier, Opened, Float (`opening_float_cfa`), Discrepancy (closed only; danger if `< 0`), Actions (“Select for POS”).  
- Row click → detail drawer.  
- **Never auto-selects** on list load / `useOpenShifts`. Binding happens only via: (1) explicit **Select for POS**, or (2) **`OpenShiftModal` success** which intentionally calls `usePOSStore.setShiftId(result.shift_id)` — preserve this.  
- `clampShiftPage` when filters shrink page count.  
- Page size: `SHIFT_PAGE_SIZE = 30`.  
- `OpenShiftModal` still uses a raw `<select>` for admin depot (not shared `Select`) — leave alone in 13E.

### 9.2 Field names / meaning

| Field | Meaning |
|-------|---------|
| `opening_float_cfa` | Cash float at open |
| `running.sales_cash_cfa` | Live sales cash in |
| `running.customer_pmts_cfa` | Live customer debt repayments |
| `running.return_cash_cfa` | Live cash refunded |
| `estimateExpectedCash(float, running)` | open: float + sales + pmts − returns |
| `expected_cash_cfa` | Frozen at close |
| `actual_cash_cfa` | Counted at close |
| `discrepancy_cfa` | actual − expected (danger if negative in UI) |
| `opened_at` / `closed_at` / `closed_by` | Lifecycle |

### 9.3 Shift detail drawer

- Identity: id (mono), depot, cashier, opened.  
- Open: running totals + **Estimated Expected**.  
- Closed: Expected / Actual / Discrepancy (+ closed by/at).  
- Actions: Select for POS; Close Shift (`canCloseShift`).

### 9.4 MoneyDisplay

| Value | Size |
|-------|------|
| List float / discrepancy | **small** |
| Drawer opening float, running lines | **small** |
| Estimated Expected / Expected / Actual | **medium** |
| Discrepancy (esp. negative) | **medium** + danger when `< 0` |

### 9.5 A11y / behavior note

List embeds `role="button"` “Select for POS” **inside** a row `<button>` — invalid nested interactive. Pre-existing. 13E may fix by using `stopPropagation` on a real `<button type="button">` **outside** nesting (e.g. `onClick` on `<span>` is current pattern) — prefer splitting actions column to non-nested control without changing selection semantics.

### 9.6 Must not touch

- `canSelectShiftForPos` / `canCloseShift` / no auto-bind  
- Open/Close RPC modals and expected-cash math  
- POS `shiftId` store wiring beyond existing Select handlers  

---

## 10. Shared Pattern Audit

### Duplicated across Sales / Customers / Payments / Shifts

1. Header band (`px-6 py-4 border-b …` + `h1` + subtitle).  
2. Raw search input + Lucide icon (except Shifts has no search).  
3. Pill filter chips (`px-3 h-7 rounded-full …`).  
4. Sticky CSS-grid column headers.  
5. `py-3` full-width row buttons (Payments: non-interactive `div`).  
6. Identical pagination Previous/Next markup.  
7. Local `TableSkeleton` clones.  
8. `EmptyState` for error / empty.

**13E shared adoption:** PageHeader + FilterBar + SearchInput + MoneyDisplay.  
**Do not extract** a new “ListPage” mega-abstraction in 13E.  
**Do not replace** grids with DataTable.

### Inconsistencies

| Topic | Variance |
|-------|----------|
| Search debounce | Sales 300ms; Customers/Payments none |
| Count placement | Subtitle vs FilterBar.count |
| Row interactivity | Payments not clickable |
| Money emphasis | Customers danger; Payments success; Sales bold only |
| Status filter encoding | `null` vs string `'all'` |

---

## 11. PageHeader Evaluation

| Page | Current title | Current description | Actions | Adopt? | Recommended |
|------|---------------|---------------------|---------|--------|-------------|
| Sales | Sales History | `N sales` / “All sales” | (search today) | **Yes** | Title keep; description = count or static “Depot sales history”; search → FilterBar |
| Customers | Customers | count / manage copy | New Customer | **Yes** | actions = New Customer |
| Payments | Customer Payments | count **or** debt-repayment copy | (search) | **Yes** | **Always** show debt-repayment description; count in FilterBar |
| Shifts | Shifts | count / open-close copy | Open Shift | **Yes** | actions = Open Shift |

Icons optional (`Receipt`, `Users`, `Banknote`, `Clock`) — low priority; avoid decorative noise.

---

## 12. FilterBar Evaluation

| Page | Chips | Search | Count | rightSlot |
|------|-------|--------|-------|-----------|
| Sales | All + 4 statuses (`all` ↔ null) | Receipt number… | optional totalCount | — |
| Customers | All / Active / With Balance / Inactive(admin) | Name or phone… | optional | — (New Customer stays PageHeader) |
| Payments | Excluding/Showing reversed (encode as chip values) | Customer name… | optional | optional depot helper text |
| Shifts | All / Open / Closed | none | optional | — |

**Preserve:** page reset to 0 on chip/search change; admin-only Inactive chip; Payments RLS helper text (may live beside FilterBar).

**Tests at risk:** Sales tests use `getByPlaceholderText('Receipt number…')` and chip button names — keep placeholders/labels when swapping to SearchInput/`aria-label`.

---

## 13. DataTable Evaluation

| Target | Adopt in 13E? | Why |
|--------|---------------|-----|
| Sales | **No** | Sticky full-bleed cashier list; depot column variants; density |
| Customers | **No** | Same |
| Payments | **No** | Same; non-click rows still fit grid |
| Shifts | **No** | Action column + Current badge |
| Staff / Depots (13G) | Maybe later | Admin tables may suit bordered DataTable |

---

## 14. MoneyDisplay Evaluation

### Current money sites (13E targets)

| Location | Mechanism today |
|----------|-----------------|
| `SalesPage` total column | `formatCFA(sale.total_cfa)` |
| `SaleDetailDrawer` financials / items / returns / balance / print | `formatCFA` |
| `CustomersPage` balance | `formatCFA` + `text-danger` |
| `CustomerDetailDrawer` hero + lists + button | `formatCFA` + danger/`text-2xl` |
| `PaymentsPage` amount | `formatCFA` + success / line-through |
| `ShiftsPage` float / discrepancy | `formatCFA` + conditional danger |
| `ShiftDetailDrawer` cash block | `formatCFA` + discrepancy danger |
| Return/Void/RecordPayment/CloseShift modals | `formatCFA` — **leave alone in 13E** |

### Emphasis guide

| Emphasis | Values |
|----------|--------|
| Large / medium | Customer drawer balance; shift expected/actual/estimated; sale drawer Total |
| Small | List totals, floats, payment amounts, line items |
| Danger | Customer owed > 0; sale balance_added; negative shift discrepancy |
| Do not emphasize | Dates, IDs, unit prices (keep quiet), zero balances as “—” |

`MoneyDisplay` currently unused outside POS (`CheckoutSummary`, `CartFooter`, `SaleSuccessModal`) and `foundations.test.tsx`.

---

## 15. Responsive / Desktop Findings

Primary targets: **1280×720, 1366×768, 1440×900, 1920×1080**. No mobile redesign.

| Risk | Screens | Notes |
|------|---------|-------|
| Horizontal squeeze | Sales (6 cols with depot), Shifts (7 cols) | Truncation already via `truncate` / `max-w-36`; avoid adding columns |
| Filter wrap | All with chips + search | FilterBar `flex-wrap` helps; keep search `w-56` |
| Vertical | Short 720p | Sticky header + ~8–10 rows; pagination OK; do not inflate row height past ~52px |
| Drawer | Sale `lg`, Customer `md`, Shift `lg` | Medium MoneyDisplay OK; avoid `display` size in narrow drawers |
| Action crowding | Sale detail Print/Return/Void | Already `size="sm"`; keep |

Excessive whitespace is **not** the main problem — inconsistency and weak money hierarchy are.

---

## 16. Accessibility Findings (recommend only if touching markup)

| Issue | Where | 13E relevance |
|-------|-------|----------------|
| Search inputs lack consistent `aria-label` | Sales/Customers/Payments | Fixed by SearchInput (`aria-label={placeholder}`) |
| Chip buttons lack `aria-pressed` / `aria-current` | All chip rows | Optional FilterBar enhancement — **do not block 13E**; FilterBar today has no aria-pressed |
| Nested interactive | Shifts Select for POS | Fix if editing row markup |
| Row buttons | Sales/Customers/Shifts | Good pattern; keep focus styles |
| Payments static rows | OK (no action) | — |
| Drawer titles | Present | Keep |
| Money / status | Text + Badge | MoneyDisplay is a `<span>` — fine |

Do not expand into a full a11y project in 13E.

---

## 17. Visual / UX Findings

Aligned with Phase 13 direction (clean, light, high-contrast, strong money hierarchy, minimal chrome):

**Keep:** light surfaces, existing badges, EmptyState, border-b row lists, danger for debt/discrepancy.

**Refine:**

- Replace copy-pasted headers/filters with PageHeader/FilterBar.  
- Strengthen money via MoneyDisplay (especially customer hero + shift expected/actual + sale total).  
- Receipt prominence (`font-semibold`) on Sales.  
- Persistent Payments description.  
- Optional slight density tune (~48–52px) — already close.

**Avoid:**

- Wholesale redesign / card grids / purple themes / heavy shadows.  
- Reopening POS 13D.  
- New shared “AdminListPage” framework.  
- Restyling Return/Void/Open/Close modals (unless tiny MoneyDisplay-only — still optional; prefer leave).

---

## 18. Behavioral Regression Risks

| Workflow | Must remain | Location | Risk if careless |
|----------|-------------|----------|------------------|
| Return | Eligibility + `ReturnModal` + RPC + invalidations | `SaleDetailDrawer`, `ReturnModal` | Breaking canReturn; wrong shiftId |
| Void | Only `completed`; confirm checkbox; RPC | `VoidModal` | Showing Void on wrong status |
| Print receipt | DOM fields LOT/receipt/customer/total/PAID | `SalePrintReceipt` | Test failures / blank print |
| Customer create/edit | `CustomerFormModal` + RPCs | Customers page/drawer | Double-submit, validation |
| Record payment | Amount ≤ balance; inactive allowed | `RecordPaymentModal` | Blocking inactive; wrong shift |
| Deactivate/reactivate | Admin only | `CustomerDetailDrawer` | Role leak |
| Payment list filter | `customer_payment` only; reversed toggle | `usePaymentList` | Showing sale_payment |
| Open shift | Modal opens shift; **on success binds** `setShiftId(result.shift_id)` | `OpenShiftModal` | Losing intentional bind, or binding on list load (forbidden) |
| Close shift | `canCloseShift`; expected math; clears current POS shift when closing current / `SHIFT_NOT_OPEN` | `CloseShiftModal`, drawer | Wrong depot close; stale POS shift |
| Select for POS | Explicit only (list/drawer) | `ShiftsPage`, drawer | Nested click bubbling / lost stopPropagation |
| Pagination / filters | page reset; depot effect | All list pages | Off-by-one; stale cache (customers queryKey) |
| Permissions | cashier depot scope; admin All Depots columns | Sales/Shifts | Wrong depotId in query |
| Return/Void UI gates | Status-only eligibility; no client role gate | `SaleDetailDrawer` | Adding incorrect client role checks that hide actions RPCs already allow/deny |

**Hooks:** Prefer **DO NOT TOUCH** except optional `customerKeys.list` completeness if CustomersPage is edited. `useInvalidateSales` exists but is unused; drawer uses custom invalidation (sales + products + customers) — do not “unify” during 13E.

---

## 19. Existing Test Coverage

| Area | File | Coverage | 13E impact |
|------|------|----------|------------|
| Sales list + filters | `src/__tests__/sales/sales.test.tsx` | heading “Sales History”, placeholder, Voided chip, fetchSalesList | Update selectors if title/placeholder change; prefer keep strings |
| Sale detail | `saleDetailDrawer.test.tsx` | Return/Void visibility, print fields, voided copy | Avoid changing button names / print HTML |
| Return / Void modals | `returnModal.test.tsx`, `voidModal.test.tsx` | Full modal flows | **Do not modify modals** → tests stay green |
| Customers | `customers.test.ts` | RPC shapes, validation, invariants — **not UI page** | No UI regression net; consider optional light CustomersPage test later |
| Payments page | **No dedicated UI test** | — | Optional smoke test after FilterBar |
| Shifts page | `shifts.test.tsx` | Open Shift, Select for POS | Keep button names |
| Shift detail / open / close | `shiftDetailDrawer`, `openShiftModal`, `closeShiftModal` | Behavior | Leave modals alone |
| POS shift selection | `posShiftSelection.test.tsx` | Store rules | Out of 13E UI |
| Foundations | `src/__tests__/ui/foundations.test.tsx` | PageHeader/FilterBar/MoneyDisplay | Already covers primitives |

**Useful 13E additions (focused):**

- SalesPage still finds heading + receipt search after PageHeader/FilterBar.  
- CustomersPage owed balance renders with danger/MoneyDisplay for `balance_owed_cfa > 0`.  
- PaymentsPage description always includes debt-repayment wording.  
- ShiftsPage Open Shift + Select for POS still work.

**Fragile selectors (preserve strings when swapping foundations):**

| Selector | File |
|----------|------|
| `getByRole('heading', { name: 'Sales History' })` | `sales.test.tsx` |
| `getByPlaceholderText('Receipt number…')` (unicode ellipsis) | `sales.test.tsx` |
| `getByRole('button', { name: '← Previous' / 'Next →' })` | list page tests |
| `#vhm-receipt-drawer` + receipt HTML must include `LOT:` / `PAID` | `saleDetailDrawer.test.tsx` |
| `getByRole('button', { name: 'Open Shift' })`, `findAllByText('Select for POS')` | `shifts.test.tsx` |

**Do not add:** broad E2E for every drawer field; re-tests of Return/Void RPC; Phase 9 tests.

---

## 20. File-by-File Change Map

| File | Responsibility | Behavior sensitivity | Likely 13E change | Risk | Action |
|------|----------------|----------------------|-------------------|------|--------|
| `src/pages/sales/SalesPage.tsx` | Sales list UI | Filters, drawer open, depot | PageHeader, FilterBar, MoneyDisplay small, receipt weight | Med | **MODIFY** |
| `src/pages/sales/components/SaleDetailDrawer.tsx` | Detail + gate actions | Return/Void/print | MoneyDisplay on key financials | Med-High | **MODIFY** (careful) |
| `src/pages/sales/components/ReturnModal.tsx` | Return workflow | High | None | — | **DO NOT TOUCH** |
| `src/pages/sales/components/VoidModal.tsx` | Void workflow | High | None | — | **DO NOT TOUCH** |
| `src/pages/customers/CustomersPage.tsx` | Customer list | Filters, create modal | PageHeader, FilterBar, MoneyDisplay | Med | **MODIFY** |
| `src/pages/customers/components/CustomerDetailDrawer.tsx` | Detail + payment/edit | High actions | MoneyDisplay on balance hero | Med | **MODIFY** |
| `src/pages/customers/components/CustomerFormModal.tsx` | Create/edit | High | None | — | **DO NOT TOUCH** |
| `src/pages/customers/components/RecordPaymentModal.tsx` | Debt repayment | High | None | — | **DO NOT TOUCH** |
| `src/pages/payments/PaymentsPage.tsx` | Payment history | Filters only | PageHeader, FilterBar, description, MoneyDisplay | Low-Med | **MODIFY** |
| `src/pages/shifts/ShiftsPage.tsx` | Shift list + POS select | High (select/open) | PageHeader, FilterBar, MoneyDisplay | Med-High | **MODIFY** |
| `src/pages/shifts/components/ShiftDetailDrawer.tsx` | Shift cash detail | Close/select | MoneyDisplay medium on cash figures | Med | **MODIFY** |
| `src/pages/shifts/components/OpenShiftModal.tsx` | Open shift | High | None | — | **DO NOT TOUCH** |
| `src/pages/shifts/components/CloseShiftModal.tsx` | Close shift | High | None | — | **DO NOT TOUCH** |
| `src/hooks/useSales.ts` | Sales queries | High | None | — | **DO NOT TOUCH** |
| `src/hooks/useCustomers.ts` | Customers/payments | High | Optional queryKey fix only | Med | **INVESTIGATE** / optional **MODIFY** key only |
| `src/hooks/useShifts.ts` | Shifts | High | None | — | **DO NOT TOUCH** |
| `src/components/ui/PageHeader.tsx` | Foundation | Low | Use as-is | Low | **ADOPT** |
| `src/components/ui/FilterBar.tsx` | Foundation | Low | Use as-is (aria optional later) | Low | **ADOPT** |
| `src/components/ui/MoneyDisplay.tsx` | Foundation | Low | Use as-is | Low | **ADOPT** |
| `src/components/ui/SearchInput.tsx` | Foundation | Low | Via FilterBar | Low | **ADOPT** |
| `src/components/ui/DataTable.tsx` | Generic table | — | Not for 13E lists | — | **KEEP** / unused |
| `src/components/ui/Badge.tsx` | Status badges | Visual contract | None (returned already warning) | — | **DO NOT TOUCH** |
| POS components / `POSPage` / PosShell | 13D | — | None | — | **DO NOT TOUCH** |
| Transfers / `useTransfers` / Phase 9 SQL | Phase 9 | Frozen | None | — | **DO NOT TOUCH** |
| `src/__tests__/sales/*` | Sales coverage | Selectors | Adjust only if copy changes | Med | **KEEP** / minimal update |
| `src/__tests__/shifts/*` | Shifts coverage | Selectors | Same | Med | **KEEP** |
| `src/__tests__/customers/customers.test.ts` | Non-UI | — | None required | Low | **KEEP** |
| `docs/PHASE13_UI_UX_IMPLEMENTATION_PLAN.md` | Old plan | — | Reference only; outdated on Customers danger / Payments empty copy | — | **KEEP** (do not treat as truth) |

---

## 21. Must / Should / Optional / Do Not Change

### MUST CHANGE

1. Adopt **`PageHeader`** on Sales, Customers, Payments, Shifts.  
2. Adopt **`FilterBar`** (chips ± search) replacing copy-pasted chip/search markup on those pages.  
3. Adopt **`MoneyDisplay`** for: Sales list totals; Customers list owed amounts; Customer detail balance hero; Payments amounts; Shifts list float/discrepancy; Shift detail primary cash figures; Sale detail **Total** (and preferably balance owed).  
4. Keep **Payments** clearly labeled as customer debt repayments when the list is non-empty.  
5. Preserve all workflows listed in §18.  
6. Leave Phase 9 and Phase 13D POS untouched.

### SHOULD CHANGE

1. Sales receipt column → stronger weight (`font-semibold`).  
2. Fix `useCustomerList` queryKey to include `search` + `filter` when editing customers hook/page.  
3. Debounce Customers (and optionally Payments) search like Sales.  
4. Align empty/error EmptyState spacing under new header composition.  
5. Fix Shifts nested interactive for Select for POS if row markup is touched.  
6. Add 2–4 focused Vitest assertions for header/filter/money after UI swap.

### OPTIONAL

1. PageHeader icons.  
2. `ActiveBadge` helper on Customers instead of inline Badge.  
3. MoneyDisplay on sale line items / return lines.  
4. Extract shared pagination control (not required for 13E).  
5. FilterBar `aria-pressed` enhancement in the primitive.  
6. Light PaymentsPage component test (none exists today).

### DO NOT CHANGE

1. Return/Void/Record Payment/Open/Close Shift **modals and RPCs**.  
2. Sale status badge variant map (already correct).  
3. Pooled customer balance model / depot-level balance ideas.  
4. Payments query filter (`customer_payment` only).  
5. Shift auto-selection rules.  
6. DataTable migration for these lists.  
7. Business field meanings / financial formulas.  
8. Phase 9 transfers files and hunks.  
9. POS terminal (13D) screens.  
10. Hook query shapes except optional customers list key fix.

---

## 22. Open Product Decisions

Only decisions that cannot be fully settled from code:

1. **Header composition:** Single bordered band containing PageHeader + FilterBar vs two stacked bands (double border)?  
2. **Count placement:** `PageHeader.description` vs `FilterBar.count` vs both?  
3. **Payments copy:** Exact persistent description — “Customer debt repayments” vs current longer “Standalone customer debt repayments”?  
4. **Sales title:** Keep “Sales History” (tests depend on it) vs shorten to “Sales”?  
5. **Row density:** Explicit `h-[48|52]` vs keep `py-3`?  
6. **Sale detail financial hierarchy:** Only Total as MoneyDisplay medium, or also tendered/applied/change?  
7. **Customer balance hero size:** `medium` vs `large` inside `md` drawer?  
8. **Fix customers queryKey in 13E** vs separate bugfix?  
9. **Payments rows:** remain non-clickable (recommended) vs navigate to customer drawer (new behavior — out of pure visual 13E)?  
10. **Sales list cashier column:** add `cashier_name` for scanability, or leave unused join as-is?

---

## Cross-check note

Parallel read-only audits ([Audit Sales screens hooks](2f38df8e-a814-4548-9524-b571ed6cd45d), [Audit Customers Payments](41ee132d-6012-4680-ae9f-e4569fb9ab61), [Audit Shifts and shared UI](a49101f8-3b54-4835-b6fe-e427543614cf)) were folded into this document. They confirm the same 13E gap (foundations unused; DataTable unused; `returned` → warning already) and supplied the Open-shift bind, status-only Return/Void UI gates, payment-history limit/comment drift, and fragile test-selector details above.

---

## 23. Proposed Acceptance Criteria

1. Sales, Customers, Payments, and Shifts each render a shared **`PageHeader`** with correct title and primary actions (New Customer / Open Shift where applicable).  
2. Status/filter chips and search (where applicable) go through **`FilterBar`** / **`SearchInput`**; filter semantics and placeholders remain equivalent.  
3. List monetary columns use **`MoneyDisplay`** (small) where amounts are shown; customer owed > 0 and negative discrepancies use **danger**.  
4. Customer detail outstanding balance uses **`MoneyDisplay`** (medium or large) with danger when owed > 0; pooled-balance caption remains.  
5. Sale detail Total (and customer current balance when present) use **`MoneyDisplay`** without changing values or eligibility.  
6. Shift detail expected/actual/estimated (and discrepancy) use **`MoneyDisplay`**; formulas unchanged.  
7. Payments page communicates **customer debt repayments** even when `totalCount > 0`.  
8. **No** DataTable migration on these four pages.  
9. Return, Void, Record Payment, Open Shift, Close Shift, Select for POS behaviors unchanged; existing Vitest suites for those flows pass.  
10. Phase 9 transfer files and POS 13D files are unmodified by the 13E implementation PR.  
11. No new business fields; no sale_payment on Payments page; no depot-scoped customer balance.

---

## 24. Recommended Verification Matrix

| Check | Method |
|-------|--------|
| Unit/component | Vitest: SalesPage filters/search; SaleDetailDrawer actions; ShiftsPage Select for POS; foundations still pass |
| Regression workflows | Manual or existing tests: return, void, create customer, record payment (incl. inactive), open/close shift, select shift for POS |
| Browser desktop | 1280×720 and 1920×1080: header wrap, table truncation, drawer money hierarchy |
| Visual checkpoints | Receipt prominence; owed danger; payments description; shift cash block |
| Cache | Customers: change filter/search and confirm list updates (especially if queryKey fixed) |
| Permissions | Cashier vs admin depot column / Inactive chip / Close Shift |
| Safety | `git status` shows no Phase 9 file edits in 13E commit |

Do **not** run broad refactors during verification planning.

---

## 25. Phase 9 Safety Verification

Performed at discovery time (before/after writing this file):

```text
git status --short
git diff --name-only
```

**Frozen Phase 9 paths (must remain untouched by this discovery and by 13E implementation):**

- `src/pages/transfers/TransfersPage.tsx`  
- `src/pages/transfers/components/*`  
- `src/hooks/useTransfers.ts`  
- `src/__tests__/transfers/*`  
- `supabase/migrations/20260913000001_rpc_cancel_transfer.sql`  
- Phase 9 hunks in `src/lib/rpc.ts`, `src/lib/errors.ts`, `src/types/rpc.ts`, `src/types/database.ts`

**Discovery task intent:** create only `docs/PHASE13E_CASHIER_SECONDARY_DISCOVERY.md`.  
**No application source, hooks, tests, or Phase 9 files were modified by this discovery write.**

Pre-existing dirty Phase 9 / Phase 13 files in the working tree were left as-is (not cleaned, staged, or reverted).

---

## Appendix A — Exact hook / UI contracts (quick reference)

### Sales list filters

```ts
useSalesList({
  depotId: effectiveDepotId, // cashier: staff.depot_id; admin: currentDepotId
  status: statusFilter,      // SaleStatus | null
  search: debouncedSearch,   // receipt_number ilike
  page,
  pageSize: 30,
})
```

### Customer list

```ts
useCustomerList({ page, pageSize: 30, search, filter })
// filter: 'all' | 'active' | 'inactive' | 'with_balance'
```

### Payment list

```ts
usePaymentList({ page, pageSize: 30, customerSearch, showReversed })
// always .eq('payment_type', 'customer_payment')
```

### Shifts list

```ts
useShiftsList({ depotId, status: statusFilter, page, pageSize: SHIFT_PAGE_SIZE })
```

### MoneyDisplay API

```ts
<MoneyDisplay amount={n} size="small" | "medium" | "large" | "display" danger? className? />
```

---

## Appendix B — Divergence from `PHASE13_UI_UX_IMPLEMENTATION_PLAN.md` §19

| Old plan claim | Repository reality |
|----------------|-------------------|
| Customers balance danger as exit criterion | **Already implemented** on list + drawer |
| Payments subtitle “debt repayments” | Empty state / zero-count subtitle **already**; non-empty loses it |
| Row heights ~52 / ~48 | Already `py-3`; minor tweak only |
| DataTable implied elsewhere in Phase 13 | **Not used**; do not force onto 13E lists |
| SaleStatus returned styling | Already **warning** in `SaleStatusBadge` |

Use **this discovery document**, not §19 alone, to draft the Phase 13E implementation plan.
