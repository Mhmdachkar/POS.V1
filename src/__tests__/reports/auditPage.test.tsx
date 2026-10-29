import { COMMON } from '@/lib/bilingual/common'
import { ADMIN } from '@/lib/bilingual/admin'
import { within } from '@testing-library/react'
/**
 * Phase 12 — Audit log UI: filters, pagination, detail drawer, CSV.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuditPage } from '@/pages/admin/AuditPage'
import { downloadCsv } from '@/lib/csvExport'
import { formatDateTime } from '@/lib/formatters'
import { auditEventSummary } from '@/lib/auditPresentation'
import { bilingualPlain } from '@/lib/bilingual/types'
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

vi.mock('@/hooks/useAuditEventUnits', () => ({
  useAuditEventUnits: () => ({ data: null, isLoading: false }),
}))

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
    expect(screen.getByText(ADMIN.allActions.fr)).toBeInTheDocument()
    expect(screen.getByText(ADMIN.allEntityTypes.fr)).toBeInTheDocument()
    expect(screen.getByDisplayValue(ADMIN.allActions.fr)).toBeInTheDocument()
    expect(screen.getByDisplayValue(ADMIN.allEntityTypes.fr)).toBeInTheDocument()
    expect((screen.getByDisplayValue(ADMIN.allActions.fr) as HTMLSelectElement).options.length)
      .toBe(AUDIT_ACTIONS.length + 1)
    expect((screen.getByDisplayValue(ADMIN.allEntityTypes.fr) as HTMLSelectElement).options.length)
      .toBe(AUDIT_ENTITY_TYPES.length + 1)
    expect(screen.getByPlaceholderText(/Réf\. élément|Item ref/i)).toBeInTheDocument()
    expect(screen.getByText(ADMIN.allDepotsIncludesGlobal.fr)).toBeInTheDocument()
  })

  it('applies action, entity, actor, and entity-id filters', async () => {
    const user = userEvent.setup()
    render(<AuditPage />)
    await user.selectOptions(screen.getByDisplayValue(ADMIN.allActions.fr), 'complete_sale')
    await user.selectOptions(screen.getByDisplayValue(ADMIN.allEntityTypes.fr), 'sale')
    await user.selectOptions(screen.getByDisplayValue(ADMIN.allActors.fr), 'admin-1')
    await user.type(screen.getByPlaceholderText(/Réf\. élément|Item ref/i), 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')
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
    await user.click(screen.getByRole('button', { name: COMMON.next.fr }))
    expect(lastFilters?.page).toBe(1)
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })

  it('opens the detail drawer with before/after JSON', async () => {
    const user = userEvent.setup()
    render(<AuditPage />)
    await user.click(screen.getByRole('button', { name: /Vente finalisée.*1.*500|Sale completed.*1.*500/i }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Ce qui a changé')).toBeInTheDocument()
    expect(screen.getAllByText(/CFA 1[\s\u202f]?500|1[\s\u202f]?500/).length).toBeGreaterThan(0)
    // rowA has depot_id = 'depot-a' (Depot Dakar) — the drawer description should NOT say global
    expect(within(dialog).queryByText(/Tous les dépôts|All depots/)).not.toBeInTheDocument()
  })

  it('shows Tous les dépôts in the drawer for null depot_id', async () => {
    const user = userEvent.setup()
    render(<AuditPage />)
    await user.click(screen.getByRole('button', { name: /Retour traité|Return processed/i }))
    // The depot label is in the drawer description header; scope to the dialog
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getAllByText((content, node) => (node?.textContent ?? '').includes(ADMIN.globalDepots.fr)).length).toBeGreaterThan(0)
  })

  it('exports the current page as CSV', async () => {
    const user = userEvent.setup()
    render(<AuditPage />)
    await user.click(screen.getByRole('button', { name: COMMON.exportCsv.fr }))
    expect(downloadCsv).toHaveBeenCalledTimes(1)
    const call = vi.mocked(downloadCsv).mock.calls[0]
    expect(call[0]).toMatch(/^audit-log-/)
    expect(call[2][0]).toEqual(expect.arrayContaining([
      formatDateTime(rowA.occurred_at),
      'Admin User',
      bilingualPlain(auditEventSummary(rowA)),
      'sale',
    ]))
  })
})
