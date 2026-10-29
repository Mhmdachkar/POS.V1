/**
 * Shared CSV + Excel download for filtered list pages (Fournisseurs style).
 */

import { downloadCsv } from '@/lib/csvExport'
import { downloadXlsx } from '@/lib/reportExport'

export const LIST_EXPORT_MAX_ROWS = 2000

export function downloadListCsv(
  filename: string,
  headers: string[],
  rows: unknown[][],
): void {
  downloadCsv(filename, headers, rows)
}

export function downloadListXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: unknown[][],
): void {
  downloadXlsx(filename, [{ name: sheetName, headers, rows }])
}

export function exportFilteredList(opts: {
  kind: 'csv' | 'xlsx'
  basename: string
  sheetName: string
  headers: string[]
  rows: unknown[][]
}): void {
  if (opts.kind === 'csv') {
    downloadListCsv(opts.basename + '.csv', opts.headers, opts.rows)
    return
  }
  downloadListXlsx(opts.basename + '.xlsx', opts.sheetName, opts.headers, opts.rows)
}
