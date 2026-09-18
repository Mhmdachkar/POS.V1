/**
 * Phase 9 — Create transfer draft: explicit depots, duplicate line block, mapped errors.
 */

import { TRANSFERS } from '@/lib/bilingual/transfers'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { CreateTransferModal } from '@/pages/transfers/components/CreateTransferModal'
import { useCreateTransferDraft } from '@/hooks/useTransfers'
import { ERROR_MESSAGES } from '@/lib/errors'
import { messageForCodePlain } from '@/lib/bilingual/errors'
import { useAuthStore } from '@/stores/authStore'
import type { Staff } from '@/types/database'
import type { ProductWithUnits } from '@/types'

vi.mock('@/hooks/useTransfers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useTransfers')>()
  return {
    ...actual,
    useCreateTransferDraft: vi.fn(),
  }
})

vi.mock('@/hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useInventory')>()
  return {
    ...actual,
    useDepotOptions: vi.fn(() => ({
      data: [
        { id: 'depot-a', name: 'Depot Dakar', code: 'DKR', is_active: true },
        { id: 'depot-b', name: 'Depot Abidjan', code: 'ABJ', is_active: true },
      ],
      isLoading: false,
    })),
  }
})

const waterA: ProductWithUnits = {
  id: 'src-water',
  depot_id: 'depot-a',
  category_id: 'cat',
  name: 'PHASE9 Water',
  photo_url: '',
  current_stock_pieces: 20,
  track_low_stock: false,
  low_stock_threshold: null,
  is_active: true,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  units: [{
    id: 'u1',
    product_id: 'src-water',
    unit_level: 0,
    unit_name: 'Bottle',
    conversion_to_base: 1,
    cost_price_cfa: 100,
    selling_price_cfa: 150,
  }],
}

const waterB: ProductWithUnits = {
  ...waterA,
  id: 'dst-water',
  depot_id: 'depot-b',
}

vi.mock('@/hooks/useProducts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useProducts')>()
  return {
    ...actual,
    useProductSearch: vi.fn((_q: string, depotId: string | null) => ({
      data: depotId === 'depot-a' ? [waterA] : depotId === 'depot-b' ? [waterB] : [],
      isLoading: false,
    })),
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

function depotStaff(): Staff {
  return {
    id: 'depot-1',
    username: 'depot',
    full_name: 'Stock Manager Dakar',
    role: 'depot_staff',
    depot_id: 'depot-a',
    is_active: true,
    deactivated_at: null,
    created_at: '2026-01-01T00:00:00Z',
  }
}

function renderModal(onCreated = vi.fn()) {
  const mutateAsync = vi.fn()
  vi.mocked(useCreateTransferDraft).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <CreateTransferModal open onClose={() => {}} onCreated={onCreated} />
    </QueryClientProvider>,
  )
  return { mutateAsync, onCreated }
}

describe('CreateTransferModal', () => {
  beforeEach(() => {
    useAuthStore.setState({ staff: adminStaff(), session: null, isLoading: false })
  })

  it('submits explicit depots and no quantity_pieces', async () => {
    const user = userEvent.setup()
    const { mutateAsync, onCreated } = renderModal()
    mutateAsync.mockResolvedValue({ transfer_id: 'tr-new' })

    await user.selectOptions(screen.getByRole('combobox', { name: /source depot/i }), 'depot-a')
    await user.selectOptions(screen.getByRole('combobox', { name: /destination depot/i }), 'depot-b')
    await user.selectOptions(screen.getByLabelText(TRANSFERS.sourceProductAria.fr), 'src-water')
    await user.selectOptions(screen.getByLabelText(TRANSFERS.destProductAria.fr), 'dst-water')
    await user.type(screen.getByLabelText(TRANSFERS.quantityAria.fr), '3')
    await user.click(screen.getByRole('button', { name: /create draft/i }))

    expect(mutateAsync).toHaveBeenCalledWith({
      p_from_depot_id: 'depot-a',
      p_to_depot_id: 'depot-b',
      p_items: [{
        from_product_id: 'src-water',
        to_product_id: 'dst-water',
        unit_level: 0,
        quantity_in_unit: 3,
      }],
      p_note: null,
    })
    expect(JSON.stringify(mutateAsync.mock.calls[0][0])).not.toContain('quantity_pieces')
    expect(onCreated).toHaveBeenCalledWith('tr-new')
  })

  it('locks source depot for depot staff', () => {
    useAuthStore.setState({ staff: depotStaff(), session: null, isLoading: false })
    renderModal()
    const source = screen.getByRole('combobox', { name: /source depot/i })
    expect(source).toBeDisabled()
    expect(source).toHaveValue('depot-a')
  })

  it('blocks a second line with the same source product', async () => {
    const user = userEvent.setup()
    const { mutateAsync } = renderModal()

    await user.selectOptions(screen.getByRole('combobox', { name: /source depot/i }), 'depot-a')
    await user.selectOptions(screen.getByRole('combobox', { name: /destination depot/i }), 'depot-b')
    await user.selectOptions(screen.getByLabelText(TRANSFERS.sourceProductAria.fr), 'src-water')
    await user.click(screen.getByRole('button', { name: /add line/i }))

    const sourceSelects = screen.getAllByLabelText(TRANSFERS.sourceProductAria.fr)
    expect(sourceSelects[1].querySelector('option[value="src-water"]')).toHaveAttribute('disabled')
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('shows mapped duplicate error from the server', async () => {
    const user = userEvent.setup()
    const { mutateAsync } = renderModal()
    mutateAsync.mockRejectedValue({
      code: 'DUPLICATE_TRANSFER_LINE',
      message: ERROR_MESSAGES.DUPLICATE_TRANSFER_LINE,
    })

    await user.selectOptions(screen.getByRole('combobox', { name: /source depot/i }), 'depot-a')
    await user.selectOptions(screen.getByRole('combobox', { name: /destination depot/i }), 'depot-b')
    await user.selectOptions(screen.getByLabelText(TRANSFERS.sourceProductAria.fr), 'src-water')
    await user.selectOptions(screen.getByLabelText(TRANSFERS.destProductAria.fr), 'dst-water')
    await user.type(screen.getByLabelText(TRANSFERS.quantityAria.fr), '1')
    await user.click(screen.getByRole('button', { name: /create draft/i }))

    expect(
      await screen.findByText(messageForCodePlain('DUPLICATE_TRANSFER_LINE'), { exact: false }),
    ).toBeInTheDocument()
  })
})
