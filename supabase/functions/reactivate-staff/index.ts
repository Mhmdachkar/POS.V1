/**
 * VHM POS — Edge Function: reactivate-staff
 *
 * JWT RPC writes is_active=true (depot/slot checks, audit).
 * Then Auth unban + converge tail. Never write staff to undo.
 */

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireAuth, createAdminClient } from '../_shared/auth-guard.ts'
import { errorResponse } from '../_shared/errors.ts'
import { callerRpc, convergeStaffAuth, requireAdminResponse } from '../_shared/staffRpc.ts'

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

  let body: { staff_id?: string }
  try {
    body = await req.json()
  } catch {
    return errorResponse('INVALID_INPUT', 'Invalid JSON body.')
  }

  const staff_id = body.staff_id
  if (!staff_id || typeof staff_id !== 'string') {
    return errorResponse('INVALID_INPUT', 'staff_id is required.', 400, { field: 'staff_id' })
  }

  const written = await callerRpc(req, 'admin_reactivate_staff_row', { p_staff_id: staff_id })
  if (written.errorResponse) return written.errorResponse

  const converged = await convergeStaffAuth(req, staff_id, true)
  if (converged.error) return converged.error

  return jsonResponse({
    success: true,
    applied: converged.result!.applied,
    reconciled: converged.result!.reconciled,
    staff: converged.result!.staff,
  })
})
