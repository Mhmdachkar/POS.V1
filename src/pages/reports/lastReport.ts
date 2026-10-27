const KEY = 'posv1.reports.last'

export function rememberReport(pathname: string, search: string) {
  if (!pathname.startsWith('/reports/')) return
  try {
    sessionStorage.setItem(KEY, `${pathname}${search}`)
  } catch {
    /* private mode */
  }
}

export function lastReportPath(): string {
  try {
    const saved = sessionStorage.getItem(KEY)
    if (saved && saved.startsWith('/reports/')) return saved
  } catch {
    /* private mode */
  }
  return '/reports/sales/summary'
}
