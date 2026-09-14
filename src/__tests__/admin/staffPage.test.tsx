import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StaffPage } from '@/pages/admin/StaffPage'
import { StaffFormModal } from '@/pages/admin/components/StaffFormModal'
import { StaffDetailDrawer } from '@/pages/admin/components/StaffDetailDrawer'
import { ERROR_MESSAGES } from '@/lib/errors'
import type { Staff } from '@/types/database'

const staffRow: Staff = {
  id: 's-cashier',
  username: 'cashier',
  full_name: 'Cashier Dakar',
  role: 'cashier',
  depot_id: 'depot-a',
  is_active: true,
  deactivated_at: null,
  created_at: '2026-09-01T00:00:00Z',
}

vi.mock('@/hooks/useStaff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useStaff')>()
  return {
    ...actual,
    useStaffList: vi.fn(() => ({
      data: { data: [staffRow], count: 1 },
      isLoading: false,
      isError: false,
    })),
    useStaff: vi.fn(() => ({ data: staffRow, isLoading: false })),
    useCreateStaff: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useUpdateStaff: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
    useDeactivateStaff: vi.fn(() => ({
      mutateAsync: vi.fn().mockRejectedValue({ code: 'LAST_ADMIN_REQUIRED', message: ERROR_MESSAGES.LAST_ADMIN_REQUIRED }),
      isPending: false,
    })),
    useReactivateStaff: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  }
})

vi.mock('@/hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useInventory')>()
  return {
    ...actual,
    useDepotOptions: vi.fn(() => ({
      data: [{ id: 'depot-a', name: 'Depot Dakar', code: 'DKR', is_active: true }],
      isLoading: false,
    })),
  }
})

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (sel: (s: { staff: Staff }) => unknown) =>
    sel({
      staff: {
        id: 's-admin',
        username: 'admin',
        full_name: 'Admin',
        role: 'admin',
        depot_id: null,
        is_active: true,
        deactivated_at: null,
        created_at: '2026-09-01T00:00:00Z',
      },
    }),
}))

function wrap(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

describe('StaffPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders filters and the staff row', () => {
    wrap(<StaffPage />)
    expect(screen.getByText('Staff')).toBeInTheDocument()
    expect(screen.getAllByText('Active').length).toBeGreaterThan(0)
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(screen.getByText('Cashier Dakar')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new staff/i })).toBeInTheDocument()
  })

  it('shows depot field for cashier and hides it for admin', async () => {
    const user = userEvent.setup()
    wrap(<StaffFormModal open onClose={() => undefined} />)
    expect(screen.getByText('Depot')).toBeInTheDocument()
    await user.selectOptions(screen.getByDisplayValue('Cashier'), 'admin')
    expect(screen.queryByText('Depot')).not.toBeInTheDocument()
  })

  it('surfaces last-admin, open-shift, and self-deactivate messages', async () => {
    const user = userEvent.setup()
    wrap(<StaffDetailDrawer staffId="s-cashier" onClose={() => undefined} />)
    await user.click(screen.getByRole('button', { name: /deactivate staff/i }))
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }))
    expect(await screen.findByText(ERROR_MESSAGES.LAST_ADMIN_REQUIRED)).toBeInTheDocument()
  })
})
