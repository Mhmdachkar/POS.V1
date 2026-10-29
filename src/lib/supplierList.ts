export const SUPPLIERS_SEARCH_DEBOUNCE_MS = 300

export type SupplierSortBy = 'name' | 'balance_owed_cfa'
export type SupplierSortDir = 'asc' | 'desc'

export function matchesSupplierSearch(
  row: { name: string; phone: string | null },
  search: string,
): boolean {
  const q = search.trim().toLowerCase()
  if (!q) return true
  return row.name.toLowerCase().includes(q) || (row.phone ?? '').toLowerCase().includes(q)
}

export function compareSuppliers(
  a: { name: string; balance_owed_cfa: number },
  b: { name: string; balance_owed_cfa: number },
  sortBy: SupplierSortBy,
  sortDir: SupplierSortDir,
): number {
  const dir = sortDir === 'desc' ? -1 : 1
  if (sortBy === 'balance_owed_cfa') {
    const diff = Number(a.balance_owed_cfa) - Number(b.balance_owed_cfa)
    if (diff !== 0) return dir * (diff > 0 ? 1 : -1)
  }
  return dir * a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' })
}

export function nextSupplierSort(
  currentBy: SupplierSortBy,
  currentDir: SupplierSortDir,
  clicked: SupplierSortBy,
): { sortBy: SupplierSortBy; sortDir: SupplierSortDir } {
  if (currentBy === clicked) {
    return { sortBy: clicked, sortDir: currentDir === 'asc' ? 'desc' : 'asc' }
  }
  return { sortBy: clicked, sortDir: clicked === 'balance_owed_cfa' ? 'desc' : 'asc' }
}

/** Empty → null. Whole number ≥ 0. Otherwise invalid. */
export function parsePaymentTermDays(raw: string): { ok: true; days: number | null } | { ok: false } {
  const trimmed = raw.trim()
  if (!trimmed) return { ok: true, days: null }
  if (!/^\d+$/.test(trimmed)) return { ok: false }
  const days = Number(trimmed)
  if (!Number.isInteger(days) || days < 0) return { ok: false }
  return { ok: true, days }
}

export function supplierExportRows(
  rows: Array<{
    name: string
    phone: string | null
    email?: string | null
    balance_owed_cfa: number
    is_active: boolean
    payment_term_days?: number | null
    address: string | null
    notes?: string | null
  }>,
): unknown[][] {
  return rows.map((r) => [
    r.name,
    r.phone ?? '',
    r.email ?? '',
    Number(r.balance_owed_cfa) || 0,
    r.is_active ? 'Actif' : 'Inactif',
    r.payment_term_days ?? '',
    r.address ?? '',
    r.notes ?? '',
  ])
}

export const SUPPLIER_EXPORT_HEADERS = [
  'Nom',
  'Téléphone',
  'E-mail',
  'Solde dû',
  'Statut',
  'Délai (jours)',
  'Adresse',
  'Notes',
]

export function formatSupplierPaymentTerm(
  days: number | null | undefined,
  unit: string,
): string {
  if (days == null) return ''
  return `${days} ${unit}`
}
