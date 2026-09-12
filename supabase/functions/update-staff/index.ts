/**
 * VHM POS — Edge Function: update-staff
 *
 * Updates a staff member's role, depot, or name (admin-only).
 *
 * PROTECTED FIELDS (all require admin):
 *   - role:      triggers app_metadata update in Supabase Auth
 *   - depot_id:  triggers app_metadata update + unique constraint check
 *   - full_name: non-authorization field, admin can update
 *
 * PASSWORD CHANGE: handled separately by Supabase Auth directly
 * (staff can change their own password via supabase.auth.updateUser).
 * Admin can reset via the Supabase Dashboard or a separate RPC.
 *
 * SELF-EDIT PROTECTION:
 *   - Admin cannot change their own role (prevents self-demotion lock).
 *   - Admin cannot change their own depot_id (admins must have null depot).
 *
 * DB-LEVEL PROTECTION:
 *   - The prevent_staff_privilege_escalation trigger (migration 014)
 *     blocks any JWT-authenticated UPDATE on sensitive fields.
 *     This Edge Function uses service_role which bypasses that trigger's
 *     auth.uid() check, so it CAN update these fields legitimately.
 */

import { handleCors, jsonResponse } from '../_shared/cors.ts'
import { requireAuth, createAdminClient } from '../_shared/auth-guard.ts'

interface UpdateStaffPayload {
  staff_id:   string
  full_name?: string
  role?:      'admin' | 'cashier' | 'depot_staff'
  depot_id?:  string | null
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
  const { caller } = authResult

  // ── 2. Parse payload ─────────────────────────────────────────
  let body: UpdateStaffPayload
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400)
  }

  const { staff_id, full_name, role, depot_id } = body

  if (!staff_id || typeof staff_id !== 'string') {
    return jsonResponse({ error: 'staff_id is required.' }, 400)
  }

  // Nothing to update
  if (full_name === undefined && role === undefined && depot_id === undefined) {
    return jsonResponse({ error: 'No fields to update. Provide full_name, role, or depot_id.' }, 400)
  }

  // Self-protection
  if (staff_id === caller.id && (role !== undefined || depot_id !== undefined)) {
    return jsonResponse({
      error: 'Admins cannot change their own role or depot. Contact another admin.',
    }, 400)
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

  // ── 4. Validate new role/depot combination ────────────────────
  const newRole    = role     ?? target.role
  const newDepotId = depot_id !== undefined ? depot_id : target.depot_id

  if (newRole === 'admin' && newDepotId !== null) {
    return jsonResponse({ error: 'Admins must have depot_id = null.' }, 400)
  }

  if (newRole !== 'admin' && !newDepotId) {
    return jsonResponse({ error: `depot_id is required for role '${newRole}'.` }, 400)
  }

  if (newDepotId) {
    const { data: depot, error: depotError } = await adminClient
      .from('depots')
      .select('id, is_active')
      .eq('id', newDepotId)
      .single()

    if (depotError || !depot) {
      return jsonResponse({ error: 'Invalid depot_id.' }, 400)
    }

    if (!depot.is_active) {
      return jsonResponse({ error: 'Cannot assign staff to an inactive depot.' }, 400)
    }
  }

  // ── 5. Build staff update ─────────────────────────────────────
  const staffUpdate: Record<string, unknown> = {}
  if (full_name !== undefined) staffUpdate.full_name = full_name.trim()
  if (role !== undefined)      staffUpdate.role      = role
  if (depot_id !== undefined)  staffUpdate.depot_id  = depot_id ?? null

  const { data: updated, error: updateError } = await adminClient
    .from('staff')
    .update(staffUpdate)
    .eq('id', staff_id)
    .select()
    .single()

  if (updateError || !updated) {
    return jsonResponse({
      error: 'Failed to update staff record.',
      detail: updateError?.message,
    }, 500)
  }

  // ── 6. Sync app_metadata for RLS performance ──────────────────
  // Update JWT app_metadata so RLS helper functions (which still fall
  // back to the DB) get accurate claims on next token refresh.
  // This is NOT authoritative — DB is always the source of truth.
  if (role !== undefined || depot_id !== undefined) {
    const { error: metaError } = await adminClient.auth.admin.updateUser(staff_id, {
      app_metadata: {
        role: updated.role,
        depot_id: updated.depot_id ?? null,
      },
    })

    if (metaError) {
      // Non-fatal: DB is updated. Auth metadata will sync on next token refresh.
      console.warn('[update-staff] Failed to sync app_metadata:', metaError.message)
    }
  }

  return jsonResponse({
    success: true,
    staff: {
      id:        updated.id,
      username:  updated.username,
      full_name: updated.full_name,
      role:      updated.role,
      depot_id:  updated.depot_id,
      is_active: updated.is_active,
    },
  })
})
