import { describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { RoleGuard } from '@/components/auth/RoleGuard'

const authState = { staff: { role: 'cashier', id: 'c1' } as { role: string; id: string } | null }

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: typeof authState) => unknown) => sel(authState),
}))

function renderGuarded(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RoleGuard roles={['admin']} redirectTo="/pos" />}>
          <Route path="/reports" element={<div>Reports ok</div>} />
          <Route path="/admin/audit" element={<div>Audit ok</div>} />
        </Route>
        <Route path="/pos" element={<div>POS fallback</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('admin-only report and audit routes', () => {
  it('redirects a cashier away from /reports', () => {
    authState.staff = { role: 'cashier', id: 'c1' }
    renderGuarded('/reports')
    expect(screen.getByText('POS fallback')).toBeInTheDocument()
    expect(screen.queryByText('Reports ok')).not.toBeInTheDocument()
  })

  it('redirects a cashier away from /admin/audit', () => {
    authState.staff = { role: 'cashier', id: 'c1' }
    renderGuarded('/admin/audit')
    expect(screen.getByText('POS fallback')).toBeInTheDocument()
    expect(screen.queryByText('Audit ok')).not.toBeInTheDocument()
  })

  it('allows an admin to open /reports and /admin/audit', () => {
    authState.staff = { role: 'admin', id: 'a1' }
    const first = renderGuarded('/reports')
    expect(first.getByText('Reports ok')).toBeInTheDocument()
    first.unmount()
    renderGuarded('/admin/audit')
    expect(screen.getByText('Audit ok')).toBeInTheDocument()
  })
})
