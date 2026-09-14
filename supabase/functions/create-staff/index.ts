/**
 * VHM POS — Edge Function: create-staff
 *
 * 1. Require active admin (DB staff row).
 * 2. Create Auth user (service role). Synthetic email {username}@vhm-pos.internal.
 * 3. Insert staff via JWT RPC admin_insert_staff (audit + last-admin lock + matrix).
 * 4. On insert failure only: deleteUser rollback.
 */

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireAuth, createAdminClient } from '../_shared/auth-guard.ts'
import { errorResponse } from '../_shared/errors.ts'
import { callerRpc, requireAdminResponse } from '../_shared/staffRpc.ts'

const ALLOWED_ROLES = ['cashier', 'depot_staff', 'admin'] as const
type CreatableRole = typeof ALLOWED_ROLES[number]

interface CreateStaffPayload {
  username: string
  full_name: string
  role: CreatableRole
  depot_id: string | null
  password: string
}

Deno.serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return errorResponse('INVALID_INPUT', 'Method not allowed.', 405)
  }

  const adminClient = createAdminClient()
  const authResult = await requireAuth(req, ['admin'], adminClient)
  const denied = requireAdminResponse(authResult)
  if (denied) return denied

  let body: CreateStaffPayload
  try {
    body = await req.json()
  } catch {
    return errorResponse('INVALID_INPUT', 'Invalid JSON body.')
  }

  const { username, full_name, role, depot_id, password } = body

  if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(username)) {
    return errorResponse('INVALID_INPUT', 'username must be alphanumeric (dots, hyphens, underscores allowed).', 400, {
      field: 'username',
    })
  }
  if (!full_name || typeof full_name !== 'string' || full_name.trim().length < 2) {
    return errorResponse('INVALID_INPUT', 'full_name must be at least 2 characters.', 400, { field: 'full_name' })
  }
  if (!ALLOWED_ROLES.includes(role as CreatableRole)) {
    return errorResponse('INVALID_INPUT', `role must be one of: ${ALLOWED_ROLES.join(', ')}.`, 400, { field: 'role' })
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return errorResponse('INVALID_INPUT', 'password must be at least 8 characters.', 400, { field: 'password' })
  }
  if (role !== 'admin' && !depot_id) {
    return errorResponse('INVALID_DEPOT', `depot_id is required for role '${role}'.`)
  }
  if (role === 'admin' && depot_id) {
    return errorResponse('INVALID_DEPOT', 'Admins must not have a depot_id.')
  }

  const syntheticEmail = `${username.toLowerCase()}@vhm-pos.internal`
  const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
    email: syntheticEmail,
    password,
    email_confirm: true,
    app_metadata: {
      role,
      depot_id: depot_id ?? null,
    },
  })

  if (authError || !authData.user) {
    const taken = /already|exists|registered/i.test(authError?.message ?? '')
    return errorResponse(
      taken ? 'USERNAME_TAKEN' : 'UNKNOWN',
      taken ? 'That username is already taken.' : 'Failed to create authentication account.',
      taken ? 409 : 500,
    )
  }

  const newUserId = authData.user.id
  const inserted = await callerRpc(req, 'admin_insert_staff', {
    p_staff_id: newUserId,
    p_username: username,
    p_full_name: full_name,
    p_role: role,
    p_depot_id: depot_id ?? null,
  })

  if (inserted.errorResponse) {
    await adminClient.auth.admin.deleteUser(newUserId)
    return inserted.errorResponse
  }

  return jsonResponse({ success: true, staff: inserted.data }, 201)
})
