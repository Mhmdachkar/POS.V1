import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import type { AuthBanState, StaffAuthSnapshot } from './staffAuthConverge.ts'
import { isAuthBannedFromTimestamp } from './staffAuthConverge.ts'

export const AUTH_BAN_DURATION = '876000h'

export async function applyAuthBanState(
  admin: SupabaseClient,
  staffId: string,
  desired: AuthBanState,
): Promise<boolean> {
  try {
    const { error } = await admin.auth.admin.updateUserById(staffId, {
      ban_duration: desired === 'banned' ? AUTH_BAN_DURATION : 'none',
    })
    return !error
  } catch {
    return false
  }
}

export async function readAuthBanState(
  admin: SupabaseClient,
  staffId: string,
): Promise<AuthBanState | 'unknown'> {
  const { data, error } = await admin.auth.admin.getUserById(staffId)
  if (error || !data?.user) return 'unknown'
  const bannedUntil =
    (data.user as { banned_until?: string | null }).banned_until ?? null
  return isAuthBannedFromTimestamp(bannedUntil) ? 'banned' : 'unbanned'
}

export function snapshotFromRpc(row: Record<string, unknown> | null): StaffAuthSnapshot | null {
  if (!row || typeof row.id !== 'string') return null
  return {
    id: row.id,
    is_active: Boolean(row.is_active),
    deactivated_at: (row.deactivated_at as string | null) ?? null,
    role: String(row.role ?? ''),
    depot_id: (row.depot_id as string | null) ?? null,
    username: typeof row.username === 'string' ? row.username : undefined,
    full_name: typeof row.full_name === 'string' ? row.full_name : undefined,
  }
}
