-- Remove POS test documents recorded before the real stock load (16 Nov 2026).
-- Deletes sales, returns, voids, their payments, proformas, delivery notes,
-- and the customers named testing and Aminata Test.
-- Does not change product quantities. Opening stock, adjustments, suppliers,
-- purchase receipts, and the customer AYMAN ZALGHOUT SP stay.

UPDATE public.sales
SET proforma_id = NULL
WHERE proforma_id IS NOT NULL;

UPDATE public.proformas
SET converted_sale_id = NULL
WHERE converted_sale_id IS NOT NULL;

UPDATE public.payments
SET reversed_by_return_id = NULL
WHERE reversed_by_return_id IS NOT NULL;

DELETE FROM public.delivery_note_items;
DELETE FROM public.delivery_notes;

DELETE FROM public.sale_return_items;
DELETE FROM public.sale_returns;

DELETE FROM public.payments
WHERE sale_id IS NOT NULL
   OR customer_id IN (
     SELECT id FROM public.customers
     WHERE name IN ('testing', 'Aminata Test')
   );

DELETE FROM public.inventory_transactions
WHERE reference_type IN ('sale', 'sale_return', 'void');

DELETE FROM public.sales;
DELETE FROM public.proformas;

DELETE FROM public.customers
WHERE name IN ('testing', 'Aminata Test');

DELETE FROM public.shift_cash_movements
WHERE shift_id IN (
  SELECT id FROM public.shifts
  WHERE opened_at < timestamptz '2026-11-16 00:00:00+00'
);

DELETE FROM public.shifts
WHERE opened_at < timestamptz '2026-11-16 00:00:00+00';
