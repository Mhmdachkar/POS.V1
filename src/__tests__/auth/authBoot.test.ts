import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOOT_STEP_TIMEOUT_MS,
  BootTimeoutError,
  withBootTimeout,
} from '@/lib/authBoot'
import { useAuthStore } from '@/stores/authStore'

describe('withBootTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resolves when the operation finishes in time', async () => {
    const result = await withBootTimeout('test.step', 1000, async () => 'ok')
    expect(result).toBe('ok')
  })

  it('rejects with BootTimeoutError when the operation never settles', async () => {
    const pending = withBootTimeout(
      'auth.getSession',
      BOOT_STEP_TIMEOUT_MS,
      () => new Promise<string>(() => {}),
    )
    const assertion = expect(pending).rejects.toBeInstanceOf(BootTimeoutError)
    await vi.advanceTimersByTimeAsync(BOOT_STEP_TIMEOUT_MS)
    await assertion
  })
})

describe('auth boot failure UX', () => {
  beforeEach(() => {
    useAuthStore.setState({
      authLoadState: 'booting',
      session: null,
      staff: null,
      isLoading: true,
      bootAttempt: 0,
    })
  })

  it('transitions to boot_failed so Réessayer can run', () => {
    useAuthStore.getState().setBootFailed()
    expect(useAuthStore.getState().authLoadState).toBe('boot_failed')

    useAuthStore.getState().retryBoot()
    expect(useAuthStore.getState().authLoadState).toBe('booting')
    expect(useAuthStore.getState().bootAttempt).toBe(1)
  })
})
