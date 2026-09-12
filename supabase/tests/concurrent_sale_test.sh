#!/usr/bin/env bash
# ================================================================
# VHM POS — Concurrent Sale Test
# ================================================================
# Tests that FOR UPDATE locking correctly serializes concurrent
# complete_sale calls against insufficient stock.
#
# Scenario: product stock = 10
#   Two concurrent requests each attempt qty = 7
#   Expected: exactly 1 succeeds (stock → 3), 1 fails (INSUFFICIENT_STOCK)
#
# Also tests concurrent idempotency key deduplication:
#   Two concurrent requests with the same idempotency_key
#   Expected: exactly 1 sale row created
#
# Prerequisites:
#   - supabase db reset must have been run
#   - psql available in PATH
#   - Local Supabase running on default port 54322
#
# Usage:
#   chmod +x concurrent_sale_test.sh
#   ./concurrent_sale_test.sh
# ================================================================

set -euo pipefail

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
PASS=0
FAIL=0
TMPDIR_TEST=$(mktemp -d)
trap 'rm -rf "$TMPDIR_TEST"' EXIT

log_pass() { echo "  ✓ PASS: $1"; PASS=$((PASS+1)); }
log_fail() { echo "  ✗ FAIL: $1"; FAIL=$((FAIL+1)); }

# ─── Setup ────────────────────────────────────────────────────
echo ""
echo "=== VHM POS Concurrent Sale Test ==="
echo "DB: $DB_URL"
echo ""

SETUP_SQL=$(cat <<'ENDSQL'
-- Set session auth context (admin)
SELECT set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
SELECT set_config('request.jwt.sub', '00000000-0000-0000-0000-000000000001', false);

-- Create isolated test product with exactly 10 pieces
INSERT INTO products (id, depot_id, category_id, name, current_stock_pieces, is_active)
VALUES (
  'cccccccc-0000-0000-0000-000000000001',
  '00000000-0000-0000-0001-000000000001',
  '00000000-0000-0000-0002-000000000001',
  'Concurrent Test Product',
  10,
  true
) ON CONFLICT (id) DO UPDATE SET current_stock_pieces = 10;

INSERT INTO product_units (product_id, unit_level, unit_name, conversion_to_base, cost_price_cfa, selling_price_cfa)
VALUES ('cccccccc-0000-0000-0000-000000000001', 0, 'Unit', 1, 100, 200)
ON CONFLICT (product_id, unit_level) DO UPDATE SET selling_price_cfa = 200;

-- Seed inventory_transactions for this test product to maintain drift invariant
DELETE FROM inventory_transactions WHERE product_id = 'cccccccc-0000-0000-0000-000000000001';
INSERT INTO inventory_transactions (depot_id, product_id, quantity_pieces, transaction_type, reference_type, reference_id, created_by)
VALUES (
  '00000000-0000-0000-0001-000000000001',
  'cccccccc-0000-0000-0000-000000000001',
  10, 'RESTOCK', 'stock_entry',
  '00000000-0000-0000-0004-000000000099',
  '00000000-0000-0000-0000-000000000001'
);
ENDSQL
)

psql "$DB_URL" -c "$SETUP_SQL" > /dev/null 2>&1 || {
  echo "FATAL: setup failed"
  exit 1
}
echo "Setup complete: test product created with stock=10"

# ─── Test 1: Concurrent conflicting sales ─────────────────────
echo ""
echo "--- Test 1: Concurrent conflicting sales (each requests qty=7) ---"

SALE_SQL_1=$(cat <<'ENDSQL'
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
SELECT set_config('request.jwt.sub', '00000000-0000-0000-0000-000000000001', false);
SELECT public.complete_sale(
  p_depot_id := '00000000-0000-0000-0001-000000000001'::uuid,
  p_cart_items := '[{"product_id":"cccccccc-0000-0000-0000-000000000001","unit_level":0,"quantity_in_unit":7}]'::jsonb,
  p_amount_tendered_cfa := 1400
);
ENDSQL
)

# Run two concurrent sales
psql "$DB_URL" -c "$SALE_SQL_1" > "$TMPDIR_TEST/sale1.out" 2>&1 &
PID1=$!
psql "$DB_URL" -c "$SALE_SQL_1" > "$TMPDIR_TEST/sale2.out" 2>&1 &
PID2=$!
wait $PID1; wait $PID2

# Count successes (contains receipt_number) and failures
SUCCESSES=0
FAILURES=0
for f in "$TMPDIR_TEST/sale1.out" "$TMPDIR_TEST/sale2.out"; do
  if grep -q 'receipt_number' "$f" 2>/dev/null; then
    SUCCESSES=$((SUCCESSES+1))
  fi
  if grep -q 'INSUFFICIENT_STOCK' "$f" 2>/dev/null; then
    FAILURES=$((FAILURES+1))
  fi
done

# Database assertions
FINAL_STOCK=$(psql "$DB_URL" -t -c "SELECT current_stock_pieces FROM products WHERE id = 'cccccccc-0000-0000-0000-000000000001'" 2>/dev/null | tr -d ' \n')
SALE_ROWS=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM sale_items WHERE product_id = 'cccccccc-0000-0000-0000-000000000001'" 2>/dev/null | tr -d ' \n')
LEDGER_SALES=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM inventory_transactions WHERE product_id = 'cccccccc-0000-0000-0000-000000000001' AND transaction_type = 'SALE'" 2>/dev/null | tr -d ' \n')
DRIFT=$(psql "$DB_URL" -t -c "
  SELECT ABS(p.current_stock_pieces - COALESCE(SUM(it.quantity_pieces), 0))
  FROM products p
  LEFT JOIN inventory_transactions it ON it.product_id = p.id
  WHERE p.id = 'cccccccc-0000-0000-0000-000000000001'
  GROUP BY p.current_stock_pieces
" 2>/dev/null | tr -d ' \n')

echo "  Results: successes=$SUCCESSES, failures=$FAILURES, final_stock=$FINAL_STOCK, sale_item_rows=$SALE_ROWS, ledger_sale_rows=$LEDGER_SALES, drift=${DRIFT:-0}"

if [ "$SUCCESSES" -eq 1 ]; then
  log_pass "Exactly 1 sale succeeded"
else
  log_fail "Expected 1 success, got $SUCCESSES"
  echo "  sale1.out:"; cat "$TMPDIR_TEST/sale1.out"
  echo "  sale2.out:"; cat "$TMPDIR_TEST/sale2.out"
fi

if [ "$FAILURES" -eq 1 ]; then
  log_pass "Exactly 1 INSUFFICIENT_STOCK error"
else
  log_fail "Expected 1 failure, got $FAILURES"
fi

if [ "$FINAL_STOCK" = "3" ]; then
  log_pass "Final stock = 3 (10 - 7)"
else
  log_fail "Expected final stock=3, got $FINAL_STOCK"
fi

if [ "$SALE_ROWS" = "1" ]; then
  log_pass "Exactly 1 sale_items row"
else
  log_fail "Expected 1 sale_items row, got $SALE_ROWS"
fi

if [ "$LEDGER_SALES" = "1" ]; then
  log_pass "Exactly 1 SALE row in inventory_transactions"
else
  log_fail "Expected 1 inventory_transactions SALE row, got $LEDGER_SALES"
fi

if [ "${DRIFT:-0}" = "0" ]; then
  log_pass "Zero inventory ledger drift"
else
  log_fail "Inventory drift detected: $DRIFT"
fi

# ─── Test 2: Concurrent idempotency key deduplication ────────
echo ""
echo "--- Test 2: Concurrent duplicate idempotency keys ---"

# Reset stock
psql "$DB_URL" -c "
  UPDATE products SET current_stock_pieces = 10 WHERE id = 'cccccccc-0000-0000-0000-000000000001';
  DELETE FROM inventory_transactions WHERE product_id = 'cccccccc-0000-0000-0000-000000000001';
  INSERT INTO inventory_transactions (depot_id, product_id, quantity_pieces, transaction_type, reference_type, reference_id, created_by)
  VALUES ('00000000-0000-0000-0001-000000000001', 'cccccccc-0000-0000-0000-000000000001', 10, 'RESTOCK', 'stock_entry', '00000000-0000-0000-0004-000000000099', '00000000-0000-0000-0000-000000000001');
" > /dev/null 2>&1

IDEM_KEY="dddddddd-0000-0000-0000-000000000001"
IDEM_SQL=$(cat <<ENDSQL
SELECT set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
SELECT set_config('request.jwt.sub', '00000000-0000-0000-0000-000000000001', false);
SELECT public.complete_sale(
  p_depot_id := '00000000-0000-0000-0001-000000000001'::uuid,
  p_cart_items := '[{"product_id":"cccccccc-0000-0000-0000-000000000001","unit_level":0,"quantity_in_unit":3}]'::jsonb,
  p_amount_tendered_cfa := 600,
  p_idempotency_key := '$IDEM_KEY'::uuid
);
ENDSQL
)

psql "$DB_URL" -c "$IDEM_SQL" > "$TMPDIR_TEST/idem1.out" 2>&1 &
PID3=$!
psql "$DB_URL" -c "$IDEM_SQL" > "$TMPDIR_TEST/idem2.out" 2>&1 &
PID4=$!
wait $PID3; wait $PID4

IDEM_SALES=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM sales WHERE idempotency_key = '$IDEM_KEY'" 2>/dev/null | tr -d ' \n')
FINAL_STOCK2=$(psql "$DB_URL" -t -c "SELECT current_stock_pieces FROM products WHERE id = 'cccccccc-0000-0000-0000-000000000001'" 2>/dev/null | tr -d ' \n')
IDEM_LEDGER=$(psql "$DB_URL" -t -c "
  SELECT ABS(p.current_stock_pieces - COALESCE(SUM(it.quantity_pieces), 0))
  FROM products p
  LEFT JOIN inventory_transactions it ON it.product_id = p.id
  WHERE p.id = 'cccccccc-0000-0000-0000-000000000001'
  GROUP BY p.current_stock_pieces
" 2>/dev/null | tr -d ' \n')

echo "  Results: sales_for_key=$IDEM_SALES, final_stock=$FINAL_STOCK2, drift=${IDEM_LEDGER:-0}"

if [ "$IDEM_SALES" = "1" ]; then
  log_pass "Exactly 1 sale created for idempotency key (dedup worked)"
else
  log_fail "Expected 1 sale for idempotency key, got $IDEM_SALES"
  cat "$TMPDIR_TEST/idem1.out"
  cat "$TMPDIR_TEST/idem2.out"
fi

if [ "$FINAL_STOCK2" = "7" ]; then
  log_pass "Stock correctly reduced by 3 only once (= 7)"
else
  log_fail "Expected stock=7 after idempotency test, got $FINAL_STOCK2"
fi

if [ "${IDEM_LEDGER:-0}" = "0" ]; then
  log_pass "Zero inventory drift after idempotency test"
else
  log_fail "Inventory drift detected: $IDEM_LEDGER"
fi

# ─── Cleanup ──────────────────────────────────────────────────
psql "$DB_URL" -c "
  DELETE FROM inventory_transactions WHERE product_id = 'cccccccc-0000-0000-0000-000000000001';
  DELETE FROM sale_items WHERE product_id = 'cccccccc-0000-0000-0000-000000000001';
  DELETE FROM sales WHERE depot_id = '00000000-0000-0000-0001-000000000001' AND id IN (SELECT sale_id FROM sale_items WHERE product_id = 'cccccccc-0000-0000-0000-000000000001');
  DELETE FROM product_units WHERE product_id = 'cccccccc-0000-0000-0000-000000000001';
  DELETE FROM products WHERE id = 'cccccccc-0000-0000-0000-000000000001';
" > /dev/null 2>&1 || true  # cleanup best-effort

# ─── Summary ─────────────────────────────────────────────────
echo ""
echo "=== Concurrency Test Results ==="
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  echo "RESULT: FAILED ($FAIL assertion(s) failed)"
  exit 1
else
  echo "RESULT: ALL TESTS PASSED"
  exit 0
fi
