/**
 * VHM POS — Edge Function: reactivate-staff
 *
 * Reactivates a previously deactivated staff member (admin-only).
 *
 * WHAT THIS FUNCTION DOES:
 *   1. Verifies the caller is an active admin.
 *   2. Checks the target staff member exists and is currently inactive.
 *   3. Sets staff.is_active = true, clears staff.deactivated_at.
 *   4. Removes the Supabase Auth ban (allows future sign-ins).
 *
 * IMPORTANT: If the target staff member's assigned depot no longer
 * exists or is inactive, reactivation is blocked until the admin
 * either assigns a different depot or reactivates the depot.
 */

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireAuth, createAdminClient } from '../_shared/auth-guard.ts'

interface ReactivateStaffPayload {
  staff_id: string
}

Deno.serve(async (req: Request) => {
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

  // ── 2. Parse payload ─────────────────────────────────────────
  let body: ReactivateStaffPayload
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400)
  }

  const { staff_id } = body

  if (!staff_id || typeof staff_id !== 'string') {
    return jsonResponse({ error: 'staff_id is required.' }, 400)
  }

  // ── 3. Fetch target staff ─────────────────────────────────────
  const { data: target, error: fetchError } = await adminClient
    .from('staff')
    .select('id, username, full_name, role, depot_id, is_active')
    .eq('id', staff_id)
    .single()

  if (fetchError || !target) {
    return jsonResponse({ error: 'Staff member not found.' }, 404)
  }

  // Idempotent: already active
  if (target.is_active) {
    return jsonResponse({
      success: true,
      message: 'Staff member is already active.',
      staff_id,
    }, 200)
  }

  // ── 4. Validate depot if assigned ────────────────────────────
  if (target.depot_id) {
    const { data: depot, error: depotError } = await adminClient
      .from('depots')
      .select('id, is_active, name')
      .eq('id', target.depot_id)
      .single()

    if (depotError || !depot) {
      return jsonResponse({
        error: 'The assigned depot no longer exists. Assign a valid depot before reactivating.',
      }, 400)
    }

    if (!depot.is_active) {
      return jsonResponse({
        error: `The assigned depot '${depot.name}' is inactive. Reactivate the depot or assign a different one first.`,
      }, 400)
    }
  }

  // ── 5. Update staff record ────────────────────────────────────
  const { error: updateError } = await adminClient
    .from('staff')
    .update({
      is_active:      true,
      deactivated_at: null,
    })
    .eq('id', staff_id)

  if (updateError) {
    return jsonResponse({
      error: 'Failed to reactivate staff record.',
      detail: updateError.message,
    }, 500)
  }

  // ── 6. Remove the Auth ban ────────────────────────────────────
  const { error: unbanError } = await adminClient.auth.admin.updateUser(staff_id, {
    ban_duration: 'none', // removes the ban
  })

  if (unbanError) {
    // Non-fatal: staff record is active, RLS will allow access.
    // But the auth ban remains, so they can't sign in until fixed.
    console.error('[reactivate-staff] Failed to remove auth ban:', unbanError.message)
    return jsonResponse({
      success: true,
      warning: 'Staff record reactivated but auth ban removal failed. Staff may not be able to sign in.',
      staff_id,
    })
  }

  return jsonResponse({
    success: true,
    message: `Staff member '${target.username}' has been reactivated.`,
    staff_id,
  })
})
