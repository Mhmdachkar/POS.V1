/**
 * Staff Auth ban/unban convergence.
 *
 * DB `staff.is_active` is the only source of truth.
 * Never write staff from this module. Never delete Auth users here.
 *
 * Mirrored from src/lib/staffAuthConverge.ts — keep the two files identical.
 */

export type AuthBanState = 'banned' | 'unbanned'

export function desiredAuthFromActive(isActive: boolean): AuthBanState {
  return isActive ? 'unbanned' : 'banned'
}

export function intentAuthState(intendedActive: boolean): AuthBanState {
  return intendedActive ? 'unbanned' : 'banned'
}

export function isAuthBannedFromTimestamp(
  bannedUntil: string | null | undefined,
  now = Date.now(),
): boolean {
  if (!bannedUntil) return false
  const t = Date.parse(bannedUntil)
  if (Number.isNaN(t)) return false
  return t > now
}

export interface StaffAuthSnapshot {
  id: string
  is_active: boolean
  deactivated_at: string | null
  role: string
  depot_id: string | null
  username?: string
  full_name?: string
}

export interface StaffAuthConvergeDeps {
  applyAuth: (desired: AuthBanState) => Promise<boolean>
  readStaff: () => Promise<StaffAuthSnapshot | null>
  readAuthState: () => Promise<AuthBanState | 'unknown'>
  auditReconcile: (details: Record<string, unknown>) => Promise<void>
}

export type StaffAuthConvergeOk = {
  ok: true
  applied: boolean
  reconciled: boolean
  staff: StaffAuthSnapshot
}

export type StaffAuthConvergeFail = {
  ok: false
  code: 'AUTH_SYNC_FAILED'
}

export type StaffAuthConvergeResult = StaffAuthConvergeOk | StaffAuthConvergeFail

/**
 * Shared tail after deactivate and reactivate JWT RPCs.
 *
 * 1. Caller has already written DB.
 * 2. Apply this call’s Auth intent, then stop trusting intent.
 * 3. Re-read staff.is_active and Auth ban state.
 * 4. If they already match, return the current snapshot.
 * 5. Otherwise one reconcile Auth call to the *current* desired state.
 * 6. Re-read both. Match → success (applied if DB still matches intent).
 * 7. Else AUTH_SYNC_FAILED. No staff UPDATE.
 */
export async function runStaffAuthConverge(
  intendedActive: boolean,
  deps: StaffAuthConvergeDeps,
): Promise<StaffAuthConvergeResult> {
  const previousIntent = intentAuthState(intendedActive)

  await deps.applyAuth(previousIntent)

  const row1 = await deps.readStaff()
  if (!row1) return { ok: false, code: 'AUTH_SYNC_FAILED' }

  const desired1 = desiredAuthFromActive(row1.is_active)
  const auth1 = await deps.readAuthState()

  if (auth1 === desired1) {
    return {
      ok: true,
      applied: row1.is_active === intendedActive,
      reconciled: false,
      staff: row1,
    }
  }

  const reconcileOk = await deps.applyAuth(desired1)
  await deps.auditReconcile({
    reason: 'auth_did_not_match_current_is_active',
    is_active: row1.is_active,
    previous_intent: previousIntent,
    desired: desired1,
    auth_apply_ok: reconcileOk,
  })

  const row2 = await deps.readStaff()
  if (!row2) return { ok: false, code: 'AUTH_SYNC_FAILED' }

  const desired2 = desiredAuthFromActive(row2.is_active)
  const auth2 = await deps.readAuthState()

  if (auth2 === desired2) {
    return {
      ok: true,
      applied: row2.is_active === intendedActive,
      reconciled: true,
      staff: row2,
    }
  }

  return { ok: false, code: 'AUTH_SYNC_FAILED' }
}
