/**
 * Phase 14B-2 — RecordPaymentModal in-flight lock and missing-shift warning.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RecordPaymentModal } from '@/pages/customers/components/RecordPaymentModal'
import { useRecordPayment } from '@/hooks/useCustomers'
import { useOpenShifts, type ShiftListItem } from '@/hooks/useShifts'
import { useAuthStore } from '@/stores/authStore'
import type { Customer, Staff } from '@/types/database'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { COMMON } from '@/lib/bilingual/common'

vi.mock('@/hooks/useCustomers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCustomers')>()
  return {
    ...actual,
    useRecordPayment: vi.fn(),
  }
})

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

function openShift(): ShiftListItem {
  return {
    id: 'shift-1',
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
  }
}

const customer: Customer = {
  id: 'cust-1',
  name: 'Aminata Diallo',
  phone: '77000000',
  address: null,
  balance_owed_cfa: 5000,
  is_active: true,
  deactivated_at: null,
  created_by: 'admin-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

function renderModal(shiftId: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <RecordPaymentModal
        open
        onClose={vi.fn()}
        customer={customer}
        shiftId={shiftId}
      />
    </QueryClientProvider>,
  )
}

describe('RecordPaymentModal', () => {
  beforeEach(() => {
    useAuthStore.setState({
      staff: cashierStaff(),
      session: null,
      isLoading: false,
      authLoadState: 'authorized',
    })
    vi.mocked(useOpenShifts).mockReturnValue({
      data: [openShift()],
      isLoading: false,
    } as never)
    vi.mocked(useRecordPayment).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        amount_cfa: 1000,
        new_balance_owed_cfa: 4000,
      }),
      isPending: false,
    } as never)
  })

  it('B8: blocks recording a payment when there is no open shift', async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn().mockResolvedValue({
      amount_cfa: 1000,
      new_balance_owed_cfa: 4000,
    })
    vi.mocked(useOpenShifts).mockReturnValue({ data: [], isLoading: false } as never)
    vi.mocked(useRecordPayment).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never)
    renderModal(null)
    expect(
      screen.getByText(/ouvrez un service pour encaisser|open a shift to complete a sale/i),
    ).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('0'), '1000')
    expect(screen.getByRole('button', { name: CUSTOMERS.recordPayment.fr })).toBeDisabled()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('B8: attaches a payment to the cashier depot open shift', async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn().mockResolvedValue({
      amount_cfa: 1000,
      new_balance_owed_cfa: 4000,
    })
    vi.mocked(useRecordPayment).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never)
    renderModal(null)
    await user.type(screen.getByPlaceholderText('0'), '1000')
    await user.click(screen.getByRole('button', { name: CUSTOMERS.recordPayment.fr }))
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      p_customer_id: 'cust-1',
      p_amount_cfa: 1000,
      p_shift_id: 'shift-1',
    }))
  })

  it('ignores a second rapid Record Payment submit', async () => {
    const mutateAsync = vi.fn(() => new Promise(() => {}))
    vi.mocked(useRecordPayment).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never)
    renderModal('shift-1')
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '1000' } })
    const form = screen.getByRole('button', { name: CUSTOMERS.recordPayment.fr }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(mutateAsync).toHaveBeenCalledTimes(1)
    expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      p_shift_id: 'shift-1',
    }))
  })

  it('B5: a negative payment amount shows an error instead of being stripped', async () => {
    const user = userEvent.setup()
    const mutateAsync = vi.fn()
    vi.mocked(useRecordPayment).mockReturnValue({
      mutateAsync,
      isPending: false,
    } as never)
    renderModal('shift-1')
    await user.type(screen.getByPlaceholderText('0'), '-25')
    expect(screen.getByPlaceholderText('0')).toHaveValue('-25')
    expect(screen.getByText(CUSTOMERS.paymentNegative.fr)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: CUSTOMERS.recordPayment.fr }))
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('B11: success copy is bilingual French, not hardcoded English', async () => {
    const user = userEvent.setup()
    renderModal('shift-1')
    await user.type(screen.getByPlaceholderText('0'), '1000')
    await user.click(screen.getByRole('button', { name: CUSTOMERS.recordPayment.fr }))
    expect(await screen.findByText(CUSTOMERS.paymentRecorded.fr)).toBeInTheDocument()
    expect(screen.getByText(COMMON.customer.fr)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: COMMON.done.fr })).toBeInTheDocument()
    expect(screen.queryByText('Payment Recorded')).not.toBeInTheDocument()
    expect(screen.queryByText('Done')).not.toBeInTheDocument()
  })
})
