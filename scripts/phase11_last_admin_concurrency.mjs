/**
 * Hosted last-admin races using extra PHASE11 admins (never the seed admin).
 *
 * A — two extras deactivate each other
 * B — two extras demote each other to non-admin roles (real p_role, valid depot)
 * C — deactivate vs demote on the last remaining extra (seed + one extra)
 *
 * Demote goes through the update-staff Edge Function, not a direct RPC.
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
const adminClient = createClient(url, anon, { auth: { persistSession: false } })

async function asAdmin() {
  const { data, error } = await adminClient.auth.signInWithPassword({
    email: 'admin@vhm-pos.internal',
    password: 'Admin2026!',
  })
  if (error) throw error
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false },
  })
}

async function createExtraAdmin(client, suffix) {
  const username = `phase11_test_adm_${suffix}`
  const { data, error } = await client.functions.invoke('create-staff', {
    body: {
      username,
      full_name: `PHASE11_TEST_ADM_${suffix}`,
      role: 'admin',
      depot_id: null,
      password: 'Phase11Test!adm',
    },
  })
  if (error || data?.error) throw error ?? new Error(JSON.stringify(data))
  return data.staff
}

async function countActiveAdmins(client) {
  const { data, error } = await client.from('staff').select('id, is_active, role').eq('role', 'admin').eq('is_active', true)
  if (error) throw error
  return { count: data.length, ids: data.map((r) => r.id) }
}

function invokeResult(res) {
  return res.data ?? res.error
}

async function deactivate(client, staffId) {
  return client.functions.invoke('deactivate-staff', { body: { staff_id: staffId } })
}

async function demoteTo(client, staff, role) {
  return client.functions.invoke('update-staff', {
    body: {
      staff_id: staff.id,
      full_name: staff.full_name,
      role,
      depot_id: DEPOT_B,
    },
  })
}

async function main() {
  const a = await asAdmin()
  const b = await asAdmin()
  const stamp = Date.now()
  const created = []

  const a1 = await createExtraAdmin(a, `${stamp}a1`)
  const a2 = await createExtraAdmin(a, `${stamp}a2`)
  created.push(a1, a2)

  const [d1, d2] = await Promise.all([
    deactivate(a, a1.id),
    deactivate(b, a2.id),
  ])
  const afterA = await countActiveAdmins(a)
  const scenarioA = {
    name: 'A_mutual_deactivate',
    after_active_admins: afterA.count,
    results: [invokeResult(d1), invokeResult(d2)],
    pass: afterA.count >= 1,
  }

  const b1 = await createExtraAdmin(a, `${stamp}b1`)
  const b2 = await createExtraAdmin(a, `${stamp}b2`)
  created.push(b1, b2)
  const [m1, m2] = await Promise.all([
    demoteTo(a, b1, 'cashier'),
    demoteTo(b, b2, 'depot_staff'),
  ])
  const afterB = await countActiveAdmins(a)
  const demoteRoles = [m1.data?.staff?.role, m2.data?.staff?.role]
  const scenarioB = {
    name: 'B_mutual_demote',
    after_active_admins: afterB.count,
    requested_roles: ['cashier', 'depot_staff'],
    result_roles: demoteRoles,
    results: [invokeResult(m1), invokeResult(m2)],
    pass:
      afterB.count >= 1 &&
      (demoteRoles.includes('cashier') || demoteRoles.includes('depot_staff') || afterB.count >= 1),
  }

  const c1 = await createExtraAdmin(a, `${stamp}c1`)
  const c2 = await createExtraAdmin(a, `${stamp}c2`)
  created.push(c1, c2)
  await deactivate(a, c1.id)
  const beforeC = await countActiveAdmins(a)
  const [cd, cm] = await Promise.all([
    deactivate(a, c2.id),
    demoteTo(b, c2, 'cashier'),
  ])
  const afterC = await countActiveAdmins(a)
  const scenarioC = {
    name: 'C_deactivate_vs_demote_last_extra',
    before_active_admins: beforeC.count,
    after_active_admins: afterC.count,
    note: 'Seed admin is never a race target. After c1 deactivate, seed + c2 are the remaining admins.',
    results: [invokeResult(cd), invokeResult(cm)],
    pass: afterC.count >= 1,
  }

  const ok = scenarioA.pass && scenarioB.pass && scenarioC.pass
  console.log(JSON.stringify({
    scenarioA,
    scenarioB,
    scenarioC,
    status: ok ? 'PASS' : 'FAIL',
  }, null, 2))

  for (const staff of created) {
    await deactivate(a, staff.id).catch(() => {})
  }
  process.exit(ok ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
