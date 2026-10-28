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
          <Route path="/achats/fournisseurs" element={<div>Achats ok</div>} />
          <Route path="/reports/purchases/suppliers" element={<div>Purchases report ok</div>} />
        </Route>
        <Route path="/pos" element={<div>POS fallback</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('admin-only achats routes', () => {
  it('redirects cashier from /achats', () => {
    authState.staff = { role: 'cashier', id: 'c1' }
    renderGuarded('/achats/fournisseurs')
    expect(screen.getByText('POS fallback')).toBeInTheDocument()
    expect(screen.queryByText('Achats ok')).not.toBeInTheDocument()
  })

  it('allows admin on /achats and purchases report', () => {
    authState.staff = { role: 'admin', id: 'a1' }
    const first = renderGuarded('/achats/fournisseurs')
    expect(first.getByText('Achats ok')).toBeInTheDocument()
    first.unmount()
    renderGuarded('/reports/purchases/suppliers')
    expect(screen.getByText('Purchases report ok')).toBeInTheDocument()
  })
})
