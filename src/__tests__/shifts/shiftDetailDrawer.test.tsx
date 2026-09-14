/**
 * Phase 10 — Shift detail drawer: open vs closed, close + select actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShiftDetailDrawer } from '@/pages/shifts/components/ShiftDetailDrawer'
import { useShiftDetail, type ShiftDetailData } from '@/hooks/useShifts'
import { useAuthStore } from '@/stores/authStore'
import { usePOSStore } from '@/stores/posStore'
import type { Staff } from '@/types/database'

vi.mock('@/hooks/useShifts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useShifts')>()
  return {
    ...actual,
    useShiftDetail: vi.fn(),
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

function openDetail(): ShiftDetailData {
  return {
    id: 'sh-open',
    depot_id: 'depot-a',
    cashier_id: 'cashier-1',
    opening_float_cfa: 1000,
    opened_at: '2026-09-13T08:00:00Z',
    closed_at: null,
    closed_by: null,
    expected_cash_cfa: null,
    actual_cash_cfa: null,
    discrepancy_cfa: null,
    status: 'open',
    depot_name: 'Depot Dakar',
    cashier_name: 'Cashier Dakar',
    closed_by_name: null,
    running: { sales_cash_cfa: 200, customer_pmts_cfa: 0, return_cash_cfa: 0 },
  }
}

function closedDetail(): ShiftDetailData {
  return {
    ...openDetail(),
    id: 'sh-closed',
    status: 'closed',
    closed_at: '2026-09-13T16:00:00Z',
    closed_by: 'cashier-1',
    expected_cash_cfa: 1200,
    actual_cash_cfa: 1200,
    discrepancy_cfa: 0,
    closed_by_name: 'Cashier Dakar',
  }
}

function renderDrawer(id: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <ShiftDetailDrawer shiftId={id} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

describe('ShiftDetailDrawer', () => {
  beforeEach(() => {
    useAuthStore.setState({ staff: cashierStaff(), session: null, isLoading: false })
    usePOSStore.setState({ shiftId: null })
  })

  it('shows running totals and Close Shift for an open authorized shift', () => {
    vi.mocked(useShiftDetail).mockReturnValue({
      data: openDetail(),
      isLoading: false,
      isError: false,
    } as never)
    renderDrawer('sh-open')
    expect(screen.getByText('Open')).toBeInTheDocument()
    expect(screen.getByText('Current running total')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close Shift' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select for POS' })).toBeInTheDocument()
  })

  it('hides Close Shift and Select for POS on a closed shift', () => {
    vi.mocked(useShiftDetail).mockReturnValue({
      data: closedDetail(),
      isLoading: false,
      isError: false,
    } as never)
    renderDrawer('sh-closed')
    expect(screen.getByText('Closed')).toBeInTheDocument()
    expect(screen.getByText('Expected Cash')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close Shift' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select for POS' })).not.toBeInTheDocument()
  })

  it('shows an error state when the detail query fails', () => {
    vi.mocked(useShiftDetail).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
    } as never)
    renderDrawer('missing')
    expect(screen.getByText('Failed to load shift details.')).toBeInTheDocument()
  })
})
