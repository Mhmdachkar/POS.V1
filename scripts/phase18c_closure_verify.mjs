/**
 * Phase 18C closure verification (live Supabase). Run locally:
 *   $env:QA_ADMIN_PASSWORD='...'; $env:QA_CASHIER_PASSWORD='...'; ...
 *   node scripts/phase18c_closure_verify.mjs
 *
 * Passwords from local seed/docs only — never commit.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { randomUUID } from 'crypto'

const DEPOT_DKR = '00000000-0000-0000-0001-000000000001'
const DEPOT_ABJ = '00000000-0000-0000-0001-000000000002'
const PROD_COLA_DKR = '00000000-0000-0000-0003-000000000002'
const PROD_COLA_ABJ = '00000000-0000-0000-0003-000000000012'

function loadEnv() {
  const text = readFileSync(new URL('../.env', import.meta.url), 'utf8')
  const env = {}
  for (const line of text.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim().replace(/^"|"$/g, '')
  }
  return env
}

function parseRpcError(error) {
  if (!error) return { code: 'UNKNOWN', message: '' }
  const msg = error.message ?? String(error)
  try {
    const j = JSON.parse(msg)
    if (j.code) return { code: j.code, message: j.message ?? msg }
  } catch {
    /* ignore */
  }
  if (/UNAUTHORIZED/i.test(msg)) return { code: 'UNAUTHORIZED', message: msg }
  return { code: 'UNKNOWN', message: msg }
}

async function signIn(supabase, email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`signIn ${email}: ${error.message}`)
}

async function rpc(supabase, fn, params) {
  const { data, error } = await supabase.rpc(fn, params)
  if (error) return { data: null, err: parseRpcError(error) }
  return { data, err: null }
}

async function getProductStock(supabase, productId, depotId) {
  const { data, error } = await supabase
    .from('products')
    .select('current_stock_pieces')
    .eq('id', productId)
    .eq('depot_id', depotId)
    .maybeSingle()
  if (error) throw error
  return data?.current_stock_pieces ?? null
}

async function countInvTxns(supabase, productId, depotId) {
  const { count, error } = await supabase
    .from('inventory_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('product_id', productId)
    .eq('depot_id', depotId)
  if (error) throw error
  return count ?? 0
}

async function ensureAbidjanDepotStaff(adminClient, url, anon) {
  const username = 'depotabj'
  const email = `${username}@vhm-pos.internal`
  const password = process.env.QA_DEPOT_ABJ_PASSWORD ?? 'DepotAbj2026!'
  const test = createClient(url, anon)
  const { error: signErr } = await test.auth.signInWithPassword({ email, password })
  if (!signErr) {
    await test.auth.signOut()
    return { email, password, created: false }
  }
  const { data: sess } = await adminClient.auth.getSession()
  const token = sess?.session?.access_token
  if (!token) throw new Error('admin session missing for create-staff')
  const res = await fetch(`${url}/functions/v1/create-staff`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anon,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username,
      full_name: 'Stock Manager Abidjan',
      role: 'depot_staff',
      depot_id: DEPOT_ABJ,
      password,
    }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok && body?.error?.code !== 'USERNAME_TAKEN') {
    throw new Error(`create-staff failed: ${res.status} ${JSON.stringify(body)}`)
  }
  return { email, password, created: res.ok }
}

const env = loadEnv()
const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY
if (!url || !anon) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env')
  process.exit(1)
}

const adminPw = process.env.QA_ADMIN_PASSWORD
const cashierPw = process.env.QA_CASHIER_PASSWORD
const depotDkrPw = process.env.QA_DEPOT_PASSWORD
if (!adminPw || !cashierPw || !depotDkrPw) {
  console.error('Set QA_ADMIN_PASSWORD, QA_CASHIER_PASSWORD, QA_DEPOT_PASSWORD')
  process.exit(1)
}

const report = {}

const admin = createClient(url, anon)
await signIn(admin, 'admin@vhm-pos.internal', adminPw)

const abjStaff = await ensureAbidjanDepotStaff(admin, url, anon)

// ─── Release integrity (fresh Dakar sale) ───────────────────────
const cashier = createClient(url, anon)
await signIn(cashier, 'cashier@vhm-pos.internal', cashierPw)

const stockBeforeSale = await getProductStock(cashier, PROD_COLA_DKR, DEPOT_DKR)
const invBeforeSale = await countInvTxns(cashier, PROD_COLA_DKR, DEPOT_DKR)

const saleRes = await rpc(cashier, 'complete_sale', {
  p_cart_items: [{ product_id: PROD_COLA_DKR, unit_level: 0, quantity_in_unit: 1 }],
  p_amount_tendered_cfa: 500,
  p_customer_id: null,
  p_shift_id: null,
  p_idempotency_key: randomUUID(),
})
if (saleRes.err) {
  report.release_integrity = { error: saleRes.err, phase: 'complete_sale' }
} else {
  const saleId = saleRes.data.sale_id
  const { data: saleRow } = await cashier
    .from('sales')
    .select('total_cfa, status, customer_id')
    .eq('id', saleId)
    .single()

  const stockAfterSale = await getProductStock(cashier, PROD_COLA_DKR, DEPOT_DKR)
  const invAfterSale = await countInvTxns(cashier, PROD_COLA_DKR, DEPOT_DKR)

  await cashier.auth.signOut()
  const depotDkr = createClient(url, anon)
  await signIn(depotDkr, 'depot@vhm-pos.internal', depotDkrPw)

  const beforeRelease = {
    stock: stockAfterSale,
    sale_total_cfa: saleRow?.total_cfa,
    sale_status: saleRow?.status,
    inv_txn_count: invAfterSale,
    customer_balance: null,
  }

  const rel = await rpc(depotDkr, 'release_sale_fulfillment', { p_sale_id: saleId })
  const stockAfterRelease = await getProductStock(depotDkr, PROD_COLA_DKR, DEPOT_DKR)
  const invAfterRelease = await countInvTxns(depotDkr, PROD_COLA_DKR, DEPOT_DKR)
  const { data: saleAfter } = await depotDkr
    .from('sales')
    .select('total_cfa, status')
    .eq('id', saleId)
    .single()

  const { data: ff } = await depotDkr
    .from('sale_fulfillments')
    .select('status, released_at, released_by, staff!sale_fulfillments_released_by_fkey(full_name)')
    .eq('sale_id', saleId)
    .maybeSingle()

  report.release_integrity = {
    sale_id: saleId,
    receipt_number: saleRes.data.receipt_number,
    stock_before_sale: stockBeforeSale,
    stock_after_sale: stockAfterSale,
    before_release: beforeRelease,
    after_release: {
      stock: stockAfterRelease,
      sale_total_cfa: saleAfter?.total_cfa,
      sale_status: saleAfter?.status,
      inv_txn_count: invAfterRelease,
    },
    release_rpc: rel.err ?? rel.data,
    released_by_name: ff?.staff?.full_name ?? null,
    checks: {
      stock_unchanged_by_release: stockAfterRelease === beforeRelease.stock,
      total_unchanged: saleAfter?.total_cfa === beforeRelease.sale_total_cfa,
      status_unchanged: saleAfter?.status === beforeRelease.sale_status,
      no_new_inv_txn: invAfterRelease === beforeRelease.inv_txn_count,
    },
  }
  report._closure_sale_dkr = saleRes.data.receipt_number
}

// ─── RPC security (depot vs admin) ──────────────────────────────
await depotDkr.auth.signOut()
const depotDkr2 = createClient(url, anon)
await signIn(depotDkr2, 'depot@vhm-pos.internal', depotDkrPw)

const depotRestock = await rpc(depotDkr2, 'restock_product', {
  p_product_id: PROD_COLA_DKR,
  p_unit_level: 0,
  p_quantity_in_unit: 1,
  p_note: 'PHASE18C_SHOULD_FAIL',
})
const depotAdjust = await rpc(depotDkr2, 'adjust_inventory', {
  p_product_id: PROD_COLA_DKR,
  p_adjustment_type: 'COUNT_CORRECTION',
  p_quantity_pieces: 1,
  p_reason: 'PHASE18C_SHOULD_FAIL',
})
await depotDkr2.auth.signOut()

const admin2 = createClient(url, anon)
await signIn(admin2, 'admin@vhm-pos.internal', adminPw)
const adminRestock = await rpc(admin2, 'restock_product', {
  p_product_id: PROD_COLA_DKR,
  p_unit_level: 0,
  p_quantity_in_unit: 1,
  p_note: 'PHASE18C_CLOSURE_ADMIN_OK',
})
const adminAdjust = await rpc(admin2, 'adjust_inventory', {
  p_product_id: PROD_COLA_DKR,
  p_adjustment_type: 'COUNT_CORRECTION',
  p_quantity_pieces: -1,
  p_reason: 'PHASE18C_CLOSURE_REVERT',
})

report.rpc_security = {
  depot_restock: depotRestock.err?.code ?? 'OK',
  depot_adjust: depotAdjust.err?.code ?? 'OK',
  admin_restock: adminRestock.err?.code ?? 'OK',
  admin_adjust: adminAdjust.err?.code ?? 'OK',
}

// ─── Two-depot isolation ─────────────────────────────────────────
const adminSaleAbj = await rpc(admin2, 'complete_sale', {
  p_depot_id: DEPOT_ABJ,
  p_cart_items: [{ product_id: PROD_COLA_ABJ, unit_level: 0, quantity_in_unit: 1 }],
  p_amount_tendered_cfa: 500,
  p_customer_id: null,
  p_idempotency_key: randomUUID(),
})

let abjSaleId = adminSaleAbj.data?.sale_id ?? null
report._closure_sale_abj = adminSaleAbj.data?.receipt_number ?? null

const dkrClient = createClient(url, anon)
await signIn(dkrClient, 'depot@vhm-pos.internal', depotDkrPw)
const { data: dkrSeesAbj } = abjSaleId
  ? await dkrClient.from('sales').select('id').eq('id', abjSaleId).maybeSingle()
  : { data: null }
const dkrReleaseAbj = abjSaleId
  ? await rpc(dkrClient, 'release_sale_fulfillment', { p_sale_id: abjSaleId })
  : { err: { code: 'SKIP' } }
const dkrClaimAbj = await rpc(dkrClient, 'claim_print_jobs', {
  p_destination: 'depot',
  p_depot_id: DEPOT_ABJ,
  p_agent_id: 'qa-dkr-agent',
  p_limit: 1,
})
const { count: dkrSaleCount } = await dkrClient
  .from('sales')
  .select('id', { count: 'exact', head: true })
  .eq('depot_id', DEPOT_DKR)
await dkrClient.auth.signOut()

const abjClient = createClient(url, anon)
await signIn(abjClient, abjStaff.email, abjStaff.password)
const { count: abjSaleCount } = await abjClient
  .from('sales')
  .select('id', { count: 'exact', head: true })
  .eq('depot_id', DEPOT_ABJ)

const closureDkrSaleId = report.release_integrity?.sale_id
const { data: abjSeesDkr } = closureDkrSaleId
  ? await abjClient.from('sales').select('id').eq('id', closureDkrSaleId).maybeSingle()
  : { data: null }
const abjReleaseDkr = closureDkrSaleId
  ? await rpc(abjClient, 'release_sale_fulfillment', { p_sale_id: closureDkrSaleId })
  : { err: { code: 'SKIP' } }
const abjClaimDkr = await rpc(abjClient, 'claim_print_jobs', {
  p_destination: 'depot',
  p_depot_id: DEPOT_DKR,
  p_agent_id: 'qa-abj-agent',
  p_limit: 1,
})

report.depot_isolation = {
  abj_staff: abjStaff.email,
  abj_sale_id: abjSaleId,
  dkr_cannot_see_abj_sale: !dkrSeesAbj,
  dkr_release_abj: dkrReleaseAbj.err?.code ?? 'OK',
  dkr_claim_abj_jobs: dkrClaimAbj.err?.code ?? 'OK',
  abj_cannot_see_dkr_closure_sale: !abjSeesDkr,
  abj_release_dkr: abjReleaseDkr.err?.code ?? 'OK',
  abj_claim_dkr_jobs: abjClaimDkr.err?.code ?? 'OK',
  dkr_visible_sales_count: dkrSaleCount,
  abj_visible_sales_count: abjSaleCount,
}

console.log(JSON.stringify(report, null, 2))
