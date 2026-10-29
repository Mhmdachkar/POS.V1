import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const writeFile = vi.fn()
const bookNew = vi.fn(() => ({ SheetNames: [], Sheets: {} }))
const aoaToSheet = vi.fn((aoa: unknown[][]) => {
  const ws: Record<string, unknown> = { '!ref': 'A1:B2' }
  // Minimal cells so format pass no-ops safely
  ws['A1'] = { v: Array.isArray(aoa?.[0]) ? aoa[0][0] : 'A', t: 's' }
  return ws
})
const bookAppendSheet = vi.fn()

vi.mock('xlsx', () => ({
  utils: {
    book_new: (...args: unknown[]) => bookNew(...args),
    aoa_to_sheet: (...args: unknown[]) => aoaToSheet(...args),
    book_append_sheet: (...args: unknown[]) => bookAppendSheet(...args),
    decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }),
    encode_cell: ({ r, c }: { r: number; c: number }) => `${String.fromCharCode(65 + c)}${r + 1}`,
  },
  writeFile: (...args: unknown[]) => writeFile(...args),
}))

import { cfaExportValue, downloadXlsx, printReportSummary } from '@/lib/reportExport'

describe('reportExport', () => {
  describe('downloadXlsx', () => {
    afterEach(() => {
      writeFile.mockClear()
      bookNew.mockClear()
      aoaToSheet.mockClear()
      bookAppendSheet.mockClear()
    })

    it('builds a workbook and writes the file', () => {
      downloadXlsx('overview', [
        { name: 'Summary', headers: ['Metric', 'Value'], rows: [['Net sales', 1000]] },
      ])

      expect(bookNew).toHaveBeenCalled()
      expect(aoaToSheet).toHaveBeenCalledWith([['Metric', 'Value'], ['Net sales', 1000]])
      expect(bookAppendSheet).toHaveBeenCalled()
      expect(writeFile).toHaveBeenCalledWith(expect.anything(), 'overview.xlsx')
    })
  })

  describe('printReportSummary', () => {
    const originalOpen = window.open

    beforeEach(() => {
      vi.useFakeTimers()
      vi.spyOn(window, 'open').mockReturnValue(null)
      vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-print')
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.runOnlyPendingTimers()
      vi.useRealTimers()
      window.open = originalOpen
      vi.restoreAllMocks()
    })

    it('opens a print window when allowed', () => {
      const focus = vi.fn()
      const print = vi.fn()
      const write = vi.fn()
      const close = vi.fn()
      vi.mocked(window.open).mockReturnValue({
        document: { write, close, readyState: 'complete' },
        focus,
        print,
      } as unknown as Window)

      printReportSummary('Sales report', [{ label: 'Net', value: '1 000 CFA' }])

      expect(window.open).toHaveBeenCalled()
      const openedUrl = vi.mocked(window.open).mock.calls[0]![0] as string
      expect(openedUrl.startsWith('blob:')).toBe(true)
      // print is deferred; advance timers
      vi.runAllTimers()
      expect(focus).toHaveBeenCalled()
      expect(print).toHaveBeenCalled()
    })

    it('falls back to iframe print when popup is blocked', () => {
      const append = vi.spyOn(document.body, 'appendChild')
      printReportSummary('Blocked', [{ label: 'A', value: 'B' }])
      expect(window.open).toHaveBeenCalled()
      expect(append).toHaveBeenCalled()
      const iframe = append.mock.calls.find((c) => (c[0] as HTMLElement).tagName === 'IFRAME')?.[0] as HTMLIFrameElement
      expect(iframe).toBeTruthy()
    })
  })

  describe('cfaExportValue', () => {
    it('formats nullish as zero CFA', () => {
      expect(cfaExportValue(null)).toMatch(/0/)
      expect(cfaExportValue(undefined)).toMatch(/0/)
    })
  })
})
