-- ================================================================
-- CEO Notes Phase — Migration: Admin Total Override on Sales
-- ================================================================
--
-- CHANGES:
--   Add admin_override_total_cfa to sales table.
--   Nullable. Only populated when an admin overrides the final total.
--   When NULL: the authoritative total is sales.total_cfa (normal).
--   When set: the authoritative total IS admin_override_total_cfa.
--
-- IMPORTANT:
--   The existing total_cfa retains the calculated total (pre-override).
--   This enables the UI to show "Calculated: X / Adjusted: Y".
--   Reports use COALESCE(admin_override_total_cfa, total_cfa) as
--   the authoritative revenue figure.
--
-- CONSTRAINTS:
--   admin_override_total_cfa >= 0 (zero override is valid).
--   Server-side RPC enforces admin-only. No DB-level role check
--   needed because the RPC (SECURITY DEFINER) authorizes.
-- ================================================================

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS admin_override_total_cfa numeric(14,2)
    CHECK (admin_override_total_cfa IS NULL OR admin_override_total_cfa >= 0);

COMMENT ON COLUMN public.sales.admin_override_total_cfa IS
  'Admin-only final total override. NULL = no override (use total_cfa). When set, this IS the authoritative revenue total.';

-- Index for queries filtering overridden sales
CREATE INDEX IF NOT EXISTS sales_override_idx
  ON public.sales (admin_override_total_cfa)
  WHERE admin_override_total_cfa IS NOT NULL;
