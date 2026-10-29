/**
 * Report calendar bounds in Africa/Abidjan (matches admin_dashboard_summary).
 */

export type ReportPreset =
  | 'today'
  | 'yesterday'
  | 'this_week'
  | 'this_month'
  | 'custom'

export interface ReportDateRange {
  preset: ReportPreset
  startDate: string
  endDate: string
}

const TZ = 'Africa/Abidjan'

function ymdInAbidjan(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m, d }
}

function addDaysYmd(ymd: string, delta: number): string {
  const { y, m, d } = parseYmd(ymd)
  const utc = new Date(Date.UTC(y, m - 1, d + delta))
  return utc.toISOString().slice(0, 10)
}

/** Monday-start week in the Abidjan calendar (approximation via UTC date parts). */
function startOfWeekYmd(ymd: string): string {
  const { y, m, d } = parseYmd(ymd)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const mondayOffset = dow === 0 ? -6 : 1 - dow
  return addDaysYmd(ymd, mondayOffset)
}

function startOfMonthYmd(ymd: string): string {
  const { y, m } = parseYmd(ymd)
  return `${y}-${String(m).padStart(2, '0')}-01`
}

function endOfMonthYmd(ymd: string): string {
  const { y, m } = parseYmd(ymd)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`
}

export function resolveReportDateRange(
  preset: ReportPreset,
  customStart?: string,
  customEnd?: string,
  now: Date = new Date(),
): ReportDateRange {
  const today = ymdInAbidjan(now)

  switch (preset) {
    case 'today':
      return { preset, startDate: today, endDate: today }
    case 'yesterday': {
      const y = addDaysYmd(today, -1)
      return { preset, startDate: y, endDate: y }
    }
    case 'this_week':
      return { preset, startDate: startOfWeekYmd(today), endDate: today }
    case 'this_month':
      return { preset, startDate: startOfMonthYmd(today), endDate: endOfMonthYmd(today) }
    case 'custom': {
      const startDate = customStart?.trim() || today
      const endDate = customEnd?.trim() || startDate
      return { preset, startDate, endDate }
    }
    default:
      return { preset: 'today', startDate: today, endDate: today }
  }
}

export const REPORT_PRESET_LABELS: Record<ReportPreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  this_week: 'This week',
  this_month: 'This month',
  custom: 'Custom',
}

/** Inclusive Abidjan YMD → UTC day bounds for list RPC / PostgREST filters. */
export function listDateBounds(range: ReportDateRange | null | undefined): {
  startAt: string | null
  endAt: string | null
} {
  if (!range) return { startAt: null, endAt: null }
  return {
    startAt: `${range.startDate}T00:00:00.000Z`,
    endAt: `${range.endDate}T23:59:59.999Z`,
  }
}
