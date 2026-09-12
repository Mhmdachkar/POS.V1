/**
 * VHM POS — Edge Function: create-staff
 *
 * Creates a new staff member (admin-only operation).
 *
 * WHAT THIS FUNCTION DOES:
 *   1. Verifies the caller is an active admin (from DB, not JWT claims).
 *   2. Validates the input payload.
 *   3. Creates the Supabase Auth user using the service-role Admin API.
 *      The synthetic email is {username}@vhm-pos.internal.
 *   4. Sets app_metadata on the Auth user (role, depot_id) for RLS
 *      query performance — but these claims are NEVER treated as
 *      authoritative; the staff table is always the source of truth.
 *   5. Inserts into the public.staff table.
 *   6. If either step fails, attempts to clean up the partial state.
 *
 * SECURITY:
 *   - Requires 'admin' role (enforced by requireAuth).
 *   - Uses service-role key (server-side only — never in frontend code).
 *   - Admin cannot escalate: they cannot create another 'admin' unless
 *     explicitly permitted. (For now, admin CAN create other admins —
 *     adjust the role allowlist below if that must be restricted.)
 *   - Depot assignment is validated: depot must exist and be active.
 *   - Password is set by the admin; staff should change it on first login
 *     (future: force-change-on-first-login via Edge Function middleware).
 */

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireAuth, createAdminClient } from '../_shared/auth-guard.ts'

// Allowed roles a new staff member can be assigned
const ALLOWED_ROLES = ['cashier', 'depot_staff', 'admin'] as const
type CreatableRole = typeof ALLOWED_ROLES[number]

interface CreateStaffPayload {
  username:   string
  full_name:  string
  role:       CreatableRole
  depot_id:   string | null
  password:   string
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  const adminClient = createAdminClient()

  // ── 1. Verify caller is an active admin ──────────────────────
  const authResult = await requireAuth(req, ['admin'], adminClient)
  if ('status' in authResult) {
    return jsonResponse({ error: authResult.message, code: authResult.code }, authResult.status)
  }

  // ── 2. Parse and validate payload ────────────────────────────
  let body: CreateStaffPayload
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400)
  }

  const { username, full_name, role, depot_id, password } = body

  if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(username)) {
    return jsonResponse({ error: 'username must be alphanumeric (dots, hyphens, underscores allowed).' }, 400)
  }

  if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
    return jsonResponse({ error: 'full_name must be at least 2 characters.' }, 400)
  }

  if (!ALLOWED_ROLES.includes(role as CreatableRole)) {
    return jsonResponse({ error: `role must be one of: ${ALLOWED_ROLES.join(', ')}.` }, 400)
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return jsonResponse({ error: 'password must be at least 8 characters.' }, 400)
  }

  // Non-admin roles MUST have a depot_id
  if (role !== 'admin' && !depot_id) {
    return jsonResponse({ error: `depot_id is required for role '${role}'.` }, 400)
  }

  // Admin role MUST NOT have a depot_id
  if (role === 'admin' && depot_id) {
    return jsonResponse({ error: 'Admins must not have a depot_id.' }, 400)
  }

  // ── 3. Validate depot exists and is active ───────────────────
  if (depot_id) {
    const { data: depot, error: depotError } = await adminClient
      .from('depots')
      .select('id, is_active')
      .eq('id', depot_id)
      .single()

    if (depotError || !depot) {
      return jsonResponse({ error: 'depot_id does not reference a valid depot.' }, 400)
    }

    if (!depot.is_active) {
      return jsonResponse({ error: 'Cannot assign staff to an inactive depot.' }, 400)
    }
  }

  // ── 4. Check username uniqueness ─────────────────────────────
  const { data: existing } = await adminClient
    .from('staff')
    .select('id')
    .eq('username', username.toLowerCase())
    .single()

  if (existing) {
    return jsonResponse({ error: 'Username is already taken.' }, 409)
  }

  // ── 5. Create Supabase Auth user ─────────────────────────────
  const syntheticEmail = `${username.toLowerCase()}@vhm-pos.internal`

  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true, // auto-confirm — no email flow needed
    app_metadata: {
      role,
      depot_id: depot_id ?? null,
      // NOTE: These claims are for RLS query performance ONLY.
      // Edge Functions ALWAYS re-verify from the staff table.
    },
  })

  if (authError || !authData.user) {
    return jsonResponse({
      error: 'Failed to create authentication account.',
      detail: authError?.message,
    }, 500)
  }

  const newUserId = authData.user.id

  // ── 6. Insert into public.staff ──────────────────────────────
  const { data: staffRecord, error: staffError } = await adminClient
    .from('staff')
    .insert({
      id:        newUserId,
      username:  username.toLowerCase(),
      full_name: full_name.trim(),
      role,
      depot_id:  depot_id ?? null,
      is_active: true,
    })
    .select()
    .single()

  if (staffError || !staffRecord) {
    // Rollback: delete the Auth user we just created
    await adminClient.auth.admin.deleteUser(newUserId)
    return jsonResponse({
      error: 'Failed to create staff record. Auth user rolled back.',
      detail: staffError?.message,
    }, 500)
  }

  return jsonResponse({
    success: true,
    staff: {
      id:        staffRecord.id,
      username:  staffRecord.username,
      full_name: staffRecord.full_name,
      role:      staffRecord.role,
      depot_id:  staffRecord.depot_id,
      is_active: staffRecord.is_active,
      created_at: staffRecord.created_at,
    },
  }, 201)
})
