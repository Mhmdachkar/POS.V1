import { describe, it, expect } from 'vitest'
import { resolvePostLoginPath } from '@/lib/postLoginRedirect'
import type { Staff } from '@/types/database'

function staff(role: Staff['role']): Staff {
  return {
    id: 's1',
    username: 'user',
    full_name: 'User',
    role,
    depot_id: role === 'admin' ? null : 'depot-a',
    is_active: true,
    created_at: '',
    updated_at: '',
  }
}

describe('resolvePostLoginPath', () => {
  it('sends admin to POS for generic login', () => {
    expect(resolvePostLoginPath(staff('admin'), '/')).toBe('/pos')
    expect(resolvePostLoginPath(staff('admin'), '/login')).toBe('/pos')
  })

  it('keeps admin on register shell when that was the intended path', () => {
    expect(resolvePostLoginPath(staff('admin'), '/pos')).toBe('/pos')
  })

  it('preserves admin deep links to admin workspace', () => {
    expect(resolvePostLoginPath(staff('admin'), '/reports')).toBe('/reports')
    expect(resolvePostLoginPath(staff('admin'), '/admin/staff')).toBe('/admin/staff')
  })

  it('sends cashier to register by default', () => {
    expect(resolvePostLoginPath(staff('cashier'), '/')).toBe('/pos')
  })

  it('keeps cashier ops routes after login', () => {
    expect(resolvePostLoginPath(staff('cashier'), '/sales')).toBe('/sales')
  })

  it('sends depot staff to depot overview by default', () => {
    expect(resolvePostLoginPath(staff('depot_staff'), '/')).toBe('/depot')
  })
})
