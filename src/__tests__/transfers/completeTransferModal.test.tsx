/**
 * Phase 9 — Complete transfer confirmation and mapped errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CompleteTransferModal } from '@/pages/transfers/components/CompleteTransferModal'
import { rpc } from '@/lib/rpc'
import { toast } from 'sonner'
import { ERROR_MESSAGES } from '@/lib/errors'
import { messageForCodePlain } from '@/lib/bilingual/errors'
import { expectToastErrorFr } from '../helpers/bilingualQueries'
import type { TransferDetailData } from '@/hooks/useTransfers'

vi.mock('@/lib/rpc', () => ({
  rpc: {
    completeTransfer: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function transfer(): TransferDetailData {
  return {
    id: 'tr-1',
    from_depot_id: 'depot-a',
    to_depot_id: 'depot-b',
    status: 'pending',
    created_by: 'admin-1',
    created_at: '2026-09-12T10:00:00Z',
    completed_at: null,
    completed_by: null,
    note: null,
    cancelled_at: null,
    cancelled_by: null,
    cancel_reason: null,
    from_depot_name: 'Depot Dakar',
    to_depot_name: 'Depot Abidjan',
    created_by_name: 'Admin',
    completed_by_name: null,
    cancelled_by_name: null,
    item_count: 1,
    items: [{
      id: 'item-1',
      transfer_id: 'tr-1',
      from_product_id: 'src-1',
      to_product_id: 'dst-1',
      unit_level: 0,
      quantity_in_unit: 2,
      quantity_pieces: 2,
      from_product_name: 'Water A',
      to_product_name: 'Water B',
      unit_name: 'Bottle',
    }],
  }
}

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CompleteTransferModal open onClose={() => {}} transfer={transfer()} />
    </QueryClientProvider>,
  )
}

describe('CompleteTransferModal', () => {
  beforeEach(() => {
    vi.mocked(rpc.completeTransfer).mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('disables complete until confirmation', async () => {
    renderModal()
    expect(screen.getByRole('button', { name: 'Complete Transfer' })).toBeDisabled()
  })

  it('calls complete_transfer after confirm', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.completeTransfer).mockResolvedValue({
      data: { transfer_id: 'tr-1', status: 'completed', items_moved: 1 },
      error: null,
    })
    renderModal()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Complete Transfer' }))
    expect(rpc.completeTransfer).toHaveBeenCalledWith({ p_transfer_id: 'tr-1' })
    expect(toast.success).toHaveBeenCalled()
  })

  it('toasts mapped insufficient stock', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.completeTransfer).mockResolvedValue({
      data: null,
      error: { code: 'INSUFFICIENT_STOCK', message: ERROR_MESSAGES.INSUFFICIENT_STOCK },
    })
    renderModal()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Complete Transfer' }))
    expectToastErrorFr(toast.error, messageForCodePlain('INSUFFICIENT_STOCK'))
  })

  it('ignores a second rapid Complete Transfer click', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.completeTransfer).mockImplementation(() => new Promise(() => {}))
    renderModal()
    await user.click(screen.getByRole('checkbox'))
    const submit = screen.getByRole('button', { name: 'Complete Transfer' })
    fireEvent.click(submit)
    fireEvent.click(submit)
    expect(rpc.completeTransfer).toHaveBeenCalledTimes(1)
  })
})
