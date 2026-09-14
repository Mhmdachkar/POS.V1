/**
 * Prove that an authenticated admin JWT cannot bypass Edge Auth
 * convergence by calling staff mutation RPCs directly.
 *
 * After 20260914000002, those RPCs require p_staff_rpc_gate which
 * only Edge can read (service_role-only admin_read_staff_rpc_gate).
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

const env = loadEnv()
const url = env.VITE_SUPABASE_URL
const anon = env.VITE_SUPABASE_ANON_KEY
const DEPOT_B = '00000000-0000-0000-0001-000000000002'

async function main() {
  const root = createClient(url, anon, { auth: { persistSession: false } })
  const { data: auth, error: signErr } = await root.auth.signInWithPassword({
    email: 'admin@vhm-pos.internal',
    password: 'Admin2026!',
  })
  if (signErr || !auth.session) throw signErr ?? new Error('admin sign-in failed')

  const admin = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } },
    auth: { persistSession: false },
  })

  const stamp = Date.now()
  const created = await admin.functions.invoke('create-staff', {
    body: {
      username: `phase11_test_bypass_${stamp}`,
      full_name: `PHASE11_TEST_BYPASS_${stamp}`,
      role: 'depot_staff',
      depot_id: DEPOT_B,
      password: 'Phase11Test!bypass',
    },
  })
  if (created.error || created.data?.error) {
    throw new Error(`create-staff failed ${JSON.stringify(created.error ?? created.data)}`)
  }
  const staffId = created.data.staff.id

  const noGateDeactivate = await admin.rpc('admin_deactivate_staff_row', {
    p_staff_id: staffId,
  })
  const noGateReactivate = await admin.rpc('admin_reactivate_staff_row', {
    p_staff_id: staffId,
  })
  const noGateUpdate = await admin.rpc('admin_update_staff_row', {
    p_staff_id: staffId,
    p_full_name: 'PHASE11_TEST_BYPASS_DIRECT',
    p_role: 'depot_staff',
    p_depot_id: DEPOT_B,
  })
  const noGateInsert = await admin.rpc('admin_insert_staff', {
    p_staff_id: '00000000-0000-0000-0000-000000000099',
    p_username: `phase11_test_bypass_ins_${stamp}`,
    p_full_name: 'PHASE11_TEST_BYPASS_INS',
    p_role: 'depot_staff',
    p_depot_id: DEPOT_B,
  })
  const fakeGate = await admin.rpc('admin_deactivate_staff_row', {
    p_staff_id: staffId,
    p_staff_rpc_gate: 'forged-client-token',
  })
  const readGate = await admin.rpc('admin_read_staff_rpc_gate')

  const { data: row } = await admin.from('staff').select('id, is_active').eq('id', staffId).single()
  const probe = await root.auth.signInWithPassword({
    email: `phase11_test_bypass_${stamp}@vhm-pos.internal`,
    password: 'Phase11Test!bypass',
  })

  const cashier = createClient(url, anon, { auth: { persistSession: false } })
  const { data: cashAuth, error: cashErr } = await cashier.auth.signInWithPassword({
    email: 'cashier@vhm-pos.internal',
    password: 'Cashier2026!',
  })
  if (cashErr) throw cashErr
  const cashClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${cashAuth.session.access_token}` } },
    auth: { persistSession: false },
  })
  const cashierDirect = await cashClient.rpc('admin_deactivate_staff_row', {
    p_staff_id: staffId,
    p_staff_rpc_gate: 'forged-client-token',
  })

  const edgeDeact = await admin.functions.invoke('deactivate-staff', { body: { staff_id: staffId } })
  const { data: afterDeact } = await admin.from('staff').select('is_active').eq('id', staffId).single()
  const probeBanned = await root.auth.signInWithPassword({
    email: `phase11_test_bypass_${stamp}@vhm-pos.internal`,
    password: 'Phase11Test!bypass',
  })
  const edgeReact = await admin.functions.invoke('reactivate-staff', { body: { staff_id: staffId } })
  const { data: afterReact } = await admin.from('staff').select('is_active').eq('id', staffId).single()
  const probeUnbanned = await root.auth.signInWithPassword({
    email: `phase11_test_bypass_${stamp}@vhm-pos.internal`,
    password: 'Phase11Test!bypass',
  })

  const directBlocked =
    Boolean(noGateDeactivate.error) &&
    Boolean(noGateReactivate.error) &&
    Boolean(noGateUpdate.error) &&
    Boolean(noGateInsert.error) &&
    Boolean(fakeGate.error) &&
    Boolean(readGate.error) &&
    Boolean(cashierDirect.error) &&
    row?.is_active === true

  const edgeOk =
    afterDeact?.is_active === false &&
    Boolean(probeBanned.error) &&
    afterReact?.is_active === true &&
    !probeUnbanned.error

  const ok = directBlocked && edgeOk
  console.log(JSON.stringify({
    direct_no_gate: {
      deactivate: noGateDeactivate.error?.message ?? noGateDeactivate.data,
      reactivate: noGateReactivate.error?.message ?? noGateReactivate.data,
      update: noGateUpdate.error?.message ?? noGateUpdate.data,
      insert: noGateInsert.error?.message ?? noGateInsert.data,
    },
    forged_gate: fakeGate.error?.message ?? fakeGate.data,
    client_cannot_read_gate: readGate.error?.message ?? readGate.data,
    cashier_direct: cashierDirect.error?.message ?? cashierDirect.data,
    db_after_direct_attempts_is_active: row?.is_active,
    can_login_after_direct_attempts: !probe.error,
    edge_deactivate: edgeDeact.data ?? edgeDeact.error,
    after_edge_deact_is_active: afterDeact?.is_active,
    can_login_after_edge_deact: !probeBanned.error,
    edge_reactivate: edgeReact.data ?? edgeReact.error,
    after_edge_react_is_active: afterReact?.is_active,
    can_login_after_edge_react: !probeUnbanned.error,
    status: ok ? 'PASS' : 'FAIL',
  }, null, 2))

  await admin.functions.invoke('deactivate-staff', { body: { staff_id: staffId } }).catch(() => {})
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
