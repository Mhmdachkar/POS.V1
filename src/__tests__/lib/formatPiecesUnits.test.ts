import { describe, expect, it } from 'vitest'
import { formatPieces, formatReportPieces, MINUS_SIGN } from '@/lib/formatters'
import { formatStockCompact, formatDeltaInUnits } from '@/lib/stockQuantityDisplay'
import { useLocaleStore } from '@/stores/localeStore'

describe('piece unit labels (titled via localizedUnitLabelForCount)', () => {
  it('formatPieces uses titled piece labels', () => {
    useLocaleStore.setState({ locale: 'fr' })
    expect(formatPieces(1)).toBe('1 Pi\u00e8ce')
    expect(formatPieces(24)).toBe('24 Pi\u00e8ces')
  })

  it('formatReportPieces Net column uses MINUS_SIGN', () => {
    useLocaleStore.setState({ locale: 'fr' })
    expect(formatReportPieces(-1)).toBe(MINUS_SIGN + '1 Pi\u00e8ce')
    expect(formatReportPieces(-12)).toBe(MINUS_SIGN + '12 Pi\u00e8ces')
  })

  it('mixed compact stock and audit delta use titled piece', () => {
    useLocaleStore.setState({ locale: 'fr' })
    const units = [
      { unit_level: 0, unit_name: 'Piece', conversion_to_base: 1 },
      { unit_level: 2, unit_name: 'Carton', conversion_to_base: 10 },
    ]
    expect(formatStockCompact(101, units)).toBe('10 Cartons \u00b7 1 Pi\u00e8ce')
    expect(formatDeltaInUnits(-1, units).fr).toBe(MINUS_SIGN + '1 Pi\u00e8ce')
  })
})
