/**
 * Browser CSV download — UTF-8 BOM + ";" delimiter (French Excel).
 */

import { formatReportDateTime } from '@/lib/formatters'

function escapeCell(value: unknown): string {
  let s: string
  if (value == null) s = ''
  else if (value instanceof Date) s = formatReportDateTime(value.toISOString())
  else s = String(value)
  if (/[";\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

/** Legacy helper: headers + body rows. Prefer tableExport.exportTable for new code. */
export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const lines = [
    headers.map(escapeCell).join(';'),
    ...rows.map((row) => row.map(escapeCell).join(';')),
  ]
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv'
  a.click()
  URL.revokeObjectURL(url)
}

/** Full AOA CSV (meta + header + rows) with BOM + semicolon. */
export function downloadCsvAoa(filename: string, aoa: unknown[][]): void {
  const lines = aoa.map((row) => row.map(escapeCell).join(';'))
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv'
  a.click()
  URL.revokeObjectURL(url)
}
