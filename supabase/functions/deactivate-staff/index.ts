/**
 * VHM POS — Edge Function: deactivate-staff
 *
 * Deactivates a staff member (admin-only operation).
 *
 * CONFIRMED DEACTIVATION MODEL:
 *   - Sets staff.is_active = false and staff.deactivated_at = now().
 *   - Bans the Supabase Auth user (prevents future logins without
 *     deleting the account or historical references).
 *   - DOES NOT call supabase.auth.admin.deleteUser() — ever.
 *   - Preserves all historical records (sales, payments, shifts, etc.)
 *   - RLS SECURITY DEFINER functions check is_active in real-time,
 *     so the deactivated user's existing JWT will return 0 rows on
 *     any protected query within seconds of deactivation.
 *   - Frontend periodic re-validation (every 5 min + focus) will
 *     detect the deactivated state and show DeactivatedPage.
 *
 * SAFEGUARDS:
 *   - Admin cannot deactivate themselves (prevents self-lockout).
 *   - A staff member who is already deactivated returns 200 (idempotent).
 */

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireAuth, createAdminClient } from '../_shared/auth-guard.ts'

interface DeactivateStaffPayload {
  staff_id: string
}

// Duration to ban the auth user (effectively permanent — 100 years)
// Using Supabase's ban_duration feature to prevent future sign-ins
// without deleting the auth account.
const BAN_DURATION = '876000h' // 100 years in hours

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
  const { caller } = authResult

  // ── 2. Parse payload ─────────────────────────────────────────
  let body: DeactivateStaffPayload
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400)
  }

  const { staff_id } = body

  if (!staff_id || typeof staff_id !== 'string') {
    return jsonResponse({ error: 'staff_id is required.' }, 400)
  }

  // ── 3. Self-lockout prevention ────────────────────────────────
  if (staff_id === caller.id) {
    return jsonResponse({ error: 'You cannot deactivate your own account.' }, 400)
  }

  // ── 4. Fetch target staff ─────────────────────────────────────
  const { data: target, error: fetchError } = await adminClient
    .from('staff')
    .select('id, username, full_name, role, is_active')
    .eq('id', staff_id)
    .single()

  if (fetchError || !target) {
    return jsonResponse({ error: 'Staff member not found.' }, 404)
  }

  // Idempotent: already deactivated
  if (!target.is_active) {
    return jsonResponse({
      success: true,
      message: 'Staff member was already deactivated.',
      staff_id,
    }, 200)
  }

  // ── 5. Update staff record ────────────────────────────────────
  const { error: updateError } = await adminClient
    .from('staff')
    .update({
      is_active:      false,
      deactivated_at: new Date().toISOString(),
    })
    .eq('id', staff_id)

  if (updateError) {
    return jsonResponse({
      error: 'Failed to deactivate staff record.',
      detail: updateError.message,
    }, 500)
  }

  // ── 6. Ban the Auth user (prevents future sign-ins) ──────────
  // This does NOT delete the account — it sets a ban_duration that
  // prevents new sign-ins. The account and all its data remain intact.
  const { error: banError } = await adminClient.auth.admin.updateUser(staff_id, {
    ban_duration: BAN_DURATION,
  })

  if (banError) {
    // Non-fatal: the staff record is already marked inactive.
    // RLS will block access. Log and continue.
    console.error('[deactivate-staff] Failed to ban auth user:', banError.message)
  }

  return jsonResponse({
    success: true,
    message: `Staff member '${target.username}' has been deactivated.`,
    staff_id,
    // Do NOT return the banned auth user object — it contains sensitive fields
  })
})
