/**
 * Phase 10 — Open shift validation and explicit POS bind.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { OpenShiftModal } from '@/pages/shifts/components/OpenShiftModal'
import { useOpenShift } from '@/hooks/useShifts'
import { ERROR_MESSAGES } from '@/lib/errors'
import { messageForCodePlain } from '@/lib/bilingual/errors'
import { useAuthStore } from '@/stores/authStore'
import type { Staff } from '@/types/database'

vi.mock('@/hooks/useShifts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useShifts')>()
  return {
    ...actual,
    useOpenShift: vi.fn(),
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
  vi.mocked(useOpenShift).mockReturnValue({
    mutateAsync,
    isPending: false,
  } as never)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <OpenShiftModal open onClose={() => {}} />
    </QueryClientProvider>,
  )
  return { mutateAsync }
}

describe('OpenShiftModal', () => {
  beforeEach(() => {
    useAuthStore.setState({ staff: cashierStaff(), session: null, isLoading: false })
  })

  it('locks depot for cashier and accepts zero float without binding POS', async () => {
    const user = userEvent.setup()
    const { mutateAsync } = renderModal()
    mutateAsync.mockResolvedValue({
      shift_id: 'new-shift',
      depot_id: 'depot-a',
      opening_float_cfa: 0,
      opened_at: '2026-09-13T08:00:00Z',
    })

    expect(screen.getByText('Depot Dakar')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Open Shift|Ouvrir un service/i }))
    expect(mutateAsync).toHaveBeenCalledWith({
      p_depot_id: 'depot-a',
      p_opening_float_cfa: 0,
    })
  })

  it('requires depot for admin and rejects negative float', async () => {
    useAuthStore.setState({ staff: adminStaff(), session: null, isLoading: false })
    const user = userEvent.setup()
    const { mutateAsync } = renderModal()

    const float = screen.getByLabelText(/Cash in Drawer|Espèces en caisse/i)
    await user.clear(float)
    await user.type(float, '-1')
    expect(screen.getByText(/Must be zero or greater|Doit être ≥ 0/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open Shift|Ouvrir un service/i })).toBeDisabled()
    expect(mutateAsync).not.toHaveBeenCalled()
  })

  it('shows mapped error on failure without binding POS', async () => {
    const user = userEvent.setup()
    const { mutateAsync } = renderModal()
    mutateAsync.mockRejectedValue({
      code: 'INVALID_AMOUNT',
      message: ERROR_MESSAGES.INVALID_AMOUNT,
    })

    await user.click(screen.getByRole('button', { name: /Open Shift|Ouvrir un service/i }))
    expect(
      await screen.findByText(messageForCodePlain('INVALID_AMOUNT'), { exact: false }),
    ).toBeInTheDocument()
  })
})
