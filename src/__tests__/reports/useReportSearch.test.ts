import { describe, expect, it } from 'vitest'
import { reportById } from '@/pages/reports/reportCatalog'
import { reportPresetFromParam, reportUrlPreset } from '@/pages/reports/useReportSearch'

describe('report date preset helpers', () => {
  it('defaults control-audit to this week, not today', () => {
    expect(reportById('control-audit').defaultPreset).toBe('this_week')
    expect(reportPresetFromParam(null, 'this_week')).toBe('this_week')
    expect(reportPresetFromParam(null, 'today')).toBe('today')
  })

  it('writes today explicitly when the report default is this_week', () => {
    expect(reportUrlPreset('today', 'this_week')).toBe('today')
    expect(reportUrlPreset('this_week', 'this_week')).toBeNull()
    expect(reportUrlPreset('today', 'today')).toBeNull()
    expect(reportPresetFromParam('today', 'this_week')).toBe('today')
  })
})
