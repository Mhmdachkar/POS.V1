/**
 * Phase 10 — Close shift: confirm before close_shift(), then server breakdown.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CloseShiftModal } from '@/pages/shifts/components/CloseShiftModal'
import { useCloseShift, type ShiftDetailData } from '@/hooks/useShifts'
import { ERROR_MESSAGES } from '@/lib/errors'
import { useAuthStore } from '@/stores/authStore'
import { usePOSStore } from '@/stores/posStore'
import type { Staff } from '@/types/database'

vi.mock('@/hooks/useShifts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useShifts')>()
  return {
    ...actual,
    useCloseShift: vi.fn(),
  }
})

function shift(): ShiftDetailData {
  return {
    id: 'sh-1',
    depot_id: 'depot-a',
    cashier_id: 'cashier-1',
    opening_float_cfa: 5000,
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
    running: {
      sales_cash_cfa: 3500,
      customer_pmts_cfa: 0,
      return_cash_cfa: 0,
    },
  }
}

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

function renderModal() {
  const mutateAsync = vi.fn()
  vi.mocked(useCloseShift).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CloseShiftModal open onClose={() => {}} shift={shift()} />
    </QueryClientProvider>,
  )
  return { mutateAsync }
}

describe('CloseShiftModal', () => {
  beforeEach(() => {
    useAuthStore.setState({ staff: cashierStaff(), session: null, isLoading: false })
    usePOSStore.setState({ shiftId: 'sh-1' })
  })

  it('does not call close_shift until checkbox and amount are set', async () => {
    const user = userEvent.setup()
    const { mutateAsync } = renderModal()

    expect(screen.getByText('Estimated')).toBeInTheDocument()
    const submit = screen.getByRole('button', { name: 'Close Shift' })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText('Actual Cash in Drawer (CFA)'), '8500')
    expect(submit).toBeDisabled()
    expect(mutateAsync).not.toHaveBeenCalled()

    await user.click(screen.getByRole('checkbox'))
    expect(submit).toBeEnabled()
  })

  it('calls close_shift after confirm and shows server breakdown', async () => {
    const user = userEvent.setup()
    const { mutateAsync } = renderModal()
    mutateAsync.mockResolvedValue({
      shift_id: 'sh-1',
      expected_cash_cfa: 8500,
      actual_cash_cfa: 8500,
      discrepancy_cfa: 0,
      breakdown: {
        opening_float_cfa: 5000,
        sales_cash_cfa: 3500,
        customer_pmts_cfa: 0,
        return_cash_cfa: 0,
      },
    })

    await user.type(screen.getByLabelText('Actual Cash in Drawer (CFA)'), '8500')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Close Shift' }))

    expect(mutateAsync).toHaveBeenCalledWith({
      p_shift_id: 'sh-1',
      p_actual_cash_cfa: 8500,
    })
    expect(await screen.findByText('Shift Closed')).toBeInTheDocument()
    expect(screen.getByText('Expected Cash')).toBeInTheDocument()
    expect(usePOSStore.getState().shiftId).toBeNull()
  })

  it('handles SHIFT_NOT_OPEN without a second close', async () => {
    const user = userEvent.setup()
    const { mutateAsync } = renderModal()
    mutateAsync.mockRejectedValue({
      code: 'SHIFT_NOT_OPEN',
      message: ERROR_MESSAGES.SHIFT_NOT_OPEN,
    })

    await user.type(screen.getByLabelText('Actual Cash in Drawer (CFA)'), '0')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Close Shift' }))

    expect(await screen.findByText('This shift is already closed.')).toBeInTheDocument()
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(usePOSStore.getState().shiftId).toBeNull()
  })
})
