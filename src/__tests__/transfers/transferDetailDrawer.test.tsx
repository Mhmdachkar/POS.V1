/**
 * Phase 9 — Transfer detail actions and cancellation metadata.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TransferDetailDrawer } from '@/pages/transfers/components/TransferDetailDrawer'
import { useTransferDetail, type TransferDetailData } from '@/hooks/useTransfers'
import { useAuthStore } from '@/stores/authStore'
import type { Staff } from '@/types/database'
import { COMMON } from '@/lib/bilingual/common'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { getByBilingualRole } from '../helpers/bilingualQueries'

vi.mock('@/hooks/useTransfers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useTransfers')>()
  return {
    ...actual,
    useTransferDetail: vi.fn(),
  }
})

function adminStaff(): Staff {
  return {
    id: 'admin-1',
    username: 'admin',
    full_name: 'System Administrator',
    role: 'admin',
    depot_id: null,
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function depotStaff(depotId = 'depot-a'): Staff {
  return {
    id: 'depot-1',
    username: 'depot',
    full_name: 'Stock Manager',
    role: 'depot_staff',
    depot_id: depotId,
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function detail(overrides: Partial<TransferDetailData> = {}): TransferDetailData {
  return {
    id: 'tr-1',
    from_depot_id: 'depot-a',
    to_depot_id: 'depot-b',
    status: 'pending',
    created_by: 'admin-1',
    created_at: '2026-09-12T10:00:00Z',
    completed_at: null,
    completed_by: null,
    note: 'Move water',
    cancelled_at: null,
    cancelled_by: null,
    cancel_reason: null,
    from_depot_name: 'Depot Dakar',
    to_depot_name: 'Depot Abidjan',
    created_by_name: 'System Administrator',
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
      from_product_name: 'PHASE9 Water A',
      to_product_name: 'PHASE9 Water B',
      unit_name: 'Bottle',
    }],
    ...overrides,
  }
}

function renderDrawer(data: TransferDetailData | null, staff: Staff = adminStaff()) {
  useAuthStore.setState({ staff, session: null, isLoading: false })
  vi.mocked(useTransferDetail).mockReturnValue({
    data,
    isLoading: false,
    isError: false,
  } as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <TransferDetailDrawer transferId={data?.id ?? 'tr-1'} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

describe('TransferDetailDrawer', () => {
  beforeEach(() => {
    vi.mocked(useTransferDetail).mockReset()
  })

  it('shows complete and cancel for pending admin', () => {
    renderDrawer(detail())
    expect(
      screen.getByRole('button', { name: /Complete transfer|Valider le transfert/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cancel|Annuler/i })).toBeInTheDocument()
    expect(screen.getByText('PHASE9 Water A')).toBeInTheDocument()
  })

  it('hides mutations for incoming depot_staff', () => {
    renderDrawer(detail(), depotStaff('depot-b'))
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('shows cancellation metadata and no mutations', () => {
    renderDrawer(detail({
      status: 'cancelled',
      cancelled_at: '2026-09-13T08:00:00Z',
      cancelled_by: 'admin-1',
      cancelled_by_name: 'System Administrator',
      cancel_reason: 'Wrong destination',
    }))
    expect(screen.getAllByText(/Annulé/i).length).toBeGreaterThan(0)
    expect(screen.getByText('Wrong destination')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Complete' })).not.toBeInTheDocument()
  })

  it('shows em dash when cancel reason is empty', () => {
    renderDrawer(detail({
      status: 'cancelled',
      cancelled_at: '2026-09-13T08:00:00Z',
      cancelled_by_name: 'System Administrator',
      cancel_reason: null,
    }))
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
