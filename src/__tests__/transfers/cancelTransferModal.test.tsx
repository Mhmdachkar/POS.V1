/**
 * Phase 9 — Cancel transfer confirmation, optional reason, mapped errors.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CancelTransferModal } from '@/pages/transfers/components/CancelTransferModal'
import { rpc } from '@/lib/rpc'
import { toast } from 'sonner'
import { ERROR_MESSAGES } from '@/lib/errors'
import { expectToastErrorFr } from '../helpers/bilingualQueries'
import type { TransferDetailData } from '@/hooks/useTransfers'

vi.mock('@/lib/rpc', () => ({
  rpc: {
    cancelTransfer: vi.fn(),
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
    items: [],
  }
}

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <CancelTransferModal open onClose={() => {}} transfer={transfer()} />
    </QueryClientProvider>,
  )
}

describe('CancelTransferModal', () => {
  beforeEach(() => {
    vi.mocked(rpc.cancelTransfer).mockReset()
    vi.mocked(toast.success).mockReset()
    vi.mocked(toast.error).mockReset()
  })

  it('requires confirmation and sends optional reason', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.cancelTransfer).mockResolvedValue({
      data: {
        transfer_id: 'tr-1',
        status: 'cancelled',
        cancelled_at: '2026-09-13T08:00:00Z',
        cancelled_by: 'admin-1',
        cancel_reason: 'Changed mind',
      },
      error: null,
    })
    renderModal()
    expect(screen.getByRole('button', { name: 'Annuler le transfert' })).toBeDisabled()
    await user.type(screen.getByLabelText(/reason|motif/i), 'Changed mind')
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Annuler le transfert' }))
    expect(rpc.cancelTransfer).toHaveBeenCalledWith({
      p_transfer_id: 'tr-1',
      p_reason: 'Changed mind',
    })
    expect(toast.success).toHaveBeenCalled()
  })

  it('toasts mapped already completed', async () => {
    const user = userEvent.setup()
    vi.mocked(rpc.cancelTransfer).mockResolvedValue({
      data: null,
      error: {
        code: 'TRANSFER_ALREADY_COMPLETED',
        message: ERROR_MESSAGES.TRANSFER_ALREADY_COMPLETED,
      },
    })
    renderModal()
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Annuler le transfert' }))
    expectToastErrorFr(toast.error, 'Ce transfert est déjà terminé.')
  })
})
