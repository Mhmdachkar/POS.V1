-- ================================================================
-- B8 — An open shift is required to sell, refund, or record a payment.
-- ================================================================
-- complete_sale, process_return, and record_payment already call
-- private.validate_shift. Making a null shift_id an error enforces
-- the rule in all three RPCs without rewriting them.
-- Existing sales/returns/payments rows are not modified.
-- ================================================================

CREATE OR REPLACE FUNCTION private.validate_shift(
  p_shift_id uuid,
  p_depot_id uuid
)
RETURNS public.shifts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_shift public.shifts;
BEGIN
  IF p_shift_id IS NULL THEN
    PERFORM private.raise_vhm_error('SHIFT_NOT_OPEN',
      jsonb_build_object('reason', 'open_shift_required'));
  END IF;

  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id
  FOR UPDATE;

  IF NOT FOUND THEN
    PERFORM private.raise_vhm_error('SHIFT_NOT_FOUND',
      jsonb_build_object('shift_id', p_shift_id));
  END IF;

  IF p_depot_id IS NOT NULL AND v_shift.depot_id != p_depot_id THEN
    PERFORM private.raise_vhm_error('INVALID_DEPOT',
      jsonb_build_object(
        'shift_depot_id', v_shift.depot_id,
        'expected_depot_id', p_depot_id
      ));
  END IF;

  IF v_shift.status != 'open' THEN
    PERFORM private.raise_vhm_error('SHIFT_NOT_OPEN',
      jsonb_build_object(
        'shift_id', p_shift_id,
        'status', v_shift.status
      ));
  END IF;

  RETURN v_shift;
END;
$$;

REVOKE EXECUTE ON FUNCTION private.validate_shift(uuid, uuid) FROM public;

COMMENT ON FUNCTION private.validate_shift(uuid, uuid) IS
  'Validates shift exists, belongs to depot (when given), and is open. Null shift_id is rejected — sales, refunds, and payments require an open shift. Acquires FOR UPDATE. Lock order: shift BEFORE products.';
