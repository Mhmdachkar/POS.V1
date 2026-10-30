/**
 * Shared table CSV/XLSX export — French Excel friendly.
 *
 * CSV: UTF-8 BOM + ";" delimiter.
 * XLSX: bold filled header, freeze below header, AutoFilter, content widths,
 * Abidjan wall-clock dates as real Excel serials (dd/mm/yyyy hh:mm).
 */

import * as XLSX from 'xlsx-js-style'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { DISPLAY_TIME_ZONE, formatReportDateTime } from '@/lib/formatters'
import { fetchBusinessSettings } from '@/hooks/useBusinessSettings'

export const LIST_EXPORT_MAX_ROWS = 2000

export type ExportCellKind = 'text' | 'money' | 'qty' | 'date' | 'bool' | 'enum'

export interface ExportColumn {
  header: string
  kind?: ExportCellKind
  /** Include in TOTAUX when money/qty. */
  total?: boolean
}

export interface TableExportMeta {
  title: string
  sheetName: string
  basename: string
  depotName?: string | null
  filterLines?: string[]
  companyName?: string | null
}

export interface TableExportRow {
  cells: unknown[]
  /** When true, excluded from TOTAUX (e.g. voided / Annulée). */
  excludeFromTotals?: boolean
}

export interface StyledSheetSpec {
  name: string
  aoa: unknown[][]
  /** 0-based header row index (freeze is the row below). */
  headerRowIndex: number
  /** 0-based columns that hold Excel date serials / ISO strings to convert. */
  dateCols?: number[]
  moneyCols?: number[]
  /** AutoFilter covers header..lastDataRow (0-based inclusive). */
  lastDataRow?: number
  freeze?: boolean
}

const HEADER_FILL = { patternType: 'solid' as const, fgColor: { rgb: 'D9E2F3' } }
const HEADER_FONT = { bold: true, color: { rgb: '1F2937' } }
const META_FONT = { bold: true }
const TOTAL_FILL = { patternType: 'solid' as const, fgColor: { rgb: 'FFF2CC' } }

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/

/** Whole CFA integer for export (never fractional). */
export function exportCfaInt(amount: number | null | undefined): number {
  return Math.round(Number(amount ?? 0) || 0)
}

export function exportOuiNon(value: boolean | null | undefined): string {
  if (value == null) return ''
  return value ? 'Oui' : 'Non'
}

/** True when a status label should be left out of TOTAUX. */
export function isVoidedExportStatus(value: unknown): boolean {
  const s = String(value ?? '').trim().toLowerCase()
  return (
    s === 'cancelled'
    || s === 'canceled'
    || s === 'voided'
    || s === 'annulé'
    || s === 'annule'
    || s === 'annulée'
    || s === 'annulee'
  )
}

function abidjanParts(iso: string): {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
} | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
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
  return {
    year: Number(get('year')),
    month: Number(get('month')),
    day: Number(get('day')),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    second: Number(get('second')),
  }
}

/**
 * Excel serial for Africa/Abidjan wall clock.
 * Keep cell.t = 'n' with z = 'dd/mm/yyyy hh:mm' — never t='d' on a serial
 * (xlsx-js-style then rewrites it as 1970-01-01).
 */
export function exportExcelSerial(iso: string | null | undefined): number | '' {
  if (!iso || !ISO_DATE_RE.test(String(iso).trim())) return ''
  const p = abidjanParts(String(iso).trim())
  if (!p) return ''
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) / 86_400_000 + 25569
}

/** @deprecated Prefer exportExcelSerial — kept for callers/tests. */
export function exportExcelDate(iso: string | null | undefined): Date | string {
  if (!iso) return ''
  const p = abidjanParts(iso)
  if (!p) return ''
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
}

export function exportDateLabel(iso: string | null | undefined): string {
  if (!iso || !ISO_DATE_RE.test(String(iso).trim())) return iso ? String(iso) : ''
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
    const s = typeof v === 'number' && v > 20_000 && v < 100_000
      ? 'dd/mm/yyyy hh:mm'
      : String(v ?? '')
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
      const cell = ws[addr] as (XLSX.CellObject & { z?: string; t?: string }) | undefined
      if (!cell || cell.v == null || cell.v === '') continue
      if (typeof cell.v === 'number') {
        // Keep numeric Excel serial — do NOT set t='d'
        cell.t = 'n'
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

/** xlsx-js-style emits empty <sheetView/> — inject real freeze panes into the zip. */
export function injectFreezePanes(xlsxBytes: Uint8Array, ySplitBySheetIndex: number[]): Uint8Array {
  const files = unzipSync(xlsxBytes)
  const sheetNames = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(n))
    .sort((a, b) => {
      const na = Number(a.match(/sheet(\d+)/i)?.[1] ?? 0)
      const nb = Number(b.match(/sheet(\d+)/i)?.[1] ?? 0)
      return na - nb
    })
  sheetNames.forEach((name, idx) => {
    const ySplit = ySplitBySheetIndex[idx]
    if (ySplit == null || ySplit <= 0) return
    const xml = strFromU8(files[name]!)
    const pane =
      `<pane ySplit="${ySplit}" topLeftCell="A${ySplit + 1}" activePane="bottomLeft" state="frozen"/>`
    let next = xml
    if (next.includes('<sheetViews/>')) {
      next = next.replace(
        '<sheetViews/>',
        `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews>`,
      )
    } else if (/<sheetView\b[^>]*\/>/.test(next)) {
      next = next.replace(/<sheetView\b([^>]*)\/>/, `<sheetView$1>${pane}</sheetView>`)
    } else if (/<sheetView\b[^>]*>/.test(next) && !next.includes('<pane ')) {
      next = next.replace(/<sheetView\b([^>]*)>/, `<sheetView$1>${pane}`)
    } else if (next.includes('<sheetData')) {
      next = next.replace(
        '<sheetData',
        `<sheetViews><sheetView workbookViewId="0">${pane}</sheetView></sheetViews><sheetData`,
      )
    }
    files[name] = strToU8(next)
  })
  return zipSync(files, { level: 6 })
}

function triggerDownload(filename: string, bytes: Uint8Array, mime: string): void {
  const blob = new Blob([bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)], {
    type: mime,
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
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
  lines.push([])
  return lines.map((row) => {
    const out = [...row]
    while (out.length < colCount) out.push('')
    return out
  })
}

function rowExcludedFromTotals(row: TableExportRow, columns: ExportColumn[]): boolean {
  if (row.excludeFromTotals) return true
  return columns.some((col, i) => {
    if (col.kind !== 'enum' && !/statut/i.test(col.header)) return false
    return isVoidedExportStatus(row.cells[i])
  })
}

function buildTotalsRow(
  columns: ExportColumn[],
  dataRows: TableExportRow[],
): unknown[] | null {
  const hasTotal = columns.some((c) => c.total && (c.kind === 'money' || c.kind === 'qty'))
  if (!hasTotal) return null
  const included = dataRows.filter((r) => !rowExcludedFromTotals(r, columns))
  const totals: unknown[] = columns.map((col, i) => {
    if (i === 0) return 'TOTAUX'
    if (!col.total || (col.kind !== 'money' && col.kind !== 'qty')) return ''
    let sum = 0
    for (const row of included) {
      const v = row.cells[i]
      if (typeof v === 'number' && Number.isFinite(v)) sum += v
      else if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) sum += Number(v)
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

function convertSheetDates(
  aoa: unknown[][],
  dateCols: Set<number>,
  dataStartRow: number,
  dataEndRow: number,
): unknown[][] {
  return aoa.map((row, ri) => {
    if (ri < dataStartRow || ri > dataEndRow) return row
    return row.map((cell, ci) => {
      if (!dateCols.has(ci)) return cell
      if (typeof cell === 'number' && Number.isFinite(cell)) return cell
      if (typeof cell === 'string' && ISO_DATE_RE.test(cell.trim())) {
        const serial = exportExcelSerial(cell.trim())
        return serial === '' ? cell : serial
      }
      return cell
    })
  })
}

/** Low-level multi-sheet writer used by list + report exports. */
export function downloadStyledWorkbook(filename: string, sheets: StyledSheetSpec[]): void {
  const wb = XLSX.utils.book_new()
  const freezeSplits: number[] = []

  for (const sheet of sheets) {
    const colCount = Math.max(0, ...sheet.aoa.map((r) => (Array.isArray(r) ? r.length : 0)))
    const dateCols = new Set(sheet.dateCols ?? [])
    const moneyCols = new Set(sheet.moneyCols ?? [])
    const dataStart = sheet.headerRowIndex + 1
    const dataEnd = sheet.lastDataRow ?? Math.max(dataStart, sheet.aoa.length - 1)
    const sheetAoa = convertSheetDates(sheet.aoa, dateCols, dataStart, dataEnd)
    const ws = XLSX.utils.aoa_to_sheet(sheetAoa)

    if (colCount > 0) {
      ws['!cols'] = Array.from({ length: colCount }, (_, i) => {
        const vals = sheetAoa.map((row) => (Array.isArray(row) ? row[i] : ''))
        return { wch: contentWidth(vals, dateCols.has(i) ? 16 : 10) }
      })
    }

    if (sheet.freeze !== false && sheet.headerRowIndex >= 0) {
      freezeSplits.push(sheet.headerRowIndex + 1)
    } else {
      freezeSplits.push(0)
    }

    if (dataEnd >= dataStart && colCount > 0) {
      const endCol = XLSX.utils.encode_col(colCount - 1)
      ws['!autofilter'] = {
        ref: `A${sheet.headerRowIndex + 1}:${endCol}${dataEnd + 1}`,
      }
    }

    if (sheet.headerRowIndex >= 0) {
      applyHeaderStyle(ws, sheet.headerRowIndex, colCount)
      for (let R = 0; R < sheet.headerRowIndex; R++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: 0 })
        const cell = ws[addr] as (XLSX.CellObject & { s?: Record<string, unknown> }) | undefined
        if (cell) cell.s = { ...(cell.s ?? {}), font: META_FONT }
      }
    }

    // Totals row = first row after data with TOTAUX label
    for (let R = dataEnd + 1; R < sheetAoa.length; R++) {
      const row = sheetAoa[R]
      if (!Array.isArray(row)) continue
      if (!row.some((c) => c === 'TOTAUX')) continue
      for (let C = 0; C < colCount; C++) {
        const addr = XLSX.utils.encode_cell({ r: R, c: C })
        const cell = ws[addr] as (XLSX.CellObject & { s?: Record<string, unknown> }) | undefined
        if (!cell) continue
        cell.s = { ...(cell.s ?? {}), font: { bold: true }, fill: TOTAL_FILL }
      }
    }

    applyDateFormats(ws, dateCols, dataStart, Math.max(dataEnd, sheetAoa.length - 1))
    applyMoneyFormats(ws, moneyCols, dataStart, Math.max(dataEnd, sheetAoa.length - 1))

    const safeName = sheet.name.slice(0, 31).replace(/[\\/?*[\]:]/g, '_') || 'Feuille'
    XLSX.utils.book_append_sheet(wb, ws, safeName)
  }

  const raw = XLSX.write(wb, { type: 'array', bookType: 'xlsx', cellStyles: true }) as Uint8Array
  const patched = injectFreezePanes(new Uint8Array(raw), freezeSplits)
  const outName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  triggerDownload(outName, patched, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
}

export function downloadTableCsv(
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
  const csvAoa = aoa.map((row, ri) =>
    row.map((cell, ci) => {
      const kind = columns[ci]?.kind
      const inData = ri >= dataStartRow && ri <= dataEndRow
      if (inData && kind === 'date' && typeof cell === 'string' && ISO_DATE_RE.test(cell.trim())) {
        return formatReportDateTime(cell.trim())
      }
      if (cell instanceof Date) return formatReportDateTime(cell.toISOString())
      if (kind === 'money' && typeof cell === 'number') return exportCfaInt(cell)
      return cell
    }),
  )
  const lines = csvAoa.map((row) => row.map(escapeCsvCell).join(';'))
  const bom = '\uFEFF'
  const bytes = new TextEncoder().encode(bom + lines.join('\r\n'))
  triggerDownload(
    filename.endsWith('.csv') ? filename : `${filename}.csv`,
    bytes,
    'text/csv;charset=utf-8',
  )
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
  downloadStyledWorkbook(filename, [
    {
      name: meta.sheetName,
      aoa,
      headerRowIndex,
      lastDataRow: dataEndRow,
      dateCols: columns.map((c, i) => (c.kind === 'date' ? i : -1)).filter((i) => i >= 0),
      moneyCols: columns.map((c, i) => (c.kind === 'money' ? i : -1)).filter((i) => i >= 0),
      freeze: true,
    },
  ])
  void dataStartRow
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

/** Build meta + header + body AOA for report tabs that share list export chrome. */
export async function buildReportExportAoa(opts: {
  title: string
  columns: ExportColumn[]
  rows: TableExportRow[]
  depotName?: string | null
  filterLines?: string[]
  companyName?: string | null
}): Promise<{ aoa: unknown[][]; headerRowIndex: number; dataStartRow: number; dataEndRow: number; company: string }> {
  const company = await resolveExportCompanyName(opts.companyName)
  const built = buildTableExportAoa(
    opts.columns,
    opts.rows,
    {
      title: opts.title,
      sheetName: opts.title,
      basename: opts.title,
      depotName: opts.depotName,
      filterLines: opts.filterLines,
    },
    company,
  )
  return { ...built, company }
}

/** @deprecated Prefer exportTable — kept for gradual migration. */
export { exportTable as exportFilteredList }
