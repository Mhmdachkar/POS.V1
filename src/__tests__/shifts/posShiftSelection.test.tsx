/**
 * Phase 10 — Explicit POS shift selection, no auto-bind, stale shiftId.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PosShiftIndicator } from '@/pages/pos/components/PosShiftIndicator'
import { clearStalePosShift, useOpenShifts, type ShiftListItem } from '@/hooks/useShifts'
import { useAuthStore } from '@/stores/authStore'
import { usePOSStore } from '@/stores/posStore'
import type { Staff } from '@/types/database'

vi.mock('@/hooks/useShifts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useShifts')>()
  return {
    ...actual,
    useOpenShifts: vi.fn(),
  }
})

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

function openItem(id: string, depotId = 'depot-a'): ShiftListItem {
  return {
    id,
    depot_id: depotId,
    cashier_id: 'cashier-1',
    opening_float_cfa: 1000,
    opened_at: '2026-09-13T08:00:00Z',
    closed_at: null,
    closed_by: null,
    expected_cash_cfa: null,
    actual_cash_cfa: null,
    discrepancy_cfa: null,
    status: 'open',
    depot_name: depotId === 'depot-a' ? 'Depot Dakar' : 'Depot Abidjan',
    cashier_name: 'Cashier Dakar',
    closed_by_name: null,
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

describe('POS shift selection', () => {
  beforeEach(() => {
    useAuthStore.setState({ staff: cashierStaff(), session: null, isLoading: false })
    usePOSStore.setState({ shiftId: null })
    vi.mocked(useOpenShifts).mockReturnValue({ data: [], isLoading: false } as never)
  })

  it('shows a soft warning when no shift is selected and does not auto-bind one open shift', () => {
    vi.mocked(useOpenShifts).mockReturnValue({
      data: [openItem('only-one')],
      isLoading: false,
    } as never)
    renderIndicator()
    expect(screen.getByText(/No active shift/)).toBeInTheDocument()
    expect(usePOSStore.getState().shiftId).toBeNull()
  })

  it('lists two open shifts and binds only after explicit select', async () => {
    const user = userEvent.setup()
    vi.mocked(useOpenShifts).mockReturnValue({
      data: [openItem('sh-a'), openItem('sh-b')],
      isLoading: false,
    } as never)
    renderIndicator()
    expect(usePOSStore.getState().shiftId).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Select for POS' }))
    expect(screen.getByText(/None is selected automatically/)).toBeInTheDocument()
    const choices = screen.getAllByRole('button').filter((el) => el.textContent?.includes('Depot Dakar'))
    await user.click(choices[0])
    expect(usePOSStore.getState().shiftId).toBe('sh-a')
    expect(screen.getByText('Shift: Active')).toBeInTheDocument()
  })

  it('does not offer a foreign-depot open shift to a cashier', () => {
    vi.mocked(useOpenShifts).mockReturnValue({
      data: [openItem('foreign', 'depot-b')],
      isLoading: false,
    } as never)
    renderIndicator()
    expect(screen.queryByRole('button', { name: 'Select for POS' })).not.toBeInTheDocument()
    expect(screen.getByText(/No active shift/)).toBeInTheDocument()
  })

  it('clears stale shiftId on SHIFT_NOT_OPEN and does not retry with null', async () => {
    usePOSStore.getState().setShiftId('closed-shift')
    const completeSale = vi.fn().mockResolvedValue({
      data: null,
      error: { code: 'SHIFT_NOT_OPEN' },
    })

    const staleId = usePOSStore.getState().shiftId
    const result = await completeSale({ p_shift_id: staleId })
    if (result.error) {
      clearStalePosShift(result.error.code)
    }

    expect(completeSale).toHaveBeenCalledTimes(1)
    expect(completeSale.mock.calls[0][0].p_shift_id).toBe('closed-shift')
    expect(usePOSStore.getState().shiftId).toBeNull()
    expect(completeSale).not.toHaveBeenCalledWith(
      expect.objectContaining({ p_shift_id: null }),
    )
  })
})
