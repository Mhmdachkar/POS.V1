# VHM POS — UI/UX Design System & Product Interface Specification

## 0. Document Purpose

This document defines the product UI/UX direction for the VHM Multi-Depot Inventory & POS System.

It is intended to be used as the single design reference by:
- UI/UX designers
- Frontend developers
- Product owners
- Cursor / AI coding agents
- QA teams evaluating interface behavior

The objective is not to reproduce a generic SaaS administration panel. The product should feel like a **professional operational POS platform** designed around speed, clarity, cash accountability, inventory control, and multi-depot operations.

The system is web-based, but the experience should feel as immediate and reliable as a dedicated professional POS terminal.

---

# 1. Product UX Principles

## 1.1 Primary principle: Action first

The interface should always prioritize the next operational action over information density.

A cashier should be able to:
1. Find a product
2. Scan or select it
3. Adjust quantity/unit
4. Select or create a customer
5. Take payment
6. Complete the sale

without navigating through unrelated pages.

The interface should minimize:
- unnecessary page transitions
- long forms
- nested settings
- repeated depot selection
- unnecessary confirmations
- hidden actions
- excessive modals

---

## 1.2 Different users need different applications

Do not expose the same navigation and density to every role.

The product has three primary staff roles:

### Admin
Primary goals:
- Understand business performance
- Manage depots
- Manage inventory
- Monitor sales
- Manage customers and payments
- Manage staff
- Review audit history
- Configure business settings

### Cashier
Primary goals:
- Open/manage shift
- Sell products
- Scan products
- Manage customers
- Take payments
- Review own sales
- Close shift

### Depot Staff
Primary goals:
- View inventory
- Add stock
- Review product quantities
- Monitor stock activity
- Manage assigned depot products

The database already defines these roles and associates non-admin staff with a specific depot. The UI should reflect this architecture instead of treating all users identically.

---

# 2. Overall Product Experience

The product should combine the strongest UX characteristics of:

- Modern retail POS software
- Banking and financial interfaces
- Inventory management software
- Modern SaaS command centers
- Professional desktop software
- Keyboard-driven operational tools

The visual direction should be closer to:

**Square / Shopify POS / Linear / Stripe / modern banking**

and deliberately avoid:

**generic admin templates / overly rounded SaaS dashboards / colorful CRM interfaces / spreadsheet-like CRUD screens**

---

# 3. Global Application Shell

## 3.1 Desktop navigation

Use a **compact vertical navigation rail** rather than a large permanent sidebar.

Recommended structure:

```text
┌──────┐
│ VHM  │
│      │
│ POS  │
│ OVER │
│ SALES│
│ INV  │
│ CUST │
│ PAY  │
│ REP  │
│      │
│ SET  │
│ USER │
└──────┘
```

The navigation should:
- remain compact
- use icons + labels
- support an expanded/collapsed state
- highlight the active module
- never occupy excessive screen width

The POS should receive special visual priority.

---

## 3.2 Top bar

Every authenticated desktop screen should use a consistent top context bar.

Recommended elements:

```text
[Current Depot ▼]     [Search / Quick Command]     [Shift Status]    [Notifications] [User]
```

For admin:
- current workspace / all depots selector
- global search
- notifications
- profile

For cashier:
- assigned depot
- shift status
- quick search / command
- profile

For depot staff:
- assigned depot
- search
- profile

---

## 3.3 Context persistence

Once a user selects a depot, the system should maintain that context across the relevant modules.

Avoid forcing the user to select:
- depot
- cashier
- shift

on every screen.

The application should clearly display the active context instead.

Example:

```text
DAKAR DEPOT
Cashier: Jean
Shift #1042
```

---

# 4. Visual Design System

## 4.1 Overall style

The visual language should feel:

- premium
- professional
- calm
- efficient
- highly legible
- operational
- modern
- trustworthy

Avoid:
- excessive gradients
- excessive glassmorphism
- decorative animations
- giant hero sections
- oversized rounded cards
- unnecessary illustrations
- excessive shadows
- excessive colors

---

## 4.2 Color strategy

Use a neutral base with one primary brand/action color.

Recommended conceptual palette:

```text
Background        #F6F7F9
Surface           #FFFFFF
Primary Text      #111827
Secondary Text    #667085
Border            #E5E7EB

Primary Action    Brand Blue
Success           Green
Warning           Amber
Danger            Red
Info              Blue
```

The actual brand primary color can be adjusted once the VHM brand identity is finalized.

Important rule:

**Color communicates state, not decoration.**

Examples:
- Green = completed / healthy / positive
- Amber = attention / low stock / warning
- Red = failed / overdue / out of stock / discrepancy
- Blue = active / informational / primary actions

---

## 4.3 Typography

Recommended:
- Inter
- Geist
- or another highly legible modern sans-serif

Typography hierarchy:

### Page title
24–32px, semibold

### Section title
16–20px, semibold

### Body
14–16px

### Metadata
12–13px

### Financial figures
22–36px depending on context

Financial values should use tabular / numerically stable typography where possible.

---

## 4.4 Spacing

Use an 8px spacing system.

Examples:

```text
8
16
24
32
40
48
64
```

Do not create arbitrary spacing values unless necessary.

---

## 4.5 Border radius

Use moderate radii.

Recommended:
- Inputs: 8–10px
- Buttons: 8–10px
- Cards: 10–14px
- Larger workspace surfaces: 12–16px

Avoid extremely pill-shaped UI except for:
- status badges
- filters
- compact controls

---

# 5. Density Strategy

The system should not use the same density everywhere.

## POS
High efficiency / high information density

## Inventory
Medium-high density

## Reports
Medium density

## Dashboard
Medium-low density

## Settings
Low-medium density

This allows each module to optimize for its actual job.

---

# 6. POS — Primary Operational Workspace

The POS is the most important screen in the product.

It should feel like a dedicated workstation rather than a normal website.

## 6.1 Recommended layout

```text
┌─────────────────────────────────────────────────────────────┐
│ VHM   DAKAR DEPOT ▼     SHIFT OPEN     18:42     USER      │
├────────┬──────────────────────────────────────┬────────────┤
│        │                                      │            │
│ NAV    │ SEARCH / SCAN                       │ CART       │
│        │                                      │            │
│ POS    │ PRODUCT GRID                         │ items      │
│        │                                      │            │
│ INV    │ categories                           │ subtotal   │
│        │                                      │ discount   │
│ SALES  │ product cards                        │ total      │
│        │                                      │            │
│ CUST   │                                      │ CHECKOUT   │
│        │                                      │            │
└────────┴──────────────────────────────────────┴────────────┘
```

Recommended proportions:

- navigation: 64–220px
- product workspace: 55–65%
- cart: 35–45%

The cart must remain visible on desktop.

---

## 6.2 POS search

Search is a first-class interaction.

The search bar should support:
- product name
- barcode
- SKU if later introduced
- partial text
- keyboard navigation

Recommended placeholder:

`Search products or scan barcode`

The system should immediately show results.

---

## 6.3 Scanner behavior

The barcode scanner should behave like a keyboard input.

Expected behavior:
1. Scanner sends value
2. Product is matched
3. Product is added to cart
4. Quantity increments if product already exists
5. Feedback is immediate

Do not force a modal after every scan.

Optional:
- subtle sound
- visual confirmation
- temporary toast

---

## 6.4 Product cards

Because product photos are mandatory in the data model, the POS can use product imagery as a recognition aid.

Recommended card:

```text
┌───────────────┐
│               │
│     IMAGE     │
│               │
├───────────────┤
│ Coca-Cola     │
│ 33cl          │
│ CFA 500       │
│ ● 124 pcs     │
└───────────────┘
```

Cards must display:
- image
- name
- current selling price
- stock status

Do not overcrowd cards with unnecessary data.

---

# 7. Multi-Unit Product Selection

The database supports:
- Piece
- Package
- Carton
- conversion to base units
- separate cost and selling prices

This should be represented visually, not technically.

When a product is selected:

```text
Coca-Cola 33cl

┌─────────────┬─────────────┬─────────────┐
│ PIECE       │ PACKAGE     │ CARTON      │
│ CFA 500     │ CFA 5,500   │ CFA 30,000  │
│ 1 piece     │ 1 package   │ 1 carton    │
└─────────────┴─────────────┴─────────────┘
```

Then:

```text
[-]    1    [+]
```

Do not expose database field names such as:
- unit_level
- conversion_to_base
- quantity_pieces

These are implementation concepts, not user-facing concepts.

---

# 8. Cart Design

The cart should remain persistent on the right side.

Each line:

```text
Coca-Cola 33cl
2 × Piece

CFA 1,000
```

Interactions:
- increment
- decrement
- remove
- change unit
- edit quantity

Bottom section:

```text
Subtotal      CFA 24,500
Discount      CFA 0
────────────────────
TOTAL         CFA 24,500

[ CHECKOUT ]
```

The total must be visually dominant.

---

# 9. Checkout Experience

Checkout should feel like a focused moment rather than another administrative page.

Example:

```text
CHECKOUT

Customer
[ Walk-in Customer ▼ ]

TOTAL
CFA 24,500

Payment Method
[ CASH ] [ BALANCE ]

Amount Received
[ 25,000 ]

Change
CFA 500

[ COMPLETE SALE ]
```

The primary action must be obvious.

Do not hide payment controls behind tabs unless needed.

---

# 10. Customer Balance / Credit

The database supports:
- sale balance added
- customer balance
- later payments
- payment history

Customers therefore need a clear financial state.

When credit is used:

```text
TOTAL
CFA 24,500

PAID
CFA 20,000

────────────────

BALANCE ADDED
CFA 4,500
```

The UI must explicitly state what happened.

Never make the user infer the remaining balance from separate fields.

---

# 11. Customer Module

Customer list:

```text
CUSTOMERS

[ Search customers... ]          [ + Add Customer ]

Name              Phone          Balance
Jean Dupont       +221...        CFA 185,000
Marie Ndiaye      +221...        CFA 0
```

Use visual status for balance:

- neutral = zero
- green = settled
- amber = outstanding
- red = high/outstanding based on configured business rules

---

# 12. Customer Detail

Customer detail should act like a financial profile.

```text
Jean Dupont

+221...
Address...

CURRENT BALANCE
CFA 185,000

[ ADD PAYMENT ]

────────────────────────

Purchases
CFA 1,240,000

Payments
CFA 1,055,000

────────────────────────

RECENT ACTIVITY
```

Tabs:

```text
Overview
Purchase History
Payment History
```

A transaction timeline is preferred over raw technical records.

---

# 13. Payment Experience

Payments should be easy to understand.

When recording a payment:

```text
CUSTOMER PAYMENT

Customer
Jean Dupont

Current balance
CFA 185,000

Amount
[ 20,000 ]

Note
[ Optional ]

[ RECORD PAYMENT ]
```

After completion:

```text
Payment recorded
New balance
CFA 165,000
```

---

# 14. Inventory Overview

Inventory should be operational and scannable.

Header:

```text
INVENTORY

[ Search products... ]       [ Category ▼ ] [ Status ▼ ]
                                             [ + RESTOCK ]
```

Table:

```text
PRODUCT         STOCK        VALUE        STATUS

Coca-Cola       124 pcs      CFA ...      Healthy
Rice 25kg       8 bags       CFA ...      Low
Water 50cl      0            CFA ...      Out of stock
```

Do not require a user to open a product to understand whether action is needed.

---

# 15. Inventory Status

Status should be immediately visible.

Recommended states:

```text
Healthy
Low Stock
Out of Stock
```

Potential status rules should be configurable later.

Do not use dozens of status categories.

---

# 16. Product Detail

Product detail should combine:
- identity
- pricing
- unit configuration
- stock
- recent stock activity

Recommended structure:

```text
← Back to Products

Coca-Cola 33cl

[ IMAGE ]

Category       Drinks
Depot          Dakar

CURRENT STOCK
124 pieces

UNITS
Piece      CFA 500
Package    CFA 5,500
Carton     CFA 30,000

────────────────────

RECENT ACTIVITY

+50 cartons     Restock
-24 pieces      Sale
+20 cartons     Restock
```

---

# 17. Restock Workflow

Restocking should be a focused task.

```text
RESTOCK INVENTORY

Product
[Coca-Cola 33cl ▼]

Unit
[Carton ▼]

Quantity
[20]

Conversion
1 Carton = 24 Pieces

────────────────

Stock before
124 pieces

Stock after
604 pieces

[ CONFIRM RESTOCK ]
```

The preview is important because it reduces operator mistakes.

---

# 18. Sales History

Sales should be designed for investigation.

Top metrics:

```text
TODAY'S SALES
CFA 4,820,000

TRANSACTIONS
328

AVERAGE SALE
CFA 14,695
```

Filters:
- date
- cashier
- payment method
- customer
- depot

Transaction table:

```text
TIME    RECEIPT     CASHIER    CUSTOMER     TOTAL    METHOD
10:42   #10482      Jean       Walk-in      45,000   Cash
10:38   #10481      Marie      Jean         12,500   Balance
```

Clicking a transaction should open a receipt-style detail drawer/page.

---

# 19. Shift Management

Shift management should be a first-class workflow.

## Open shift

```text
OPEN SHIFT

Depot
Dakar

Opening Float
[ CFA 50,000 ]

[ OPEN SHIFT ]
```

## Active shift

```text
YOUR SHIFT

Opened
08:03

Opening Float
CFA 50,000

Cash Sales
CFA 1,420,000

Payments Received
CFA 185,000

Expected Cash
CFA 1,655,000

[ CLOSE SHIFT ]
```

## Close shift

```text
COUNT YOUR CASH

Expected
CFA 1,655,000

Actual
[ CFA 1,650,000 ]

Difference
-CFA 5,000

Reason
[ Shortage ▼ ]

[ CONFIRM CLOSE ]
```

Discrepancy must be visually prominent.

---

# 20. Admin Overview Dashboard

The admin dashboard should answer:

**What is happening today?**

Recommended structure:

```text
Good morning, Admin

Dakar Depot ▼

┌────────────┐ ┌────────────┐ ┌────────────┐
│ SALES      │ │ GROSS PROFIT│ │ CUSTOMERS │
│ CFA ...    │ │ CFA ...     │ │ 342       │
└────────────┘ └────────────┘ └────────────┘

SALES PERFORMANCE
[ chart ]

ACTION REQUIRED
• Low-stock products
• Outstanding balances
• Shift discrepancy
• Exchange-rate update

TOP PRODUCTS
...
```

Avoid dashboard overload.

The admin should be able to understand the situation within 5–10 seconds.

---

# 21. Multi-Depot UX

The application must make depot context obvious.

Recommended control:

```text
DAKAR DEPOT ▼
```

Dropdown:

```text
Dakar
Abidjan
Lagos
Accra
─────────
All Depots
```

Admin may use:
- one depot
- all depots

Cashier and depot staff should stay within their assigned depot context.

---

# 22. Reports Workspace

Reports should be grouped by business question rather than technical table.

Recommended top-level views:

```text
Sales
Inventory
Customers
Cash
```

Example:

```text
REPORTS

[ Sales ] [ Inventory ] [ Customers ] [ Cash ]

Period
[ Last 30 Days ▼ ]

Revenue
CFA 48.2M

Units Sold
18,420

Gross Profit
CFA 11.7M
```

Charts should support:
- trend view
- comparison
- filtering
- drill down

Avoid decorative charts.

---

# 23. Audit Log

Audit should not look like a normal CRUD table.

It is a security/accountability tool.

Recommended:

```text
AUDIT LOG

11 Sep 18:42
Jean
Created sale #10482

11 Sep 17:15
Admin
Edited Coca-Cola pricing

11 Sep 15:08
Marie
Added stock

11 Sep 09:02
Admin
Updated CFA/USD exchange rate
```

Clicking an event should show:
- actor
- timestamp
- action
- entity
- before state
- after state

---

# 24. Settings

Settings should be organized by responsibility.

```text
SETTINGS

Business
Depots
Staff
Currency
Receipt
Security
```

Business settings include:
- business name
- logo
- CFA/USD exchange rate

The system should clearly show:
- current rate
- update time
- updated by

---

# 25. Authentication

Login should be simple and professional.

```text
VHM

Welcome Back

Username
[             ]

Password
[             ]

[ SIGN IN ]

Forgot password?
```

Do not over-design authentication.

---

# 26. Responsive Strategy

The product is desktop-first because POS operations benefit from large screens.

However, responsive behavior must be intentional.

## Desktop
Full operational layout.

## Tablet
- compact navigation
- POS remains split-pane
- cart may become a drawer

## Mobile
Mobile should prioritize:
- inventory viewing
- customer lookup
- reports
- management
- lightweight POS if necessary

Do not simply shrink the desktop UI.

---

# 27. Mobile POS

If mobile checkout is supported:

```text
VHM

Search / Scan

[ Product ]

Cart (3)
─────────
Coca-Cola     2
Water         1

TOTAL
CFA 1,300

[ CHECKOUT ]
```

Cart becomes a bottom sheet/drawer.

---

# 28. Keyboard Navigation

Keyboard support is a core professional feature.

Suggested shortcuts:

```text
F2     Search product
F4     Customer
F6     Discount
F8     Payment
ENTER  Add / Confirm
ESC    Close modal
```

Shortcuts should be visible in tooltips and optional shortcut help.

Do not make keyboard shortcuts mandatory for basic use.

---

# 29. Feedback & Microinteractions

Feedback should be immediate but restrained.

Use:
- subtle success toast
- inline validation
- active button states
- loading indicators
- stock update confirmation
- scanner confirmation

Avoid:
- large blocking success animations
- excessive toast stacking
- decorative animation
- long transition times

Operational software should feel fast.

---

# 30. Modal vs Drawer Rules

Use a modal when:
- confirmation is critical
- the user must focus on one decision

Use a drawer when:
- inspecting transaction details
- viewing customer details
- viewing product details
- examining audit records

Use a full page when:
- the user is performing a substantial workflow

Use inline controls when:
- editing quantity
- filtering
- changing unit

This keeps the interface lightweight.

---

# 31. Tables

Tables should be used where they genuinely improve scanning.

Good table use:
- inventory
- sales history
- customers
- audit records
- staff

Bad table use:
- POS product selection
- product browsing
- mobile interactions

Tables should support:
- sticky headers
- sorting
- filtering
- pagination when needed
- row hover
- keyboard navigation where practical

---

# 32. Empty States

Empty states should explain what to do.

Bad:

```text
No Data
```

Better:

```text
No customers yet

Customers added during checkout will appear here.

[ ADD CUSTOMER ]
```

---

# 33. Error States

Errors must be human-readable.

Never expose:
- SQL errors
- stack traces
- database field names
- raw API exceptions

Bad:

```text
23505 duplicate key
```

Better:

```text
This username is already in use.
Choose a different username.
```

---

# 34. Loading States

Use skeletons for:
- dashboard metrics
- product grids
- inventory tables
- customer lists

Use spinners for:
- button actions
- payment submission
- restock submission

Disable the primary action while an operation is processing.

---

# 35. Financial UX Rules

Currency display must be consistent.

Default system currency:
- CFA

USD may be displayed when applicable.

Always show:
- currency
- total
- payment amount
- remaining balance

Never make the user interpret a bare number.

Examples:

Correct:
`CFA 24,500`

Incorrect:
`24,500`

---

# 36. Exchange Rate UX

The application stores the CFA/USD exchange rate and the rate used at the time of sale.

The interface should clearly distinguish:

### Current rate
Used for current operations.

### Sale rate
Historical rate locked to that transaction.

Never silently recalculate an old sale using today's exchange rate.

For admin:

```text
CURRENT EXCHANGE RATE

1 USD = XXXX CFA

Updated
11 Sep 2026, 16:42

Updated by
Admin
```

---

# 37. Role-Based Navigation

## Admin navigation

```text
Overview
Depots
Sales
Inventory
Customers
Payments
Reports
Staff
Audit Log
Settings
```

## Cashier navigation

```text
POS
Customers
Payments
Sales
Shift
```

## Depot Staff navigation

```text
Inventory
Products
Restock
Stock Activity
```

Hide irrelevant functionality instead of merely disabling it.

---

# 38. Important UX Security Principle

The UI must reinforce authorization.

For example:
- cashier should not see admin settings
- depot staff should not edit unrelated depots
- users should not see actions they cannot perform

Permission logic must be enforced by the backend as well. UI hiding is only a usability layer, not a security mechanism.

---

# 39. Design Tokens

Suggested initial tokens:

```css
--background: #F6F7F9;
--surface: #FFFFFF;
--surface-muted: #F9FAFB;

--text-primary: #111827;
--text-secondary: #667085;
--text-muted: #98A2B3;

--border: #E5E7EB;
--border-strong: #D0D5DD;

--primary: <BRAND_PRIMARY>;
--primary-hover: <BRAND_PRIMARY_DARK>;

--success: #12B76A;
--warning: #F79009;
--danger: #F04438;
--info: #2E90FA;

--radius-sm: 8px;
--radius-md: 10px;
--radius-lg: 14px;

--shadow-sm: 0 1px 2px rgba(16,24,40,0.05);
--shadow-md: 0 4px 12px rgba(16,24,40,0.08);
```

Do not hard-code these values repeatedly across the application.

---

# 40. Component Library

The implementation should establish reusable components before building pages.

Required primitives:

### Navigation
- AppRail
- AppSidebar
- WorkspaceSwitcher
- UserMenu

### Data
- DataTable
- StatCard
- StatusBadge
- Metric
- EmptyState

### Forms
- Input
- Select
- Combobox
- NumberInput
- CurrencyInput
- SearchInput

### POS
- ProductCard
- ProductGrid
- Cart
- CartItem
- UnitSelector
- PaymentMethodSelector
- CheckoutPanel
- ShiftPanel

### Inventory
- StockIndicator
- RestockForm
- ProductDetail
- StockActivityList

### Customers
- CustomerCard
- CustomerProfile
- BalanceIndicator
- PaymentForm
- TransactionTimeline

### Feedback
- Toast
- Modal
- Drawer
- ConfirmDialog
- Skeleton
- LoadingButton

---

# 41. Page Priority

Design and implement in this order:

## Phase 1 — Core POS
1. Login
2. POS
3. Product selection
4. Cart
5. Checkout
6. Customer selection
7. Payment
8. Shift open/close

## Phase 2 — Inventory
9. Inventory overview
10. Product detail
11. Restock
12. Product management

## Phase 3 — Customer / Sales
13. Customer list
14. Customer detail
15. Payments
16. Sales history

## Phase 4 — Admin
17. Dashboard
18. Multi-depot
19. Staff
20. Reports
21. Audit log
22. Settings

This sequencing ensures the highest-value operational workflows are validated first.

---

# 42. UX Acceptance Criteria

The interface should be considered successful when:

### Cashier
- Can start a shift quickly
- Can scan a product without opening extra screens
- Can add multiple products rapidly
- Can change unit and quantity without friction
- Can select a customer quickly
- Can complete cash payment with minimal clicks
- Can create a balance transaction clearly
- Can close a shift with explicit reconciliation

### Depot Staff
- Can identify low-stock products immediately
- Can restock without navigating through multiple configuration screens
- Can understand unit conversions
- Can inspect recent stock activity

### Admin
- Can understand today's business state within seconds
- Can switch depot context
- Can investigate sales
- Can inspect balances and payments
- Can identify inventory problems
- Can review discrepancies
- Can trace important actions in the audit log

---

# 43. Anti-Patterns to Avoid

Do NOT build:

- generic left-sidebar SaaS templates
- giant dashboard cards everywhere
- excessive rounded corners
- excessive gradients
- dark mode as the default visual direction
- giant navigation menus
- CRUD-first workflows
- unnecessary confirmation dialogs
- forms with 15+ fields
- technical database terminology in the UI
- tables for every feature
- excessive animations
- decorative charts with no operational value
- hidden checkout actions
- tiny touch targets
- ambiguous financial figures
- generic "success" states without useful confirmation

---

# 44. Golden UX Rule

Every screen should answer three questions immediately:

### 1. Where am I?
Clear page/module/context.

### 2. What matters right now?
The important operational state.

### 3. What should I do next?
A visible and obvious primary action.

If a screen cannot answer these questions quickly, redesign it.

---

# 45. Final Design Direction

The VHM POS should feel like:

> **A modern professional operating system for retail operations.**

Not a website that happens to contain:
- sales
- inventory
- customers
- reports

The system should have a strong operational identity.

The POS should be extremely fast.

The inventory screens should be extremely clear.

The admin dashboard should be extremely informative.

The customer/payment system should feel financially trustworthy.

The multi-depot architecture should be visible without becoming complicated.

The overall interface should communicate:

**Fast. Clear. Controlled. Reliable. Professional.**

---

# 46. AI / Cursor Implementation Prompt

Use the following as the primary instruction when implementing the UI:

> Build the VHM Multi-Depot POS and Inventory System according to `VHM-POS-UI-UX-SPEC.md`.
>
> Do not generate a generic SaaS admin dashboard.
>
> Build a professional operational POS interface optimized for speed, inventory control, cashier workflows, customer balances, payments, shifts, and multi-depot management.
>
> The POS must behave like a dedicated professional POS workstation even though it is web-based.
>
> Use a compact navigation rail, persistent depot context, role-based navigation, strong typography, neutral surfaces, restrained colors, and clear operational states.
>
> Prioritize action-oriented workflows over CRUD screens.
>
> Build reusable components before duplicating UI.
>
> The POS must support scanner-first operation, keyboard navigation, product cards, persistent cart, multi-unit selling, checkout, cash payment, customer balance, and shift reconciliation.
>
> Inventory must support visual stock status, product details, unit configuration, restocking, and recent stock activity.
>
> Customers must have financial profiles with balance, purchases, payments, and activity history.
>
> Admin must have a concise command-center dashboard, multi-depot context switching, reports, staff management, audit history, and settings.
>
> Do not expose database implementation terminology such as `unit_level`, `conversion_to_base`, `balance_added_cfa`, or raw SQL concepts in the visual UI.
>
> Do not create unnecessary screens or navigation items.
>
> Every screen must clearly communicate:
> 1. Where the user is
> 2. What matters now
> 3. What the next action is
>
> Optimize for desktop POS usage first, tablet second, and mobile management workflows third.
>
> Use accessible contrast, large touch targets, clear loading states, precise financial formatting, and human-readable error messages.
>
> The result should feel closer to a premium professional POS product than a generic template.

---

# 47. Source / Data-Model Alignment

This design specification is based on the VHM data model supplied for the system.

The data model includes:
- business settings and CFA/USD exchange rate
- multi-depot structure
- role-based staff accounts
- shared categories
- depot-owned products
- multi-level product units
- stock entries
- cashier shifts
- customers and balances
- sales and sale items
- payments
- system audit logs

The UI should preserve these concepts while translating implementation-level structures into understandable operational language.

