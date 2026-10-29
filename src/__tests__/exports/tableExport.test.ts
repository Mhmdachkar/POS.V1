import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

vi.mock('xlsx-js-style', () => {
  const writeFile = vi.fn()
  const bookNew = vi.fn(() => ({ SheetNames: [], Sheets: {} }))
  const aoaToSheet = vi.fn((aoa: unknown[][]) => {
    const ws: Record<string, unknown> = { '!ref': 'A1:B5' }
    for (let r = 0; r < aoa.length; r++) {
      const row = aoa[r] as unknown[]
      for (let c = 0; c < row.length; c++) {
        ws[`${String.fromCharCode(65 + c)}${r + 1}`] = { v: row[c], t: typeof row[c] === 'number' ? 'n' : 's' }
      }
    }
    return ws
  })
  const bookAppendSheet = vi.fn()
  return {
    utils: {
      book_new: bookNew,
      aoa_to_sheet: aoaToSheet,
      book_append_sheet: bookAppendSheet,
      encode_cell: ({ r, c }: { r: number; c: number }) => `${String.fromCharCode(65 + c)}${r + 1}`,
      encode_col: (c: number) => String.fromCharCode(65 + c),
      decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 4, c: 1 } }),
    },
    writeFile,
  }
})

vi.mock('@/hooks/useBusinessSettings', () => ({
  fetchBusinessSettings: vi.fn(async () => ({ business_name: 'Test Co' })),
}))

import {
  buildTableExportAoa,
  exportCfaInt,
  exportExcelDate,
  exportOuiNon,
} from '@/lib/tableExport'

describe('tableExport', () => {
  it('rounds CFA to whole integers', () => {
    expect(exportCfaInt(2166.66)).toBe(2167)
    expect(exportCfaInt(2166.4)).toBe(2166)
    expect(exportCfaInt(null)).toBe(0)
  })

  it('maps booleans to Oui/Non', () => {
    expect(exportOuiNon(true)).toBe('Oui')
    expect(exportOuiNon(false)).toBe('Non')
    expect(exportOuiNon(null)).toBe('')
  })

  it('builds Abidjan wall-clock Excel dates', () => {
    const d = exportExcelDate('2026-03-15T14:30:00.000Z')
    expect(d).toBeInstanceOf(Date)
    const date = d as Date
    // Africa/Abidjan is UTC+0 — same wall clock
    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(2)
    expect(date.getDate()).toBe(15)
    expect(date.getHours()).toBe(14)
    expect(date.getMinutes()).toBe(30)
  })

  it('excludes voided rows from TOTAUX and rounds money', () => {
    const { aoa, headerRowIndex } = buildTableExportAoa(
      [
        { header: 'Ticket' },
        { header: 'Total CFA', kind: 'money', total: true },
      ],
      [
        { cells: ['A', 1000] },
        { cells: ['B', 500], excludeFromTotals: true },
        { cells: ['C', 2166.66] },
      ],
      { title: 'Ventes', sheetName: 'Ventes', basename: 'ventes', filterLines: ['Période : 2026-01-01'] },
      'Aquilux',
    )
    expect(aoa[0][0]).toBe('Aquilux')
    expect(aoa[1][0]).toBe('Ventes')
    expect(aoa.some((r) => String(r[0]).startsWith('Édité le'))).toBe(true)
    const header = aoa[headerRowIndex]
    expect(header).toEqual(['Ticket', 'Total CFA'])
    const totals = aoa[aoa.length - 1]
    expect(totals[0]).toBe('TOTAUX')
    expect(totals[1]).toBe(3167) // 1000 + 2167
  })
})
