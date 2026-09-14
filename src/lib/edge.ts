/**
 * Typed wrappers for staff lifecycle Edge Functions.
 * Callers send the user JWT; service role never leaves the function.
 */

import { supabase } from '@/lib/supabase'
import { parseError, type VhmError } from '@/lib/errors'
import type {
  CreateStaffEdgePayload,
  CreateStaffEdgeResult,
  StaffLifecycleEdgeResult,
  UpdateStaffEdgePayload,
} from '@/types/rpc'

interface EdgeSuccess<T> { data: T; error: null }
interface EdgeFailure { data: null; error: VhmError }
export type EdgeResult<T> = EdgeSuccess<T> | EdgeFailure

type FunctionsInvokeOptions = NonNullable<Parameters<typeof supabase.functions.invoke>[1]>
type FunctionsInvokeBody = NonNullable<FunctionsInvokeOptions['body']>
type FunctionsInvokeJsonBody = Extract<FunctionsInvokeBody, Record<string, unknown>>

async function invokeEdge<T>(name: string, body: FunctionsInvokeJsonBody): Promise<EdgeResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke(name, { body })
    if (error) {
      let payload: unknown = error
      const ctx = (error as { context?: Response }).context
      if (ctx && typeof ctx.json === 'function') {
        try {
          payload = await ctx.json()
        } catch {
          payload = data ?? error
        }
      } else if (data) {
        payload = data
      }
      return { data: null, error: parseError(payload) }
    }
    if (data && typeof data === 'object' && data !== null && 'error' in data) {
      const envelope = data as { error?: { code?: string } }
      if (envelope.error?.code) {
        return { data: null, error: parseError(data) }
      }
    }
    return { data: data as T, error: null }
  } catch (err) {
    return { data: null, error: parseError(err) }
  }
}

export const edge = {
  createStaff: (payload: CreateStaffEdgePayload) =>
    invokeEdge<CreateStaffEdgeResult>('create-staff', {
      username: payload.username,
      full_name: payload.full_name,
      role: payload.role,
      depot_id: payload.depot_id,
      password: payload.password,
    }),

  updateStaff: (payload: UpdateStaffEdgePayload) =>
    invokeEdge<StaffLifecycleEdgeResult>('update-staff', {
      staff_id: payload.staff_id,
      full_name: payload.full_name,
      role: payload.role,
      depot_id: payload.depot_id,
    }),

  deactivateStaff: (staffId: string) =>
    invokeEdge<StaffLifecycleEdgeResult>('deactivate-staff', { staff_id: staffId }),

  reactivateStaff: (staffId: string) =>
    invokeEdge<StaffLifecycleEdgeResult>('reactivate-staff', { staff_id: staffId }),
}
