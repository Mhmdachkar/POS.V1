/**
 * CEO Notes — Active POS shift workflow removed.
 * PosShiftIndicator is a no-op; clearStalePosShift does not touch posStore.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PosShiftIndicator } from '@/pages/pos/components/PosShiftIndicator'
import { clearStalePosShift } from '@/hooks/useShifts'
import { useAuthStore } from '@/stores/authStore'
import { usePOSStore } from '@/stores/posStore'
import type { Staff } from '@/types/database'

function cashierStaff(): Staff {
  return {
    id: 'cashier-1',
    username: 'cashier',
    full_name: 'Cashier Dakar',
    role: 'cashier',
    depot_id: 'depot-a',
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function renderIndicator() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <PosShiftIndicator />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('POS shift selection (removed)', () => {
  beforeEach(() => {
    useAuthStore.setState({ staff: cashierStaff(), session: null, isLoading: false })
  })

  it('PosShiftIndicator renders nothing', () => {
    const { container } = renderIndicator()
    expect(container).toBeEmptyDOMElement()
  })

  it('clearStalePosShift is a no-op and does not mutate posStore', () => {
    const before = usePOSStore.getState()
    clearStalePosShift('SHIFT_NOT_OPEN')
    clearStalePosShift(null)
    clearStalePosShift(undefined)
    expect(usePOSStore.getState()).toEqual(before)
    expect(usePOSStore.getState()).not.toHaveProperty('shiftId')
    expect(usePOSStore.getState()).not.toHaveProperty('setShiftId')
  })
})
