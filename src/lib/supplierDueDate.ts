/**
 * Credit BR due date from document_date + supplier payment_term_days.
 * Computed only — no due_date column on purchase_receipts.
 */

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export function todayYmdAbidjan(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Abidjan',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

export function creditDueDateYmd(
  documentDateYmd: string | null | undefined,
  paymentTermDays: number | null | undefined,
): string | null {
  if (!documentDateYmd || paymentTermDays == null) return null
  if (!Number.isInteger(paymentTermDays) || paymentTermDays < 0) return null
  return addDaysYmd(documentDateYmd.slice(0, 10), paymentTermDays)
}

export function isCreditOverdue(
  documentDateYmd: string | null | undefined,
  paymentTermDays: number | null | undefined,
  paymentMode: 'paid' | 'credit' | null | undefined,
  todayYmd = todayYmdAbidjan(),
): boolean {
  if (paymentMode !== 'credit') return false
  const due = creditDueDateYmd(documentDateYmd, paymentTermDays)
  if (!due) return false
  return due < todayYmd
}
