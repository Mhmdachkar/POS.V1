import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { downloadCsv } from '@/lib/csvExport'

describe('downloadCsv', () => {
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:csv')
    URL.revokeObjectURL = vi.fn()
  })

  afterEach(() => {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
  })

  it('writes escaped headers and rows and triggers a download', () => {
    const click = vi.fn()
    const createElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = createElement(tag)
      if (tag === 'a') {
        Object.defineProperty(el, 'click', { value: click })
      }
      return el
    })

    downloadCsv('sales.csv', ['Metric', 'Value'], [['Sales activity (CFA)', 2280], ['Note, quoted', 'a"b']])

    expect(URL.createObjectURL).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    expect(blob.type).toContain('text/csv')
  })
})
