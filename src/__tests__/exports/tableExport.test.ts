import { describe, expect, it, vi } from 'vitest'

vi.mock('xlsx-js-style', () => {
  const writeFile = vi.fn()
  const write = vi.fn(() => new Uint8Array([80, 75])) // PK stub
  const bookNew = vi.fn(() => ({ SheetNames: [], Sheets: {} }))
  const aoaToSheet = vi.fn((aoa: unknown[][]) => {
    const ws: Record<string, unknown> = { '!ref': 'A1:B5' }
    for (let r = 0; r < aoa.length; r++) {
      const row = aoa[r] as unknown[]
      for (let c = 0; c < row.length; c++) {
        ws[`${String.fromCharCode(65 + c)}${r + 1}`] = {
          v: row[c],
          t: typeof row[c] === 'number' ? 'n' : 's',
        }
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
    write,
  }
})

vi.mock('fflate', () => ({
  unzipSync: (u8: Uint8Array) => ({ 'xl/worksheets/sheet1.xml': u8 }),
  zipSync: (files: Record<string, Uint8Array>) => files['xl/worksheets/sheet1.xml'] ?? new Uint8Array(),
  strFromU8: (u8: Uint8Array) => new TextDecoder().decode(u8),
  strToU8: (s: string) => new TextEncoder().encode(s),
}))

vi.mock('@/hooks/useBusinessSettings', () => ({
  fetchBusinessSettings: vi.fn(async () => ({ business_name: 'Test Co' })),
}))

import {
  buildTableExportAoa,
  exportCfaInt,
  exportExcelSerial,
  exportOuiNon,
  isVoidedExportStatus,
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

  it('builds Abidjan Excel serials (not epoch 25569)', () => {
    const serial = exportExcelSerial('2026-03-15T14:30:00.000Z')
    expect(typeof serial).toBe('number')
    expect(serial).toBeGreaterThan(40_000)
    expect(serial).not.toBeCloseTo(25569, 0)
  })

  it('excludes Annulé / voided rows from TOTAUX and labels non-date column', () => {
    const { aoa, headerRowIndex } = buildTableExportAoa(
      [
        { header: 'Date', kind: 'date' },
        { header: 'Statut', kind: 'enum' },
        { header: 'Total CFA', kind: 'money', total: true },
      ],
      [
        { cells: ['2026-01-01T10:00:00.000Z', 'Converti', 52500] },
        { cells: ['2026-01-02T10:00:00.000Z', 'Annulé', 2500], excludeFromTotals: true },
        { cells: ['2026-01-03T10:00:00.000Z', 'Annulé', 999] }, // excluded via status cell
      ],
      { title: 'Proformas', sheetName: 'Proformas', basename: 'proformas' },
      'Aquilux',
    )
    expect(aoa[0][0]).toBe('Aquilux')
    expect(aoa[headerRowIndex]).toEqual(['Date', 'Statut', 'Total CFA'])
    const totals = aoa[aoa.length - 1]
    expect(totals[0]).toBe('TOTAUX')
    expect(totals[2]).toBe(52500)
  })

  it('detects voided export statuses', () => {
    expect(isVoidedExportStatus('cancelled')).toBe(true)
    expect(isVoidedExportStatus('Annulé')).toBe(true)
    expect(isVoidedExportStatus('Annulée')).toBe(true)
    expect(isVoidedExportStatus('converted')).toBe(false)
  })

  it('keeps TOTAUX out of date formatting path for paiements-style columns', () => {
    const { aoa } = buildTableExportAoa(
      [
        { header: 'Date', kind: 'date' },
        { header: 'Montant CFA', kind: 'money', total: true },
      ],
      [{ cells: ['2026-01-01T12:00:00.000Z', 1000] }],
      { title: 'Paiements', sheetName: 'Paiements', basename: 'paiements' },
      'Aquilux',
    )
    const totals = aoa[aoa.length - 1]
    expect(totals[0]).toBe('TOTAUX')
    expect(totals[1]).toBe(1000)
  })
})
