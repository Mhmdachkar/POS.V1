/**
 * Shared table CSV/XLSX export — French Excel friendly.
 *
 * CSV: UTF-8 BOM + ";" delimiter.
 * XLSX: bold filled header, freeze, AutoFilter, content widths, Abidjan dates.
 */

import * as XLSX from 'xlsx-js-style'
import { DISPLAY_TIME_ZONE, formatReportDateTime } from '@/lib/formatters'
import { fetchBusinessSettings } from '@/hooks/useBusinessSettings'

export const LIST_EXPORT_MAX_ROWS = 2000

export type ExportCellKind = 'text' | 'money' | 'qty' | 'date' | 'bool' | 'enum'

export interface ExportColumn {
  header: string
  /** Column letter width hint; also used for AutoFilter. */
  kind?: ExportCellKind
  /** Include in TOTAUX when money/qty. */
  total?: boolean
}

export interface TableExportMeta {
  title: string
  sheetName: string
  basename: string
  depotName?: string | null
  /** Human-readable period / filter summary lines. */
  filterLines?: string[]
  companyName?: string | null
}

export interface TableExportRow {
  cells: unknown[]
  /** When true, excluded from TOTAUX (e.g. voided / Annulée). */
  excludeFromTotals?: boolean
}

const HEADER_FILL = { patternType: 'solid' as const, fgColor: { rgb: 'D9E2F3' } }
const HEADER_FONT = { bold: true, color: { rgb: '1F2937' } }
const META_FONT = { bold: true }
const TOTAL_FILL = { patternType: 'solid' as const, fgColor: { rgb: 'FFF2CC' } }

/** Whole CFA integer for export (never fractional). */
export function exportCfaInt(amount: number | null | undefined): number {
  return Math.round(Number(amount ?? 0) || 0)
}

export function exportOuiNon(value: boolean | null | undefined): string {
  if (value == null) return ''
  return value ? 'Oui' : 'Non'
}

/** Excel date value in Africa/Abidjan wall clock (Date object for SheetJS). */
export function exportExcelDate(iso: string | null | undefined): Date | string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  // Local Date with Abidjan wall-clock parts → timezone-naive Excel serial.
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIME_ZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(d)
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '00'
  return new Date(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    Number(get('hour')),
    Number(get('minute')),
    Number(get('second')),
  )
}

export function exportDateLabel(iso: string | null | undefined): string {
  return formatReportDateTime(iso)
}

function escapeCsvCell(value: unknown): string {
  let s: string
  if (value == null) s = ''
  else if (value instanceof Date) s = formatReportDateTime(value.toISOString())
  else s = String(value)
  if (/[";\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function contentWidth(values: unknown[], min = 10, max = 42): number {
  let w = min
  for (const v of values) {
    const s = v instanceof Date ? 'dd/mm/yyyy hh:mm' : String(v ?? '')
    w = Math.max(w, Math.min(max, s.length + 2))
  }
  return w
}

function applyHeaderStyle(ws: XLSX.WorkSheet, headerRowIndex: number, colCount: number): void {
  for (let C = 0; C < colCount; C++) {
    const addr = XLSX.utils.encode_cell({ r: headerRowIndex, c: C })
    const cell = ws[addr] as (XLSX.CellObject & { s?: Record<string, unknown> }) | undefined
    if (!cell) continue
    cell.s = {
      ...(cell.s ?? {}),
      font: HEADER_FONT,
      fill: HEADER_FILL,
      alignment: { vertical: 'center', wrapText: true },
    }
  }
}

function applyDateFormats(
  ws: XLSX.WorkSheet,
  dateCols: Set<number>,
  startRow: number,
  endRow: number,
): void {
  for (let R = startRow; R <= endRow; R++) {
    for (const C of dateCols) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[addr] as (XLSX.CellObject & { z?: string }) | undefined
      if (!cell || cell.v == null || cell.v === '') continue
      if (cell.v instanceof Date || typeof cell.v === 'number') {
        cell.t = 'd'
        cell.z = 'dd/mm/yyyy hh:mm'
      }
    }
  }
}

function applyMoneyFormats(
  ws: XLSX.WorkSheet,
  moneyCols: Set<number>,
  startRow: number,
  endRow: number,
): void {
  for (let R = startRow; R <= endRow; R++) {
    for (const C of moneyCols) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[addr] as (XLSX.CellObject & { z?: string }) | undefined
      if (!cell || typeof cell.v !== 'number') continue
      cell.t = 'n'
      cell.z = '#,##0'
    }
  }
}

export async function resolveExportCompanyName(override?: string | null): Promise<string> {
  if (override?.trim()) return override.trim()
  try {
    const settings = await fetchBusinessSettings()
    return settings.business_name?.trim() || 'Aquilux POS'
  } catch {
    return 'Aquilux POS'
  }
}

function buildMetaBlock(meta: TableExportMeta, company: string, colCount: number): unknown[][] {
  const nowLabel = formatReportDateTime(new Date().toISOString())
  const lines: unknown[][] = [
    [company, meta.depotName ? `Dépôt : ${meta.depotName}` : ''],
    [meta.title],
  ]
  for (const line of meta.filterLines ?? []) {
    if (line.trim()) lines.push([line])
  }
  lines.push([`Édité le ${nowLabel}`])
  lines.push([]) // blank before header
  // Pad rows to colCount for cleaner sheet
  return lines.map((row) => {
    const out = [...row]
    while (out.length < colCount) out.push('')
    return out
  })
}

function buildTotalsRow(
  columns: ExportColumn[],
  dataRows: TableExportRow[],
): unknown[] | null {
  const hasTotal = columns.some((c) => c.total && (c.kind === 'money' || c.kind === 'qty'))
  if (!hasTotal) return null
  const included = dataRows.filter((r) => !r.excludeFromTotals)
  const totals: unknown[] = columns.map((col, i) => {
    if (i === 0) return 'TOTAUX'
    if (!col.total || (col.kind !== 'money' && col.kind !== 'qty')) return ''
    let sum = 0
    for (const row of included) {
      const v = row.cells[i]
      if (typeof v === 'number' && Number.isFinite(v)) sum += v
    }
    return col.kind === 'money' ? exportCfaInt(sum) : Math.round(sum * 1000) / 1000
  })
  return totals
}

export function buildTableExportAoa(
  columns: ExportColumn[],
  dataRows: TableExportRow[],
  meta: TableExportMeta,
  company: string,
): { aoa: unknown[][]; headerRowIndex: number; dataStartRow: number; dataEndRow: number } {
  const colCount = columns.length
  const metaRows = buildMetaBlock(meta, company, colCount)
  const header = columns.map((c) => c.header)
  const body = dataRows.map((r) => {
    const cells = r.cells.map((v, i) => {
      const kind = columns[i]?.kind
      if (kind === 'money' && (typeof v === 'number' || (typeof v === 'string' && v !== ''))) {
        return exportCfaInt(typeof v === 'number' ? v : Number(v))
      }
      // Keep ISO strings here; XLSX writer converts, CSV formats as Abidjan label.
      if (kind === 'date' && v instanceof Date) return v.toISOString()
      return v ?? ''
    })
    while (cells.length < colCount) cells.push('')
    return cells
  })
  const totals = buildTotalsRow(columns, dataRows)
  const aoa: unknown[][] = [...metaRows, header, ...body]
  if (totals) aoa.push(totals)
  const headerRowIndex = metaRows.length
  const dataStartRow = headerRowIndex + 1
  const dataEndRow = headerRowIndex + body.length
  return { aoa, headerRowIndex, dataStartRow, dataEndRow }
}

export function downloadTableCsv(
  filename: string,
  columns: ExportColumn[],
  dataRows: TableExportRow[],
  meta: TableExportMeta,
  company: string,
): void {
  const { aoa, headerRowIndex } = buildTableExportAoa(columns, dataRows, meta, company)
  // CSV: dates as Abidjan labels (not Excel serials)
  const csvAoa = aoa.map((row, ri) =>
    row.map((cell, ci) => {
      const kind = ri > headerRowIndex ? columns[ci]?.kind : undefined
      if (kind === 'date' && typeof cell === 'string' && cell) return formatReportDateTime(cell)
      if (cell instanceof Date) return formatReportDateTime(cell.toISOString())
      if (kind === 'money' && typeof cell === 'number') return exportCfaInt(cell)
      return cell
    }),
  )
  const lines = csvAoa.map((row) => row.map(escapeCsvCell).join(';'))
  const bom = '\uFEFF'
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export function downloadTableXlsx(
  filename: string,
  columns: ExportColumn[],
  dataRows: TableExportRow[],
  meta: TableExportMeta,
  company: string,
): void {
  const { aoa, headerRowIndex, dataStartRow, dataEndRow } = buildTableExportAoa(
    columns,
    dataRows,
    meta,
    company,
  )
  // Convert date columns to Excel dates for the sheet only
  const sheetAoa = aoa.map((row, ri) => {
    if (ri <= headerRowIndex) return row
    return row.map((cell, ci) => {
      if (columns[ci]?.kind === 'date' && typeof cell === 'string' && cell) {
        return exportExcelDate(cell)
      }
      return cell
    })
  })
  const ws = XLSX.utils.aoa_to_sheet(sheetAoa)
  const colCount = columns.length

  // Content-based widths
  ws['!cols'] = columns.map((col, i) => {
    const vals = [col.header, ...dataRows.map((r) => r.cells[i])]
    return { wch: contentWidth(vals, col.kind === 'date' ? 16 : 10) }
  })

  // Freeze below header
  ws['!freeze'] = { xSplit: 0, ySplit: headerRowIndex + 1, topLeftCell: `A${headerRowIndex + 2}`, activePane: 'bottomLeft', state: 'frozen' }
  // SheetJS views form (more compatible)
  ws['!views'] = [{ state: 'frozen', ySplit: headerRowIndex + 1, topLeftCell: `A${headerRowIndex + 2}` }]

  // AutoFilter on header + data (not totals)
  if (dataEndRow >= dataStartRow) {
    const endCol = XLSX.utils.encode_col(colCount - 1)
    ws['!autofilter'] = {
      ref: `A${headerRowIndex + 1}:${endCol}${dataEndRow + 1}`,
    }
  }

  applyHeaderStyle(ws, headerRowIndex, colCount)

  // Bold meta rows
  for (let R = 0; R < headerRowIndex; R++) {
    const addr = XLSX.utils.encode_cell({ r: R, c: 0 })
    const cell = ws[addr] as (XLSX.CellObject & { s?: Record<string, unknown> }) | undefined
    if (cell) cell.s = { ...(cell.s ?? {}), font: META_FONT }
  }

  // Totals row style
  const totalsRow = dataEndRow + 1
  if (aoa.length > totalsRow) {
    for (let C = 0; C < colCount; C++) {
      const addr = XLSX.utils.encode_cell({ r: totalsRow, c: C })
      const cell = ws[addr] as (XLSX.CellObject & { s?: Record<string, unknown> }) | undefined
      if (!cell) continue
      cell.s = { ...(cell.s ?? {}), font: { bold: true }, fill: TOTAL_FILL }
    }
  }

  const dateCols = new Set(columns.map((c, i) => (c.kind === 'date' ? i : -1)).filter((i) => i >= 0))
  const moneyCols = new Set(columns.map((c, i) => (c.kind === 'money' ? i : -1)).filter((i) => i >= 0))
  applyDateFormats(ws, dateCols, dataStartRow, Math.max(dataEndRow, totalsRow))
  applyMoneyFormats(ws, moneyCols, dataStartRow, Math.max(dataEndRow, totalsRow))

  const wb = XLSX.utils.book_new()
  const safeName = meta.sheetName.slice(0, 31).replace(/[\\/?*[\]:]/g, '_') || 'Feuille'
  XLSX.utils.book_append_sheet(wb, ws, safeName)
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

export async function exportTable(opts: {
  kind: 'csv' | 'xlsx'
  columns: ExportColumn[]
  rows: TableExportRow[]
  meta: TableExportMeta
  companyName?: string | null
}): Promise<void> {
  const company = await resolveExportCompanyName(opts.companyName)
  if (opts.kind === 'csv') {
    downloadTableCsv(opts.meta.basename, opts.columns, opts.rows, opts.meta, company)
    return
  }
  downloadTableXlsx(opts.meta.basename, opts.columns, opts.rows, opts.meta, company)
}

/** @deprecated Prefer exportTable — kept for gradual migration. */
export { exportTable as exportFilteredList }
