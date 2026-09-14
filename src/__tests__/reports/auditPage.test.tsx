/**
 * Phase 12 — Audit log UI: filters, pagination, detail drawer, CSV.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuditPage } from '@/pages/admin/AuditPage'
import { downloadCsv } from '@/lib/csvExport'
import type { AuditLogFilters, AuditLogRow } from '@/hooks/useAuditLog'
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '@/hooks/useAuditLog'

const rowA: AuditLogRow = {
  id: 'evt-1',
  actor_id: 'admin-1',
  action: 'complete_sale',
  entity_type: 'sale',
  entity_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  depot_id: 'depot-a',
  before_value: { status: 'cart' },
  after_value: { status: 'completed', total_cfa: 1500 },
  occurred_at: '2024-02-10T12:00:00.000Z',
  actor_name: 'Admin User',
  actor_username: 'admin',
}

const rowB: AuditLogRow = {
  ...rowA,
  id: 'evt-2',
  action: 'process_return',
  entity_type: 'sale_return',
  depot_id: null,
  before_value: null,
  after_value: { refund_amount_cfa: 300 },
  occurred_at: '2024-02-10T16:00:00.000Z',
  actor_name: 'Admin User',
  actor_username: 'admin',
}

let lastFilters: AuditLogFilters | null = null
const auditState = {
  data: { data: [rowA, rowB], count: 100 },
  isLoading: false,
  isError: false,
}

vi.mock('@/hooks/useAuditLog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAuditLog')>()
  return {
    ...actual,
    useAuditLog: (filters: AuditLogFilters) => {
      lastFilters = filters
      return auditState
    },
  }
})

vi.mock('@/hooks/useStaff', () => ({
  useStaffList: () => ({
    data: {
      data: [{ id: 'admin-1', full_name: 'Admin User', username: 'admin' }],
      count: 1,
    },
    isLoading: false,
  }),
}))

const depotState = {
  currentDepotId: null as string | null,
  currentDepotName: null as string | null,
}

vi.mock('@/stores/depotStore', () => ({
  useDepotStore: (sel: (s: typeof depotState) => unknown) => sel(depotState),
}))

vi.mock('@/hooks/useInventory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useInventory')>()
  return {
    ...actual,
    useDepotOptions: vi.fn(() => ({
      data: [{ id: 'depot-a', name: 'Depot Dakar', code: 'DKR' }],
      isLoading: false,
    })),
  }
})

vi.mock('@/lib/csvExport', () => ({
  downloadCsv: vi.fn(),
}))

describe('AuditPage', () => {
  beforeEach(() => {
    lastFilters = null
    auditState.data = { data: [rowA, rowB], count: 100 }
    auditState.isLoading = false
    auditState.isError = false
    depotState.currentDepotId = null
    depotState.currentDepotName = null
    vi.mocked(downloadCsv).mockClear()
  })

  it('renders filter controls including actions and entity types', () => {
    render(<AuditPage />)
    expect(screen.getByText('All actions')).toBeInTheDocument()
    expect(screen.getByText('All entity types')).toBeInTheDocument()
    expect(screen.getByDisplayValue('All actions')).toBeInTheDocument()
    expect(screen.getByDisplayValue('All entity types')).toBeInTheDocument()
    expect((screen.getByDisplayValue('All actions') as HTMLSelectElement).options.length)
      .toBe(AUDIT_ACTIONS.length + 1)
    expect((screen.getByDisplayValue('All entity types') as HTMLSelectElement).options.length)
      .toBe(AUDIT_ENTITY_TYPES.length + 1)
    expect(screen.getByPlaceholderText(/Entity id/)).toBeInTheDocument()
    expect(screen.getByText(/All depots — includes global events/)).toBeInTheDocument()
  })

  it('applies action, entity, actor, and entity-id filters', async () => {
    const user = userEvent.setup()
    render(<AuditPage />)
    await user.selectOptions(screen.getByDisplayValue('All actions'), 'complete_sale')
    await user.selectOptions(screen.getByDisplayValue('All entity types'), 'sale')
    await user.selectOptions(screen.getByDisplayValue('All actors'), 'admin-1')
    await user.type(screen.getByPlaceholderText(/Entity id/), 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
    expect(lastFilters?.action).toBe('complete_sale')
    expect(lastFilters?.entityType).toBe('sale')
    expect(lastFilters?.actorId).toBe('admin-1')
    expect(lastFilters?.entityIdSearch).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
  })

  it('scopes to a depot and hides global-events copy', () => {
    depotState.currentDepotId = 'depot-a'
    depotState.currentDepotName = 'Depot Dakar'
    render(<AuditPage />)
    expect(screen.getByText(/events for this depot only/)).toBeInTheDocument()
    expect(lastFilters?.depotId).toBe('depot-a')
  })

  it('paginates when more than one page of events exists', async () => {
    const user = userEvent.setup()
    render(<AuditPage />)
    expect(screen.getByText('100 events')).toBeInTheDocument()
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(lastFilters?.page).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(lastFilters?.page).toBe(1)
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('opens the detail drawer with before/after JSON', async () => {
    const user = userEvent.setup()
    render(<AuditPage />)
    await user.click(screen.getByRole('button', { name: /complete_sale/ }))
    expect(screen.getByText('Audit event')).toBeInTheDocument()
    expect(screen.getByText('Before')).toBeInTheDocument()
    expect(screen.getByText('After')).toBeInTheDocument()
    expect(screen.getByText(/"status": "cart"/)).toBeInTheDocument()
    expect(screen.getByText(/"total_cfa": 1500/)).toBeInTheDocument()
    expect(screen.queryByText('Global / all depots')).not.toBeInTheDocument()
  })

  it('shows Global / all depots in the drawer for null depot_id', async () => {
    const user = userEvent.setup()
    render(<AuditPage />)
    await user.click(screen.getByRole('button', { name: /process_return/ }))
    expect(screen.getByText('Global / all depots')).toBeInTheDocument()
  })

  it('exports the current page as CSV', async () => {
    const user = userEvent.setup()
    render(<AuditPage />)
    await user.click(screen.getByRole('button', { name: 'Export CSV' }))
    expect(downloadCsv).toHaveBeenCalledTimes(1)
    const call = vi.mocked(downloadCsv).mock.calls[0]
    expect(call[0]).toMatch(/^audit-log-/)
    expect(call[2][0]).toEqual(expect.arrayContaining([
      rowA.occurred_at,
      'Admin User',
      'complete_sale',
      'sale',
    ]))
  })
})
