-- ================================================================
-- CEO Notes Phase — Migration: Product Unit Serials & Hierarchy
-- ================================================================
--
-- CHANGES:
--   1. Add serial_number TEXT to product_units (nullable initially)
--   2. Add relative_quantity NUMERIC to product_units
--      L0 = NULL (base unit, conversion fixed at 1)
--      L1 = pieces per package
--      L2 = packages per carton
--   3. Deterministic backfill for existing units:
--      Format: <NAME3>-<LEVEL>-<SEQ> e.g. ONI-PCE-001
--      Guaranteed unique via global sequential row number
--   4. Add NOT NULL constraint after backfill
--   5. Add unique index on lower(trim(serial_number))
--   6. Add backfill for relative_quantity from existing conversion_to_base
--
-- HISTORICAL SAFETY:
--   conversion_to_base is NOT removed — all historical sale_items,
--   stock_entries, etc. still reference it via their frozen values.
--   relative_quantity is the new admin-editable field; server derives
--   and writes conversion_to_base from it going forward.
--
-- BACKFILL STRATEGY for serial_number:
--   Deterministic: UPPER(REGEXP_REPLACE(LEFT(product.name,3),'[^A-Za-z0-9]','','g'))
--                  + '-' + level_code + '-' + LPAD(global_seq, 4, '0')
--   global_seq = ROW_NUMBER() over all units ordered by product.created_at, product.id, unit_level
--   This guarantees no collisions even if name prefixes are identical.
--   Admins are expected to rename these to human-friendly values.
-- ================================================================

-- Step 1: Add columns (nullable to allow backfill before NOT NULL)
ALTER TABLE public.product_units
  ADD COLUMN IF NOT EXISTS serial_number    text,
  ADD COLUMN IF NOT EXISTS relative_quantity numeric(14,3)
    CHECK (relative_quantity IS NULL OR relative_quantity > 0);

COMMENT ON COLUMN public.product_units.serial_number IS
  'Unique identifier for this unit definition (e.g. ON-PCE-001). Case-insensitive. Admin-editable.';

COMMENT ON COLUMN public.product_units.relative_quantity IS
  'Parent-relative quantity. L0=NULL (fixed). L1=pieces per package. L2=packages per carton. Server derives conversion_to_base.';

-- Step 2: Deterministic serial_number backfill for existing units
UPDATE public.product_units pu
SET serial_number = sub.generated_serial
FROM (
  SELECT
    pu2.id,
    UPPER(
      REGEXP_REPLACE(LEFT(p.name, 3), '[^A-Za-z0-9]', '', 'g')
    ) || '-' ||
    CASE pu2.unit_level
      WHEN 0 THEN 'PCE'
      WHEN 1 THEN 'PKG'
      WHEN 2 THEN 'CTN'
      ELSE 'UNK'
    END || '-' ||
    LPAD(
      ROW_NUMBER() OVER (
        ORDER BY p.created_at, p.id, pu2.unit_level
      )::text,
      4, '0'
    ) AS generated_serial
  FROM public.product_units pu2
  JOIN public.products p ON p.id = pu2.product_id
  WHERE pu2.serial_number IS NULL
) sub
WHERE pu.id = sub.id;

-- Step 3: Backfill relative_quantity from existing conversion_to_base
-- L0: remains NULL (conversion is always 1)
-- L1: relative_quantity = conversion_to_base (pieces per package)
-- L2: relative_quantity = conversion_to_base / COALESCE(L1.conversion_to_base, 1)
--     i.e., packages per carton — computed from the stored absolute values
UPDATE public.product_units pu
SET relative_quantity = CASE
  WHEN pu.unit_level = 0 THEN NULL  -- base unit: no relative_quantity
  WHEN pu.unit_level = 1 THEN pu.conversion_to_base  -- pieces/package
  WHEN pu.unit_level = 2 THEN
    -- packages/carton = carton_conversion / package_conversion
    CASE
      WHEN l1.conversion_to_base IS NOT NULL AND l1.conversion_to_base > 0
        THEN ROUND(pu.conversion_to_base / l1.conversion_to_base, 3)
      ELSE pu.conversion_to_base  -- fallback if no L1 (shouldn't happen)
    END
  ELSE NULL
END
FROM public.product_units l1
WHERE l1.product_id = pu.product_id
  AND l1.unit_level = 1
  AND pu.serial_number IS NOT NULL  -- already backfilled
  AND pu.relative_quantity IS NULL;

-- Handle L1 units (no LEFT JOIN needed since we already set L1 above)
UPDATE public.product_units pu
SET relative_quantity = pu.conversion_to_base
WHERE pu.unit_level = 1
  AND pu.relative_quantity IS NULL;

-- Step 4: Add NOT NULL after backfill (all existing rows now have a serial)
ALTER TABLE public.product_units
  ALTER COLUMN serial_number SET NOT NULL;

-- Step 5: Unique index (case-insensitive, trimmed)
-- This enforces that 'ABC-123', 'abc-123', ' ABC-123 ' are all the same serial
CREATE UNIQUE INDEX IF NOT EXISTS product_units_serial_unique_idx
  ON public.product_units (lower(trim(serial_number)));

-- Step 6: Regular index for serial search performance
CREATE INDEX IF NOT EXISTS product_units_serial_search_idx
  ON public.product_units USING gin (lower(trim(serial_number)) gin_trgm_ops);

COMMENT ON TABLE public.product_units IS
  'Unit levels: 0=piece (base), 1=package, 2=carton. serial_number is unique per unit definition. relative_quantity is admin-editable parent relationship. conversion_to_base is server-derived absolute.';
