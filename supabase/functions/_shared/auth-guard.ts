/**
 * VHM POS — Edge Function Shared Auth Guard
 *
 * Verifies that the caller of an Edge Function is an active staff
 * member with the required role. Uses the service-role admin client
 * to re-read the authoritative staff record from the database.
 *
 * SECURITY MODEL:
 *   - The service-role key is ONLY available in Edge Functions via
 *     Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'). It is never in
 *     VITE_* environment variables or bundled in the frontend.
 *   - JWT claims (app_metadata) are NOT trusted for authorization.
 *     The authoritative source is always the staff table.
 *   - A valid JWT is required to identify the caller, but the staff
 *     record is always re-read from the DB to verify is_active, role,
 *     and depot_id.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export type StaffRole = 'admin' | 'cashier' | 'depot_staff'

export interface AuthorizedStaff {
  id: string
  role: StaffRole
  depot_id: string | null
  full_name: string
  is_active: true
}

export interface AuthError {
  status: 401 | 403
  message: string
  code:
    | 'no_authorization_header'
    | 'invalid_token'
    | 'staff_not_found'
    | 'staff_deactivated'
    | 'insufficient_role'
}

// ─────────────────────────────────────────────────────────────────
// Admin Supabase client factory
// ─────────────────────────────────────────────────────────────────

/**
 * Creates a Supabase client using the service-role key.
 * Bypasses RLS — use ONLY for server-side trusted operations.
 * NEVER expose this client or its key to the frontend.
 */
export function createAdminClient(): SupabaseClient {
  const url    = Deno.env.get('SUPABASE_URL')!
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  if (!url || !secret) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in Edge Function environment.')
  }

  return createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

/**
 * Creates a Supabase client scoped to the calling user's JWT.
 * Subject to RLS — used only to identify/verify the caller.
 */
export function createCallerClient(req: Request): SupabaseClient {
  const url     = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!

  return createClient(url, anonKey, {
    global: {
      headers: { Authorization: req.headers.get('Authorization') ?? '' },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

// ─────────────────────────────────────────────────────────────────
// Auth guard
// ─────────────────────────────────────────────────────────────────

/**
 * requireAuth — verifies that the caller is an active staff member
 * with at least one of the required roles.
 *
 * Returns the verified AuthorizedStaff on success.
 * Returns an AuthError descriptor on failure (caller must reject).
 *
 * Usage:
 *   const result = await requireAuth(req, ['admin'])
 *   if ('status' in result) {
 *     return jsonResponse({ error: result.message }, result.status)
 *   }
 *   const { caller } = result  // AuthorizedStaff
 *
 * @param req       The incoming Edge Function request
 * @param roles     Allowed roles (empty array = any active staff)
 * @param adminClient Optional pre-created admin client (avoids double creation)
 */
export async function requireAuth(
  req: Request,
  roles: StaffRole[] = [],
  adminClient?: SupabaseClient,
): Promise<{ caller: AuthorizedStaff } | AuthError> {
  // 1. Extract Bearer JWT from Authorization header
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { status: 401, message: 'No authorization header.', code: 'no_authorization_header' }
  }

  const jwt = authHeader.replace('Bearer ', '').trim()

  // 2. Verify JWT using admin client (getUser validates the token signature)
  const admin = adminClient ?? createAdminClient()
  const { data: { user }, error: userError } = await admin.auth.getUser(jwt)

  if (userError || !user) {
    return { status: 401, message: 'Invalid or expired token.', code: 'invalid_token' }
  }

  // 3. Re-read authoritative staff record from DB (never trust JWT claims)
  const { data: staff, error: staffError } = await admin
    .from('staff')
    .select('id, role, depot_id, full_name, is_active')
    .eq('id', user.id)
    .single()

  if (staffError || !staff) {
    return { status: 403, message: 'Staff record not found.', code: 'staff_not_found' }
  }

  // 4. Verify staff is active
  if (!staff.is_active) {
    return { status: 403, message: 'Account is deactivated.', code: 'staff_deactivated' }
  }

  // 5. Verify role if required
  if (roles.length > 0 && !roles.includes(staff.role as StaffRole)) {
    return {
      status: 403,
      message: `Access denied. Required role: ${roles.join(' or ')}. Your role: ${staff.role}.`,
      code: 'insufficient_role',
    }
  }

  return { caller: staff as AuthorizedStaff }
}
