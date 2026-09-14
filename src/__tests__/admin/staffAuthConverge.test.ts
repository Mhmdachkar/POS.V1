import { describe, expect, it, vi } from 'vitest'
import {
  desiredAuthFromActive,
  intentAuthState,
  isAuthBannedFromTimestamp,
  runStaffAuthConverge,
  type AuthBanState,
  type StaffAuthSnapshot,
} from '@/lib/staffAuthConverge'

const staff = (isActive: boolean): StaffAuthSnapshot => ({
  id: 'staff-1',
  is_active: isActive,
  deactivated_at: isActive ? null : '2026-09-14T00:00:00Z',
  role: 'cashier',
  depot_id: 'depot-a',
})

describe('staffAuthConverge helpers', () => {
  it('maps is_active to the desired Auth ban state', () => {
    expect(desiredAuthFromActive(true)).toBe('unbanned')
    expect(desiredAuthFromActive(false)).toBe('banned')
    expect(intentAuthState(false)).toBe('banned')
    expect(intentAuthState(true)).toBe('unbanned')
  })

  it('treats banned_until in the future as banned', () => {
    expect(isAuthBannedFromTimestamp('2099-01-01T00:00:00Z', Date.parse('2026-09-14T00:00:00Z'))).toBe(true)
    expect(isAuthBannedFromTimestamp(null)).toBe(false)
  })
})

describe('runStaffAuthConverge', () => {
  it('retries Auth when the intent call fails and DB still matches intent, then AUTH_SYNC_FAILED', async () => {
    const applyAuth = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
    const readStaff = vi.fn().mockResolvedValue(staff(false))
    const readAuthState = vi.fn().mockResolvedValue('unbanned' as AuthBanState)
    const auditReconcile = vi.fn().mockResolvedValue(undefined)

    const result = await runStaffAuthConverge(false, {
      applyAuth,
      readStaff,
      readAuthState,
      auditReconcile,
    })

    expect(applyAuth).toHaveBeenCalledTimes(2)
    expect(applyAuth).toHaveBeenNthCalledWith(1, 'banned')
    expect(applyAuth).toHaveBeenNthCalledWith(2, 'banned')
    expect(auditReconcile).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: false, code: 'AUTH_SYNC_FAILED' })
  })

  it('reconciles Auth to a flipped DB row and does not invent a staff write', async () => {
    const applyAuth = vi.fn().mockResolvedValue(true)
    const readStaff = vi
      .fn()
      .mockResolvedValueOnce(staff(true))
      .mockResolvedValueOnce(staff(true))
    const readAuthState = vi
      .fn()
      .mockResolvedValueOnce('banned' as AuthBanState)
      .mockResolvedValueOnce('unbanned' as AuthBanState)
    const auditReconcile = vi.fn().mockResolvedValue(undefined)

    const result = await runStaffAuthConverge(false, {
      applyAuth,
      readStaff,
      readAuthState,
      auditReconcile,
    })

    expect(applyAuth).toHaveBeenNthCalledWith(1, 'banned')
    expect(applyAuth).toHaveBeenNthCalledWith(2, 'unbanned')
    expect(auditReconcile).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.applied).toBe(false)
      expect(result.reconciled).toBe(true)
      expect(result.staff.is_active).toBe(true)
    }
  })

  it('does not compensate DB when Auth fails after is_active already flipped', async () => {
    const applyAuth = vi.fn().mockResolvedValue(false)
    const readStaff = vi.fn().mockResolvedValue(staff(true))
    const readAuthState = vi.fn().mockResolvedValue('unbanned' as AuthBanState)
    const auditReconcile = vi.fn()

    const result = await runStaffAuthConverge(false, {
      applyAuth,
      readStaff,
      readAuthState,
      auditReconcile,
    })

    expect(applyAuth).toHaveBeenCalledTimes(1)
    expect(auditReconcile).not.toHaveBeenCalled()
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.applied).toBe(false)
      expect(result.reconciled).toBe(false)
      expect(result.staff.is_active).toBe(true)
    }
  })
})
