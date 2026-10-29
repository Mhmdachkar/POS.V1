/**
 * Report export helpers — XLSX workbook download and print-friendly documents.
 */

import * as XLSX from 'xlsx'
import { formatCFA } from '@/lib/formatters'

export interface XlsxSheet {
  name: string
  headers: string[]
  rows: unknown[][]
  /** When true, `rows` is a full AOA including titles (headers ignored). */
  rawAoa?: boolean
  /** Explicit column widths (characters). Falls back to heuristic widths. */
  colWidths?: number[]
  /** Enable wrap on all cells (helps long product names). */
  wrapText?: boolean
  /** Bold cells in column A for label rows (summary / section titles). */
  boldFirstColLabels?: boolean
}

function applyNumberFormats(ws: XLSX.WorkSheet): void {
  if (!ws['!ref'] || typeof XLSX.utils.decode_range !== 'function') return
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[addr] as XLSX.CellObject | undefined
      if (!cell || typeof cell.v !== 'number' || !Number.isFinite(cell.v)) continue
      cell.t = 'n'
      cell.z = '#,##0'
    }
  }
}

function applyWrapAndBold(
  ws: XLSX.WorkSheet,
  opts: { wrapText?: boolean; boldFirstColLabels?: boolean },
): void {
  if (!ws['!ref'] || typeof XLSX.utils.decode_range !== 'function') return
  const range = XLSX.utils.decode_range(ws['!ref'])
  for (let R = range.s.r; R <= range.e.r; R++) {
    for (let C = range.s.c; C <= range.e.c; C++) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C })
      const cell = ws[addr] as (XLSX.CellObject & { s?: Record<string, unknown> }) | undefined
      if (!cell) continue
      cell.s = cell.s ?? {}
      if (opts.wrapText) {
        cell.s.alignment = { wrapText: true, vertical: 'top' }
      }
      if (opts.boldFirstColLabels && C === 0 && typeof cell.v === 'string' && cell.v.length > 0) {
        const v = cell.v
        if (
          R < 12
          || v.startsWith('TOTAL')
          || v.startsWith('Total')
          || v.startsWith('Ventes')
          || v.startsWith('Retours')
          || v.startsWith('Paiements')
          || v.startsWith('Résumé')
          || v.startsWith('Somme')
          || v.startsWith('Solde')
          || v.startsWith('SOLDE')
          || v.startsWith('Client')
          || v.startsWith('Rapport')
          || v.startsWith('Ajustements')
          || v.startsWith('Sales')
          || v.startsWith('Returns')
          || v.startsWith('Payments')
          || v.startsWith('Summary')
          || v.startsWith('Final')
          || v.startsWith('CURRENT')
          || v.startsWith('Customer')
          || v.startsWith('Sum of')
          || v.startsWith('Admin')
        ) {
          cell.s.font = { bold: true }
        }
      }
    }
  }
}

export function downloadXlsx(filename: string, sheets: XlsxSheet[]): void {
  const wb = XLSX.utils.book_new()
  for (const sheet of sheets) {
    const aoa = sheet.rawAoa
      ? sheet.rows
      : [sheet.headers, ...sheet.rows]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const colCount = Math.max(0, ...aoa.map((r) => (Array.isArray(r) ? r.length : 0)))

    if (colCount > 0) {
      if (sheet.colWidths && sheet.colWidths.length > 0) {
        ws['!cols'] = Array.from({ length: colCount }, (_, i) => ({
          wch: sheet.colWidths![i] ?? sheet.colWidths![sheet.colWidths!.length - 1] ?? 14,
        }))
      } else {
        ws['!cols'] = Array.from({ length: colCount }, (_, i) => ({
          wch: i === 1 ? 28 : i === 0 ? 18 : 14,
        }))
      }
    }

    if (sheet.wrapText && aoa.length > 0) {
      ws['!rows'] = aoa.map((row, idx) => {
        const isTitle =
          idx < 6
          || (Array.isArray(row) && typeof row[0] === 'string' && String(row[0]).length > 28)
        return { hpt: isTitle ? 22 : 18 }
      })
    }

    applyNumberFormats(ws)
    if (sheet.wrapText || sheet.boldFirstColLabels) {
      applyWrapAndBold(ws, sheet)
    }

    const safeName = sheet.name.slice(0, 31).replace(/[\\/?*[\]:]/g, '_') || 'Feuille'
    XLSX.utils.book_append_sheet(wb, ws, safeName)
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
}

export function printReportSummary(title: string, lines: Array<{ label: string; value: string }>): void {
  const rows = lines
    .map(
      (line) =>
        `<tr><td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(line.label)}</td>`
        + `<td style="padding:6px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-variant-numeric:tabular-nums;">${escapeHtml(line.value)}</td></tr>`,
    )
    .join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;padding:24px;color:#111}h1{font-size:18px;margin:0 0 16px}table{border-collapse:collapse;width:100%;max-width:480px}@media print{body{padding:0}}</style></head>
<body><h1>${escapeHtml(title)}</h1><table>${rows}</table></body></html>`
  printHtmlDocument(html)
}

/**
 * Print commercial A4 HTML via a dedicated window (no blob URL).
 * Prefer this for Releve / proforma-style documents.
 */
export function printCommercialDocument(html: string): void {
  const win = window.open('', '_blank')
  if (!win) {
    printHtmlDocument(html)
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
  window.setTimeout(() => {
    try {
      win.print()
    } catch {
      /* user may close tab before print */
    }
  }, 350)
}

/**
 * Open Soft Gestion commercial HTML in a new tab and trigger print.
 * Never use `noopener` on window.open — Chrome returns null and the PDF never appears.
 */
export function printHtmlDocument(html: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) {
    // Popup blocked: still print via hidden iframe so PDF flow is not a silent no-op.
    const iframe = document.createElement('iframe')
    iframe.setAttribute(
      'style',
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden',
    )
    iframe.src = url
    document.body.appendChild(iframe)
    iframe.addEventListener('load', () => {
      try {
        iframe.contentWindow?.focus()
        iframe.contentWindow?.print()
      } finally {
        window.setTimeout(() => {
          iframe.remove()
          URL.revokeObjectURL(url)
        }, 60_000)
      }
    })
    return
  }
  window.setTimeout(() => {
    try {
      win.focus()
      win.print()
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
    }
  }, 300)
}

export function cfaExportValue(amount: number | null | undefined): string {
  return formatCFA(Number(amount ?? 0))
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
