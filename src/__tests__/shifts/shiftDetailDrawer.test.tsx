/**
 * Phase 10 — Shift detail drawer: open vs closed, close + select actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShiftDetailDrawer } from '@/pages/shifts/components/ShiftDetailDrawer'
import { useShiftDetail, type ShiftDetailData } from '@/hooks/useShifts'
import { useUnshiftedSalesForShiftWindow } from '@/hooks/useSales'
import { useAuthStore } from '@/stores/authStore'
import { formatCFA } from '@/lib/formatters'
import type { Staff } from '@/types/database'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { COMMON } from '@/lib/bilingual/common'

vi.mock('@/hooks/useShifts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useShifts')>()
  return {
    ...actual,
    useShiftDetail: vi.fn(),
  }
})

vi.mock('@/hooks/useSales', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useSales')>()
  return {
    ...actual,
    useUnshiftedSalesForShiftWindow: vi.fn(() => ({
      data: { count: 0, total_cfa: 0 },
      isLoading: false,
    })),
  }
})

function cashierStaff(): Staff {
  return {
    id: 'cashier-1',
    username: 'cashier',
    full_name: 'Cashier',
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
    cashier_name: 'Cashier',
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
    closed_by_name: 'Cashier',
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
    vi.mocked(useUnshiftedSalesForShiftWindow).mockReturnValue({
      data: { count: 0, total_cfa: 0 },
      isLoading: false,
    } as never)
  })

  it('shows running totals and Close Shift for an open authorized shift', () => {
    vi.mocked(useShiftDetail).mockReturnValue({
      data: openDetail(),
      isLoading: false,
      isError: false,
    } as never)
    renderDrawer('sh-open')
    expect(screen.getByRole('heading', { name: 'Cashier' })).toBeInTheDocument()
    expect(screen.getAllByText('Depot Dakar').length).toBeGreaterThan(0)
    expect(screen.getByText(SHIFT_COPY.cashSummary.fr)).toBeInTheDocument()
    expect(screen.getByText(SHIFT_COPY.openingFloat.fr)).toBeInTheDocument()
    expect(screen.getByText(SHIFT_COPY.salesCash.fr)).toBeInTheDocument()
    expect(screen.getByText(SHIFT_COPY.customerPayments.fr)).toBeInTheDocument()
    expect(screen.getByText(SHIFT_COPY.returnCash.fr)).toBeInTheDocument()
    expect(screen.getByText(SHIFT_COPY.expectedCash.fr)).toBeInTheDocument()
    expect(screen.getByText(SHIFT_COPY.actualCash.fr)).toBeInTheDocument()
    expect(screen.getAllByText(SHIFT_COPY.shiftDetails.fr).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/^Actions$/i).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Close [Ss]hift|Fermer le service|Clôturer le service/i })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Select for POS|Sélectionner pour la caisse/i }),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Current/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit Shift' })).not.toBeInTheDocument()

    const floatNode = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === formatCFA(1000),
    ).find((el) => el.className.includes('financial-value'))
    expect(floatNode).toBeTruthy()

    const estimatedNode = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === formatCFA(1200),
    ).find((el) => el.className.includes('text-financial-sm'))
    expect(estimatedNode).toBeTruthy()
  })

  it('shows sales without a shift separately from expected cash', () => {
    vi.mocked(useShiftDetail).mockReturnValue({
      data: openDetail(),
      isLoading: false,
      isError: false,
    } as never)
    vi.mocked(useUnshiftedSalesForShiftWindow).mockReturnValue({
      data: { count: 3, total_cfa: 47000 },
      isLoading: false,
    } as never)
    renderDrawer('sh-open')
    expect(screen.getByText(SHIFT_COPY.salesWithoutShift.fr)).toBeInTheDocument()
    const unshiftedBlock = screen.getByTestId('unshifted-shift-sales')
    expect(unshiftedBlock.textContent).toContain('3 ventes')
    expect(unshiftedBlock.textContent).toContain(formatCFA(47000))
    expect(
      screen.getByText(SHIFT_COPY.unshiftedWindowNote.fr, { exact: false }),
    ).toBeInTheDocument()
    const expectedNode = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === formatCFA(1200),
    ).find((el) => typeof el.className === 'string' && el.className.includes('text-financial-sm'))
    expect(expectedNode).toBeTruthy()
    expect(
      screen.queryAllByText((_, el) =>
        el?.tagName === 'SPAN' && el.textContent === formatCFA(48200),
      ).find((el) => typeof el.className === 'string' && el.className.includes('text-financial-sm')),
    ).toBeUndefined()
  })

  it('hides Close Shift on a closed shift', () => {
    vi.mocked(useShiftDetail).mockReturnValue({
      data: closedDetail(),
      isLoading: false,
      isError: false,
    } as never)
    renderDrawer('sh-closed')
    expect(screen.getAllByText(SHIFT_COPY.closed.fr).length).toBeGreaterThan(0)
    expect(screen.getByText(SHIFT_COPY.expectedCash.fr)).toBeInTheDocument()
    expect(screen.getByText(SHIFT_COPY.actualCash.fr)).toBeInTheDocument()
    expect(screen.getByText(SHIFT_COPY.discrepancy.fr)).toBeInTheDocument()
    expect(screen.getByText(SHIFT_COPY.opened.fr)).toBeInTheDocument()
    expect(screen.getByText(SHIFT_COPY.closedBy.fr)).toBeInTheDocument()
    expect(screen.getByText(SHIFT_COPY.shiftId.fr)).toBeInTheDocument()
    expect(screen.getAllByText('Depot Dakar').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: SHIFT_COPY.closeShift.fr })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Select for POS' })).not.toBeInTheDocument()
    expect(screen.queryByText(COMMON.actions.fr)).not.toBeInTheDocument()

    const expectedNode = screen.getAllByText((_, el) =>
      el?.tagName === 'SPAN' && el.textContent === formatCFA(1200),
    ).find((el) => el.className.includes('text-financial-sm'))
    expect(expectedNode).toBeTruthy()
  })

  it('shows an error state when the detail query fails', () => {
    vi.mocked(useShiftDetail).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
    } as never)
    renderDrawer('missing')
    expect(screen.getByText(SHIFT_COPY.failedDetail.fr)).toBeInTheDocument()
  })
})
