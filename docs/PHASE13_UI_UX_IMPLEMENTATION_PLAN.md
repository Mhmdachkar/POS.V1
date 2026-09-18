# Phase 13 — UI/UX Implementation Plan

**Source document:** `docs/PHASE13_UI_UX_DISCOVERY.md`
**Phase 12 closed at:** `6f12aed — feat: complete phase 12 reports and audit`
**Phase 9 status:** Uncommitted. Frozen. Do not modify any Phase 9 file or hunk during Phase 13.

**Confirmed user decisions (overrides discovery open questions):**

- Primary hardware: **Desktop PC + mouse + keyboard**
- Touch targets: 44px minimum on POS primary controls (practical insurance)
- Visual direction: **Clean high-contrast light** (not dark)
- POS shell: **Dedicated `PosShell` component** (same auth/routes, different presentation frame)
- POS navigation: **Cashier does not get the full admin rail**
- Product discovery: **Category-first / visual browse + search as accelerator**
- Exact cash: **Exact-amount button required** (no denomination pads)
- Product photography: **Mixed availability assumed**

**Plan revision (pre-implementation):** Stock Activity source verified as `inventory_transactions` (no `inventory_ledger` table). Cart unit-change is an atomic `changeUnit` store action with stable cart-order merge (survivor keeps the target line’s index). Enter-to-complete is gated against inputs, overlays, native button/link Enter, and `event.isComposing`. POS chrome is thin (~40–48px context) and product-wall-first. Admin reaches POS via TopBar **Open POS** only — never as an admin AppRail item. CheckoutSummary is the single 36px Total (CartFooter is compact). Stock Activity is always one selected depot: depot_staff = assigned depot; admin = `currentDepotId` (All Depots / `null` shows EmptyState, not a mixed all-depot list).

---

## 1. Executive Summary

VHM is operationally mature. Its POS, inventory, reporting, and audit workflows are complete. What it lacks is a presentation system that makes those workflows feel like a purpose-built retail product.

The current UI reads as a **generic light SaaS admin console** because it uses the same visual frame, the same chrome density, and the same interaction model for every role. A cashier selling twenty items a day sees the same 64px navigation rail, the same 56px admin-style TopBar, and the same compact form controls as a back-office administrator reviewing quarterly reports.

The POS is the highest-priority surface because:

1. It is the cashier's primary workspace. Every second of friction in a sale is multiplied by every transaction.
2. The current interaction model is **SEARCH → FILL FORM → SUBMIT** (admin data-entry). The target is **SEE → RECOGNIZE → TAP → ADJUST → PAY → COMPLETE** (retail terminal).
3. The current layout gives up ~162px of vertical chrome (64px rail + 56px TopBar + ~42px shift strip) before the first product card appears. On a 768px viewport that is 21% of the screen.
4. Product cards are 32×32px thumbnails with 12px type. A professional POS product wall is recognizable at a glance.
5. The cart is fixed 380–420px with 24px quantity controls — far below the 44px touch-safe threshold.
6. The checkout panel reads as a form (discount type, cash number, nested muted card) rather than a payment stage (dominant total, obvious cash input, unmissable commit button).

This is not a CSS refresh. It is a **product transformation**: building a dedicated cashier terminal experience on top of existing, proven business logic — without changing any of that logic.

The admin and depot_staff experiences should become visually consistent (shared foundations, cleaner headers, consistent tables) but should not be converted to a POS grid. Information density is appropriate for management and operational screens.

Implementation must proceed **POS-first**: sub-phases 13A–13D establish the terminal. Sub-phases 13E–13I complete the application without disrupting the POS.

---

## 2. Goals

### POS (P0)

- Product discovery without mandatory typing — category rail enables browse; search is an accelerator
- Tap-to-add — single-unit products add on one tap; multi-unit open a compact unit picker
- Persistent cart — ticket always visible alongside products; no route change, no modal
- Cart targets ≥ 44px — increment, decrement, remove all comfortably clickable
- In-cart visual state — products in cart show count indicator on the card
- Unit change without remove/re-add — cart line allows switching unit inline
- Visible checkout summary — total, cash, change, balance always visible without internal scroll
- Dominant money hierarchy — **CheckoutSummary Total** is the largest number on screen (36px `financial-lg`). CartFooter must not duplicate that size.
- Exact-cash button — one click sets `cashTendered = totals.total_cfa`
- Complete Sale always reachable — commit button pinned, never below a scroll boundary
- Keyboard completion — `Enter` submits when `canSubmit` is true and all §9.7 gates pass (including `event.isComposing === false`)
- Reduced navigation chrome — `PosShell` with a thin context bar (~40–48px, visually validated), no full admin rail

### Operations (P1–P2)

- Consistent `PageHeader` across all list pages
- Consistent `FilterBar` replacing per-page copy-pasted chips
- `DataTable` adopted on Staff and Depots pages first
- `MoneyDisplay` component used everywhere money is shown
- Balance shown in danger color on Customers list
- Inventory hybrid list for depot_staff (64px image + inline Restock)
- Stock Activity as a real page destination (not a duplicate InventoryPage), reading `inventory_transactions`
- Admin can open `/pos` via a separated **Open POS** action (not a primary admin rail destination)

---

## 3. Non-Goals

Explicitly excluded from every sub-phase:

- New payment methods (card, mobile money, bank transfer)
- Barcode scanning or SKU fields of any kind
- New database tables, columns, indexes, or migrations
- Changes to any existing operational RPC behavior (`complete_sale`, `restock_product`, `adjust_inventory`, `open_shift`, `close_shift`, `record_payment`, `void_sale`, `process_return`, Phase 12 report RPCs)
- Changes to Phase 12 report semantics, metrics, date logic, or CSV output
- Audit log schema or event semantic changes
- Per-depot timezone support
- Password reset / account recovery
- Storage redesign
- Receipt content changes (frozen spec: lot, receipt number, amount, PAID)
- Mobile POS (phone viewport)
- Advanced keyboard shortcuts beyond Enter
- Transfer UI while Phase 9 is uncommitted
- Historical stock snapshots beyond existing `inventory_transactions`
- Any backend/query optimization

---

## 4. Preserved Business / Technical Invariants

Every implementation task must be evaluated against this list. If a proposed change would alter any item below, it must be rejected or redesigned.

**Payment model:**
- Cash-only. No payment method selector. No card, bank, or mobile money.
- Customer pooled balance — payments not allocated to individual sales.
- Walk-in: `customer_id = null` allowed; `balance_added_cfa > 0` not allowed for walk-in.
- Credit requires a real named customer.
- `cashTendered` can be zero (full credit sale).

**POS submission:**
- `complete_sale` RPC is the single point of truth.
- Idempotency: same `idempotency_key` on retry; do not reset until `startNewSale`.
- Server-authoritative totals replace client preview after success.
- No retry with `p_shift_id: null` after `SHIFT_NOT_OPEN` error.

**Shift:**
- Never auto-select a shift.
- Sales without a shift remain possible with existing warning.
- `clearStalePosShift` on `SHIFT_NOT_OPEN` preserved.
- Shift open/close modal cash-entry semantics unchanged.

**Inventory:**
- UI stock is awareness only; server validates.
- Restock and adjust only via existing RPCs.

**Return / void:**
- Gates, confirmation flows, and RPC calls unchanged.

**Auth:**
- RLS is the authority. No client-side permission bypass.
- Role home redirects: admin → `/dashboard`, cashier → `/pos`, depot_staff → `/inventory`.
- Deactivated accounts: `DeactivatedPage` shown.
- Synthetic email pattern hidden from UI.

**Receipt:**
- `window.print()` with `@media print` revealing only `#vhm-receipt`.
- Receipt content: lot, receipt number, CFA amount, PAID. No timestamps, plates, or payment methods.
- Thermal 80mm Courier CSS unchanged.

**Phase locks:**
- Phase 9 transfer files — `TransfersPage.tsx`, `useTransfers.ts`, transfer modals, `20260913000001_rpc_cancel_transfer.sql` — **do not open, do not stage, do not modify**.
- Phase 12 report RPCs, CSV columns, date math, depot scoping — frozen.
- No new migrations in Phase 13.

---

## 5. Current-State Baseline

Drawn from `docs/PHASE13_UI_UX_DISCOVERY.md`. Key facts referenced per sub-phase.

- **Shell:** Rail 64px + TopBar 56px + PosShiftIndicator ~42px = ~162px vertical chrome before first product.
- **POS layout:** Products `flex-1` left, cart fixed `w-[380px] xl:w-[420px]` right. Checkout `max-h-[60vh]` internal scroll — Complete Sale can be off-screen.
- **Product cards:** 32×32px image, `text-sm` name, unit row with `h-7` input + `icon-sm` (28px) Plus. No category browse. Search-first. Limit 40.
- **Cart items:** `h-6 w-6` (24px) qty controls — below touch threshold.
- **Checkout:** Total `text-base` (~16px). No exact-cash button. Enter shortcut commented out.
- **Design system:** `DataTable` exported but unused. No `FilterBar`, `Select`, `Tabs`, `MoneyDisplay`, `PageHeader`. `financial-lg/md/sm` tokens defined but unused on POS.

---

## 6. Target UX Architecture

```
VHM Application
├── Public
│   └── /login  →  LoginPage (standalone, no shell)
│
└── Authenticated (AuthGuard)
    ├── CASHIER TERMINAL  (PosShell)
    │   └── /pos  →  POSPage
    │       PosContextBar (~40–48px): depot | shift chip | nav links | user
    │       Two-pane: [ProductGrid] | [CartPanel + PaymentPanel]
    │
    └── OPERATIONS CONSOLE  (AppShell = AppRail + TopBar)
        ├── Cashier-accessible:  /sales, /customers, /payments, /shifts
        ├── Depot-accessible:    /inventory, /inventory/activity, /transfers (Phase 9 frozen)
        └── Admin-only:          /dashboard, /reports, /admin/staff, /admin/depots,
                                 /admin/categories, /admin/audit, /admin/settings
```

**Two shells, one auth system.** `AuthGuard` and `RoleGuard` are not duplicated. The split happens at the route-to-layout level. Zustand stores are global and unaffected.

**Admin POS access:** When admin navigates to `/pos`, they get `PosShell` (not AppShell). `PosContextBar` detects `staff.role === 'admin'` and renders a "← Back to Dashboard" link. The full 13-item admin rail does not appear during selling.

**Transfers:** `/transfers` remains in `AppShell`, renders `TransfersPage`. Phase 9 files not modified. After Phase 9 commits, a targeted visual REWORK aligns Transfers with Phase 13 foundations.

---

## 7. Target Visual System

### Visual language

**Clean, high-contrast, light.** Principles:
- Strong typography carries the interface. Decoration does not.
- Surfaces: white or near-white. Background: light gray. No glassmorphism.
- Borders: 1px `#E5E7EB` — keep existing token.
- Color used for semantic meaning (success, warning, danger, selected, in-cart) — not decoration.
- No gradients on interactive controls.
- Shadows minimal (card lift, popover, modal) — existing shadow tokens kept.

### Typography hierarchy

| Level | Usage | Size | Weight |
|---|---|---|---|
| `money-display` | POS CheckoutSummary Total (only) | 36px (`financial-lg`) | 700 |
| `money-large` | Change / balance when non-zero | 28px (`financial-md`) | 700 |
| `money-medium` | Dashboard KPIs, StatCards | 22px (`financial-sm`) | 600 |
| `product-title` | Product card name | 15px | 600 |
| `price-primary` | Primary unit price on card | 14px | 600 |
| `body` | Standard text, list rows | 14px | 400 |
| `label` | Form labels, section heads | 12px uppercase | 600 |
| `metadata` | Stock qty, dates, ids | 12px | 400 |

The existing `financial-sm/md/lg` Tailwind tokens (22/28/36px) are correct values. Phase 13 applies them.

### Target sizes

| Class | Height | Usage |
|---|---|---|
| Standard control | `h-9` (36px) | List filters, secondary inputs |
| Touch-safe control | `h-11` (44px) | POS qty controls, POS cash input |
| POS commit action | `h-14` (56px) | Complete Sale button |

### Color fixes required

1. Sale `returned` status badge: change variant from `info` to `warning` in `src/components/ui/Badge.tsx` — visual fix only, no business change.
2. In-cart selected state: add `selected` semantic — `border-primary` ring on product cards that have items in cart.

No primary brand color change. `#1570EF` continues as primary. No new colors invented.

---

## 8. Component Architecture

### Existing components — classification

| Component | File | Action | Reason |
|---|---|---|---|
| `Button` | `src/components/ui/Button.tsx` | EXTEND | Add `xl` size (`h-14`) for POS commit |
| `LoadingButton` | `src/components/ui/LoadingButton.tsx` | EXTEND | Support new `xl` size |
| `Input` | `src/components/ui/Input.tsx` | KEEP + ADOPT | POS cash and qty inputs currently bypass it; fix in 13D |
| `Badge` + domain badges | `src/components/ui/Badge.tsx` | MODIFY | Fix `returned` → `warning` |
| `Card` / `StatCard` / `Section` | `src/components/ui/Card.tsx` | KEEP | StatCard adopts MoneyDisplay |
| `Modal` | `src/components/ui/Modal.tsx` | KEEP | No semantic change |
| `ConfirmDialog` | `src/components/ui/Modal.tsx` | KEEP | No change |
| `Drawer` | `src/components/ui/Modal.tsx` | KEEP | No change |
| `Skeleton` variants | `src/components/ui/Skeleton.tsx` | KEEP + FIX | `ProductCardSkeleton` now actually used by ProductGrid |
| `EmptyState` | `src/components/ui/EmptyState.tsx` | KEEP + ADOPT | POS empty cart now uses it |
| `DataTable` | `src/components/ui/DataTable.tsx` | ADOPT | Currently unused; Staff/Depots adopt it in 13G |
| `AppShell` | `src/components/layout/AppShell.tsx` | KEEP | POS routes exit it; no change to the component itself |
| `AppRail` | `src/components/layout/AppRail.tsx` | KEEP (13B) / MODIFY (13I sign-out only) | Do **not** add POS to admin nav. Cashier already has POS as `isPrimary`. Admin opens POS from TopBar. |
| `TopBar` | `src/components/layout/TopBar.tsx` | MODIFY | Admin **Open POS** action; optional page title |

### New shared UI primitives (`src/components/ui/`)

| Component | Purpose |
|---|---|
| `MoneyDisplay` | Renders `formatCFA(amount)` at size `display/large/medium/small`. Applies `tabular-nums font-semibold`. Optional `danger` prop for balance-owed. |
| `SearchInput` | `Input` with `Search` icon pre-attached, `type="search"`, `autoComplete="off"`. Replaces 5+ copy-pasted search fields. |
| `Select` | Styled `<select>` wrapper matching Button/Input visual language. Replaces native `<select>` on discount type and list filters. |
| `FilterBar` | Horizontal row: optional `SearchInput`, filter chip group, count label, optional right slot. Props: `chips[]`, `activeChip`, `onChipChange`, `search`, `onSearchChange`, `count`, `rightSlot`. |
| `Tabs` | Tab strip with `role="tablist"`. Props: `tabs[]`, `active`, `onChange`. Used by Reports page. |
| `PageHeader` | Page title + subtitle + right action slot. `h1` + optional `p` + optional right `div`. Replaces 10+ copy-pasted page headers. |

### New POS layout components (`src/components/layout/`)

| Component | Purpose |
|---|---|
| `PosShell` | Dedicated POS layout. Renders `PosContextBar` above `<Outlet>`. No AppRail. No TopBar. |
| `PosContextBar` | Thin POS chrome (~40–48px): depot name | ShiftChip | role-sensitive nav links + user. Height is visually validated, not a hard pixel lock. |

### New POS composites (`src/components/pos/`)

New directory. All POS-specific; not shared with admin screens.

| Component | Purpose |
|---|---|
| `ShiftChip` | Compact shift state in PosContextBar. Dot + status text. Popover for select/change. |
| `ProductGrid` | Adaptive CSS grid (`repeat(auto-fill, minmax(min-card-width, 1fr))`). Handles empty/loading/error. Shows note when 40 results. |
| `ProductCard` | Tap-to-add card. Spec in §9.3. |
| `UnitPickerPopover` | Compact popover for multi-unit products. One 44px button per unit. |
| `CategoryRail` | Horizontal scrollable pill strip. "All" first. Active: solid primary. Prefer combining with SearchInput in one discovery toolbar. |
| `CartPanel` | Outer container: header + scrollable items + sticky footer. |
| `CartItem` | Two-line row: name/unit | qty controls (44px) + unit selector + line total + remove. |
| `UnitChangeSelect` | Compact `<Select>` inside CartItem for switching unit level inline. |
| `CartFooter` | Sticky separator above payment. Compact subtotal/line count only — **not** a second 36px total. |
| `PaymentPanel` | Replaces CheckoutPanel. No internal scroll. Contains all payment UI. |
| `CustomerChip` | Compact customer selector. Walk-in or selected name + owe badge. |
| `DiscountRow` | Collapsible row. Default: collapsed "No discount". Expanded: Select + value input. |
| `CashSection` | `CashInput` + `ExactCashButton` side by side. |
| `CashInput` | Large `h-11` number input using shared `Input`. CFA prefix. `text-base font-semibold`. |
| `ExactCashButton` | Secondary button labeled `Exact: CFA X,XXX`. Calls **only** `setCashTendered(totals.total_cfa)`. Does not set applied/change/balance. |
| `CheckoutSummary` | Financial rows with MoneyDisplay. Total at display size. Change/balance at large size. |
| `CommitButton` | `LoadingButton` xl size (h-14), full width. Wires Enter key. Disabled with aria reason. |

---

## 9. POS Architecture

### 9.1 Layout specification

```
+-----------------------------------------------------------------------+
|  PosContextBar (~40–48px — thin, readable, touch-safe chips)          |
|  [Depot Name]  [● Shift chip]  [POS][Sales][Cust][Shift]  [User]     |
+-----------------------------------------------------------------------+
|  Discovery toolbar (ONE compact band — search + category pills)       |
+-----------------------------------+-----------------------------------+
|                                   |  CartPanel header:                |
|  ProductGrid (flex-1 overflow-y)  |  "Cart (N lines)" + Clear         |
|  auto-fill minmax(min card, 1fr)  |                                   |
|  product wall DOMINATES leftover  |  CartItems (flex-1 overflow-y)    |
|  height after thin chrome         |  CartItem × N                     |
|                                   +-----------------------------------+
|                                   |  CartFooter (sticky, compact):     |
|                                   |  lines / subtotal (body size)     |
|                                   +-----------------------------------+
|                                   |  PaymentPanel (shrink-0, no scroll):
|                                   |  intrinsic/min footprint          |
|                                   |  [CustomerChip]                   |
|                                   |  [DiscountRow — collapsed]        |
|                                   |  [CashSection: input + Exact]     |
|                                   |  [CheckoutSummary — sole 36px Total]
|                                   |  [CommitButton h-14]              |
+-----------------------------------+-----------------------------------+
```

**Top-area density (required):** Do not stack PosContextBar + a full-width CategoryRail row + a full-width SearchInput row as three independent chrome bands if that starves the product wall. Combine SearchInput and CategoryRail into **one discovery toolbar** (search left, pills scroll right; wrap internally if needed). The product grid must remain the dominant visual region at **1280×720**.

**1280×720 validation (required after 13B and 13D):** Confirm context bar is readable, discovery toolbar is one band, product wall still occupies the majority of remaining height, cart scrolls independently, payment is fully visible with no internal payment scroll.

### 9.2 Scroll model

| Region | Behavior |
|---|---|
| PosContextBar | Fixed. Never scrolls. Target ~40–48px. |
| Discovery toolbar | Fixed below context bar. Search + category in one band. Category pills may scroll horizontally inside the band. |
| ProductGrid | Vertical scroll within left column. This is the primary scroll region. |
| CartItems | Vertical scroll within cart column flex-grow region. Cart receives remaining height after payment. |
| CartFooter | Sticky at bottom of cart items region, above PaymentPanel. Always visible. |
| PaymentPanel | `flex-shrink-0`. Intrinsic/minimum footprint — **not a fixed 390–420px height**. No internal scroll. Always fully visible. |
| CommitButton | Part of PaymentPanel. Never behind a scroll boundary. |

The current `max-h-[60vh]` scroll on CheckoutPanel is **eliminated**. PaymentPanel sizes to its content. CartItems `flex-1 min-h-0` takes leftover height. On 1280×720 and 1366×768: all payment controls + commit must remain fully visible; cart may scroll. Secondary financial rows (subtotal/applied) may be visually compact, but CashInput, Total, Change/Balance (when non-zero), and CommitButton are never hidden.

### 9.3 ProductCard specification

**Dimensions:** min-width ~160–180px (usable recognition floor), min-height ~140px. Cards fill the auto-fit column. Grid uses `repeat(auto-fill, minmax(<min-card-width>, 1fr))` so column count follows available width instead of a rigid 2/3/4 breakpoint table. Responsive behavior remains (fewer columns when the product pane is narrower). Invariant: minimum card width stays usable; product wall fills leftover space; cards remain visually recognizable.

**States:**

| State | Visual |
|---|---|
| Normal | White, `border-border`, hover: `border-primary/40 shadow-sm` |
| In-cart | `border-primary` ring + **presence** indicator (see below — not a summed mixed-unit count) |
| Low stock | `StockStatusBadge warning` inline below name |
| Out of stock | 50% opacity, add disabled, "Out of stock" label |
| Loading | `ProductCardSkeleton` (existing component, now used) |

**Card layout (top to bottom):**
1. Image area: 80px high, full card width, `rounded-t-lg`. `object-cover` if `photo_url`. `Package` icon in `bg-surface-muted` if null.
2. Padding block: product name (15px, semibold, 2-line clamp), stock text/badge.
3. Primary unit price (14px semibold) or "from CFA X,XXX" for multi-unit.

**Tap behavior:**
- Single unit: clicking card calls `onAddItem(product, product.units[0], 1)` — no qty dialog.
- Multi-unit: clicking card opens `UnitPickerPopover` with one 44px button per unit.
- No qty-before-add input on card. Quantity adjustment happens in the cart.

**In-cart indicator (unit-aware — do not sum heterogeneous units):**

Cart lines are keyed by `product_id + unit_level`. Piece × 3 and Pack × 2 are **two lines**, not “5”.

Chosen UX:
- **Zero lines** for this product: no indicator.
- **Exactly one cart line** for this product: show `×N` of that unit (e.g. `×3`) plus `border-primary`. The number is that line’s `quantity_in_unit`, not a mixed-unit sum.
- **Two or more cart lines** (different units): show a presence badge **“In cart”** (no number). Optional tooltip: unit-aware summary (`Piece × 3 · Pack × 2`).

Do not `reduce` quantities across unit levels into a single badge number.

**Why remove qty-on-card:** Current model: set qty → click Plus. New model: tap card → added. Qty in cart (where the item lives). Matches physical POS terminal semantics.

### 9.4 Category rail

**Source:** `useCategories()` from `src/hooks/useInventory.ts` (already exists; no new hook or RPC).

**Behavior:**
- "All" pill always first. Active by default.
- Selecting a category passes `categoryId` to `useProductSearch` (requires hook extension — see §9.5).
- Selecting "All" passes `null` (shows all products).
- Search query and category filter are independent. Cashier can search within a selected category.
- Horizontal scroll: `overflow-x-auto scrollbar-none`.
- Active: `bg-primary text-primary-foreground`. Inactive: `bg-surface border-border text-text-secondary hover:bg-surface-muted`.

**Zero results in category:** `EmptyState` — "No products in [category]" + "Show all" action clears category filter.

### 9.5 Product catalog > 40

**Problem:** `fetchProductSearch` has `.limit(40)`. Large catalogs silently truncate.

**Phase 13C solution (default):** When `products.length === 40`, show informational note: "Showing 40 results — search or select a category to narrow." This is sufficient if catalog depth per category is < 40.

**Phase 13H enhancement (if needed):** Add `offset` param to `useProductSearch`. "Load more" button in `ProductGrid` increments offset by 40 and merges results. Confirm catalog depth with business before implementing load-more.

**`useProductSearch` extension for category filter:** Add `categoryId?: string | null` param. When set, append `.eq('category_id', categoryId)` to the PostgREST query. This is a non-breaking additive change to a client-side read query. No RPC. No business logic change.

### 9.6 Cart design

**Width:** Increases from 380–420px to `w-[480px] xl:w-[520px]`. Product grid retains `flex-1`.

**CartItem (two-line):**
- Line 1: product name (`text-sm font-semibold`), unit (`text-xs text-muted`)
- Line 2: Minus `h-11 w-11`, qty input `h-11 w-16 text-center`, Plus `h-11 w-11`, optional `UnitChangeSelect`, line total `text-sm font-semibold text-right`, Trash `h-11 w-11` danger
- Thumbnail 32×32 if `product_photo_url` set
- Min row height: ~80px

**Clear cart:** ConfirmDialog when 2+ items. Confirm-less when 1 item.

**CartFooter:** Sticky separator above PaymentPanel. Compact only: line count and optional **subtotal** at body/`MoneyDisplay small` — **never** `financial-lg` / 36px. The **single dominant Total** is `CheckoutSummary` Total (`MoneyDisplay size="display"`). Two 36px totals in the same column are forbidden.

**Inline unit change — unsafe if implemented as sequential `removeItem` + `addItem`:**

Inspected `src/stores/posStore.ts`:
- Lines are unique by `product_id + unit_level`.
- `addItem` **merges** quantity when that pair already exists.
- `removeItem` deletes that pair.
- `updateQuantity` with `qty <= 0` removes the line.
- There is **no** `changeUnit` action today.
- Two `set()` calls are not atomic: a failed/interrupted add after remove **loses quantity**. If the target unit already exists, a naive add would merge, but a naive remove-then-add of qty 1 would drop the source qty. Duplicate lines must never appear.

**Required strategy (UI/cart only — no RPC):** add an explicit atomic store action `changeUnit` in `posStore`. One `set()`. Preserve `addItem` / `removeItem` / `updateQuantity` / `computeTotals` semantics.

`changeUnit(product_id, from_unit_level, toUnit)` where `toUnit` supplies `unit_level`, `unit_name`, `unit_price_cfa`, `cost_price_cfa`, `conversion_to_base`:

1. No-op if source line missing or `from_unit_level === toUnit.unit_level`.
2. Read `qty = source.quantity_in_unit` (preserve quantity-in-selected-unit; do not convert pieces).
3. Preserve product identity: `product_id`, `product_name`, `product_photo_url`.
4. Apply new unit selling price, cost preview, conversion, unit name/level.
5. `line_total_cfa = qty * toUnit.unit_price_cfa`.
6. If a line already exists for `product_id + toUnit.unit_level`: merge `qty` into **that surviving target line**; **drop the source line**. Cart order: keep the **target line’s existing array index**. Do not move the merged line to the end. Do not rewrite at the source index. Unrelated lines keep their relative order (adjust indices only because the source row was removed).
7. Else: rewrite the source line **in place** (same array index) to the new unit.
8. Recompute `totals` once via existing `computeTotals`.

Example: cart `[Water/Piece×3, Soda/Pack×1, Water/Pack×2]`. Change Water/Piece → Pack. Result: `[Soda/Pack×1, Water/Pack×5]` — Pack line stays where it was; Piece line is gone; qty 3+2 merged.

`UnitChangeSelect` calls **only** `changeUnit`. Never `removeItem` then `addItem`.

### 9.7 Payment panel

**Structure (all visible, no internal scroll):**

1. `CustomerChip` — walk-in or selected customer + owe badge. ~44px.
2. `DiscountRow` — collapsed by default. "Apply discount" expand link. Expanded: Select + Input. ~44px collapsed / ~88px expanded.
3. Divider.
4. `CashSection` — `CashInput` (h-11) + `ExactCashButton` side by side. ~60px.
5. `CheckoutSummary` — **sole 36px Total** (`MoneyDisplay display`). Subtotal/Discount at body size. Cash/Applied at body. Change/Balance at large (28px) when non-zero. Do not also render a 36px total in CartFooter.
6. `CommitButton` — h-14 (56px), full width.

**PaymentPanel footprint:** approximate intrinsic/minimum height of the above (often ~350–420px depending on discount expand and credit warning). **Not a locked height.** CartItems `flex-1 min-h-0` receives remaining column height. Requirements: payment controls fully visible; commit always reachable; no internal payment scrolling; no hidden checkout state. Validate at **1280×720** and **1366×768**. Also spot-check **1440×900** and **1920×1080** after 13D.

**ExactCashButton:** Label dynamically: `Exact: ${formatCFA(totals.total_cfa)}`. Updates reactively. On click: **only** `setCashTendered(totals.total_cfa)`. Must **not** write `amount_applied_cfa`, `change_given_cfa`, or `balance_added_cfa`. Those remain derived by existing `computeTotals` (client preview) and by `complete_sale` (server-authoritative).

**Enter key (CommitButton) — gated global handler:**

Keep Enter-to-complete. Submit **only** when all of the following are true:

- `canSubmit === true`
- `event.defaultPrevented === false`
- `event.isComposing === false` (IME composition must not submit)
- focused element is not an `input`, `textarea`, or `select` (and not `contenteditable`)
- no modal / popover / dialog is open (`[role="dialog"]`, `[data-state="open"]` Radix overlay, sale success modal, UnitPickerPopover, ShiftChip popover, CustomerChip dropdown)
- focused element is not a `button`, `a`, or other control whose native Enter should run (e.g. Exact, Clear, unit picker, nav links)

If any check fails: do nothing (do not `preventDefault` unless actually submitting). This avoids accidental checkout from search, discount, cash field, overlay confirms, or focused buttons.

**Credit warning:** Inline above CommitButton when `isWalkIn && balance_added_cfa > 0`. Danger box: "Select a customer for credit sales." Existing logic and condition; new visual placement.

---

## 10. Cashier Experience

### Primary cash sale flow

1. Morning: opens `/pos`. PosContextBar shows depot + amber shift chip. Clicks chip → popover → selects shift → chip turns green. No page navigation.
2. Browse: sees ProductGrid. Either taps category pill or types in SearchInput.
3. Tap product: single unit → in cart. Multi-unit → UnitPickerPopover → select unit → in cart.
4. Cart: adjust qty with 44px ±. Change unit inline if needed. Remove if mistake.
5. Cash sale: clicks "Exact CFA X,XXX" → CommitButton activates. Click or Enter → Complete.
6. Success modal → New Sale → cart clears → back to products.

### Customer / credit sale flow

- Tap CustomerChip → CustomerSelector dropdown → type name → select.
- Or tap "New customer" → inline create form (same logic, same fields).
- If cash < total and customer selected → balance added automatically; shown in CheckoutSummary.
- If cash < total and walk-in → CommitButton disabled; credit warning shows.

### Stale shift handling

- `clearStalePosShift` on `SHIFT_NOT_OPEN` — ShiftChip reverts to amber.
- Improved toast copy: "Your shift has closed. Please select a new shift."
- Cashier clicks amber ShiftChip → selects a new shift → continues.

---

## 11. Depot Staff Experience

### Inventory page — hybrid view

When `currentDepotId` is set (`showDepotColumn === false`): product list where each row is ~72px tall:
- Left: 64×64 image (`object-cover`, `loading="lazy"`) or Package icon.
- Body: product name (`text-sm font-semibold`), category name, `StockStatusBadge`.
- Right: stock qty in pieces (`text-sm tabular-nums`), `Restock` button (44px, secondary variant).
- Row click: `ProductDetailDrawer` — unchanged.

When `showDepotColumn === true` (admin all-depots): existing dense table preserved. Both views adopt `PageHeader` and `FilterBar`.

### Stock Activity page

**Problem:** `/inventory/activity` renders `InventoryPage`. No dedicated activity view exists.

**Verified data source:** There is **no** `inventory_ledger` table. The append-only ledger is `public.inventory_transactions` (migration `20260912200001_rpc_schema_additions.sql`). `inventory_ledger` must not appear in implementation.

Existing per-product reader (`fetchInventoryActivity` in `src/hooks/useInventory.ts`):

```
.from('inventory_transactions')
.select('*, staff!created_by(full_name)')   // INVENTORY_ACTIVITY_SELECT
.eq('product_id', productId)
.order('created_at', { ascending: false })
.limit(50)                                  // INVENTORY_ACTIVITY_LIMIT
```

**Real columns (do not invent `change_qty` / `reason`):**

| Column | Meaning |
|---|---|
| `id` | uuid |
| `depot_id` | depot |
| `product_id` | product |
| `quantity_pieces` | signed numeric; negative = stock out |
| `transaction_type` | `SALE` `RETURN` `VOID` `RESTOCK` `ADJUSTMENT` `TRANSFER_IN` `TRANSFER_OUT` |
| `reference_type` | `sale` `sale_return` `void` `stock_entry` `inventory_adjustment` `stock_transfer` |
| `reference_id` | polymorphic FK |
| `created_by` | staff uuid |
| `created_at` | timestamptz |
| `metadata` | jsonb; optional `reason`, `type`, `unit_level`, `quantity_in_unit` |

**Depot-wide query shape for Stock Activity (SELECT only, existing RLS):**

```
.from('inventory_transactions')
.select('*, products(name), staff!created_by(full_name)')
.eq('depot_id', depotId)
.order('created_at', { ascending: false })
.limit(50)
```

Reuse `INVENTORY_ACTIVITY_LIMIT` (50) unless a slightly higher depot-wide cap is justified; do not invent a new table. Index `inventory_transactions_depot_idx (depot_id, created_at desc)` already exists.

**Role / depot scope (explicit — one depot per view, never a mixed all-depot dump):**

| Role | `depotId` passed to the query | Behavior |
|---|---|---|
| `depot_staff` | Assigned depot only (`staff.depot_id`) | Always scoped to that depot. Existing RLS `inventory_transactions_select_own_depot` already restricts SELECT. Do not offer All Depots. |
| `admin` | Currently selected depot (`currentDepotId` from depot store) | Query only when `currentDepotId` is a specific depot uuid. If All Depots / `currentDepotId === null`: **do not query**; render `EmptyState` “Select a specific depot to view stock activity.” Admin RLS `inventory_transactions_select_admin` allows all depots, but the **UI must not** load an unscoped mixed list of every depot’s movements. |

Query remains `.from('inventory_transactions').eq('depot_id', depotId)` whenever a depot is selected. Never omit `eq('depot_id')` for admin.

**RLS:** `inventory_transactions_select_admin` and `inventory_transactions_select_own_depot` already exist. Depot staff can SELECT own depot. If `staff!created_by` or `products(name)` join is blocked, fall back to `*` only and resolve names separately — do not add a migration.

**UI labels:** derive from `transaction_type` (same vocabulary as ProductDetailDrawer). Signed `quantity_pieces` via `formatPieces` (`+` success / `-` danger). Optional `metadata.reason` / `metadata.type` as secondary italic text when present. Do not display invented `reason` columns.

**Page:** PageHeader "Stock Activity" + FilterBar (product search, client-side on loaded rows) + chronological list: date/time, product name, `transaction_type`, signed pieces, actor name.

**Solution:** Create `src/pages/inventory/StockActivityPage.tsx`. New hook `useDepotInventoryActivity` in `src/hooks/useInventory.ts` wrapping the query above. Do not change `useInventoryActivity(productId)`.

### Transfers (frozen)

No Phase 13 changes. `TransfersPage`, `useTransfers.ts`, all modals, and the RPC migration remain untouched. After Phase 9 commits: targeted visual REWORK to align with Phase 13 foundations.

---

## 12. Admin Experience

- Same `AppShell`. No structural change.
- **Admin POS access (recommendation B):** do **not** add POS as a permanent `isPrimary` admin rail destination. That would mix Cashier Terminal into the Operations Console home list.
- Admins **retain** `RoleGuard` access to `/pos`.
- Provide a clearly separated **Open POS** action on the admin `TopBar` (button/link, not a first-class operational nav item like Overview/Reports). Clicking it navigates to `/pos` and opens `PosShell`.
- On POS, admin `PosContextBar` shows **← Overview** (or ← Dashboard) to return to the console.
- Cashier rail is unchanged: POS remains `isPrimary` for cashiers.
- All admin list pages adopt `PageHeader` and `FilterBar`.
- `DataTable` adopted on Staff and Depots first.
- Categories render as a visual tree with indent connectors.
- Dashboard KPIs use `MoneyDisplay`.
- Reports page: `Tabs` component replaces custom chips; no semantic change.
- Audit page: timeline-style visual; no event change.

---

## 13. Global Shell / Navigation

### AppShell (operations console — mostly unchanged)

`AppShell` wraps all non-POS authenticated routes. Modifications limited to:
- `TopBar`: admin-only **Open POS** action; optional page title from route context.
- `AppRail`: **no** new primary POS item for admin. Cashier rail already has POS.

### PosShell (new — `src/components/layout/PosShell.tsx`)

```
<div className="flex flex-col h-full bg-background">
  <PosContextBar />
  <main className="flex-1 overflow-hidden min-h-0">
    <Outlet />
  </main>
</div>
```

No AppRail. No TopBar.

### PosContextBar — content by role

| Role | Left | Center | Right |
|---|---|---|---|
| Cashier | Depot name | ShiftChip | POS · Sales · Customers · Payments · Shift · User |
| Admin | Depot name | ShiftChip | POS · Sales · Customers · Shifts · ← Overview · User |

### Route restructuring (`src/routes/index.tsx`)

**Before:** `/pos` is a child of `AppShell > RoleGuard(cashier|admin)`.

**After:**
```
<Route element={<AuthGuard />}>
  {/* POS terminal — dedicated shell */}
  <Route element={<RoleGuard roles={['cashier', 'admin']} redirectTo="/inventory" />}>
    <Route element={<PosShell />}>
      <Route path="/pos" element={<POSPage />} />
    </Route>
  </Route>

  {/* Operations console — existing shell */}
  <Route element={<AppShell />}>
    {/* All other routes unchanged */}
    ...
  </Route>
</Route>
```

Same `AuthGuard`. Same `RoleGuard` rules. Same route paths. Only the presentation shell changes.

### Navigation by role (target state)

**Cashier in PosContextBar (on /pos):** POS · Sales · Customers · Payments · Shift

**Cashier in AppRail (on /sales, /customers, etc.):** POS (isPrimary) · Sales · Customers · Payments · Shift (same as today)

**Depot staff in AppRail:** Inventory · Stock Activity · Transfers

**Admin in AppRail:** Overview · Sales · Inventory · Customers · Payments · Transfers · Shifts · Reports · Staff · Depots · Categories · Audit Log · Settings (same destinations as today — **no** POS rail item)

**Admin Open POS:** `TopBar` action only. Navigates to `/pos` → `PosShell`. Does not make POS the admin home. Preserves Operations Console vs Cashier Terminal.

---

## 14. Screen-by-Screen Implementation Plan

| Screen | File(s) | Change | Priority | Blocked by |
|---|---|---|---|---|
| POS | `POSPage.tsx` + new `src/components/pos/*` | Redesign (presentation) | P0 | 13A, 13B |
| POS Shell | New `PosShell.tsx`, `PosContextBar.tsx`, `routes/index.tsx` | New | P0 | 13A |
| Login | `LoginPage.tsx` | Visual rework | P2 | 13A |
| Sales | `SalesPage.tsx`, `SaleDetailDrawer.tsx` | PageHeader, FilterBar, DataTable | P1 | 13A |
| Customers | `CustomersPage.tsx`, `CustomerDetailDrawer.tsx` | PageHeader, FilterBar, balance | P1 | 13A |
| Payments | `PaymentsPage.tsx` | PageHeader, FilterBar, copy | P1 | 13A |
| Shifts | `ShiftsPage.tsx`, `ShiftDetailDrawer.tsx` | PageHeader, FilterBar, cash | P1 | 13A |
| Inventory | `InventoryPage.tsx` | Hybrid depot list + admin table | P1 | 13A |
| Stock Activity | New `StockActivityPage.tsx`, `routes/index.tsx` | New page | P1 | 13A, 13F |
| Dashboard | `DashboardPage.tsx` | PageHeader, MoneyDisplay, chart | P2 | 13A |
| Staff | `StaffPage.tsx`, `StaffDetailDrawer.tsx` | PageHeader, FilterBar, DataTable | P2 | 13A |
| Depots | `DepotsPage.tsx`, `DepotDetailDrawer.tsx` | PageHeader, FilterBar, DataTable | P2 | 13A |
| Categories | `CategoriesPage.tsx` | Tree rendering | P2 | 13A |
| Settings | `SettingsPage.tsx` | Shared Input, PageHeader | P2 | 13A |
| Reports | `ReportsPage.tsx` | Tabs, PageHeader, MoneyDisplay | P2 | 13A |
| Audit | `AuditPage.tsx` | PageHeader, FilterBar, timeline | P2 | 13A |
| Transfers | **ALL FROZEN** | No changes | — | Phase 9 commit |

---

## 15. Sub-Phase 13A — Foundations

**Goal:** Establish shared design primitives. No page behavior changes.

**Dependencies:** None.

**Files to create:**
- `src/components/ui/MoneyDisplay.tsx`
- `src/components/ui/SearchInput.tsx`
- `src/components/ui/Select.tsx`
- `src/components/ui/FilterBar.tsx`
- `src/components/ui/Tabs.tsx`
- `src/components/ui/PageHeader.tsx`

**Files to modify:**
- `src/components/ui/Button.tsx` — add `xl` size: `'xl': 'h-14 px-8 text-base gap-2'`
- `src/components/ui/Badge.tsx` — `SALE_STATUS_CONFIG.returned.variant`: `'info'` → `'warning'`
- `src/components/ui/index.ts` — export all new components
- `src/index.css` — add `--pos-context-height` as a **target token (~40–48px)**, not a hard lock that must equal 40px in the rendered bar
- `tailwind.config.ts` — verify `financial-lg/md/sm` values; no value change needed

**No page files modified in 13A.**

**MoneyDisplay:**
```
Props: { amount: number | null, size?: 'display'|'large'|'medium'|'small', danger?: boolean, className?: string }
Renders formatCFA(amount) with:
  display → text-financial-lg financial-value  (36px 700)
  large   → text-financial-md financial-value  (28px 700)
  medium  → text-financial-sm financial-value  (22px 600)
  small   → text-sm financial-value            (14px 600)
danger: adds text-danger-foreground
```

POS `size="display"` (36px) is reserved for **CheckoutSummary Total** and **SaleSuccessModal** total. CartFooter uses `small` or body text only.

**FilterBar:**
```
Props: {
  chips?: { value: string; label: string }[]
  activeChip?: string
  onChipChange?: (v: string) => void
  search?: string
  onSearchChange?: (v: string) => void
  searchPlaceholder?: string
  count?: number
  rightSlot?: ReactNode
}
```

**PageHeader:**
```
Props: { title: string, description?: string, actions?: ReactNode, icon?: ReactNode }
Renders: px-6 py-4 border-b border-border bg-surface flex items-center justify-between
h1: text-lg font-bold text-text-primary
p: text-sm text-text-secondary
```

**Exit criteria:**
- All new components render without errors
- `MoneyDisplay` shows correct CFA at all four sizes
- `FilterBar` renders chips, search, fires callbacks
- `Button xl` renders at h-14
- `Badge` `returned` shows warning (amber)
- All existing Vitest tests pass
- `tsc --noEmit` passes

**Visual checkpoint (manual):** new primitives (Button xl, MoneyDisplay sizes, FilterBar, Tabs, PageHeader, Badge returned=warning) look consistent on a throwaway/story or first consumer; no page redesign required in 13A.

---

## 16. Sub-Phase 13B — POS Shell

**Goal:** Build `PosShell`, `PosContextBar`, `ShiftChip`. Restructure routes. Remove `PosShiftIndicator` strip. Shift state moves into context bar.

**Dependencies:** 13A complete.

**Files to create:**
- `src/components/layout/PosShell.tsx`
- `src/components/layout/PosContextBar.tsx`
- `src/components/pos/ShiftChip.tsx`

**Files to modify:**
- `src/routes/index.tsx` — extract `/pos` from AppShell, wrap in `PosShell` with `RoleGuard`
- `src/pages/pos/POSPage.tsx` — remove `import { PosShiftIndicator }` and `<PosShiftIndicator />`
- `src/components/layout/TopBar.tsx` — admin-only **Open POS** action (navigates to `/pos`). Not `isPrimary`. Not added to admin `AppRail`.

**Files NOT modified:** All POS component files, all stores, all hooks.

**PosShell.tsx:**
```
export function PosShell() {
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <PosContextBar />
      <main className="flex-1 overflow-hidden min-h-0">
        <Outlet />
      </main>
    </div>
  )
}
```

**PosContextBar.tsx:** Reads from `useAuthStore`, `useDepotStore`, `usePOSStore`. Target height **~40–48px** (`h-10`–`h-12`). Must remain readable with adequate chip/link targets. Final height is visually validated at **1280×720** and **1366×768** — not a literal 40px lock. Depot name left, `ShiftChip` center, nav links + user name right. Admin: **← Overview** link.

**ShiftChip.tsx:** Encapsulates logic currently in `PosShiftIndicator.tsx`:
- Same `authorizedOpenShifts`, `useOpenShifts`, `usePOSStore.setShiftId`
- Same no-auto-select rule
- UI: dot + text + click → popover (list of open shifts)
- "Open new shift" link navigates to `/shifts`
- Compact format fits the thin context bar

**Route change in `routes/index.tsx`:**

Add before the AppShell block:
```
<Route element={<RoleGuard roles={['cashier', 'admin']} redirectTo="/inventory" />}>
  <Route element={<PosShell />}>
    <Route path="/pos" element={<POSPage />} />
  </Route>
</Route>
```

Remove `/pos` from the existing cashier+admin `RoleGuard` block inside `AppShell`.

**PosShiftIndicator.tsx:** Retained but no longer rendered. Delete in 13I cleanup.

**Exit criteria:**
- Cashier on `/pos` sees PosShell (no AppRail, no TopBar, PosContextBar at top)
- Cashier on `/sales` sees AppShell (AppRail + TopBar)
- Admin on `/pos` sees PosShell with "← Overview" link
- Admin **Open POS** in TopBar navigates to PosShell; admin AppRail does **not** gain a primary POS item
- Shift selection works via ShiftChip popover
- Business logic in POSPage unchanged (stores, submission, errors)
- All existing POS Vitest tests pass
- Build and tsc pass

**Visual checkpoint (manual):** empty POS shell at **1280×720** and **1366×768** — thin context bar, leftover height clearly belongs to the future product wall, no leftover AppRail/TopBar chrome.

---

## 17. Sub-Phase 13C — Product Discovery + Cart

**Goal:** New ProductCard (tap-to-add), CategoryRail, ProductGrid. New CartPanel, CartItem. Replace ProductSearchPanel and old CartPanel.

**Dependencies:** 13A, 13B complete.

**Files to create (`src/components/pos/`):**
- `ProductCard.tsx`
- `UnitPickerPopover.tsx`
- `ProductGrid.tsx`
- `CategoryRail.tsx`
- `CartPanel.tsx`
- `CartItem.tsx`
- `UnitChangeSelect.tsx`
- `CartFooter.tsx`

**Files to modify:**
- `src/pages/pos/POSPage.tsx` — replace `<ProductSearchPanel>` and `<CartPanel>` imports and JSX; set cart width `w-[480px] xl:w-[520px]`; compose two-pane layout with a **single discovery toolbar** (SearchInput + CategoryRail), not two stacked full-width rows
- `src/hooks/useProducts.ts` — add `categoryId?: string | null` to `fetchProductSearch` params; add `.eq('category_id', categoryId)` when truthy
- `src/stores/posStore.ts` — **add only** atomic `changeUnit` (see §9.6). Do not change `addItem` merge rules, `removeItem`, `updateQuantity`, `computeTotals`, or sale submission fields
- `src/components/ui/Skeleton.tsx` — verify `ProductCardSkeleton` dimensions match new card (80px image area); adjust if needed

**Files to delete (after 13C confirmed):**
- `src/pages/pos/components/ProductSearchPanel.tsx`
- `src/pages/pos/components/CartPanel.tsx`

**New POSPage layout (simplified):**
```jsx
<div className="flex h-full overflow-hidden bg-background">
  {/* Left: product discovery — wall must dominate leftover height */}
  <div className="flex-1 flex flex-col overflow-hidden border-r border-border min-w-0">
    <div className="flex-shrink-0 flex items-center gap-3 px-3 py-2 border-b border-border">
      <SearchInput ... />
      <CategoryRail ... /> {/* same band; horizontal scroll */}
    </div>
    <ProductGrid className="flex-1 overflow-y-auto p-4"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))' }} />
  </div>

  {/* Right: cart + payment */}
  <div className="w-[480px] xl:w-[520px] flex-shrink-0 flex flex-col overflow-hidden bg-surface">
    <CartPanel className="flex-1 min-h-0" />  {/* CartItems scroll + CartFooter sticky */}
    {/* PaymentPanel added in 13D — shrink-0 */}
  </div>
</div>
```

**CategoryRail — data:** `useCategories()` from `src/hooks/useInventory.ts`. Props: `activeId`, `onSelect`. Emits `null` for "All".

**ProductCard — tap logic:**
```
onClick:
  if (product.units.length === 1) onAddItem(product, product.units[0], 1)
  else setPopoverOpen(true)  // UnitPickerPopover
```

**CartItem unit change (`UnitChangeSelect`):**
```
onChange: (newUnit) => {
  posStore.changeUnit(item.product_id, item.unit_level, {
    unit_level: newUnit.unit_level,
    unit_name: newUnit.unit_name,
    unit_price_cfa: newUnit.selling_price_cfa,
    cost_price_cfa: newUnit.cost_price_cfa,
    conversion_to_base: newUnit.conversion_to_base,
  })
}
```

Do **not** call `removeItem` then `addItem`. See §9.6 for atomic merge-if-target-exists and stable cart-order behavior.

**Exit criteria:**
- Single-unit tap → cart (no dialog)
- Multi-unit tap → popover → unit button → cart
- In-cart indicator: single-line `×N`; multi-unit lines show "In cart" (never a mixed-unit sum)
- Category pill filters product grid
- Search narrows within selected category
- Qty ± in CartItem are 44px
- Unit change via `changeUnit`: qty preserved; target-already-in-cart merges **at the target line’s existing index** (source dropped; survivor not appended/moved to end); unrelated lines keep relative order; no duplicates; new unit price/conversion applied
- Clear cart: ConfirmDialog when 2+ items
- CartFooter compact (line count / optional body-size subtotal) always visible — **not** a 36px Total (that lands in 13D CheckoutSummary)
- Existing posStore Vitest tests pass; new `changeUnit` tests pass
- New tests: tap-add, multi-unit, in-cart presence vs ×N, category filter, CartItem qty/unit/remove

**Visual checkpoint (manual):** populated product grid; mixed photo / no-photo catalog; multi-unit products; cart with multiple lines; long cart scroll (payment not yet required). Confirm product wall dominates at 1280×720.

---

## 18. Sub-Phase 13D — Checkout / Payment

**Goal:** Replace CheckoutPanel with PaymentPanel. Eliminate scroll. Money hierarchy. ExactCashButton. Wire Enter. Improve SaleSuccessModal visuals.

**Dependencies:** 13A, 13B, 13C complete.

**Files to create (`src/components/pos/`):**
- `PaymentPanel.tsx`
- `CustomerChip.tsx`
- `DiscountRow.tsx`
- `CashSection.tsx`
- `CashInput.tsx`
- `ExactCashButton.tsx`
- `CheckoutSummary.tsx`
- `CommitButton.tsx`

**Files to modify:**
- `src/pages/pos/POSPage.tsx` — add `<PaymentPanel>` below `<CartPanel>` in right column
- `src/pages/pos/components/SaleSuccessModal.tsx` — visual hierarchy only; replace total with `MoneyDisplay display`; replace change/balance with `MoneyDisplay large`; no behavioral change
- `src/pages/pos/components/CustomerSelector.tsx` — adapt to be driven by `CustomerChip` (same hook, refactored presentation)

**Files to delete (after 13D confirmed):**
- `src/pages/pos/components/CheckoutPanel.tsx`

**Business logic migration:** All logic from `CheckoutPanel.tsx` moves to `PaymentPanel.tsx` verbatim:
- `canSubmit` condition (4 checks: cart, credit-without-customer, discount-invalid, cash-negative)
- `handleCompleteSale` async (same RPC call: `rpc.completeSale(...)`, same error handling, same `clearStalePosShift`, same cache invalidation)
- `ensureIdempotencyKey` usage
- `isWalkIn` / `customer` from posStore
- `discountType` / `discountValue` from posStore
- `cashTendered` from posStore
- `totals` from posStore

None of these change. They move files only.

**SaleSuccessModal changes (visual only):**
- `result.total_cfa`: replace `text-base` span with `<MoneyDisplay size="display" amount={result.total_cfa} />`
- `result.change_given_cfa` (when > 0): replace `text-sm text-success-foreground` with `<MoneyDisplay size="large" amount={result.change_given_cfa} />`
- `result.balance_added_cfa` (when > 0): replace `text-sm text-danger-foreground` with `<MoneyDisplay size="large" amount={result.balance_added_cfa} danger />`
- `window.print()`, receipt CSS, `startNewSale` — all unchanged

**Exit criteria:**
- **CheckoutSummary** is the **sole** 36px Total (`MoneyDisplay size="display"`) without scrolling. CartFooter remains compact (no second `financial-lg` / 36px total)
- ExactCashButton calls only `setCashTendered`; applied/change/balance still derived
- CommitButton is h-14, always visible on ≥1280px; PaymentPanel has no internal scroll
- Enter submits only under the gated rules in §9.7 (not from inputs, overlays, focused buttons/links, or IME composition / `event.isComposing`)
- Credit warning inline when walk-in underpays
- SaleSuccessModal: total at 36px, change at 28px
- Print receipt visually and semantically unchanged
- All existing POS Vitest tests pass
- New tests: ExactCashButton (cashTendered only), Enter gates, credit validation, CommitButton disabled states

**Visual checkpoint (manual):** normal cash sale; exact cash; overpayment (change large); credit / walk-in blocked; customer-selected credit (balance large); long cart with payment still fully visible. Viewports: **1280×720**, **1366×768**, **1440×900**, **1920×1080**.

---

## 19. Sub-Phase 13E — Cashier Secondary Screens

**Goal:** Apply foundations to Sales, Customers, Payments, Shifts. Scanability and balance prominence.

**Dependencies:** 13A complete.

**Files to modify:**
- `src/pages/sales/SalesPage.tsx` — `PageHeader`; `FilterBar` (status chips + receipt search); rows: receipt `font-semibold`, total `MoneyDisplay small`, `SaleStatusBadge` left-aligned; row height ~52px
- `src/pages/sales/components/SaleDetailDrawer.tsx` — financial values in drawer use `MoneyDisplay`
- `src/pages/customers/CustomersPage.tsx` — `PageHeader`; `FilterBar`; balance column: `MoneyDisplay small danger` when > 0; row height ~48px
- `src/pages/customers/components/CustomerDetailDrawer.tsx` — balance at top as `MoneyDisplay medium danger` when > 0
- `src/pages/payments/PaymentsPage.tsx` — `PageHeader`; `FilterBar`; subtitle: "Customer debt repayments" (no business change)
- `src/pages/shifts/ShiftsPage.tsx` — `PageHeader`; `FilterBar`
- `src/pages/shifts/components/ShiftDetailDrawer.tsx` — cash figures as `MoneyDisplay medium` in clear grid

**Behavior unchanged in 13E:** Return/void modals and RPCs; customer payment recording; shift open/close modals; pagination; filter logic; drawer/modal semantics.

**Exit criteria:**
- All four pages use consistent `PageHeader`
- `FilterBar` replaces copy-pasted chip rows
- Balance > 0 shown in danger color on Customers list
- Payments subtitle says "debt repayments"
- Shift detail cash figures use MoneyDisplay
- All existing Vitest tests pass; no regression in workflows

---

## 20. Sub-Phase 13F — Operations (Inventory + Stock Activity)

**Goal:** Inventory hybrid view for depot_staff. StockActivityPage on `/inventory/activity`.

**Dependencies:** 13A complete.

**Files to create:**
- `src/pages/inventory/StockActivityPage.tsx`
- New hook `useDepotInventoryActivity` in `src/hooks/useInventory.ts`

**Files to modify:**
- `src/pages/inventory/InventoryPage.tsx` — hybrid list when `showDepotColumn === false`; adopt `PageHeader`, `FilterBar` for both views
- `src/routes/index.tsx` — `/inventory/activity` renders `StockActivityPage` instead of `InventoryPage`

**useDepotInventoryActivity:** In `src/hooks/useInventory.ts`:
```
export function useDepotInventoryActivity(depotId: string | null) {
  return useQuery({
    queryKey: ['inventory', 'activity', 'depot', depotId],
    queryFn: async () => {
      if (!depotId) return []
      const { data, error } = await supabase
        .from('inventory_transactions')
        .select('*, products(name), staff!created_by(full_name)')
        .eq('depot_id', depotId)
        .order('created_at', { ascending: false })
        .limit(INVENTORY_ACTIVITY_LIMIT)
      if (error) throw error
      return data ?? []
    },
    enabled: !!depotId,
    staleTime: 60_000,
  })
}
```

**RLS:** already on `inventory_transactions` (`inventory_transactions_select_admin` = admin may SELECT all depots; `inventory_transactions_select_own_depot` = non-admin own depot). **UI scope is stricter than admin RLS:** always `.eq('depot_id', depotId)` for one depot. If `staff!created_by` or `products(name)` join fails, fall back to `INVENTORY_ACTIVITY_SELECT` plus a product-name lookup — no migration.

**Depot id resolution for `useDepotInventoryActivity`:**
- `depot_staff`: `depotId = staff.depot_id` (assigned depot). Query enabled whenever that id exists.
- `admin`: `depotId = currentDepotId`. `enabled: !!depotId`. All Depots / `null` → hook returns `[]` without querying; page shows EmptyState (see below). Do **not** fetch unscoped rows and mix depots.

**StockActivityPage content:**
- `PageHeader` title "Stock Activity", description "[depot name] · recent movements"
- `FilterBar` with product name search (client-side filter on fetched rows)
- List rows: date/time, product name, `transaction_type`, signed `quantity_pieces` (`+` success / `-` danger), actor name, optional `metadata.reason` / `metadata.type`
- Empty state (depot selected, no rows): "No stock movements recorded yet."
- Admin All Depots / `currentDepotId === null`: `EmptyState` "Select a specific depot to view stock activity." — **not** a combined all-depot feed.

**Inventory hybrid list for depot_staff (when `showDepotColumn === false`):**
- Row: `h-[72px]`, left thumbnail 64×64, body: name + category + `StockStatusBadge`, right: stock qty + Restock button (44px)
- Row click: `ProductDetailDrawer` unchanged
- Adjust: stays in `ProductDetailDrawer` only (not in-row)

**Files NOT modified:** `useInventoryActivity(productId)`, `RestockModal`, `AdjustmentModal`, `ProductDetailDrawer`, `ProductFormModal`.

**Exit criteria:**
- `/inventory/activity` renders `StockActivityPage`
- StockActivityPage shows movements or appropriate empty state
- `depot_staff` activity is assigned-depot only (`staff.depot_id` + RLS own-depot)
- Admin activity is `currentDepotId` only; All Depots / `null` shows “Select a specific depot…” EmptyState (no mixed all-depot list)
- Query always `.eq('depot_id', depotId)` when a depot is selected
- Inventory hybrid list shows 64px image + Restock button for depot_staff
- Admin all-depots **inventory table** view unchanged (Stock Activity still requires a specific depot)
- Restock opens same `RestockModal`, same RPC
- Existing inventory Vitest tests pass

---

## 21. Sub-Phase 13G — Admin

**Goal:** Visual consistency across all admin pages. Categories as tree. Reports/Audit visual polish only.

**Dependencies:** 13A complete.

**Files to modify:**
- `src/pages/admin/DashboardPage.tsx` — `PageHeader`; `MoneyDisplay medium` for StatCards; replace crude CSS bar chart with proper inline SVG bars (using existing hourly data, no new hook)
- `src/pages/admin/StaffPage.tsx` — `PageHeader`, `FilterBar`, `DataTable` (first full adoption)
- `src/pages/admin/DepotsPage.tsx` — `PageHeader`, `FilterBar`, `DataTable`
- `src/pages/admin/CategoriesPage.tsx` — tree rendering with CSS indent lines and connector characters; parent rows: `font-semibold`; child rows: indent + connector
- `src/pages/admin/SettingsPage.tsx` — adopt `Input` component; `PageHeader`; `ConfirmDialog` on rate change unchanged
- `src/pages/admin/AuditPage.tsx` — `PageHeader`, `FilterBar`; timeline-style list: date dot + actor + event label
- `src/pages/reports/ReportsPage.tsx` — replace custom tab chips with `Tabs` component; `PageHeader`; `MoneyDisplay medium` for metric values

**Files NOT modified in 13G:**
- Phase 12 report hooks and RPC calls
- CSV export logic
- Report date presets / range logic
- Audit query and event types
- All admin drawers and form modals

**Exit criteria:**
- All admin pages have consistent `PageHeader`
- `FilterBar` on Staff, Depots, Audit, Reports
- `DataTable` on Staff and Depots
- Categories visual tree with connectors
- Dashboard MoneyDisplay KPIs
- Reports uses `Tabs` component; CSV unchanged (verify with export)
- Existing admin Vitest tests pass
- Phase 12 report semantic behavior verified unchanged

---

## 22. Sub-Phase 13H — Hardening

**Goal:** Keyboard, accessibility, responsive minimum, catalog > 40, image performance.

**Dependencies:** 13A–13G substantially complete.

**Tasks:**

**Keyboard:**
- CommitButton Enter: implemented in 13D with the gated rules in §9.7. Re-verify: no submit from cash/search/discount fields, open dialogs, focused buttons/links, or IME composition (`event.isComposing`).
- `Escape` on Radix popover/dropdown/dialog: native Radix behavior. Verify ShiftChip popover, CustomerChip dropdown, UnitPickerPopover all close on Esc.
- Search autofocus on POS: `SearchInput` receives `autoFocus`. Verify after PosShell route change.

**Accessibility:**
- `aria-live="polite"` region for cart total: `<output aria-live="polite" className="sr-only">{formatCFA(totals.total_cfa)}</output>` in `CartPanel` or `CartFooter`.
- Verify all POS qty buttons have `aria-label="Increase quantity of [product]"` / `"Decrease quantity"`.
- `CommitButton`: `aria-disabled` + `aria-describedby` pointing to validation message when disabled.
- `CustomerChip`: `aria-haspopup="listbox"` + `aria-expanded`.
- `ShiftChip`: `aria-haspopup="listbox"` + `aria-expanded`.
- `UnitPickerPopover`: `role="dialog"` + `aria-label="Select unit for [product name]"`.
- `prefers-reduced-motion`: wrap cart badge animation in `@media (prefers-reduced-motion: no-preference)`.

**Target size sweep:** Verify every new POS interactive control is ≥ 44px. CommitButton: 56px. CartItem qty: 44px. CategoryRail pills: min-height 36px (acceptable for mouse; pills are wide).

**Product catalog > 40:** Add informational note to `ProductGrid` when `products.length === 40`: "Showing top 40 — search or select a category to narrow." If business confirms larger catalogs, implement load-more: add `offset` param to `useProductSearch`; "Load more" button appends results.

**Image performance:** `ProductCard` and Inventory hybrid list images: `loading="lazy"`, explicit `width` and `height` attributes.

**Exit criteria:**
- Enter → Complete Sale works **only** under §9.7 gates; Esc closes overlays
- Cart total `aria-live` region present
- All new POS controls ≥ 44px
- Images have lazy loading
- ProductGrid shows note or load-more at 40 results
- Build passes

---

## 23. Sub-Phase 13I — Final Polish

**Goal:** Spacing, icons, motion, empty states, duplicate sign-out, login visual.

**Dependencies:** 13A–13H complete.

**Tasks:**

**Spacing sweep:** Standardize list page content padding to `px-6 py-5`. Drawer `p-5` (already consistent). Modal `p-5` (already consistent). Eliminate isolated exceptions.

**Radius/shadow:** Replace bare `rounded` with `rounded-md` (10px). Replace `rounded-lg` consistently (14px). No new token values.

**Icon scale:** Standardize to 16/20/24px. Replace any remaining 12px POS icons (should be eliminated in 13C/D). Apply: metadata = 16px, nav = 20px, large actions = 24px.

**Cart add motion:** When `posStore.addItem` is called, briefly apply `animate-cart-bump` CSS keyframe to the CartFooter line-count / compact subtotal (not a second 36px Total) or the context-bar cart count. 200ms `scale-110 → scale-100`. Implement in `tailwind.config.ts` keyframes + `index.css` utility or Tailwind animate class. Wrap in `@media (prefers-reduced-motion: no-preference)`.

**SaleSuccess checkmark:** Scale animation on `CheckCircle` in `SaleSuccessModal`: `scale-0 → scale-100` 200ms. Respects reduced-motion.

**Duplicate sign-out removal:** Remove sign-out button from `AppRail` bottom section. Sign-out stays in `TopBar` UserMenu (operations console) and in `PosContextBar` user dropdown (POS).

**Empty state improvements:**
- POS empty cart → `EmptyState` with ShoppingCart icon, "Your cart is empty", "Tap a product to add it."
- Category no-results → "No products in [category]" + "Show all" action.
- StockActivityPage empty → "No stock movements recorded yet."

**Login visual rework:**
- Center card: stronger shadow, `text-xl font-bold` heading "VHM POS".
- Form fields: use shared `Input` component (currently raw register).
- Submit: `LoadingButton xl` (h-14) "Sign in".
- No auth logic changes.

**`PosShiftIndicator.tsx`:** Delete (replaced by ShiftChip in PosContextBar; confirmed unused since 13B).

**Exit criteria:**
- Spacing consistent (no isolated large-padding exceptions)
- No 12px icons remaining
- Cart add animation present and respects reduced-motion
- Duplicate sign-out removed from AppRail
- Login uses shared Input and LoadingButton xl
- All empty states have icon + description + action where applicable
- All Vitest tests pass
- Full browser verification passes (§30)
- `tsc --noEmit` passes

---

## 24. Responsive Strategy

**Primary target:** Desktop ≥ 1280px. Only viewport for which full POS layout is guaranteed.

| Viewport | POS | Admin |
|---|---|---|
| ≥ 1440px | Adaptive grid fills leftover product pane (typically 4+ cards across if min-width allows); cart 520px | xl: 4-col stats |
| 1280–1439px | Adaptive grid (typically 3 cards if min-width ~180px); cart 480px; **required visual validation** | Standard |
| 1024–1279px | Not primary target. Grid still auto-fills; cart may compress. Functional, not ideal. Document. | Most pages functional. |
| < 1024px | POS not supported. No fake mobile POS. Login and list pages readable. | Admin pages readable; dense tables may require horizontal scroll. |

No dedicated mobile POS layout is built in Phase 13.

**Required POS visual validation heights/widths:** 1280×720, 1366×768 after 13B (empty shell) and 13D (full checkout). Also 1440×900 and 1920×1080 after 13D.

Below 1280px: no special mobile POS breakpoint. If a tablet/kiosk requirement is confirmed later, it is scoped separately.

---

## 25. Keyboard / Mouse / Touch Strategy

### Keyboard shortcuts

| Key | Context | Action |
|---|---|---|
| `Enter` | POS, **all §9.7 gates pass** (including `event.isComposing === false`) | Fire `handleCompleteSale()` |
| `Escape` | Any Radix popover/dropdown/dialog | Close (Radix native) |
| `Tab` | All pages | Standard DOM focus order |
| Autofocus | POS page mount | `SearchInput` receives focus |

No barcode shortcuts. No arrow navigation in product grid. No quantity keyboard increments.

### Mouse

All interactive elements have `hover:` states. Click targets are unambiguous. Row click opens drawer. Cart controls are 44px (comfortable for mouse users).

### Touch

- 44px targets on all primary POS controls.
- Product cards: entire card is tappable.
- CategoryRail pills: min-height 36px (adequate for mouse; flag for tablet follow-up if needed).
- UnitPickerPopover unit buttons: 44px.
- No swipe gestures. No haptics.

---

## 26. Accessibility

Practical improvements implemented across 13C–13H.

| Gap | Implementation | Phase |
|---|---|---|
| POS qty targets 24px | Replaced with 44px CartItem controls | 13C |
| CommitButton Enter missing | Wired in CommitButton | 13D |
| Cart total live region | `aria-live="polite"` `<output>` in CartPanel | 13H |
| Product card labels | `aria-label="{product name}"` on card button | 13C |
| Cash input bypasses shared Input | Fixed via shared `CashInput` using `Input` | 13D |
| CustomerChip no ARIA | `aria-haspopup` + `aria-expanded` | 13D |
| UnitPickerPopover no role | `role="dialog"` + `aria-label` | 13C |
| CommitButton disabled reason | `aria-describedby` linking validation msg | 13D |
| Reduced motion unhandled | `prefers-reduced-motion` on cart animation | 13H |
| Login raw inputs | Shared `Input` component in 13I | 13I |

---

## 27. Motion / Micro-interactions

Every animation has a functional purpose. No decorative motion.

| Interaction | Motion | Implementation |
|---|---|---|
| Product added to cart | CartFooter line-count / compact subtotal or context-bar cart count: `scale-110 → scale-100`, 200ms ease-out | CSS keyframe in `tailwind.config.ts`; class added on add, removed after animation |
| Qty changed | No animation. Instant number update. | None |
| Modal/drawer open | Existing Radix `animate-in`/`animate-out` (200ms) | Keep |
| Sale success | CheckCircle: `scale-0 → scale-100`, 200ms | Applied to icon element |
| Toast | Sonner default | Keep |
| Category filter | Grid re-renders with skeleton. Accept. | None |

`prefers-reduced-motion`: all Phase 13 animations wrapped in `@media (prefers-reduced-motion: no-preference)`. Instant state change if user prefers reduced motion.

---

## 28. Performance

Observe and report; no premature optimization.

| Risk | Status | Action |
|---|---|---|
| Product query cap 40 | Silent truncation for large catalogs | Informational note in 13C; load-more in 13H if confirmed needed |
| Category filter adds `.eq()` | Minimal overhead on 40-row query | None |
| ProductCard image loading | Full `photo_url` in 80px display | `loading="lazy"` + explicit dimensions in 13C |
| Cart rerenders on cash input | All checkout rows re-render | `useShallow` preserved in PaymentPanel (as in current CheckoutPanel) |
| Category hook on POS mount | `useCategories()` fires once | `staleTime: 5 * 60 * 1000` already in hook pattern |
| Reports 4 hooks fire on load | Extra network | Phase 12 closed; do not change |
| Zustand selectors | `useShallow` currently used | Preserve and extend to new POS components |

---

## 29. Testing Strategy

### Layer 1: Vitest tests

**Existing tests that must pass throughout (all sub-phases):**
- `src/__tests__/pos/` — store, checkout, success modal
- `src/__tests__/sales/` — SaleDetailDrawer, ReturnModal, VoidModal
- `src/__tests__/customers/` — CustomerDetailDrawer, CustomerFormModal
- `src/__tests__/shifts/` — OpenShiftModal, CloseShiftModal, ShiftDetailDrawer
- `src/__tests__/inventory/` — InventoryPage, ProductDetailDrawer
- `src/__tests__/admin/` — StaffPage, AdminGates
- `src/__tests__/transfers/` — **ALL FROZEN. Do not modify any transfer test.**

**New tests by sub-phase:**

**13C:**
- `ProductCard`: single-unit tap → addItem called; multi-unit tap → popover opens; out-of-stock → disabled; in-cart: `×N` for one line, "In cart" for mixed units (never summed)
- `UnitPickerPopover`: unit button click → onAdd called with correct unit
- `CategoryRail`: category click → onCategoryChange called; "All" default
- `posStore.changeUnit`: qty preserved; target existing line merges **in place at the target’s array index**; source dropped (not rewritten at source index); survivor **not** appended or moved to end; unrelated lines keep relative order; no duplicates; same unit no-op; missing source no-op; new price/conversion applied; totals recomputed once; rewrite-in-place when no target line exists
- `CartItem`: increment → updateQuantity(qty+1); decrement → updateQuantity(qty-1); trash → removeItem; unit change → `changeUnit` only
- `CartPanel`: empty state renders; item count in header; clear confirm when 2+ items

**13D:**
- `ExactCashButton`: click → `setCashTendered(totals.total_cfa)` only; does not assign applied/change/balance
- `CommitButton`: Enter fires only when all §9.7 gates pass; no-fire when input focused, overlay open, `!canSubmit`, focused button/link, or `event.isComposing === true`
- `PaymentPanel`: credit warning when walk-in + balance > 0; CommitButton disabled when cart empty
- `SaleSuccessModal`: MoneyDisplay rendered for total; change visible when non-zero; New Sale calls startNewSale

**13E:**
- `SalesPage`: FilterBar rendered; status filter changes list; receipt bold
- `CustomersPage`: balance > 0 has danger class
- `ShiftDetailDrawer`: MoneyDisplay present for cash figures

**13F:**
- `StockActivityPage`: list renders when data; empty state when no depot / All Depots; depot_staff uses assigned depot; admin uses `currentDepotId`; rows use `transaction_type` + signed `quantity_pieces`
- `useDepotInventoryActivity`: `from('inventory_transactions')`, `eq('depot_id')` whenever enabled, `order created_at desc`, `staff!created_by`; `enabled: !!depotId` (no unscoped admin fetch)
- `InventoryPage` hybrid: 64px image area rendered; Restock button in row

**13G:**
- `DashboardPage`: StatCards with MoneyDisplay render
- `CategoriesPage`: child rows have indent/connector

### Layer 2: TypeScript

`tsc --noEmit` after each sub-phase. No new `any` without documented justification.

### Layer 3: Manual workflow validation (post-13D)

1. Add one product (single unit) — tap card
2. Add same product twice — qty increments in cart
3. Add multi-unit product — popover opens, unit selected, added
4. Adjust qty with ± buttons
5. Change unit inline in CartItem
6. Remove one line
7. Clear cart (confirm when 2+ items)
8. Select category — grid filters
9. Search within category
10. Select existing customer — chip shows name + owe
11. Create new customer inline — chip switches
12. Tap Exact button — cash = total
13. Overpayment — change shown at 28px
14. Walk-in underpay — CommitButton disabled, warning visible
15. Customer underpay — balance shown
16. Press Enter — sale submits (when valid)
17. Complete sale — success modal: total 36px, change 28px
18. Print receipt — verify content unchanged
19. Stale shift error — ShiftChip reverts to amber, toast with improved copy
20. No shift selected — warning persists; sale completes without shift attribution

---

## 30. Browser Verification

Run against hosted TEST environment after each sub-phase.

### Admin in AppShell

| Route | Check |
|---|---|
| `/dashboard` | PageHeader; MoneyDisplay KPIs |
| `/sales` | FilterBar; receipt bold; total MoneyDisplay; return/void intact |
| `/customers` | FilterBar; balance danger color |
| `/payments` | FilterBar; "debt repayments" subtitle |
| `/shifts` | FilterBar; cash MoneyDisplay in drawer |
| `/inventory` (all depots) | Dense table preserved; PageHeader |
| `/admin/staff` | DataTable; FilterBar |
| `/admin/depots` | DataTable; FilterBar |
| `/admin/categories` | Tree with connectors |
| `/admin/settings` | Input components; ConfirmDialog on rate change |
| `/reports` | Tabs component; MoneyDisplay; CSV unchanged |
| `/admin/audit` | FilterBar; timeline visual |
| `/pos` via TopBar **Open POS** | PosShell; no AppRail; "← Overview" link |

### Cashier in PosShell + AppShell

| Route | Check |
|---|---|
| `/pos` | PosContextBar; CategoryRail; ProductGrid; PaymentPanel; CommitButton always visible |
| `/sales` | FilterBar; return/void intact |
| `/customers` | FilterBar; balance danger |
| `/payments` | FilterBar |
| `/shifts` | FilterBar; shift list; Open Shift works |
| Unauthorized (e.g., `/dashboard`) | Redirected to `/pos` |

### Depot staff in AppShell

| Route | Check |
|---|---|
| `/inventory` | Hybrid list: 64px image, Restock button |
| `/inventory/activity` | StockActivityPage (not InventoryPage) |
| `/transfers` | Phase 9 UI unchanged |
| Unauthorized (e.g., `/pos`) | Redirected to `/inventory` |

---

## 31. Visual Acceptance Criteria

**Manual visual checkpoints by sub-phase (not automated screenshots unless tooling already exists):**

**After 13A:** foundation component consistency (Button xl, MoneyDisplay sizes, FilterBar, Tabs, PageHeader, Badge `returned` = warning).

**After 13B:** empty POS shell; **1280×720**; **1366×768**. Thin context bar; product pane is the leftover majority; no AppRail/TopBar on `/pos`.

**After 13C:** populated product grid; mixed image / no-image catalog; multi-unit products; cart with multiple lines; long cart. Product wall dominates. In-cart indicator is unit-aware.

**After 13D:** normal cash sale; exact cash; overpayment; credit (walk-in blocked); customer-selected credit; long cart with payment fully visible. Viewports: **1280×720**, **1366×768**, **1440×900**, **1920×1080**.

**POS — all must pass:**
- [ ] No large empty gray canvas when products are available
- [ ] Product grid fills available width with uniformly sized cards
- [ ] Cart persistently visible without any user action
- [ ] PaymentPanel (total + cash + commit) always visible without scrolling on ≥1280px
- [ ] CheckoutSummary Total is the **only** 36px number on the right column (CartFooter is compact)
- [ ] Cash input is the largest input in the payment area
- [ ] CommitButton is h-14 (56px), full cart column width
- [ ] ExactCashButton visible beside or below CashInput
- [ ] Change (when non-zero) at 28px `money-large`
- [ ] Balance added (when non-zero) at 28px `money-large` danger color
- [ ] Cart qty controls are ≥ 44px
- [ ] Product cards are tappable without a qty input on the card
- [ ] In-cart products show presence: `×N` for a single unit line, or "In cart" when multiple unit lines (never a mixed-unit sum)
- [ ] CategoryRail + search share one discovery toolbar; product wall dominates leftover height
- [ ] Search narrows within selected category
- [ ] PosContextBar is thin (~40–48px), readable at 1280×720 / 1366×768, with depot + shift + nav (no full admin rail)
- [ ] Admin on POS sees PosShell with "← Overview" link
- [ ] Admin opens POS from TopBar **Open POS**, not a primary admin rail item
- [ ] Shift chip updates after selection without page reload

**Operations console — all must pass:**
- [ ] All list pages have consistent PageHeader (title, subtitle, actions)
- [ ] All list pages use FilterBar
- [ ] Money values use MoneyDisplay at appropriate sizes
- [ ] Customer balance in danger color on Customers list
- [ ] Categories show tree with connectors
- [ ] Stock Activity page renders on `/inventory/activity` (one selected depot; admin All Depots shows EmptyState)
- [ ] Inventory depot_staff view: 64px image + inline Restock
- [ ] Reports tabs use Tabs component; data and CSV unchanged
- [ ] Admin **Open POS** in TopBar navigates to PosShell; admin rail does not treat POS as a primary destination

---

## 32. Regression Protection

Workflows that must be verified unchanged after Phase 13:

| Workflow | Verify |
|---|---|
| `complete_sale` | Same RPC call, error handling, idempotency, cache invalidation |
| Return | Same modal, same RPC, same gate (completed status required) |
| Void | Same modal, same RPC, same gate |
| Record customer payment | Same modal, same RPC |
| Customer pooled balance | Computed server-side; UI displays only |
| Restock | Same RestockModal; same `restock_product` RPC |
| Inventory adjustment | Same AdjustmentModal; same `adjust_inventory` RPC |
| Open shift | Same OpenShiftModal; same RPC; no auto-select |
| Close shift | Same CloseShiftModal; same RPC; actual-cash field unchanged |
| Report data | Same metrics, same date boundaries, same CSV columns |
| Audit events | Same event types; same detail payload |
| Auth / RLS | Same roles; same depot isolation; same deactivated behavior |
| Phase 9 transfers | No functional change; UI unchanged until Phase 9 commits |

---

## 33. File-by-File Change Map

### CREATE

| File | Sub-phase | Purpose |
|---|---|---|
| `src/components/ui/MoneyDisplay.tsx` | 13A | CFA display at 4 size tokens |
| `src/components/ui/SearchInput.tsx` | 13A | Shared search field with icon |
| `src/components/ui/Select.tsx` | 13A | Styled select wrapper |
| `src/components/ui/FilterBar.tsx` | 13A | Shared filter row |
| `src/components/ui/Tabs.tsx` | 13A | Shared tab strip |
| `src/components/ui/PageHeader.tsx` | 13A | Shared page header |
| `src/components/layout/PosShell.tsx` | 13B | POS layout wrapper |
| `src/components/layout/PosContextBar.tsx` | 13B | Thin POS context bar (~40–48px, visually validated) |
| `src/components/pos/ShiftChip.tsx` | 13B | Shift state + popover |
| `src/components/pos/ProductCard.tsx` | 13C | Tap-to-add product card |
| `src/components/pos/UnitPickerPopover.tsx` | 13C | Multi-unit selection |
| `src/components/pos/ProductGrid.tsx` | 13C | Responsive product grid |
| `src/components/pos/CategoryRail.tsx` | 13C | Horizontal category pills |
| `src/components/pos/CartPanel.tsx` | 13C | Cart container |
| `src/components/pos/CartItem.tsx` | 13C | Two-line cart row |
| `src/components/pos/UnitChangeSelect.tsx` | 13C | Inline unit switch in cart |
| `src/components/pos/CartFooter.tsx` | 13C | Sticky compact footer (line count / body subtotal — not 36px Total) |
| `src/components/pos/PaymentPanel.tsx` | 13D | Replaces CheckoutPanel |
| `src/components/pos/CustomerChip.tsx` | 13D | Compact customer selector |
| `src/components/pos/DiscountRow.tsx` | 13D | Collapsible discount |
| `src/components/pos/CashSection.tsx` | 13D | Cash input + exact button |
| `src/components/pos/CashInput.tsx` | 13D | Large cash number input |
| `src/components/pos/ExactCashButton.tsx` | 13D | One-click exact cash |
| `src/components/pos/CheckoutSummary.tsx` | 13D | Financial rows; **sole** 36px Total |
| `src/components/pos/CommitButton.tsx` | 13D | h-14 commit with Enter |
| `src/pages/inventory/StockActivityPage.tsx` | 13F | Depot activity page |

### MODIFY

| File | Sub-phase | Change |
|---|---|---|
| `src/components/ui/Button.tsx` | 13A | Add `xl` size |
| `src/components/ui/Badge.tsx` | 13A | `returned` → `warning` |
| `src/components/ui/index.ts` | 13A | Export new components |
| `src/index.css` | 13A | Add `--pos-context-height` target token (~40–48px) |
| `src/components/layout/TopBar.tsx` | 13B | Admin **Open POS** action |
| `src/components/layout/AppRail.tsx` | 13I | Remove duplicate Sign out only. **Do not** add POS to admin nav |
| `src/routes/index.tsx` | 13B, 13F | POS → PosShell; activity → StockActivityPage |
| `src/pages/pos/POSPage.tsx` | 13B, 13C, 13D | Remove ShiftIndicator; adopt new components |
| `src/hooks/useProducts.ts` | 13C | Add categoryId param |
| `src/stores/posStore.ts` | 13C | Add atomic `changeUnit` only |
| `src/hooks/useInventory.ts` | 13F | Add useDepotInventoryActivity (`inventory_transactions`) |
| `src/components/ui/Skeleton.tsx` | 13C | Verify ProductCardSkeleton dimensions |
| `src/pages/pos/components/SaleSuccessModal.tsx` | 13D | MoneyDisplay for totals |
| `src/pages/pos/components/CustomerSelector.tsx` | 13D | Driven by CustomerChip |
| `src/pages/sales/SalesPage.tsx` | 13E | PageHeader, FilterBar |
| `src/pages/sales/components/SaleDetailDrawer.tsx` | 13E | MoneyDisplay |
| `src/pages/customers/CustomersPage.tsx` | 13E | PageHeader, FilterBar, balance |
| `src/pages/customers/components/CustomerDetailDrawer.tsx` | 13E | Balance MoneyDisplay |
| `src/pages/payments/PaymentsPage.tsx` | 13E | PageHeader, FilterBar, copy |
| `src/pages/shifts/ShiftsPage.tsx` | 13E | PageHeader, FilterBar |
| `src/pages/shifts/components/ShiftDetailDrawer.tsx` | 13E | Cash MoneyDisplay |
| `src/pages/inventory/InventoryPage.tsx` | 13F | Hybrid list for depot_staff |
| `src/pages/admin/DashboardPage.tsx` | 13G | PageHeader, MoneyDisplay, chart |
| `src/pages/admin/StaffPage.tsx` | 13G | PageHeader, FilterBar, DataTable |
| `src/pages/admin/DepotsPage.tsx` | 13G | PageHeader, FilterBar, DataTable |
| `src/pages/admin/CategoriesPage.tsx` | 13G | Tree rendering |
| `src/pages/admin/SettingsPage.tsx` | 13G | Shared Input, PageHeader |
| `src/pages/admin/AuditPage.tsx` | 13G | PageHeader, FilterBar, timeline |
| `src/pages/reports/ReportsPage.tsx` | 13G | Tabs, PageHeader, MoneyDisplay |
| `src/pages/LoginPage.tsx` | 13I | Shared Input, LoadingButton xl |
| `tailwind.config.ts` | 13I | Cart bump animation keyframe |

### DELETE (after replacement confirmed)

| File | After sub-phase | Replaced by |
|---|---|---|
| `src/pages/pos/components/ProductSearchPanel.tsx` | 13C | `src/components/pos/ProductGrid.tsx` + `CategoryRail.tsx` + `SearchInput` |
| `src/pages/pos/components/CartPanel.tsx` | 13C | `src/components/pos/CartPanel.tsx` |
| `src/pages/pos/components/CheckoutPanel.tsx` | 13D | `src/components/pos/PaymentPanel.tsx` |
| `src/pages/pos/components/PosShiftIndicator.tsx` | 13I | `src/components/pos/ShiftChip.tsx` (inside PosContextBar) |

### DO NOT TOUCH (Phase 13 prohibition)

| Files | Reason |
|---|---|
| `src/pages/transfers/TransfersPage.tsx` | Phase 9 frozen |
| `src/pages/transfers/components/*` | Phase 9 frozen |
| `src/hooks/useTransfers.ts` | Phase 9 frozen |
| `src/__tests__/transfers/*` | Phase 9 frozen |
| `supabase/migrations/*` | No new migrations in Phase 13 |
| `supabase/tests/*` | No SQL changes |
| `src/lib/rpc.ts` | Operational RPCs unchanged |
| `src/lib/errors.ts` | Error messages and codes unchanged |
| `src/stores/posStore.ts` | **Except 13C `changeUnit` addition.** Do not change `addItem` merge, `computeTotals`, cash/discount/sale fields, or RPC mapping |
| `src/hooks/useSales.ts` | No change |
| `src/hooks/useCustomers.ts` | No change (CustomerSelector refactor is presentation only) |
| `src/hooks/useShifts.ts` | No change (ShiftChip uses same hooks) |
| `supabase/seed.sql` | No change |

---

## 34. Implementation Order

Each sub-phase must meet its exit criteria before the next begins.

```
13A (Foundations)
  |
  +→ 13B (POS Shell) — depends on 13A
       |
       +→ 13C (Product Discovery + Cart) — depends on 13A, 13B
            |
            +→ 13D (Checkout) — depends on 13A, 13B, 13C
                 |
                 +→ 13E (Cashier Secondary) — depends on 13A only; can run parallel with 13C/D
                 |
                 +→ 13F (Operations) — depends on 13A only; can run after 13D
                 |
                 +→ 13G (Admin) — depends on 13A; after 13E and 13F
                      |
                      +→ 13H (Hardening) — depends on 13A–13G
                           |
                           +→ 13I (Polish) — depends on 13A–13H
```

**Parallelism opportunity:** 13E can start as soon as 13A is done (no POS dependency). 13F can also start from 13A. 13G can start as soon as 13A is done. However, 13B–13D must be sequential.

**Recommended minimum shippable sequence:** 13A → 13B → 13C → 13D. After 13D, the POS is transformed. Everything else improves the application but doesn't define the product.

---

## 35. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PaymentPanel scroll regression — CommitButton hidden on short viewports | Medium | High | Validate at 1280×720 and 1366×768; PaymentPanel shrink-0 intrinsic; cart flex-1; no internal payment scroll |
| Sequential removeItem+addItem loses qty or duplicates lines | High | High | Forbidden. Atomic `changeUnit` in posStore; tests for merge-if-target-exists **and stable cart order** (survivor keeps target index) |
| Accidental Enter checkout | Medium | High | §9.7 gates: canSubmit, defaultPrevented, `isComposing === false`, not editing input, no overlay, not a native button/link Enter |
| useDepotInventoryActivity blocked by RLS | Medium | Medium | Table is `inventory_transactions` with existing SELECT policies; verify join; fallback without join; no new table |
| Admin Stock Activity dumps all depots | Medium | High | UI always `.eq('depot_id', depotId)`; All Depots / `null` → EmptyState; never omit the filter even though admin RLS allows all |
| Admin rail with POS as primary destination | Medium | Medium | Do not add POS as admin `isPrimary` rail item; TopBar **Open POS** only |
| Phase 9 contamination — accidental save/format of transfer files | Low | High | Do not open transfer files in editor; keep them unstaged; verify `git status` before each commit |
| Business logic migration from CheckoutPanel breaks canSubmit or submission | Medium | High | Move logic verbatim first; run all POS tests before any visual change |
| Category filter reveals RLS gap (cashier can't filter by category_id) | Low | Medium | Verify with a test query in TEST environment before 13C; fallback: show all products when category filter fails |
| ProductGrid rerender performance with 40 cards | Low | Low | 40 cards is small; Zustand shallow selectors maintained; no action unless measured |
| UnitPickerPopover blocks underlying product grid on small screens | Low | Medium | Popover is anchored to card; z-index above grid; test at 1280px |
| Cart total aria-live spamming screen readers | Low | Medium | Debounce the live region update (only announce when cart total changes, not on every keystroke in CashInput) |
| Login visual rework breaks RHF form or Zod validation | Low | High | Change only presentation markup; keep all register() calls, validation rules, submit handler untouched |
| Transfers REWORK pulled into Phase 13 before Phase 9 commits | Low | Critical | Hard rule: no transfer file opened in Phase 13. Post-commit rule for Phase 9 only. |
| Over-abstraction in 13A — FilterBar too complex to adopt | Low | Medium | Keep FilterBar props optional; pages can adopt incrementally |
| Images on ProductCard cause layout shift | Low | Low | Explicit width/height on img elements eliminates CLS |
| Reports CSV columns or date logic inadvertently changed in 13G | Low | High | 13G only modifies tab strip, PageHeader, MoneyDisplay; no changes to hooks or report data; run a CSV export before/after |

---

## 36. Definition of Done

**Phase 13 is complete when all of the following are true:**

**POS:**
- [ ] The POS reads visually and interactively as a professional retail terminal, not a generic SaaS form
- [ ] SEE → RECOGNIZE → TAP → ADJUST → PAY → COMPLETE is achievable in a typical cash sale
- [ ] Desktop mouse/keyboard workflow is complete and smooth
- [ ] No critical action (cart, pay, commit) is hidden behind a scroll boundary
- [ ] Product browsing is visual (category + grid)
- [ ] Category browse works; search narrows results
- [ ] Cart is persistent and always visible
- [ ] Payment hierarchy is dominant (total largest, cash large, change/balance large)
- [ ] Exact cash is one obvious action
- [ ] Credit workflow is correct: customer required, balance shown, no payment method selector
- [ ] Unit selection works without remove/re-add
- [ ] Receipt print content is semantically unchanged
- [ ] No barcode/SKU UI anywhere
- [ ] No payment method selector anywhere

**Application:**
- [ ] Cashier shell (PosShell) is visually distinct from operations console (AppShell)
- [ ] Depot staff inventory workflow improved (hybrid list, Stock Activity page)
- [ ] Admin console is visually consistent (PageHeader, FilterBar, MoneyDisplay)
- [ ] Reports data, metrics, and CSV unchanged
- [ ] Audit events unchanged
- [ ] No Phase 9 file modified or staged
- [ ] All Vitest tests pass (`npm test`)
- [ ] TypeScript build passes (`tsc --noEmit`)
- [ ] Full browser verification passes (§30 matrix)
- [ ] No new migrations created
- [ ] No operational RPC changed

---

## 37. Post-Phase-13 Opportunities

Items that should **not** be pulled into Phase 13 unless confirmed essential:

- Tablet-first terminal mode (touch-primary, stacked layout)
- Phone/mobile POS layout
- Barcode scanner integration
- Advanced analytics / charts for reports
- Per-depot timezone support
- Historical stock snapshots (point-in-time)
- Advanced keyboard macro system (arrow navigation, hotkeys)
- Hardware receipt printer API (beyond `window.print()`)
- Transfers visual REWORK (blocked on Phase 9 commit; becomes a targeted sub-phase after)
- Load-more for product catalog > 40 (if catalogs remain ≤ 40, the informational note is sufficient)
- Dark mode
- Custom brand/accent color (if a brand guide is provided)
- Offline / PWA capability

---

## 38. Final Recommended Scope

### Recommended session structure

| Session | Sub-phases | Shippable? | Notes |
|---|---|---|---|
| Session 1 | 13A | Yes | Foundations only; no page changes; low risk |
| Session 2 | 13B | Yes | Shell restructure; POS visual unchanged; medium risk |
| Session 3 | 13C | Yes | Product discovery + cart; highest value visual change |
| Session 4 | 13D | Yes | Checkout + payment; completes POS transformation |
| Session 5 | 13E + 13F | Yes | Cashier secondary + operations; can be split |
| Session 6 | 13G | Yes | Admin visual polish |
| Session 7 | 13H + 13I | Yes | Hardening + final polish |

**Each session should be committed independently.** No sub-phase should span multiple sessions without an interim commit. This enables rollback if a regression is discovered.

### Sub-phase independence

- **13A is strictly required before all others.** No page can adopt new components that don't exist.
- **13B must precede 13C and 13D.** The POS shell envelope must exist before the internal product/payment UI is rebuilt.
- **13C must precede 13D.** PaymentPanel is the rightmost column below CartPanel.
- **13E, 13F, 13G can start from 13A** and proceed in parallel with 13C/D if multiple developers are available.
- **13H and 13I require 13A–13G to be complete.**

### What to validate after 13D

After Session 4, run the full §29 manual workflow validation (20 scenarios) before proceeding to 13E. The POS transformation is the product-defining milestone. Admin polish in 13E–13G should not distract from confirming the POS works correctly.

### What must not be touched until Phase 9 commits

- `src/pages/transfers/TransfersPage.tsx`
- `src/pages/transfers/components/*`
- `src/hooks/useTransfers.ts`
- `src/__tests__/transfers/*`
- `supabase/migrations/20260913000001_rpc_cancel_transfer.sql`
- Any hunk in `src/lib/rpc.ts`, `src/types/rpc.ts`, `src/types/database.ts`, `src/lib/errors.ts` that belongs to Phase 9

After Phase 9 commits, a separate targeted plan will align the Transfers UI with Phase 13 foundations. This is not part of Phase 13's scope.
