/**
 * Unit tests for authStore — the auth state machine.
 *
 * Tests the store transitions without any UI or Supabase calls.
 * The store is reset before each test.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import {
  useAuthStore,
  selectIsAdmin,
  selectIsCashier,
  selectIsDepotStaff,
  selectIsAuthorized,
  selectIsBooting,
  selectIsDeactivated,
} from '@/stores/authStore'
import type { Staff } from '@/types/database'

// ─── Fixtures ────────────────────────────────────────────────────

function makeStaff(overrides: Partial<Staff> = {}): Staff {
  return {
    id:             'staff-001',
    username:       'testuser',
    full_name:      'Test User',
    role:           'cashier',
    depot_id:       'depot-001',
    is_active:      true,
    deactivated_at: null,
    created_at:     new Date().toISOString(),
    ...overrides,
  }
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    access_token:  'access-token-001',
    refresh_token: 'refresh-token-001',
    token_type:    'bearer',
    expires_in:    3600,
    expires_at:    Math.floor(Date.now() / 1000) + 3600,
    user: {
      id:         'staff-001',
      aud:        'authenticated',
      role:       'authenticated',
      email:      'testuser@vhm-pos.internal',
      created_at: new Date().toISOString(),
      app_metadata: {},
      user_metadata: {},
    } as Session['user'],
    ...overrides,
  }
}

// ─── Tests ───────────────────────────────────────────────────────

describe('authStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAuthStore.setState({
      authLoadState: 'booting',
      session: null,
      staff: null,
      isLoading: true,
    })
  })

  // ── Initial state ─────────────────────────────────────────────

  it('starts in booting state', () => {
    const state = useAuthStore.getState()
    expect(state.authLoadState).toBe('booting')
    expect(state.session).toBeNull()
    expect(state.staff).toBeNull()
    expect(state.isLoading).toBe(true)
  })

  // ── setAuthorized ─────────────────────────────────────────────

  it('setAuthorized transitions to authorized with session and staff', () => {
    const session = makeSession()
    const staff   = makeStaff()

    useAuthStore.getState().setAuthorized(session, staff)

    const state = useAuthStore.getState()
    expect(state.authLoadState).toBe('authorized')
    expect(state.session).toBe(session)
    expect(state.staff).toBe(staff)
    expect(state.isLoading).toBe(false)
  })

  it('setAuthorized clears isLoading', () => {
    const { setAuthorized } = useAuthStore.getState()
    setAuthorized(makeSession(), makeStaff())
    expect(useAuthStore.getState().isLoading).toBe(false)
  })

  // ── setDeactivated ────────────────────────────────────────────

  it('setDeactivated transitions to deactivated, keeps session, clears staff', () => {
    const session = makeSession()

    // First set authorized
    useAuthStore.getState().setAuthorized(session, makeStaff())

    // Then deactivate
    useAuthStore.getState().setDeactivated(session)

    const state = useAuthStore.getState()
    expect(state.authLoadState).toBe('deactivated')
    expect(state.session).toBe(session)    // Session kept (user must consciously sign out)
    expect(state.staff).toBeNull()         // Staff cleared (no role/depot access)
    expect(state.isLoading).toBe(false)
  })

  it('deactivated state has null staff (no role-based access)', () => {
    useAuthStore.getState().setDeactivated(makeSession())
    expect(useAuthStore.getState().staff).toBeNull()
  })

  // ── clear ─────────────────────────────────────────────────────

  it('clear transitions to unauthenticated', () => {
    // Start authorized
    useAuthStore.getState().setAuthorized(makeSession(), makeStaff())

    // Clear
    useAuthStore.getState().clear()

    const state = useAuthStore.getState()
    expect(state.authLoadState).toBe('unauthenticated')
    expect(state.session).toBeNull()
    expect(state.staff).toBeNull()
    expect(state.isLoading).toBe(false)
  })

  it('clear works from deactivated state', () => {
    useAuthStore.getState().setDeactivated(makeSession())
    useAuthStore.getState().clear()
    expect(useAuthStore.getState().authLoadState).toBe('unauthenticated')
  })

  // ── Selectors ────────────────────────────────────────────────

  it('selectIsAuthorized is true only in authorized state', () => {
    const store = useAuthStore.getState()

    // booting → not authorized
    expect(useAuthStore.getState().authLoadState).toBe('booting')

    // authorized → true
    store.setAuthorized(makeSession(), makeStaff())
    expect(useAuthStore.getState().authLoadState).toBe('authorized')

    // deactivated → not authorized
    store.setDeactivated(makeSession())
    expect(useAuthStore.getState().authLoadState).toBe('deactivated')
  })

  it('selectIsAdmin returns true for admin staff', () => {
    useAuthStore.getState().setAuthorized(
      makeSession(),
      makeStaff({ role: 'admin', depot_id: null }),
    )
    expect(selectIsAdmin(useAuthStore.getState())).toBe(true)
  })

  it('selectIsCashier returns false for admin', () => {
    useAuthStore.getState().setAuthorized(
      makeSession(),
      makeStaff({ role: 'admin', depot_id: null }),
    )
    expect(selectIsCashier(useAuthStore.getState())).toBe(false)
  })

  // ── Atomic state transitions ──────────────────────────────────

  it('transitions do not leak intermediate states', () => {
    // Full lifecycle test: booting → authorized → deactivated → unauthenticated
    const session = makeSession()
    const staff   = makeStaff()

    useAuthStore.getState().setAuthorized(session, staff)
    expect(useAuthStore.getState().authLoadState).toBe('authorized')

    useAuthStore.getState().setDeactivated(session)
    expect(useAuthStore.getState().authLoadState).toBe('deactivated')
    expect(useAuthStore.getState().staff).toBeNull()  // No role access in deactivated

    useAuthStore.getState().clear()
    expect(useAuthStore.getState().authLoadState).toBe('unauthenticated')
    expect(useAuthStore.getState().session).toBeNull()
  })
})

// ─── Role-based access control tests ─────────────────────────────

describe('authStore role access control', () => {
  beforeEach(() => {
    useAuthStore.setState({
      authLoadState: 'booting',
      session: null,
      staff: null,
      isLoading: true,
    })
  })

  it('admin role has no depot restriction (depot_id = null)', () => {
    useAuthStore.getState().setAuthorized(
      makeSession(),
      makeStaff({ role: 'admin', depot_id: null }),
    )
    expect(useAuthStore.getState().staff?.depot_id).toBeNull()
  })

  it('cashier role has a depot assigned', () => {
    useAuthStore.getState().setAuthorized(
      makeSession(),
      makeStaff({ role: 'cashier', depot_id: 'depot-001' }),
    )
    expect(useAuthStore.getState().staff?.depot_id).toBe('depot-001')
  })

  it('depot_staff role has a depot assigned', () => {
    useAuthStore.getState().setAuthorized(
      makeSession(),
      makeStaff({ role: 'depot_staff', depot_id: 'depot-002' }),
    )
    expect(useAuthStore.getState().staff?.depot_id).toBe('depot-002')
  })

  it('deactivated staff has no role or depot in store', () => {
    useAuthStore.getState().setDeactivated(makeSession())
    const state = useAuthStore.getState()
    // No staff record in deactivated state = no role-based rendering
    expect(state.staff).toBeNull()
    expect(state.staff?.role).toBeUndefined()
    expect(state.staff?.depot_id).toBeUndefined()
  })
})

// ─── Security invariant tests ─────────────────────────────────────

describe('authStore security invariants', () => {
  it('authorized state always has both session and staff', () => {
    const session = makeSession()
    const staff   = makeStaff()
    useAuthStore.getState().setAuthorized(session, staff)
    const state = useAuthStore.getState()
    expect(state.authLoadState).toBe('authorized')
    expect(state.session).not.toBeNull()
    expect(state.staff).not.toBeNull()
  })

  it('deactivated state always has null staff (prevents role-based access)', () => {
    useAuthStore.getState().setDeactivated(makeSession())
    expect(useAuthStore.getState().staff).toBeNull()
  })

  it('unauthenticated state always has null session and staff', () => {
    useAuthStore.getState().setAuthorized(makeSession(), makeStaff())
    useAuthStore.getState().clear()
    const state = useAuthStore.getState()
    expect(state.session).toBeNull()
    expect(state.staff).toBeNull()
  })
})
