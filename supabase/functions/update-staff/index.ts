/**
 * VHM POS — Edge Function: update-staff
 *
 * JWT RPC writes staff (matrix, last-admin, audit).
 * app_metadata sync is non-fatal.
 */

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireAuth, createAdminClient } from '../_shared/auth-guard.ts'
import { errorResponse } from '../_shared/errors.ts'
import { callerRpc, requireAdminResponse } from '../_shared/staffRpc.ts'

interface UpdateStaffPayload {
  staff_id: string
  full_name: string
  role: 'admin' | 'cashier' | 'depot_staff'
  depot_id: string | null
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

  let body: UpdateStaffPayload
  try {
    body = await req.json()
  } catch {
    return errorResponse('INVALID_INPUT', 'Invalid JSON body.')
  }

  const { staff_id, full_name, role, depot_id } = body
  if (!staff_id || typeof staff_id !== 'string') {
    return errorResponse('INVALID_INPUT', 'staff_id is required.', 400, { field: 'staff_id' })
  }
  if (!full_name || typeof full_name !== 'string') {
    return errorResponse('INVALID_INPUT', 'full_name is required.', 400, { field: 'full_name' })
  }
  if (!role) {
    return errorResponse('INVALID_INPUT', 'role is required.', 400, { field: 'role' })
  }

  const updated = await callerRpc(req, 'admin_update_staff_row', {
    p_staff_id: staff_id,
    p_full_name: full_name,
    p_role: role,
    p_depot_id: depot_id ?? null,
  })
  if (updated.errorResponse) return updated.errorResponse

  const { error: metaError } = await adminClient.auth.admin.updateUserById(staff_id, {
    app_metadata: {
      role: updated.data?.role,
      depot_id: updated.data?.depot_id ?? null,
    },
  })
  if (metaError) {
    console.warn('[update-staff] Failed to sync app_metadata:', metaError.message)
  }

  return jsonResponse({
    success: true,
    applied: true,
    reconciled: false,
    staff: updated.data,
  })
})
