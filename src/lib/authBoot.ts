import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { Staff } from '@/types/database'
import { bootEnd, bootMark } from '@/lib/bootTiming'

/** Max wait for each cold-start auth step before showing Réessayer. */
export const BOOT_STEP_TIMEOUT_MS = 8_000

export class BootTimeoutError extends Error {
  readonly step: string

  constructor(step: string) {
    super(`Boot step timed out: ${step}`)
    this.name = 'BootTimeoutError'
    this.step = step
  }
}

export async function withBootTimeout<T>(
  step: string,
  ms: number,
  operation: () => Promise<T>,
): Promise<T> {
  bootMark(step)
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new BootTimeoutError(step)), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
    bootEnd(step)
  }
}

export async function getSessionForBoot(): Promise<{
  session: Session | null
  recoverableError: boolean
}> {
  const { data: { session }, error } = await withBootTimeout(
    'auth.getSession',
    BOOT_STEP_TIMEOUT_MS,
    () => supabase.auth.getSession(),
  )

  if (error) {
    console.warn('[authBoot] getSession error:', error.message)
    return { session: null, recoverableError: true }
  }
  return { session, recoverableError: false }
}

export async function fetchStaffForBoot(userId: string): Promise<Staff | null> {
  const { data, error } = await withBootTimeout(
    'auth.fetchStaff',
    BOOT_STEP_TIMEOUT_MS,
    async () =>
      supabase.from('staff').select('*').eq('id', userId).single(),
  )

  if (error || !data) return null
  return data as Staff
}

/** Clear a broken session after auth errors (e.g. invalid refresh token). */
export async function signOutAfterBootAuthFailure(): Promise<void> {
  try {
    await supabase.auth.signOut()
  } catch {
    /* session may already be gone */
  }
}
