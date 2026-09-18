# Phase 13 — UI/UX Discovery

Discovery only. No implementation. Evidence is from the current repository as of this document. Phase 12 is closed at commit `6f12aed`. Phase 9 transfer work remains uncommitted and must not be modified as part of Phase 13 discovery or later UI work until it is committed separately. Phase 10 and Phase 11 remain closed.

Target mental model for cashier POS:

**SEE → RECOGNIZE → TAP → ADJUST → PAY → COMPLETE**

Current mental model in the shipped POS:

**SEARCH THROUGH ADMIN UI → OPEN SMALL CONTROLS → FILL FORM → SUBMIT**

---

## 1. Executive Summary

The product is operationally mature: cash-only sales, pooled customer balance, shifts, inventory, transfers (Phase 9 uncommitted), reports, and audit all exist as working workflows. The visual and interaction system does not yet match that maturity.

The application currently presents as a **generic light SaaS admin console** with POS features bolted into the same shell. Evidence: Inter + Untitled-UI-like tokens (`#F6F7F9` canvas, `#1570EF` primary), a persistent 64px rail + 56px TopBar on every authenticated page including POS, compact product cards with 32×32 images, form-like quantity inputs, a 380–420px cart column, and checkout totals rendered at `text-base` rather than the unused `financial-lg` (36px) token.

The cashier POS is the highest-priority redesign surface. It is constrained by chrome that belongs to an admin app, product discovery that is search-first rather than recognition-first, touch targets below 44px, and a payment panel that reads as a form rather than a terminal checkout.

Admin and depot_staff screens should **not** be forced into a visual POS grid. They should keep information density where tables and filters are legitimate, while sharing foundations (money, status, buttons, drawers, empty states).

Phase 13 should be treated as **several visual/UX sub-phases**, not one undifferentiated restyle. Business rules, RPCs, routes, and Phase 9/12 semantics must not change.

---

## 2. Current Application Inventory

Authenticated routes all render inside `AuthGuard` → `AppShell` (`AppRail` + `TopBar` + scrollable `<main>`). Public: `/login`. Deactivated staff see `DeactivatedPage` inside AuthGuard (URL unchanged). Unknown routes: `NotFoundPage`.

Role home: admin `/dashboard`, cashier `/pos`, depot_staff `/inventory`.

### 2.1 Auth / system screens

| Screen | Purpose | Role | Current layout | Primary task | Primary CTA | Secondary | Major components | Pain points | Complexity | Redesign level |
|---|---|---|---|---|---|---|---|---|---|---|
| Login | Username/password sign-in | All | Centered card on gray canvas | Authenticate | Sign in (`LoadingButton`) | Show/hide password | RHF + Zod form, toast errors | Generic SaaS login; no terminal/depot personality; synthetic email is hidden (correct) | Low | REWORK (visual only) |
| Deactivated | Explain inactive account | Any deactivated staff | Centered message | Acknowledge + sign out | Sign out | None | Copy + `LoadingButton` | Adequate; keep behavior | Low | KEEP |
| 404 | Unknown / unauthorized path | Authenticated | Centered 404 | Return to role home | Go to Home | None | Heading + button | Fine | Low | KEEP |

### 2.2 Cashier (+ admin via RoleGuard)

| Screen | Purpose | Role | Current layout | Primary task | Primary CTA | Secondary | Major components | Pain points | Complexity | Redesign level |
|---|---|---|---|---|---|---|---|---|---|---|
| **POS** `/pos` | Sell products | Cashier primary; admin can open URL but **POS is not in the admin rail** | Shift strip + 2 columns: products `flex-1`, cart `w-[380px] xl:w-[420px]` | Complete a sale | Complete Sale | Search, qty, customer, discount, cash, print | `ProductSearchPanel`, `CartPanel`, `CheckoutPanel`, `PosShiftIndicator`, `SaleSuccessModal` | See §3–4. Generic admin chrome, small cards, narrow cart, weak pay/complete hierarchy | Medium functionally; high UX debt | **REDESIGN FROM SCRATCH** (layout + interaction; keep RPC/store semantics) |
| Sales `/sales` | History, return, void | Cashier, admin | Page header + filter chips + receipt search + CSS-grid list + drawer | Find a sale; return/void | Row → drawer | Status filters, pagination | `SalesPage`, `SaleDetailDrawer`, `ReturnModal`, `VoidModal` | Table-like list is legitimate; cashier scanability is weak; return/void buried in drawer | Medium | REWORK |
| Customers `/customers` | Search, create, balances, history | Cashier, admin | Header + filters + search + list + drawer/modal | Find customer / see balance | Row → drawer; + New Customer | Active / With Balance / Inactive (admin) | `CustomerDetailDrawer`, `CustomerFormModal`, `RecordPaymentModal` | Search-first is right; balance not visually dominant enough in the list | Medium | REWORK |
| Payments `/payments` | Standalone customer_payment history | Cashier, admin | Header + search + reversed toggle + list | See who paid | Row is informational (chevron) | Show reversed | List rows | Outstanding balances live on Customers, not here — split can confuse cashiers | Low–medium | REWORK |
| Shift `/shifts` | Open/close/select POS shift | Cashier, admin | Header + status chips + list + drawer + Open/Close modals | Open or close shift; select for POS | Open Shift / row → drawer | Status filter | `OpenShiftModal`, `CloseShiftModal`, `ShiftDetailDrawer` | Cash figures are table cells, not a cash-drawer mental model; POS selection is a separate strip + this page | Medium | REWORK |

### 2.3 Depot staff (+ admin)

| Screen | Purpose | Role | Current layout | Primary task | Primary CTA | Secondary | Major components | Pain points | Complexity | Redesign level |
|---|---|---|---|---|---|---|---|---|---|---|
| Inventory `/inventory` | Product list, stock, restock/adjust | Depot staff, admin | Header + search/filters + CSS-grid table + drawer + modals | Find product; restock/adjust | Row → drawer; admin + New Product | Stock/category filters | `ProductDetailDrawer`, `RestockModal`, `AdjustmentModal`, `ProductFormModal` | Product identity is a tiny 32px thumb in a dense table; activity is inside the drawer | Medium | REWORK (product-first for depot_staff; admin may keep dense table) |
| Stock Activity `/inventory/activity` | Intended movement log | Depot staff (rail item) | **Same `InventoryPage` as `/inventory`.** Page does not read the path. | — | — | — | None dedicated | **Broken information architecture:** rail item does not change the UI. Activity exists only inside `ProductDetailDrawer`. | Accidental | **REDESIGN** the destination later (dedicated activity view); do not invent RPC changes here |
| Transfers `/transfers` | Inter-depot transfers | Depot staff, admin | List + status + drawer + create/complete/cancel modals (Phase 9 UI exists locally) | Create / receive / cancel transfer | New transfer / row detail | Status filters | `TransfersPage` + Phase 9 modals/drawer | Source/destination and item readability will need UX work **after Phase 9 is committed**. Do not modify Phase 9 files now. | Medium | KEEP until Phase 9 committed, then REWORK |

### 2.4 Admin

| Screen | Purpose | Role | Current layout | Primary task | Primary CTA | Secondary | Major components | Pain points | Complexity | Redesign level |
|---|---|---|---|---|---|---|---|---|---|---|
| Dashboard `/dashboard` | Today KPIs | Admin | Padding + StatCards + crude CSS hourly bars + lists | See today’s health | None (read-only) | Action-required list | `StatCard`, `Card` | Hierarchy is flat; hourly chart is a prototype; no POS-style needed | Low | REWORK (management visual, not POS grid) |
| Staff `/admin/staff` | People CRUD | Admin | Header + search/role/status + list + drawer + form modal | Create / deactivate staff | + New; row → drawer | Filters | `StaffDetailDrawer`, `StaffFormModal` | Adequate admin CRUD | Medium | KEEP / light REWORK |
| Depots `/admin/depots` | Location CRUD | Admin | Same list pattern | Manage depots | + New; row → drawer | Active filter | `DepotDetailDrawer`, `DepotFormModal` | Adequate | Low | KEEP / light REWORK |
| Categories `/admin/categories` | Category tree | Admin | Flattened indented list + form modal + confirm | Maintain hierarchy | + New / add child | Deactivate/reactivate | `CategoryFormModal` | Tree is flattened; parent/child is text indent only | Medium | REWORK (tree clarity) |
| Settings `/admin/settings` | Business name, logo URL, CFA/USD rate | Admin | Simple form in page | Save settings | Save | Confirm rate change | Form + `ConfirmDialog` | Simple is correct | Low | KEEP |
| Reports `/reports` | Phase 12 analytics + CSV | Admin | Tabs + date toolbar + StatCards + lists + export | Analyze period | Export CSV | Presets / custom dates / depot via TopBar | `ReportToolbar`, four report hooks | Semantics are closed. Visual polish only later. | Medium | KEEP IA; P2 visual |
| Audit Log `/admin/audit` | Activity inspection | Admin | Filters + list + detail drawer | Inspect an event | Row → drawer | Filters | `AuditDetailDrawer` | Timeline vs table is a later polish question | Medium | KEEP IA; P2 visual |

### 2.5 Global chrome (all authenticated pages)

| Surface | Purpose | Layout | Pain on POS | Redesign level |
|---|---|---|---|---|
| `AppRail` | Role nav | 64px collapsed / 220px expanded; logo “V”; sign out + collapse | Always present; cashier POS loses 64px permanently; admin has 13 items and **no POS link** | POS: reduced/contextual shell. Admin: KEEP pattern |
| `TopBar` | Depot + user | 56px; depot dropdown (admin) or label; user menu | No page title, no shift, no sale context; duplicates sign-out | POS: merge into compact context bar. Others: KEEP with stronger page title |
| Toasts | Errors/success | Sonner top-right, 4s, `richColors` | Fine for errors; sale success already uses a modal (correct) | KEEP |
| Print receipt | Thermal 80mm | `#vhm-receipt` + `@media print` | Spec-correct; not a visual POS issue | KEEP |

No breadcrumbs exist anywhere.

---

## 3. Current POS Deep Audit

Source of truth: `src/pages/pos/POSPage.tsx` and its components. Business comments already forbid barcode/SKU and payment-method selectors — preserve.

### 3.1 Layout

| Region | Actual | Effect |
|---|---|---|
| App chrome | Rail 64px + TopBar 56px on every POS session | Checkout is never full-viewport. Feels like an admin page, not a terminal. |
| Shift strip | Extra full-width bar (`py-2`) success/warning background | Third chrome band before products. Useful state, wrong placement. |
| Product area | `flex-1`, search `h-10` in `p-4` border-b, grid `grid-cols-1 sm:2 xl:3 gap-3` | On a wide monitor the left pane is large, but **cards do not fill it**. Screenshot evidence: unused gray space around small cards. |
| Cart column | Fixed `w-[380px] xl:w-[420px]`, `bg-surface` | Narrow relative to a retail cart. Qty + price + trash compete on one row. |
| Payment | Same column, `max-h-[60vh]` internal scroll | On 1366×768, cart body is squeezed (~200px) while checkout form scrolls. Payment is a form stack, not a dominant pay zone. |
| Empty products | `EmptyState` centered | Correct copy; visually a SaaS empty state. |
| Empty cart | Icon + “Search products and add them” | Instructs search, not tap-to-add. |
| Scroll | Products and cart scroll independently; checkout may scroll inside the right column | Three scroll contexts. Easy to lose the Complete Sale button below the fold inside `max-h-[60vh]`. |

**Viewport math (illustrative, not measured in browser this discovery):**

- 1920×1080: content height ≈ 1080 − 56 − ~40 shift ≈ 984px. Product width ≈ 1920 − 64 − 420 ≈ 1436px → 3 columns of small cards with leftover cell padding.
- 1366×768: height is the failure mode. Chrome + shift + search + checkout 60vh leaves a stub of cart.
- `< sm`: product grid becomes 1 column; cart remains 380px — **POS is not actually usable as a stacked mobile layout**. There is no POS breakpoint that hides the cart or becomes a dedicated cart sheet.

### 3.2 Product discovery

| Concern | Current behavior | Friction |
|---|---|---|
| Search | Debounced 300ms `ilike` name; autofocus; custom input (not shared `Input`) | Search-first. Browse is “whatever the first 40 active products are.” |
| Limit | `.limit(40)` in `fetchProductSearch` | Large catalogs silently truncate. No pagination, no “load more”, no category narrowing. |
| Categories | **Not on POS.** Categories exist for inventory/admin only | Cashier cannot SEE a category rail. Must remember names and type. |
| Cards | White bordered `rounded-lg p-3`; 32×32 image or Package icon; `text-sm` name truncate | Recognition is poor. Images are thumbnails, not merchandise. |
| Stock | Text: Out of stock / Low: N pcs / N pcs | Useful, but small `text-xs`. Out-of-stock cards stay visible at 60% opacity with disabled add. |
| Units | Every unit is a **form row**: unit name, price, `h-7 w-14` number input, `icon-sm` (28px) Plus | This is admin data entry, not TAP. Multi-unit products become mini-tables. |
| Selection / added state | Hover border only. No selected/pressed/in-cart highlight on the card | Cashier cannot see which products are already in the cart from the grid. |
| Add | Click Plus after setting qty | Qty-on-card + qty-in-cart is double UI. Target is ~28px. |
| Images | `photo_url` if present | Most products will look identical (Package icon) unless photos are populated. |

### 3.3 Cart

| Concern | Current | Friction |
|---|---|---|
| Hierarchy | One row: name, unit·price, ± qty, line total, trash | Name is `text-sm`; line total `text-sm`. No product image in cart despite `product_photo_url` being stored. |
| Merge | Same product+unit merges qty in `posStore.addItem` | Correct. Repeated Plus on the card increases line qty. |
| Qty controls | `h-6 w-6` ± (24px), `h-6 w-12` input | Far below touch. Easy mis-tap of trash (`h-6`) vs minus. |
| Unit change | Not in cart; would require remove + re-add | Extra clicks if cashier picked the wrong unit. |
| Subtotal | Cart footer shows subtotal only | Grand total lives in checkout, so the “cart” does not feel like the bill. |
| Clear | Ghost “Clear” in header | Discoverable; confirm-less destructive (whole cart). |
| Empty | Centered illustration | Fine. |
| Large vs small | Everything is small | Opposite of a POS cart. |

### 3.4 Checkout

| Concern | Current | Friction |
|---|---|---|
| Customer | `CustomerSelector`: Walk-in vs search dropdown vs inline create | Walk-in is correct default. Search/create inside a 380px column is cramped. Balance shown as awareness (“Owes …”) — correct model, weak visual. |
| Discount | Native `<select>` None/Flat/Percent + number | Secondary action given equal visual weight to cash. |
| Cash received | `h-10` number input, CFA prefix, `text-sm` | Should be the loudest input. No denomination pads. No “exact” / “pay total” control. Default cash is **0**. |
| Totals | Nested muted card; Total is `text-base` (~16px) | `text-financial-lg` (36px) exists in Tailwind and is unused on POS. Change and balance are small colored rows. |
| Amount applied / change / balance | Preview from client `totals`; server authoritative after submit | Labels are accountant language. Fine for accuracy; not glanceable. |
| Validation | Toasts + inline credit warning if walk-in underpays | Credit warning is good. Enter-to-submit is **commented, not implemented**. |
| Complete Sale | `LoadingButton` `lg` full width “Complete Sale →” | Largest control in the panel, but still a standard button in a scrolling form. Competes with discount/cash fields. Disabled states do not always explain why until click (empty cart toast). |
| Success | `SaleSuccessModal` cannot dismiss except New Sale; Print Receipt → `window.print()` | Correct gating. Financials still `text-sm`/`text-base`. Change/balance not poster-sized. |
| Receipt | Spec-minimal thermal (lot, number, amount, PAID) | Keep. |

### 3.5 Shift

| State | Behavior |
|---|---|
| Indicator | Always visible strip. Green “Shift: Active” or warning “No active shift — sales will not be attributed…” |
| Selection | Never auto-selects (business rule — preserve). “Select for POS” popover of open shifts. Link to `/shifts`. |
| No shift | Sales still enabled | Correct semantically; visually a banner, not a persistent context chip. |
| Stale shift | `clearStalePosShift` on `SHIFT_NOT_OPEN` from complete sale | Error via toast. Cashier may not understand they must re-select. |
| Open/close | Lives on `/shifts` with navigation away from POS | Context switch in the middle of a shift-open morning routine. |

### 3.6 Cashier speed (conceptual, from interaction graph)

| Task | Today (typical) | Unnecessary steps |
|---|---|---|
| Add one product | Locate in 40-item 3-col grid **or** type search → wait 300ms → set qty → click 28px Plus | Visual search in small type; qty form; tiny target. No category. No tap-card-to-add. |
| Add same product again | Click Plus again on card **or** cart + | Works due to merge, but card has no “in cart” state. |
| Change quantity | Cart 24px ± or type in 24px input | Targets too small; easy to hit trash. |
| Search | Type in `h-10` field | OK if name known. Only discovery path. |
| Choose customer | Open selector → type → click | Extra vs walk-in. Inline create is good but nested in dropdown. |
| Exact cash | Mentally read Total → type digits in Cash Received | **No “exact amount” action.** High friction every cash sale. |
| Overpay | Type larger amount → read Change row | Change is not a large readout. |
| Credit sale | Leave cash 0 → must pick customer → warning → Complete | Correct rules; customer picker is the slow part. |
| Complete sale | Click Complete Sale (possibly scrolled) | Enter shortcut not wired. Button can sit below checkout scroll. |
| Print receipt | Success modal → Print Receipt | One extra click after success; acceptable if New Sale remains dominant. |

---

## 4. Why the Current POS Does Not Feel Like a Modern POS

The provided current-state POS screenshot is treated as **evidence of the problem**, not a style to copy.

### 4.1 Why it reads as a generic business/admin web app

1. **Same shell as admin.** Rail icons, “V” logo tile, TopBar depot + avatar is a SaaS console frame. Retail POS terminals typically dedicate the viewport to merchandise + ticket + pay.
2. **SaaS token set.** `#F6F7F9` page gray, white cards, 1px `#E5E7EB` borders, `#1570EF` primary — the Untitled UI / enterprise-dashboard look. It signals “back office,” not “counter.”
3. **Unused space + small objects.** A large left pane filled with small 32px-thumb cards, 12px metadata, and gutters. The eye sees empty canvas, not a product wall.
4. **Narrow ticket.** Cart is a sidebar list, not a persistent bill with a dominant total.
5. **Form controls as the product of record.** Quantity is an HTML number input. Add is a plus-icon button. That is data entry.
6. **Payment is a settings panel.** Discount select, cash field, and a muted summary card are equal siblings. Checkout is not a stage.
7. **Primary action is not dominant enough.** “Complete Sale →” is `h-11`, full width of a 380px column, often competing with scroll. It is not a terminal-sized commit.
8. **Navigation consumes POS space.** 64px rail + 56px top + shift strip is ~160px before the first product.
9. **Dense-table language leaks in.** Unit rows on cards are tiny spreadsheets.
10. **No merchandise presence.** Without large images or strong typography, products are rows of text.

### 4.2 What a professional retail POS reads as (goals, not pixels)

Measurable visual/UX goals for the later redesign (no final colors):

- **Product discovery dominates** the main workspace (majority of remaining width and height after a thin context bar).
- **Cart is persistently visible** during the sale (not a route, not a modal).
- **Payment state is visually dominant** near checkout: cash, change, balance, and total must outrank discount and nav.
- **Primary actions use large targets** (minimum ~44px; POS commit larger).
- **Low-value navigation recedes** during active checkout (collapsed, overlay, or cashier-specific shell).
- **Cashier should not interpret dense tables** to sell. Tables belong to sales history, reports, audit.
- **Recognition before search:** category or visual grid first; search as accelerator.
- **One obvious next action** at every step: add → adjust → tender → complete → new sale.
- **Money has a dedicated display scale** (total > change/balance > line price > metadata).
- **Status is glanceable** (shift, stock, customer owe) without reading a paragraph.

---

## 5. Cashier UX Analysis

**Goal:** maximum speed, recognition, minimal cognitive load.

### What cashiers actually do

1. Open/select shift (infrequent, high importance).
2. Sell: find goods, build cart, take cash or credit, finish, optionally print, next sale.
3. Occasionally: pick/create customer, apply discount, look up a past sale, take a customer payment, return/void.

### What the UI currently optimizes for

- Correctness of forms (qty, discount type, cash number).
- Shared admin chrome and shared list-page patterns.
- Mouse precision on 24–28px controls.

### What should be uniquely cashier

- Dedicated POS shell (or heavily reduced chrome).
- Visual product grid + persistent cart + loud payment.
- Huge money readouts; denomination/exact-cash aids.
- Customer as a compact chip, not a management page.
- Shift as a persistent context chip, not a banner + separate page visit mid-flow when avoidable.
- Sales/customers/payments as **secondary** cashier screens: still list-based, but faster scan and bigger row targets than admin.

### What cashiers should share with the rest of the app

- `formatCFA`, status badges, toasts, login, receipt print CSS, drawer/modal primitives, error copy from `parseError`.
- Not: product card, cart, cash input, or rail density.

---

## 6. Depot Staff UX Analysis

**Goal:** fast inventory and stock operations.

### Current

Depot rail: Inventory, Stock Activity, Transfers. Inventory is a dense product **table** with tiny photos, stock badges, and actions behind a drawer then a modal (restock/adjust). Stock Activity nav is a no-op (same page). Transfers exist as Phase 9 uncommitted UI.

### What should differ from cashier POS

- **Do not** turn inventory into a sell grid. Depot staff need stock numbers, units, activity, and mutations.
- **Do** make products identifiable (larger thumb, name, stock state) and make Restock/Adjust reachable with fewer layers.
- Activity should become a real destination or a first-class panel — later, without changing movement RPCs.
- Transfers: source → destination → status must be obvious after Phase 9 lands. Out of Phase 13 scope until commit.

### Share vs unique

- Share: badges (`StockStatusBadge`), drawers, confirm dialogs, search field pattern.
- Unique: product-first stock cards or hybrid list for depot_staff; admin inventory may stay tabular when viewing all depots.

---

## 7. Admin UX Analysis

**Goal:** management, analysis, configuration, visibility.

Admin rail currently has **13 destinations and no POS**. Admin *can* open `/pos` (RoleGuard allows it) but must know the URL. That is a discovery bug if admins are expected to sell or support cashiers.

Admin should remain **information-dense**:

- Dashboard, reports, audit, sales, staff, depots: tables, KPIs, filters are appropriate.
- Visual work: consistent headers, StatCards, money, status colors, less duplicate filter-chip CSS.
- Do not convert reports/audit into POS-style cards. Phase 12 IA stays.

Shared: shell (for non-POS), DataTable (currently unused), FilterBar (does not exist yet), MoneyDisplay, StatusBadge.

Intentional difference: POS may go nearly full-screen; admin keeps rail + TopBar.

---

## 8. Global Shell / Navigation Audit

### Current

```
[ AppRail 64/220 ] [ TopBar 56: depot ........ user ]
                   [ page content ]
```

POS adds `PosShiftIndicator` inside the page.

- Depot selector: admin switchable including “All Depots”; cashier/depot_staff display-only.
- User menu: name, role, username, sign out.
- Sign out also on rail.
- No page title in TopBar (each page repeats `h1` in a local header).
- No breadcrumbs.
- Content width: POS is full remaining width; list pages use `px-6` headers and full-bleed rows; dashboard `p-6`.
- Toasts: global Sonner.

### Remain global

- Auth, role-based nav *existence*, depot context for admin, user identity, toasts, print CSS.
- Design tokens and primitives.

### Become contextual

- Shift: belongs in POS context, not a third full-width band plus a distant `/shifts` link as the only management path.
- Page title: should live in TopBar for admin/list pages (today duplicated in-page).
- POS primary action should not compete with 13 admin nav items (admin on POS).

### POS shell recommendation (decision in §26)

Cashier POS should use a **reduced shell**: thin context (depot + shift + user) and receding nav. Not the full admin rail during active selling.

Admin visiting POS can keep a way back to Overview without a 13-item rail eating the product wall.

### Depot/shift persistent context

Yes — a compact context bar is more POS-like than TopBar (depot/user) + page banner (shift) + rail (nav). Do not auto-select shift (invariant).

---

## 9. Design System Audit

Location: `src/components/ui/*`, tokens in `src/index.css` + `tailwind.config.ts`. Font: Inter 400–700 from Google CDN (`index.html` notes self-host before production). `JetBrains Mono` is configured and **unused**.

### Inventory

| Primitive | Variants / notes | Issue |
|---|---|---|
| Button | primary, secondary, outline, ghost, danger; sm h-8, md h-9, lg h-11, icon 36, icon-sm **28**, icon-lg 44 | POS uses icon-sm and custom 24px buttons, bypassing the system |
| LoadingButton | wraps Button | Used well for async |
| Input / Textarea | label, error, hint, prefix, suffix | POS search, cash, qty, customer create **bypass** Input |
| Select | **None** | Native `<select>` on discount, various filters |
| Card / StatCard / Section | Card `p-5` + border + shadow-sm; StatCard uses `text-financial-sm` | Section underused; pages roll custom headers |
| Badge + domain badges | success/warning/danger/info/neutral; Sale/Transfer/Stock/Active/Shift | Sale `returned` = info (odd); voided = neutral |
| Modal | sm–2xl; overlay blur; hideClose | Used for forms, confirm, sale success |
| ConfirmDialog | sm modal | Destructive confirms |
| Drawer | sm/md/lg max-width, right sheet | Default pattern for all detail |
| Tabs | **None** | Reports chips are custom; sales/customers filters are custom chips |
| DataTable | Generic, loading, row click | **Exported and unused.** Every list reimplements CSS-grid + TableSkeleton |
| Skeleton | StatCard, TableRow, ProductCard | POS uses a one-off ProductGridSkeleton instead of ProductCardSkeleton |
| EmptyState | icon, title, description, action | Used well; POS empty cart does not use it |
| Toast | Sonner | Fine |
| Tooltip | Radix on collapsed rail | Fine |
| Dropdown | Radix on TopBar | No shared menu primitive |
| Filter chips | Copy-pasted `cn(...)` pill buttons on many pages | Should be FilterBar |
| Icons | lucide-react | Inconsistent sizes 3 / 3.5 / 4 / 5 |
| Typography | body 14px Inter; page `h1` `text-lg font-bold` | No type ramp beyond Tailwind defaults + unused financial sizes |
| Spacing | 8px extras 18/22; pages mix `p-4` `p-5` `p-6` `px-6 py-4` | Inconsistent |
| Radius | 8–16px tokens; components often `rounded-md` / `rounded-lg` | Mixed |
| Shadows | sm/md/lg | Cards sm; POS cards hover sm |
| Surfaces | background / surface / surface-muted | POS left pane is `bg-background` showing gray around white cards |

### Too generic

Button, Card, Modal, Drawer, Input — correct as foundations, but POS needs specialized composites on top.

### Too page-specific

Every `TableSkeleton`, every filter chip row, POS `AddToCartRow`, POS `FinancialRow`, Reports tabs, page headers.

### Duplicated

- List page chrome (title, subtitle, search, chips, pagination).
- Custom `<input>` styles matching Input but not using it.
- Sign out in rail and user menu.

### Minimum foundation before page redesign

1. Tokens: type ramp, spacing scale, semantic status, money sizes actually used.
2. Primitives: Button (incl. POS-sized), Input, SearchInput, Select, Tabs, FilterBar, MoneyDisplay, StatusBadge (already), EmptyState, Modal, Drawer, Toast (keep Sonner).
3. List: one DataTable (or documented hybrid) so pages stop forking markup.
4. POS composites: ProductCard, ProductGrid, CategoryRail, CartItem, CartPanel, PaymentPanel, CashInput, CustomerSelector, ShiftIndicator — designed as POS, not reused Card.

Do not restyle every admin page before POS foundations exist.

---

## 10. Typography / Hierarchy

| Role | Current | Gap |
|---|---|---|
| Font stack | Inter + system | Acceptable. Mono unused except receipt Courier and success receipt number `font-mono` |
| Headings | Page `text-lg font-bold`; section `text-base font-semibold`; uppercase `text-xs` labels | One heading size for Dashboard, Inventory, POS (POS has no page title) |
| Labels | `text-xs font-semibold uppercase tracking-wide` in checkout | OK for forms; too quiet for Cash Received |
| Prices on cards | `text-xs font-medium` | Price should rival product name |
| Product name | `text-sm font-medium truncate` | Weak recognition |
| Quantity | `text-xs` / `text-sm` in 24–28px fields | Should be large and unambiguous |
| Cart total | Subtotal `text-sm`; checkout Total `text-base` | Inverted: the bill total should be the loudest number on screen |
| Cash received | `text-sm font-semibold` in `h-10` | Too small |
| Change / balance | `text-sm` with color | Should be poster-sized when non-zero |
| Complete action | `text-base` on `h-11` | Needs more weight/size |
| Table text | `text-sm` throughout lists | OK for admin; cashier sales list could emphasize receipt + total |
| Status text | Badge `text-xs` | OK |
| Money formatter | `formatCFA` → `CFA 24,500` with fr-FR grouping | Consistent string; inconsistent size/weight around it |
| StatCard | `text-financial-sm` (22px) | Dashboard money is **larger than POS total** — wrong hierarchy for a POS product |

**POS weight recommendation (principle, not spec):** product name medium-large; card price large; cart line medium; cart/checkout **total largest**; cash input large; change/balance large when present; metadata smallest.

---

## 11. Spacing / Density

| Surface | Today | Desired density |
|---|---|---|
| POS product grid | Small cards, gap-3, unused gray | **COMPACT to BALANCED** with **large tap objects** — density of information, not density of whitespace. Fill the wall with recognizable products. |
| POS cart | Cramped 24px controls in a narrow column | **COMPACT** but with **larger targets** (wider cart or two-line items). |
| POS checkout | `gap-4 p-4` form | **COMPACT** for fields, **SPACIOUS** only around the commit button and total. |
| Sales / Customers / Payments / Shifts lists | Header `px-6 py-4` + tight rows | **COMPACT** (keep). Slightly larger row hit area for cashier. |
| Inventory | Same | Depot: **COMPACT** with bigger product identity. Admin all-depots: **VERY COMPACT** table OK. |
| Dashboard | `p-6 space-y-6` | **BALANCED** |
| Reports / Audit | Similar | **COMPACT** (data). |
| Settings / login | Comfortable | **BALANCED** |
| Drawers | `p-5` | **BALANCED** |
| Modals | Mixed | **BALANCED**; POS success can be more ceremonial |

Problems: excess empty space on POS left; cramped qty on POS right; nested cards (checkout summary inside column inside surface); list pages already reasonably compact.

Do not make the whole app spacious.

---

## 12. Responsive / Touch / Keyboard

### Observed

- Layout is **desktop-first**. No POS-specific breakpoints for tablet stacking.
- `sm:` / `md:` / `xl:` used on grids (POS cards 1/2/3 cols; dashboard stats).
- TopBar user name `hidden sm:block`.
- Touch: POS qty 24–28px — **not touch-friendly**. Button `lg` is 44px tall — only Complete Sale and icon-lg meet a 44px target.
- Mouse: works, but precision-required.
- Keyboard: login form OK; POS search autofocus OK; **Complete Sale Enter not implemented**; no product-grid arrow navigation; no quantity `+`/`-` keys.
- Barcode: **explicitly out of project. Do not add.** Search is name `ilike` only.

### Expected by device (recommendation)

| Context | Expectation |
|---|---|
| Desktop (≥1440) | Primary POS: large grid + persistent cart/pay. |
| Laptop (1280–1440) | Still two-pane; reduce chrome; cart ≥ ~420–480 if possible. |
| Small desktop (1280) | Minimum viable POS: reduced shell + two panes. Below this, cart may need a collapsible sheet — **ask in §26**. |
| Tablet | Not supported today. If yes, touch-first: 44px+ targets, maybe bottom cart sheet. Default recommendation: **desktop/laptop primary; tablet optional later**. |
| Phone | Not a POS terminal. Do not pretend. Login/admin may wrap; POS should not be a mobile redesign in 13A–13D. |
| Keyboard | Search focus, Enter to complete when valid, Esc to close overlays. Still no barcode. |
| Touch | If tablet or touchscreen laptop is in-scope, POS controls must be rebuilt around 44px+ even on desktop. |

**Minimum viable POS viewport (recommendation):** ~1280×720 with reduced shell. Current 64+380 chrome already fails that comfortably.

---

## 13. Interaction / Workflow Friction

### POS

| Action | Type | Today | Friction |
|---|---|---|---|
| Add product | Primary | Qty form + Plus | Should be tap card (default unit) + adjust in cart |
| Change qty | Primary | Tiny ± | Enlarge; keep typed qty |
| Remove line | Destructive | Tiny trash, no confirm | Confirm-less is OK if target is not adjacent to minus |
| Clear cart | Destructive | No confirm | Consider confirm when many lines |
| Customer | Secondary | Dropdown in checkout | Keep inline, not a route |
| Create customer | Secondary | Nested in dropdown | Keep inline (good); give it more space |
| Discount | Secondary | Equal visual weight | Recede behind a compact control |
| Cash | Primary | Small input, default 0 | Exact-amount + large input |
| Complete | Primary | Button; Enter commented | Always visible; keyboard |
| Success | Feedback | Blocking modal | Keep blocking; enlarge change |
| Errors | Feedback | Toast | Keep; also inline for credit/shift |
| Shift select | Secondary | Banner popover or `/shifts` | Chip + popover on POS; full page for open/close |

### Other screens (patterns)

| Pattern | Where | Recommendation |
|---|---|---|
| Row click → drawer → modal for the real action | Inventory restock/adjust; sale return/void; customer payment | Inventory: restock/adjust closer (drawer actions OK; avoid extra mystery). Return/void: keep confirm modal (destructive). |
| Filter chips + search + paginated list | Almost all lists | Extract FilterBar; keep pattern |
| Create in modal | Customer, product, staff, depot, category, shift, transfer | Keep modal for create; they are forms |
| Nested modal | Drawer open + RestockModal / ConfirmDialog | One extra layer is OK for confirm; restock from drawer is OK; avoid stacking three |
| Table vs cards | Lists | Keep tables for admin data; cashier customers might gain a balance-forward list, not a POS grid |
| Context switch | POS → Shifts to open a shift → POS | Allow open-shift from POS context later without changing shift RPCs |
| Loading | Skeletons on lists; button spinner | Fine |
| Success | Toast on many mutations; modal on sale | Sale modal is correct; others toasts OK |

No workflow should become a dedicated page solely for visual fashion. Drawers are correct for sale/customer/product **detail**. POS checkout should stay **inline**.

---

## 14. Screen-by-Screen Redesign Assessment

### POS — REDESIGN FROM SCRATCH (presentation)

Keep: `completeSale` RPC, posStore merge/idempotency, walk-in, cash-only, no SKU, success modal + print, server-authoritative totals.

Change: shell, grid, cards, cart, payment hierarchy, shift chrome.

### Sales — REWORK

Keep table/list. Bigger receipt + total + status. Filters stay. Return/void stay behind detail + confirm. Cashier vs admin can share the page with denser admin filters later if needed.

### Customers — REWORK

Search-first stays. Make **balance** the second most visible field after name (danger when owed). Payments and history stay in drawer. Create modal stays.

### Payments — REWORK

Clarify this is **debt repayments**, not POS tenders (copy already tries). Consider linking “record payment” more strongly from Customers (already in drawer). List can stay a table.

### Shift — REWORK

Cash-in / expected / variance should feel like a drawer count, not just cells. Open/Close modals stay (money entry needs focus). POS selection should be visible without losing the selling screen.

### Inventory — REWORK

Depot_staff: product-first hybrid (identity + stock + quick restock). Admin all-depots: table OK. Photos larger than 32px. `/inventory/activity` must eventually be a real view (P1 IA, implement after design system).

### Stock Activity — REDESIGN destination

Today a duplicate route. Later: chronological movements with product, qty, reason, actor. Do not change RPCs in this discovery.

### Transfers — KEEP (frozen)

Phase 9 uncommitted. Inventory this screen as existing for depot_staff/admin. No Phase 13 edits to transfer files. After commit: REWORK for source/destination/status/item clarity.

### Dashboard — REWORK

Stronger KPI hierarchy, replace toy hourly bars with a real small visualization, keep management tone.

### Staff / Depots — KEEP / light REWORK

People/location lists. Shared FilterBar + DataTable. Not POS-styled.

### Categories — REWORK

True hierarchy (indent/tree lines, parent labels). Not a POS concern.

### Settings — KEEP

Simplicity is the feature.

### Reports — KEEP IA, P2 visual

Phase 12 closed. Do not change metrics, date semantics, CSV, or depot scoping. Optional later: chart polish, consistent StatCards.

### Audit — KEEP IA, P2 visual

Could become a timeline visually without changing event data.

### Login — REWORK visual

Brand/terminal presence; same fields and auth flow.

---

## 15. Tables / Drawers / Modals

### 15.1 Tables / DataTable

`DataTable` is a generic primitive and **is not used by any page**. All of the following are custom CSS-grid or flex “tables”:

| Page | Why a table | Keep table? | Notes |
|---|---|---|---|
| Sales | Many receipts, sortable-ish columns | **Yes** | Hybrid not required. Improve row scan (receipt, total, status). Row click OK. Touch: rows are full width — acceptable on desktop. |
| Customers | Directory | **Yes** / optional hybrid | Balance column must pop. |
| Payments | Ledger | **Yes** | Admin-like. |
| Shifts | Operational log | **Yes** | Emphasize cash columns. |
| Inventory | Catalog + stock | **Hybrid** | Table for admin cross-depot; cards/list for depot_staff. |
| Staff | Directory | **Yes** | |
| Depots | Directory | **Yes** | |
| Categories | Tree flattened to rows | **Tree, not table** | |
| Reports lists | Rankings / stock / cash | **Yes** | Dense is correct. |
| Audit | Event log | **Yes** or timeline | Dense OK. |
| Transfers | Operational log | **Yes** after Phase 9 | |

Row actions: almost none in-row; everything is row-click → drawer. Discoverability is medium (no kebab). Acceptable if rows look clickable (hover exists on many lists).

Mobile/touch: lists are not designed for phones. Out of P0.

### 15.2 Drawers

| Drawer | Role | Verdict |
|---|---|---|
| SaleDetailDrawer | Full sale + return/void | Keep drawer. Destructive actions → modal. |
| CustomerDetailDrawer | Identity, balance, sales, payments | Keep. Heavy but appropriate. |
| ProductDetailDrawer | Identity, units, activity, restock/adjust | Keep; activity list inside is why Stock Activity page is empty. |
| ShiftDetailDrawer | Cash totals + close | Keep. |
| Staff / Depot | CRUD detail | Keep. |
| AuditDetailDrawer | Payload inspection | Keep. |
| TransferDetailDrawer | Phase 9 | Frozen. |

Drawers: `max-w-sm/md/lg`, overlay `bg-black/30`, close X, Esc via Radix. Close behavior is clear.

Too much in one drawer: Product (identity + units + activity + admin lifecycle) and Customer (history + pay). Acceptable vs full pages; do not split into routes for fashion.

### 15.3 Modals

| Modal | Verdict |
|---|---|
| SaleSuccessModal | Keep modal (blocking). Cannot click overlay to dismiss — intentional. |
| Open/Close shift | Keep modal (numeric cash). |
| Restock / Adjustment | Keep modal from drawer (focused qty). |
| Return / Void | Keep modal (destructive + reason). |
| RecordPayment | Keep modal. |
| Customer/Product/Staff/Depot/Category forms | Keep modal. |
| ConfirmDialog | Keep for deactivate/rate. |
| Transfer create/complete/cancel | Frozen Phase 9. |

**Nested:** Product drawer + Restock + possible Confirm = 2–3 layers. Reduce later if restock can be a drawer section; not P0.

**Recommendations**

| Pattern | Use when |
|---|---|
| Inline | POS cart, cash, discount, customer chip, qty |
| Popover | Shift picker, compact customer search, category overflow |
| Modal | Short forms, destructive confirms, sale success, cash count |
| Drawer | Record detail while keeping list context |
| Dedicated page | Primary workspaces only: POS, Inventory, Reports, not each entity |

---

## 16. Iconography / Status / Color

### Icons

Library: **lucide-react**.

| Use | Example | Issue |
|---|---|---|
| Nav | Dashboard, cart, receipt, package, users, banknote, clock, etc. | Clear. POS icon is ShoppingCart — OK. |
| POS add | Plus 12px | Too small; meaning OK |
| POS cart | Minus / Plus / Trash2 12–14px | Same |
| Search | Search 16px | Repeated pattern |
| Decorative | EmptyState circles | Fine |
| Missing | No category icons; no cash/change visual emphasis; no in-cart check on product cards | Add only where they speed recognition |

Do not decorate admin tables with random icons.

Inconsistencies: primary nav icon 20px vs others 16px (intentional for POS). Page header icons sometimes unused.

### Color / status (current tokens)

Existing semantic tokens (do not invent a new palette in implementation without a §26 decision):

- success `#12B76A` / bg `#ECFDF3`
- warning `#F79009` / bg `#FFFAEB`
- danger `#F04438` / bg `#FEF3F2`
- info `#2E90FA` / bg `#EFF8FF` (same family as primary)
- primary `#1570EF`
- neutral: muted surface + border

| Meaning | Current | Proposed semantic (not hex) |
|---|---|---|
| Success | Badge + shift strip green | Keep |
| Warning | Low stock, no shift | Keep |
| Danger | Out of stock, credit without customer, balance added, void actions | Keep; balance-owed should always use danger |
| Info | Sale **Returned** | Reconsider: returned ≠ info. Use warning or a dedicated “returned” token |
| Neutral | Voided, cancelled, inactive, closed shift | Closed shift as neutral is OK; could use a stronger “closed” |
| Selected / active | `bg-primary/10` nav; cart none | Need explicit selected/in-cart |
| Inactive | opacity / ActiveBadge | Keep |
| Low stock | warning | Keep |
| Out of stock | danger + 60% opacity | Keep; still visible for awareness |
| Open shift | success | Keep |
| Closed shift | neutral | Keep |
| Pending | transfer warning | Keep |
| Completed | success | Keep |
| Returned | info | **Fix mapping** |
| Voided | neutral | Acceptable; could be stronger |

Primary blue reads SaaS, not retail. Whether to keep it is a §26 personality decision. Do not treat `#1570EF` as sacred brand unless stakeholders say it is.

---

## 17. Motion

Current: Radix `animate-in` on modal/drawer/dropdown/tooltip (~200ms); skeleton pulse; button color `duration-150`; POS card hover `transition-all duration-150`. **No motion** for add-to-cart, qty change, or checkout success beyond modal entrance.

Where subtle motion would help (functional, not decorative):

- Product added: brief cart highlight / count bump.
- Qty change: number tick, not flying cards.
- Drawer/modal: keep current short slide/fade.
- Tab/filter: none required.
- Toast: Sonner default.
- Loading: keep skeletons; avoid full-page spinners on POS grid (placeholderData already keeps old results while typing).
- Checkout success: modal is enough; optional check-mark scale.

Avoid: parallax, staggered product masonry animations, confetti.

Goal: **responsive + polished + fast**.

---

## 18. Accessibility

Not a WCAG certification project. Practical gaps:

| Area | Finding |
|---|---|
| Target size | POS ±/trash/Plus fail 44px. icon-sm is 28px. |
| Keyboard | POS complete-sale Enter missing. Custom qty buttons are `<button>` (good). Many custom inputs lack the shared Input id/label pattern. Discount native select has aria-label (good). |
| Focus | `focus-ring` utility exists; many custom inputs use `ring-primary/20`. Overlay dialogs use Radix focus trap (good). Sale success New Sale `autoFocus` (good). |
| Labels | Lots of `aria-label` on POS controls. Customer create fields rely on placeholders. |
| Contrast | Muted `#98A2B3` on white is a risk for metadata. Primary on white OK. Warning text on warning-bg OK if not tiny. |
| Dialogs | Radix Title/Description; VisuallyHidden when needed. Sale success `onClose={() => {}}` blocks overlay dismiss — OK if announced. |
| Errors | Toasts may be missed; credit warning is inline (good). |
| Screen readers | Grid of products is a sea of similarly labeled Plus buttons — labels include product+unit+qty (good). Live region for cart total: **none**. |
| Reduced motion | Not handled. |

P0 practical: target size on POS, Enter to submit, cart total as a live region, don’t rely on color alone for out-of-stock (text already present — good).

---

## 19. Performance / UX Risks

Report only; no optimization now.

| Risk | Evidence |
|---|---|
| Product query cap 40 | Large depot catalogs hide products unless searched |
| Debounce 300ms + refetch | Acceptable; `placeholderData` prevents flicker |
| Full product+units join every search | Needed for POS; keep |
| No virtualization | 40 cards is fine; a future unbounded grid would not be |
| Images | 32px thumbs still load full `photo_url` files if large assets stored |
| POS rerenders | Zustand `useShallow` used in several panels (good). Product cards each hold local qty state — OK. Typing cash updates all checkout rows — likely fine at this size |
| Reports page | Four report hooks are called even when one tab is visible | Extra network on `/reports` (Phase 12 closed; polish later) |
| Inventory filters | Server-side (good) |
| Customer search on POS | Separate hook; OK |
| Invalidate products+sales+customers after every sale | Correct; may hitch the grid on New Sale |

No evidence of barcode scanners or SKU indexes (good).

---

## 20. Visual Consistency Findings

Ranked by importance:

1. **POS vs rest of app share one SaaS look** — highest. POS must diverge.
2. **Money size inverted** — StatCard 22px vs POS total ~16px.
3. **Button/target sizes** — system `lg` = 44px; POS qty = 24px.
4. **Inputs** — shared Input vs one-off POS/list search fields.
5. **List page headers** — near-copies with small drift (`w-56` vs `w-64` search).
6. **Filter chips** — duplicated class strings, not a component.
7. **DataTable unused** vs custom grids — visual sameness with forked bugs.
8. **Empty states** — EmptyState vs ad-hoc POS empty cart.
9. **Skeletons** — ProductCardSkeleton unused.
10. **Radius/shadow** — `rounded-md` vs token `rounded-lg` vs `rounded`.
11. **Icon sizes** — 12–20px mix.
12. **Sign out duplicated**.
13. **Admin POS unreachable from nav**.
14. **Stock Activity nav duplicate**.
15. **Reports tabs** vs other chips — third filter language.

Lower: login card vs settings card padding.

---

## 21. P0/P1/P2/P3 Priority Matrix

### P0 — MUST CHANGE (POS-dominated)

1. **POS layout:** product wall dominates; persistent cart; payment/total/commit visually dominant.
2. **Reduced POS chrome:** rail/TopBar/shift banner must stop eating the terminal.
3. **Product discovery:** larger recognizable cards; tap-to-add; category or equivalent browse; search as accelerator.
4. **Cart targets and hierarchy:** qty ± ≥ 44px; identity + line total clear; in-cart feedback.
5. **Checkout/payment:** large cash, large total, large change/balance; exact-tender control; Complete Sale always visible and dominant.
6. **Touch/mouse POS controls** rebuilt around large targets.
7. **Money typography** on POS (use or replace unused financial tokens).

### P1 — IMPORTANT

8. **Shift** as persistent context without auto-select; open/close still explicit; stale-shift messaging clearer.
9. **Customer on POS** more glanceable (name + owe) without becoming CRM.
10. **Cashier secondary screens** (Sales, Customers, Payments, Shift) scanability and balance prominence.
11. **Inventory product identity** + reachable restock/adjust; fix Stock Activity IA.
12. **Shared foundations:** MoneyDisplay, FilterBar, SearchInput, DataTable adoption, POS primitives.
13. **Admin nav includes POS** if admins sell/support; or explicitly hide POS from admin (product decision).
14. **Keyboard:** Enter to complete sale when valid.

### P2 — SHOULD CHANGE

15. Dashboard visual hierarchy and hourly chart.
16. Categories tree clarity.
17. Login visual personality.
18. Status mapping (returned ≠ info).
19. Reports/Audit visual polish **without semantic change**.
20. Motion for add-to-cart / qty.
21. Drawer density tweaks; reduce triple-layer where cheap.

### P3 — POLISH

22. Icon size scale, radius/shadow unification on admin.
23. Self-host Inter (already noted in `index.html`).
24. Duplicate sign-out.
25. Empty-state illustration quality.
26. Tablet support if chosen later.
27. Transfers visual REWORK **after Phase 9 commit**.

### Area mapping

| Area | Priority |
|---|---|
| POS | P0 |
| Shell/navigation (cashier) | P0 |
| Product discovery | P0 |
| Cart | P0 |
| Checkout/payment | P0 |
| Shift (POS context) | P1 |
| Customers (cashier) | P1 |
| Inventory (depot) | P1 |
| Sales | P1 |
| Payments | P1 |
| Admin CRUD | P2 |
| Dashboard | P2 |
| Reports | P2 (visual only) |
| Audit | P2 (visual only) |
| Transfers | P3 until Phase 9 committed, then P1/P2 |

---

## 22. Phase 13 Design Principles

1. **Optimize for cashier speed** — fewer clicks than today’s form-on-card model.
2. **SEE → RECOGNIZE → TAP → ADJUST → PAY → COMPLETE** — every POS control is tested against this.
3. **Persistent cart** — the ticket never disappears during a sale.
4. **Primary action is always visually dominant** — Complete Sale / New Sale / Restock as applicable.
5. **Information before decoration** — no ornamental charts on the selling screen.
6. **Touch-friendly targets on POS** — 44px minimum; commit larger.
7. **Predictable hierarchy** — total > tender/change > line money > metadata.
8. **Contextual complexity** — discount, create-customer, and admin nav recede until needed.
9. **Admin density where useful** — reports, audit, and ledgers stay dense.
10. **Do not force one POS style on the whole app.**
11. **Consistent money presentation** — same `formatCFA` semantics; shared MoneyDisplay sizes.
12. **Minimal modal depth** — inline for selling; modal for irreversible or focused money entry.
13. **Role-appropriate chrome** — cashier terminal vs manager console vs depot stock bench.
14. **Status is glanceable** — stock, shift, customer owe, sale state.
15. **UI modernization must not silently change business rules.**

---

## 23. Proposed VHM Design System

Name: **VHM design system** (foundations + app composites). Not a new product name.

### Foundations

- **Typography:** Inter (then self-hosted); defined heading/body/label/meta ramp; money sizes `sm/md/lg` **used** on POS; receipt stays Courier.
- **Spacing:** 4/8px grid; POS vs admin density tokens.
- **Radius / borders / shadows / surfaces:** keep current tokens; apply consistently; POS may use fewer nested borders.
- **Semantic colors:** success, warning, danger, info, neutral, selected, plus domain aliases (low stock, out of stock, open/closed shift, pending, completed, returned, voided). Accent/personality per §26.
- **Icons:** lucide, size scale 16/20/24; no decorative extras.
- **Motion:** 150–200ms fade/slide; cart highlight; `prefers-reduced-motion` later.

### Components

Button, Input, Search, Select, Tabs, FilterBar, MoneyDisplay, StatusBadge, StatCard, DataTable, Drawer, Modal, Confirm, EmptyState, Skeleton/Loading, Toast (Sonner), Dropdown, Tooltip.

### POS-specific

ProductGrid, ProductCard, CategoryRail, CartPanel, CartItem, PaymentPanel, CashInput (and optional exact/denomination controls), CheckoutSummary, CustomerSelector, ShiftIndicator, SaleSuccess.

### Management-specific (evidence-backed)

PageHeader, ReportToolbar (exists — keep semantics), Audit filters, InventoryStockMark, ShiftCashFigures. Do not invent a second table library.

---

## 24. Recommended Phase 13 Sub-Phases

Do **not** treat Phase 13 as one dump of every screen.

Recommended structure (implementation order only — not an implementation plan):

| Sub-phase | Focus | Why this order |
|---|---|---|
| **13A** | Design system foundations (tokens, MoneyDisplay, Button sizes, Search, FilterBar, DataTable start) | Pages cannot be restyled on shifting primitives |
| **13B** | POS shell (reduced chrome, context bar: depot/shift/user) | Layout envelope before cards |
| **13C** | Product browsing + cart (grid, cards, tap-add, qty, categories/search) | Core SEE/TAP/ADJUST |
| **13D** | Checkout/payment + success (cash, exact, totals, complete, receipt actions) | PAY/COMPLETE |
| **13E** | Cashier secondary: Sales, Customers, Payments, Shift pages | Same role, lower frequency |
| **13F** | Inventory (and Stock Activity IA) + Customers/sales overlap for depot/cashier | Operational non-POS |
| **13G** | Admin: Dashboard, Staff, Depots, Categories, Settings; Reports/Audit visual only | After primitives exist |
| **13H** | Responsive, accessibility, performance (Enter key, targets, 40-product cap UX, images) | Harden |
| **13I** | Final visual polish | Last |

**Transfers:** not in 13A–13G until Phase 9 is committed; then attach to 13F or a small 13F.2.

**Recommendation:** several sub-phases under Phase 13, each shippable, POS-first (13A–13D are the product-defining slice). Do not visually “finish” admin before POS feels like a terminal.

---

## 25. Business / Technical Invariants

UI modernization must preserve:

- **Cash-only.** No payment method selector. No mobile money / card UI.
- **No barcode / SKU** fields, scanners, or search-by-SKU.
- **Customer pooled balance** — payments are not allocated to a specific sale. Language must not say “allocated to sale #”.
- **Multiple payments model** as implemented (sale tender vs standalone `customer_payment`).
- **Return accounting** and **void behavior** (gates, RPCs, confirmations).
- **Stock concurrency** — UI stock is awareness; server validates.
- **Shift semantics** — never auto-select; sales without shift remain possible with clear warning; `SHIFT_NOT_OPEN` handling; do not retry complete sale with null shift after that error.
- **Role and depot authorization** — RLS and RoleGuard remain source of truth. Cashiers locked to depot. Admin depot switcher including All Depots.
- **All existing operational RPC semantics** — `complete_sale`, restock/adjust, payments, shifts, returns/voids, Phase 12 report RPCs, etc.
- **Historical data integrity.**
- **Idempotent sale submission** (same key on retry).
- **Server-authoritative financials** after sale.
- **Walk-in vs named customer**; credit requires a customer.
- **Display currency CFA**; USD informational via locked rate in settings — not a POS tender currency switcher.
- **Receipt content spec** (lot, number, amount, PAID; no timestamps/plates/methods).
- **Phase 9 remains separate until committed** — no transfer file/hunk edits in Phase 13 UI work until then.
- **Phase 12 reporting semantics** closed at `6f12aed` — no metric/date/CSV meaning changes.
- **Auth/security boundaries** — username login, deactivated page, no client-side permission invention.
- **Routes** — discovery does not require route changes; Stock Activity may later need a real view on the existing path without expanding authorization.

---

## 26. DECISIONS REQUIRED

Questions already answered by repo/business rules are omitted (cash-only, no barcode, pooled balance, no auto shift, Phase 9/12 frozen, roles).

### D1. Visual personality

**Why:** Tokens today are generic SaaS blue. Personality drives whether POS feels like a premium retail terminal or a restyled admin app.

**Choices:** (A) Keep current blue/light SaaS and fix layout/hierarchy only. (B) Light, warmer retail (still professional, less “Unnamed CRM”). (C) High-contrast light “terminal” (near-black type, strong surfaces, accent only on pay/commit). (D) Dark POS / light admin.

**Recommendation:** **C** for cashier POS, **A/B light** for admin. Split personality is allowed by §5–7.

### D2. Light vs dark

**Why:** Affects contrast, money glare on counter screens, and whether one theme can serve POS + admin.

**Choices:** (A) Light everywhere. (B) Dark POS, light admin. (C) Dark everywhere.

**Recommendation:** **A** unless counter hardware is used in dim shops — then **B**. Do not dark-mode admin first.

### D3. Accent direction

**Why:** Primary color is currently `#1570EF`. Commit buttons and selected products will stain the whole POS.

**Choices:** (A) Keep current blue. (B) Keep blue for admin; distinct POS accent (e.g. deep teal/ink). (C) New single brand accent you supply (logo/brand guide).

**Recommendation:** **B** if no brand guide; **C** if you have a VHM color. Do not invent a loud unrelated palette.

### D4. POS density

**Why:** Screenshot problem is unused space *and* tiny controls. Density ≠ whitespace.

**Choices:** (A) More spacious cards (fewer per row, large images). (B) Information-dense grid with large type/targets (more products visible). (C) Adaptive: more columns on wide screens, always large type.

**Recommendation:** **C** with a floor on card size so cards never look like the current 32px thumbs.

### D5. POS full-screen vs persistent rail

**Why:** 64px rail is always-on today.

**Choices:** (A) Keep collapsed rail. (B) Overlay/hover rail; hidden during sale. (C) Icon dock only on POS (POS, Sales, Shift). (D) No rail on POS; switcher in context bar.

**Recommendation:** **C** or **D**. Prefer **D** for cashiers (context bar: POS / Sales / Customers / Shift). Admin-on-POS: a single “Back to admin” control.

### D6. How visual / image-heavy should product cards be?

**Why:** `photo_url` exists but cards are 32px. Empty photos will look worse if the layout assumes a catalog of photography.

**Choices:** (A) Image-first large tiles (placeholder if missing). (B) Name/price-first, image optional medium. (C) Text-only POS (fastest to implement, weakest recognition).

**Recommendation:** **B** unless most SKUs will have photos — then **A**. Need your catalog reality (D11).

### D7. Motion amount

**Why:** Current app is almost static.

**Choices:** (A) Minimal (overlays only). (B) Functional (cart bump, qty, success). (C) Rich (avoid).

**Recommendation:** **B**.

### D8. Degree of admin visual redesign

**Why:** Scope risk. Admin can stay dense.

**Choices:** (A) Foundations only (shared components leak in). (B) Headers/filters/tables consistency + dashboard. (C) Full visual re-skin of every admin page in the same sprint as POS.

**Recommendation:** **B** after POS (13G). Not **C**.

### D9. Desktop-first vs touch-first

**Why:** Target sizes and cart layout.

**Choices:** (A) Mouse desktop-first, 44px still used. (B) Touch-first (tablet counter). (C) Mouse-first with a later tablet pass.

**Recommendation:** **A** if cashiers use mouse/keyboard PCs; **B** if they use touch all-in-ones. Default if unknown: **A** with 44px targets anyway (cheap insurance).

### D10. Tablet support in Phase 13

**Why:** No working POS layout exists below two-pane width.

**Choices:** (A) Not in Phase 13. (B) Basic stacked POS (grid + cart sheet). (C) Full tablet terminal.

**Recommendation:** **A** for 13A–13D; **B** only in 13H if you confirm hardware.

### D11. Product images expected for most products?

**Why:** Locks D6 and grid aspect ratio.

**Choices:** (A) Yes, most products will have photos. (B) Mixed. (C) Rare / none.

**Recommendation:** Ask you — default plan **B** (layout must work with placeholders).

### D12. Dedicated cashier POS shell?

**Why:** Implementation shape of 13B.

**Choices:** (A) Same AppShell, hide pieces with CSS. (B) Dedicated `PosShell` layout component, same routes. (C) Separate route tree.

**Recommendation:** **B** (same routes/guards; different frame). Not **C** (auth/route risk).

### D13. Category rail vs search-first browse

**Why:** Categories exist in data but not on POS.

**Choices:** (A) Horizontal category rail + grid. (B) Search only (status quo IA). (C) Categories as left mini-list + grid.

**Recommendation:** **A** (recognition). Search remains global accelerator. No SKU/barcode.

### D14. Exact cash control

**Why:** Every cash sale currently requires typing the total.

**Choices:** (A) “Exact” / pay-total button. (B) Denomination pads. (C) Both. (D) Neither (keep typing).

**Recommendation:** **A** minimum; **C** if touch-first (D9=B).

---

## 27. Recommended Overall Direction

Build a **two-register visual system** on one product:

1. **Cashier terminal** — reduced shell, merchandise-first grid, persistent ticket, loud cash/total/complete, large targets, categories + search, exact tender. Same RPCs and store rules as today.
2. **Operations console** — current admin/depot information density, cleaned headers/filters/tables, shared money and status, dashboard that looks managed rather than prototyped.

Do not restyle the POS by putting larger padding on the existing admin cards. That would preserve the generic-business reading.

Sequence: **foundations → POS shell → grid/cart → pay/complete → cashier secondary → inventory → admin polish**. Freeze Phase 9 transfers and Phase 12 report meaning. No barcode. No new payment methods.

Success looks like: a cashier can complete a typical cash sale with **see product → tap → (optional qty) → exact/tender → complete** without interpreting a form and without hunting through a SaaS sidebar.

---

## 28. Discovery Conclusion

The application’s **business spine is ready**. Its **presentation spine is a light admin dashboard**. The screenshot’s unused space, small cards, narrow cart, weak pay/complete, and chrome-heavy frame are confirmed in code (`AppShell` + `POSPage` + `ProductSearchPanel` + `CartPanel` + `CheckoutPanel`).

Phase 13 should start as discovery (this document) and proceed as **sub-phases 13A–13I**, with **POS P0** defining whether VHM feels like a professional retail POS.

**Out of scope for implementation until explicitly started:** application code, SQL, migrations, routes, operational RPCs, git commits, Phase 9 files, Phase 12 semantics.

**This discovery created only:** `docs/PHASE13_UI_UX_DISCOVERY.md`.
