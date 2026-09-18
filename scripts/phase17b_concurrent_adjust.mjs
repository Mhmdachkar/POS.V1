/**
 * Phase 17B — real dual-session stock race.
 *
 * Two admin clients concurrently DAMAGE the same product (each -6)
 * from a known stock of 10. Row-level FOR UPDATE must admit exactly
 * one success. Final stock must be 4, never negative, and must equal
 * SUM(inventory_transactions).
 *
 * Usage (repo root, with VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY):
 *   node scripts/phase17b_concurrent_adjust.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

function rpcError(data, error) {
  const raw = error?.message || data?.message || JSON.stringify(data?.error ?? data ?? error)
  try {
    const parsed = JSON.parse(raw)
    return parsed.code || raw
  } catch {
    if (typeof raw === 'string' && raw.includes('ADJUSTMENT_NEGATIVE_RESULT')) {
      return 'ADJUSTMENT_NEGATIVE_RESULT'
    }
    return String(raw)
  }
}

async function main() {
  const env = loadEnv()
  const url = env.VITE_SUPABASE_URL
  const anon = env.VITE_SUPABASE_ANON_KEY
  if (!url || !anon) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
    process.exit(1)
  }

  const auth = createClient(url, anon, { auth: { persistSession: false } })
  const { data: session, error: signErr } = await auth.auth.signInWithPassword({
    email: 'admin@vhm-pos.internal',
    password: process.env.QA_ADMIN_PASSWORD || process.env.PHASE17B_ADMIN_PASSWORD || (() => { console.error("Missing QA_ADMIN_PASSWORD"); process.exit(1) })(),
  })
  if (signErr || !session.session) {
    console.error('admin sign-in failed', signErr)
    process.exit(1)
  }

  const token = session.session.access_token
  const a = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })
  const b = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })

  const stamp = Date.now()
  const created = await a.rpc('create_product', {
    p_depot_id: '00000000-0000-0000-0001-000000000001',
    p_category_id: '00000000-0000-0000-0002-000000000001',
    p_name: `PHASE17B_TEST_CONCURRENT_${stamp}`,
    p_photo_url:
      'https://images.unsplash.com/photo-1559839914-17aae19cec71?auto=format&fit=crop&w=800&h=800&q=80',
    p_units: [
      {
        unit_level: 0,
        unit_name: 'Piece',
        conversion_to_base: 1,
        cost_price_cfa: 100,
        selling_price_cfa: 200,
      },
    ],
    p_track_low_stock: false,
    p_low_stock_threshold: null,
  })
  if (created.error || created.data?.error) {
    console.error('create_product failed', created.error ?? created.data)
    process.exit(1)
  }
  const productId = created.data.id
  const restock = await a.rpc('restock_product', {
    p_product_id: productId,
    p_unit_level: 0,
    p_quantity_in_unit: 10,
    p_note: 'PHASE17B_TEST_CONCURRENT_BASE',
  })
  if (restock.error) {
    console.error('restock_product failed', restock.error)
    process.exit(1)
  }

  const payload = {
    p_product_id: productId,
    p_adjustment_type: 'DAMAGE',
    p_quantity_pieces: -6,
    p_reason: 'PHASE17B_TEST_CONCURRENT_DAMAGE',
  }
  const [left, right] = await Promise.all([
    a.rpc('adjust_inventory', payload),
    b.rpc('adjust_inventory', payload),
  ])

  const outcomes = [left, right].map((r) =>
    r.error || r.data?.error
      ? { ok: false, code: rpcError(r.data, r.error) }
      : { ok: true, stock: r.data?.new_stock_pieces },
  )
  const successes = outcomes.filter((o) => o.ok)
  const failures = outcomes.filter((o) => !o.ok)

  const { data: product, error: prodErr } = await a
    .from('products')
    .select('current_stock_pieces')
    .eq('id', productId)
    .single()
  if (prodErr) {
    console.error('product read failed', prodErr)
    process.exit(1)
  }

  const { data: ledger, error: ledErr } = await a
    .from('inventory_transactions')
    .select('quantity_pieces')
    .eq('product_id', productId)
  if (ledErr) {
    console.error('ledger read failed', ledErr)
    process.exit(1)
  }
  const ledgerSum = (ledger ?? []).reduce((s, row) => s + Number(row.quantity_pieces), 0)
  const stock = Number(product.current_stock_pieces)

  console.log(
    JSON.stringify(
      {
        productId,
        outcomes,
        stock,
        ledgerSum,
        expectedStock: 4,
      },
      null,
      2,
    ),
  )

  const pass =
    successes.length === 1 &&
    failures.length === 1 &&
    failures[0].code.includes('ADJUSTMENT_NEGATIVE_RESULT') &&
    stock === 4 &&
    ledgerSum === 4

  await a.rpc('deactivate_product', { p_product_id: productId })

  if (!pass) {
    console.error('PHASE17B concurrent adjust FAILED')
    process.exit(1)
  }
  console.log('PHASE17B concurrent adjust PASSED')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
