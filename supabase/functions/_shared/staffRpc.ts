import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createCallerClient, createAdminClient } from './auth-guard.ts'
import { errorResponse, parseCallerRpcError, rpcErrorStatus } from './errors.ts'
import { applyAuthBanState, readAuthBanState, snapshotFromRpc } from './staffAuthApply.ts'
import { runStaffAuthConverge, type StaffAuthSnapshot } from './staffAuthConverge.ts'
import type { AuthBanState } from './staffAuthConverge.ts'

let cachedStaffRpcGate: string | null = null

export async function getStaffRpcGate(): Promise<string> {
  if (cachedStaffRpcGate) return cachedStaffRpcGate
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('admin_read_staff_rpc_gate')
  if (error || typeof data !== 'string' || data.length < 16) {
    throw new Error(error?.message ?? 'staff rpc gate unavailable')
  }
  cachedStaffRpcGate = data
  return cachedStaffRpcGate
}

export async function callerRpc(
  req: Request,
  fnName: string,
  params: Record<string, unknown>,
): Promise<{ data: Record<string, unknown> | null; errorResponse: Response | null }> {
  let gate: string
  try {
    gate = await getStaffRpcGate()
  } catch {
    return {
      data: null,
      errorResponse: errorResponse(
        'UNKNOWN',
        'Staff update is temporarily unavailable.',
        500,
      ),
    }
  }

  const caller = createCallerClient(req)
  const { data, error } = await caller.rpc(fnName, { ...params, p_staff_rpc_gate: gate })
  if (error) {
    const parsed = parseCallerRpcError(error)
    return {
      data: null,
      errorResponse: errorResponse(parsed.code, parsed.message, rpcErrorStatus(parsed.code), parsed.details),
    }
  }
  return { data: (data ?? null) as Record<string, unknown> | null, errorResponse: null }
}

export async function convergeStaffAuth(
  req: Request,
  staffId: string,
  intendedActive: boolean,
): Promise<{ result?: { applied: boolean; reconciled: boolean; staff: StaffAuthSnapshot }; error?: Response }> {
  const admin = createAdminClient()
  const caller = createCallerClient(req)

  let gate: string
  try {
    gate = await getStaffRpcGate()
  } catch {
    return {
      error: errorResponse(
        'AUTH_SYNC_FAILED',
        'The account was updated but login access could not be synced. Retry from the current staff status.',
        409,
      ),
    }
  }

  const converge = await runStaffAuthConverge(intendedActive, {
    applyAuth: (desired: AuthBanState) => applyAuthBanState(admin, staffId, desired),
    readStaff: async () => {
      const { data, error } = await caller.rpc('admin_get_staff_row', { p_staff_id: staffId })
      if (error) return null
      return snapshotFromRpc(data as Record<string, unknown>)
    },
    readAuthState: () => readAuthBanState(admin, staffId),
    auditReconcile: async (details) => {
      await caller.rpc('admin_audit_staff_auth_reconcile', {
        p_staff_id: staffId,
        p_details: details,
        p_staff_rpc_gate: gate,
      })
    },
  })

  if (!converge.ok) {
    return {
      error: errorResponse(
        'AUTH_SYNC_FAILED',
        'The account was updated but login access could not be synced. Retry from the current staff status.',
        409,
      ),
    }
  }

  return { result: { applied: converge.applied, reconciled: converge.reconciled, staff: converge.staff } }
}

export function requireAdminResponse(
  authResult: { status: number; message: string; code: string } | { caller: unknown },
): Response | null {
  if ('status' in authResult) {
    return errorResponse('UNAUTHORIZED', authResult.message, authResult.status)
  }
  return null
}

export type { SupabaseClient }
