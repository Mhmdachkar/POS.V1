/**
 * CEO Notes — PosShiftPersistence is a no-op; active shift persistence removed.
 */

import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it } from 'vitest'
import { PosShiftPersistence } from '@/components/pos/PosShiftPersistence'
import { posShiftStorageKey } from '@/lib/posShiftPersistence'
import { useAuthStore } from '@/stores/authStore'
import { usePOSStore } from '@/stores/posStore'
import type { Staff } from '@/types/database'

function cashierStaff(): Staff {
  return {
    id: 'staff-1',
    username: 'cashier',
    full_name: 'Cashier',
    role: 'cashier',
    depot_id: 'depot-a',
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

describe('PosShiftPersistence', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({
      authLoadState: 'authorized',
      staff: cashierStaff(),
      session: null,
    })
  })

  function renderPersistence() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={client}>
        <PosShiftPersistence />
      </QueryClientProvider>,
    )
  }

  it('renders null', () => {
    const { container } = renderPersistence()
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByTestId('shift-chip')).not.toBeInTheDocument()
  })

  it('does not restore a persisted shift id into posStore', () => {
    localStorage.setItem(posShiftStorageKey('staff-1'), 'shift-open')
    const before = usePOSStore.getState()
    renderPersistence()
    expect(usePOSStore.getState()).toEqual(before)
    expect(usePOSStore.getState()).not.toHaveProperty('shiftId')
    expect(localStorage.getItem(posShiftStorageKey('staff-1'))).toBe('shift-open')
  })

  it('does not clear storage or change store when nothing was persisted', () => {
    const before = usePOSStore.getState()
    renderPersistence()
    expect(usePOSStore.getState()).toEqual(before)
    expect(localStorage.getItem(posShiftStorageKey('staff-1'))).toBeNull()
  })
})
