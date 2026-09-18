import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchSalesExportLines } from '@/lib/salesLineExport'

type Result = { data: unknown; error: null }

const rangeMock = vi.fn()
const builder: Record<string, unknown> = {}

function chain() {
  builder.select = vi.fn(() => builder)
  builder.eq = vi.fn(() => builder)
  builder.gte = vi.fn(() => builder)
  builder.lte = vi.fn(() => builder)
  builder.order = vi.fn(() => builder)
  builder.range = rangeMock
  return builder
}

const from = vi.fn(() => chain())

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (...args: unknown[]) => from(...args),
  },
}))

describe('fetchSalesExportLines pagination', () => {
  beforeEach(() => {
    from.mockClear()
    rangeMock.mockReset()
    chain()
  })

  it('pages beyond UI page size and returns every line', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => ({
      id: `item-${i}`,
      unit_level: i % 3,
      quantity_in_unit: 1,
      unit_price_cfa: 100,
      line_total_cfa: 100,
      net_line_total_cfa: 100,
      products: {
        name: `P${i}`,
        product_units: [
          { unit_level: 0, unit_name: 'Piece', serial_number: `SN-P-${i}` },
          { unit_level: 1, unit_name: 'Package', serial_number: `SN-K-${i}` },
          { unit_level: 2, unit_name: 'Carton', serial_number: `SN-C-${i}` },
        ],
      },
      sales: {
        id: `sale-${i}`,
        created_at: '2026-09-18T10:00:00.000Z',
        status: 'completed',
        receipt_number: `R-${i}`,
        total_cfa: 100,
        admin_override_total_cfa: null,
      },
    }))
    const page2 = [
      {
        id: 'item-500',
        unit_level: 2,
        quantity_in_unit: 3,
        unit_price_cfa: 2000,
        line_total_cfa: 6000,
        net_line_total_cfa: 6000,
        products: {
          name: 'Product A',
          product_units: [
            { unit_level: 0, unit_name: 'Piece', serial_number: 'SN-001' },
            { unit_level: 2, unit_name: 'Carton', serial_number: 'SN-CTN' },
          ],
        },
        sales: {
          id: 'sale-500',
          created_at: '2026-09-18T11:00:00.000Z',
          status: 'completed',
          receipt_number: 'R-500',
          total_cfa: 6000,
          admin_override_total_cfa: 5000,
        },
      },
    ]

    rangeMock
      .mockResolvedValueOnce({ data: page1, error: null } satisfies Result)
      .mockResolvedValueOnce({ data: page2, error: null } satisfies Result)

    const lines = await fetchSalesExportLines({
      startDate: '2026-09-18',
      endDate: '2026-09-18',
    })

    expect(rangeMock).toHaveBeenCalledTimes(2)
    expect(rangeMock.mock.calls[0]).toEqual([0, 499])
    expect(rangeMock.mock.calls[1]).toEqual([500, 999])
    expect(lines).toHaveLength(501)
    expect(lines.some((l) => l.unitName === 'Carton')).toBe(true)
    expect(lines.some((l) => l.unitName === 'Package')).toBe(true)
    expect(lines.some((l) => l.unitName === 'Piece')).toBe(true)
    const last = lines.find((l) => l.serialNumber === 'SN-CTN')
    expect(last?.unitName).toBe('Carton')
    expect(last?.quantity).toBe(3)
    expect(last?.adminOverrideTotalCfa).toBe(5000)
  })
})
