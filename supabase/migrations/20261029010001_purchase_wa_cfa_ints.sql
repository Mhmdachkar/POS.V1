-- Soft Gestion: CFA are whole francs. Round purchase WA + BR line totals to integers.
CREATE OR REPLACE FUNCTION private.apply_purchase_wa_cost(
  p_product_id uuid,
  p_qty_pieces numeric,
  p_cost_per_piece numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_product public.products%ROWTYPE;
  v_l0 public.product_units%ROWTYPE;
  v_old_l0 numeric;
  v_new_l0 numeric;
  v_old_pieces numeric;
BEGIN
  SELECT * INTO v_product FROM public.products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_l0 FROM public.product_units
  WHERE product_id = p_product_id AND unit_level = 0;
  IF NOT FOUND THEN RETURN; END IF;

  v_old_l0 := coalesce(v_l0.cost_price_cfa, 0);
  v_old_pieces := greatest(0, coalesce(v_product.current_stock_pieces, 0));

  IF v_old_l0 <= 0 OR v_old_pieces <= 0 THEN
    v_new_l0 := round(p_cost_per_piece, 0);
  ELSE
    v_new_l0 := round(
      (v_old_pieces * v_old_l0 + p_qty_pieces * p_cost_per_piece)
      / (v_old_pieces + p_qty_pieces),
      0
    );
  END IF;

  UPDATE public.product_units u
  SET cost_price_cfa = round(v_new_l0 * u.conversion_to_base, 0)
  WHERE u.product_id = p_product_id;
END;
$$;

REVOKE ALL ON FUNCTION private.apply_purchase_wa_cost(uuid, numeric, numeric) FROM PUBLIC;