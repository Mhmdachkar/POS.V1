/**
 * Hosted Auth A/B: concurrent deactivate vs reactivate on the same
 * non-last-admin TEST staff. Requires two admin JWTs.
 *
 * Usage (from repo root, with VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY):
 *   node scripts/phase11_hosted_auth_ab.mjs
 *
 * Creates PHASE11_TEST staff via create-staff, races deactivate/reactivate,
 * asserts DB is_active ⇔ Auth banned/unbanned, then deactivates the fixture.
 * SQL cleanup (phase11_admin_integration_test.sql) deletes leftover Auth users.
 *
 * Hosted C/D are SKIP — cannot inject Auth Admin failure/timing.
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
if (!url || !anon) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY')
  process.exit(1)
}

const adminClient = createClient(url, anon, { auth: { persistSession: false } })

async function signIn(username, password) {
  const { data, error } = await adminClient.auth.signInWithPassword({
    email: `${username}@vhm-pos.internal`,
    password,
  })
  if (error || !data.session) throw error ?? new Error('sign-in failed')
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${data.session.access_token}` } },
    auth: { persistSession: false },
  })
}

function isBanned(user) {
  const until = user?.banned_until
  if (!until) return false
  return Date.parse(until) > Date.now()
}

async function main() {
  const admin = await signIn('admin', 'Admin2026!')
  const stamp = Date.now()
  const username = `phase11_test_ab_${stamp}`
  const created = await admin.functions.invoke('create-staff', {
    body: {
      username,
      full_name: `PHASE11_TEST_AB_${stamp}`,
      role: 'depot_staff',
      depot_id: '00000000-0000-0000-0001-000000000002',
      password: 'Phase11Test!ab',
    },
  })
  if (created.error || created.data?.error) {
    console.error('create-staff failed', created.error ?? created.data)
    process.exit(1)
  }
  const staffId = created.data.staff.id
  const admin2 = await signIn('admin', 'Admin2026!')

  const [deact, react] = await Promise.all([
    admin.functions.invoke('deactivate-staff', { body: { staff_id: staffId } }),
    admin2.functions.invoke('reactivate-staff', { body: { staff_id: staffId } }),
  ])

  const { data: row, error: rowErr } = await admin
    .from('staff')
    .select('id, is_active')
    .eq('id', staffId)
    .single()
  if (rowErr) throw rowErr

  const { data: authUser } = await admin.rpc('admin_get_staff_row', { p_staff_id: staffId })
  const { data: users } = await admin.auth.admin?.getUserById?.(staffId) ?? { data: null }
  // Auth ban bit is not readable with anon JWT. Re-read via Edge result + login probe.
  const probe = await adminClient.auth.signInWithPassword({
    email: `${username}@vhm-pos.internal`,
    password: 'Phase11Test!ab',
  })
  const canLogin = !probe.error
  const matches = row.is_active === canLogin

  console.log(JSON.stringify({
    deactivate: deact.data ?? deact.error,
    reactivate: react.data ?? react.error,
    db_is_active: row.is_active,
    can_login: canLogin,
    invariant: matches ? 'PASS' : 'FAIL',
    note_c: 'SKIP cannot inject Auth Admin success-after-flip',
    note_d: 'SKIP cannot inject Auth Admin failure',
    authUserPresent: Boolean(authUser),
    usersProbe: Boolean(users),
  }, null, 2))

  // Best-effort: align to inactive so leftover is harmless until SQL cleanup
  await admin.functions.invoke('deactivate-staff', { body: { staff_id: staffId } })

  process.exit(matches ? 0 : 1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
