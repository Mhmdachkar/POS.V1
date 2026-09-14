# VHM Multi-Depot POS & Inventory System

A professional operational POS platform for multi-depot retail management.
Fast. Clear. Controlled. Reliable. Professional.

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Database | Supabase / PostgreSQL |
| Backend logic | Supabase Edge Functions (Deno/TypeScript) |
| Transactional RPCs | PostgreSQL functions (PL/pgSQL) |
| Auth | Supabase Auth (synthetic email mapping) |
| Frontend | React 18 + TypeScript |
| Bundler | Vite 5 |
| Routing | React Router v6 |
| Server state | TanStack Query v5 |
| Client state | Zustand v5 |
| Forms | React Hook Form + Zod |
| Styling | Tailwind CSS + CSS variables |
| Components | Radix UI primitives (accessible) |

### Key Architectural Decisions

**1. Database transactions are real**
All critical financial and inventory operations use actual PostgreSQL
transactions with `SELECT ... FOR UPDATE` row locking. Multiple
`supabase.from()` calls in sequence are NOT a substitute.

**2. Pooled customer balance accounting**
`customers.balance_owed_cfa` is a single pooled outstanding balance.
Customer payments are NOT allocated to specific sales.
A payment must NOT be automatically reversed when an unrelated sale is returned.

**3. Cash only**
Cash is the only accepted payment method. No card, mobile money, or bank
transfer. Customer balance is a credit/debt accounting mechanism — not a
payment method.

**4. No barcode / scanner**
Product search uses name, partial text, categories, and keyboard navigation.
There is no barcode column, SKU, or scanner hardware support.

**5. Depot-owned product model**
Products belong to exactly one depot. Transfers explicitly name both a
source product and a destination product (which must already exist).

**6. Soft deactivation**
Depots, categories, products, and staff are deactivated (is_active = false)
rather than deleted. Historical records remain intact and attributed.

---

## Environment Setup

```bash
# 1. Copy the environment file
cp .env.example .env

# 2. Fill in your Supabase credentials:
#    VITE_SUPABASE_URL=https://your-project-ref.supabase.co
#    VITE_SUPABASE_ANON_KEY=your-anon-key-here

# 3. Install dependencies
npm install

# 4. Start the development server
npm run dev
```

---

## Folder Structure

```
/
├── supabase/
│   ├── migrations/          Phase 2: all SQL migrations
│   └── functions/           Phase 4: Edge Functions (Deno)
│       ├── create_sale/
│       ├── void_sale/
│       ├── process_sale_return/
│       ├── record_customer_payment/
│       ├── restock_product/
│       ├── adjust_inventory/
│       ├── create_transfer/
│       ├── complete_transfer/
│       ├── cancel_transfer/
│       ├── open_shift/
│       ├── close_shift/
│       ├── create_staff/
│       ├── deactivate_staff/
│       └── update_business_settings/
└── src/
    ├── lib/                 Supabase client, query client, utilities
    ├── types/               Database types (Phase 2: replaced by CLI-generated)
    ├── stores/              Zustand stores (auth, depot, pos cart)
    ├── hooks/               Custom React hooks
    ├── components/
    │   ├── ui/              Shared design-system primitives
    │   ├── layout/          AppShell, AppRail, TopBar
    │   └── auth/            AuthProvider, AuthGuard, RoleGuard
    ├── routes/              React Router route tree
    └── pages/               One folder per module
        ├── pos/             POS workspace (Phase 5)
        ├── sales/           Sales history + returns (Phase 8)
        ├── customers/       Customer profiles (Phase 6)
        ├── payments/        Payment recording (Phase 6)
        ├── shifts/          Shift management (Phase 10)
        ├── inventory/       Inventory + adjustments (Phase 7)
        ├── transfers/       Depot transfers (Phase 9)
        ├── reports/         Analytics (Phase 12)
        └── admin/           Dashboard, staff, depots, settings (Phase 11)
```

---

## Staff Roles

| Role | Scope | Primary Access |
|------|-------|----------------|
| `admin` | All depots | Dashboard, all modules, admin settings |
| `cashier` | Assigned depot | POS, sales, customers, payments, shift |
| `depot_staff` | Assigned depot | Inventory, transfers, stock activity |

Role-based navigation: admins see all nav items; cashiers see POS-focused items;
depot staff see inventory-focused items.

---

## Authentication

Staff log in with `username + password`.
The username is mapped to a synthetic email (`{username}@vhm-pos.internal`)
in Supabase Auth. Real users never see the synthetic email.

After login, the staff record is fetched from the database to verify:
- `is_active` (deactivated staff are immediately rejected and signed out)
- `role` (determines navigation and RLS policies)
- `depot_id` (determines depot context for non-admin)

**Deactivation**: `staff.is_active = false` + `deactivated_at` timestamp.
The Supabase Auth user is NOT deleted — historical records remain attributed.

---

## Backend Transaction Architecture

```
Frontend (display preview only)
         │
         ▼
Edge Function (authenticated, validates role + depot)
         │
         ▼
PostgreSQL transactional function
         │
         ├─ SELECT ... FOR UPDATE  (acquire locks)
         ├─ Validate constraints
         ├─ Write changes
         ├─ Write audit_log
         └─ COMMIT / ROLLBACK
```

Operations that MUST be transactional Edge Functions (never direct client writes):
- `create_sale` — locks depot (receipt seq) + products (stock)
- `void_sale` — restores stock + reverses balance + marks payments reversed
- `process_sale_return` — validates returnable qty, restores stock, adjusts balance
- `record_customer_payment` — reduces pooled balance
- `restock_product` — increments stock
- `adjust_inventory` — signed stock change
- `complete_transfer` — atomic cross-depot stock movement (deadlock-safe lock order)
- `close_shift` — calculates expected cash from authoritative records

---

## Migration Strategy

Migrations live in `supabase/migrations/` and are applied in order.

| File | Content |
|------|---------|
| `001_foundation.sql` | Extensions, business_settings, depots, staff, categories |
| `002_products.sql` | Products, product_units |
| `003_inventory.sql` | stock_entries, inventory_adjustments, stock_transfers |
| `004_shifts.sql` | shifts |
| `005_customers.sql` | customers |
| `006_sales.sql` | sales, sale_items |
| `007_returns.sql` | sale_returns, sale_return_items |
| `008_payments.sql` | payments (with payment_type, shift_id, is_reversed) |
| `009_audit.sql` | audit_log |
| `010_indexes.sql` | Performance indexes including trigram search |
| `011_rls.sql` | Row Level Security policies |
| `012_triggers.sql` | Transfer item validation, updated_at triggers |

**Key schema corrections from blueprint review (applied in Phase 2):**
- `payments`: adds `is_reversed`, `reversed_at`, `reversed_by`, `reversed_by_return_id`, `payment_type`, `shift_id`
- `sale_returns`: adds `shift_id` (for shift cash reconciliation)
- `stock_entries`: adds `depot_id` (denormalized), `note`
- `staff` unique indexes: filtered to `AND is_active = true` (allows replacing deactivated staff)
- All performance indexes for the actual query paths

---

## Implementation Phases

| Phase | Focus | Status |
|-------|-------|--------|
| 0 | Repository audit | ✅ Complete |
| 1 | Foundation (this phase) | ✅ Complete |
| 2 | Database migrations | ⬜ Next |
| 3 | Auth + RLS | ⬜ Pending |
| 4 | Edge Functions / RPCs | ⬜ Pending |
| 5 | Core POS | ⬜ Pending |
| 6 | Customers + Payments | ⬜ Pending |
| 7 | Inventory | ⬜ Pending |
| 8 | Returns + Voids | ✅ Complete |
| 9 | Transfers | ⬜ Pending |
| 10 | Shifts | ✅ Complete |
| 11 | Admin | ⬜ Pending |
| 12 | Reports + Audit | ⬜ Pending |
| 13 | Hardening + Testing | ⬜ Pending |

---

## Business Rules Reference

See the full Master Technical Blueprint for complete specifications.

Key rules implemented or to be enforced:
- NO BARCODE/SKU in any part of the system
- CASH ONLY — no payment method selection
- Customer balance = pooled debt, not allocated to specific sales
- Standalone customer payments are NOT reversed by returns
- `is_reversed` on payments used only for void-related reversals and admin corrections
- Returns: `balance_adjustment_cfa = min(sale.balance_added_cfa, customer.current_balance)`
- Returns: never make customer balance negative
- Transfers: destination product must already exist (never auto-created)
- Concurrency: all stock mutations use `SELECT ... FOR UPDATE`
- Transfer locking: products acquired in ascending UUID order (deadlock prevention)
- Receipt numbers: locked inside create_sale transaction (no duplicates possible)
