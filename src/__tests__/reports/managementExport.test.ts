import { describe, expect, it, vi } from 'vitest'
import { resolveReportDateRange } from '@/lib/reportDates'
import {
  buildSalesExportDataset,
  salesExportSheetAoa,
  salesExportPrintHtml,
  groupSalesExportLines,
  sumFinalSaleTotalsOnce,
  sumLineTotals,
  lineTotalFromQtyPrice,
  authoritativeFinalSaleTotal,
  type SalesExportLine,
} from '@/lib/salesLineExport'
import {
  customerAccountSheetAoa,
  customerAccountPrintHtml,
  groupCustomerSaleRows,
  type CustomerAccountExportDataset,
  type CustomerSaleExportRow,
} from '@/lib/customerAccountExport'
import { salesReportFilename, customerAccountFilename, sanitizeFilenamePart } from '@/lib/reportFilenames'

vi.mock('xlsx', () => ({
  utils: {
    book_new: () => ({ SheetNames: [], Sheets: {} }),
    aoa_to_sheet: (aoa: unknown) => ({ __aoa: aoa, '!ref': 'A1' }),
    book_append_sheet: vi.fn(),
    decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 0, c: 0 } }),
    encode_cell: ({ r, c }: { r: number; c: number }) => `${String.fromCharCode(65 + c)}${r + 1}`,
  },
  writeFile: vi.fn(),
}))

function line(
  partial: Partial<SalesExportLine> & Pick<SalesExportLine, 'unitName' | 'lineTotalCfa'>,
): SalesExportLine {
  const quantity = partial.quantity ?? 3
  const unitPriceCfa = partial.unitPriceCfa ?? 2000
  const calculated = partial.calculatedSaleTotalCfa ?? partial.lineTotalCfa
  const override = partial.adminOverrideTotalCfa ?? null
  return {
    serialNumber: 'SN-001',
    productName: 'Product A',
    quantity,
    unitPriceCfa,
    saleId: 'sale-1',
    receiptNumber: 'DKR-00000001',
    saleCreatedAt: '2026-09-18T10:00:00.000Z',
    adminOverrideTotalCfa: override,
    calculatedSaleTotalCfa: calculated,
    finalSaleTotalCfa:
      partial.finalSaleTotalCfa
      ?? authoritativeFinalSaleTotal({
        total_cfa: calculated,
        admin_override_total_cfa: override,
      }),
    ...partial,
  }
}

function customerLine(
  partial: Partial<CustomerSaleExportRow> & Pick<CustomerSaleExportRow, 'lineTotalCfa'>,
): CustomerSaleExportRow {
  return {
    date: '2026-09-10T12:00:00.000Z',
    receiptNumber: 'DKR-00000025',
    serialNumber: 'SN-A',
    productName: 'Rice',
    unitName: 'Carton',
    quantity: 2,
    unitPriceCfa: 10000,
    saleId: 's1',
    finalSaleTotalCfa: 20000,
    calculatedSaleTotalCfa: 20000,
    hasOverride: false,
    ...partial,
  }
}

describe('sales report date ranges', () => {
  const wednesday = new Date('2026-09-16T12:00:00.000Z')

  it('Today covers the full Abidjan day', () => {
    const r = resolveReportDateRange('today', '', '', wednesday)
    expect(r.startDate).toBe('2026-09-16')
    expect(r.endDate).toBe('2026-09-16')
  })

  it('This Week covers Monday through today', () => {
    const r = resolveReportDateRange('this_week', '', '', wednesday)
    expect(r.startDate).toBe('2026-09-14')
    expect(r.endDate).toBe('2026-09-16')
  })

  it('Custom uses the exact selected bounds', () => {
    const r = resolveReportDateRange('custom', '2026-09-01', '2026-09-18', wednesday)
    expect(r.startDate).toBe('2026-09-01')
    expect(r.endDate).toBe('2026-09-18')
  })
})

describe('sales export reconciliation', () => {
  it('Total ligne equals quantity × unit price helper', () => {
    expect(lineTotalFromQtyPrice(2, 400)).toBe(800)
    expect(lineTotalFromQtyPrice(1, 600)).toBe(600)
  })

  it('normal sale: final total equals calculated; grand total once', () => {
    const lines = [
      line({
        unitName: 'Piece',
        quantity: 2,
        unitPriceCfa: 3000,
        lineTotalCfa: 6000,
        calculatedSaleTotalCfa: 6000,
        finalSaleTotalCfa: 6000,
      }),
    ]
    expect(sumLineTotals(lines)).toBe(6000)
    expect(sumFinalSaleTotalsOnce(lines)).toBe(6000)
    const dataset = buildSalesExportDataset(lines, {
      startDate: '2026-09-18',
      endDate: '2026-09-18',
      authoritativeTotalCfa: 6000,
    })
    expect(dataset.authoritativeTotalCfa).toBe(6000)
  })

  it('ajusté admin: line sum stays catalog; final total uses override once', () => {
    const lines = [
      line({
        unitName: 'Carton',
        quantity: 1,
        unitPriceCfa: 9100,
        lineTotalCfa: 9100,
        calculatedSaleTotalCfa: 9100,
        adminOverrideTotalCfa: 7000,
        finalSaleTotalCfa: 7000,
      }),
    ]
    expect(sumLineTotals(lines)).toBe(9100)
    expect(sumFinalSaleTotalsOnce(lines)).toBe(7000)
    expect(sumLineTotals(lines)).not.toBe(sumFinalSaleTotalsOnce(lines))

    const aoa = salesExportSheetAoa(
      buildSalesExportDataset(lines, {
        startDate: '2026-09-18',
        endDate: '2026-09-18',
        authoritativeTotalCfa: 7000,
      }),
    )
    const flat = aoa.flat().map(String).join('\n')
    expect(flat).toContain('Total ligne')
    expect(flat).toContain('Total final (ajusté admin)')
    expect(flat).toContain('ajusté admin')
    expect(flat).toContain('DKR-00000001')
    // Line value present as its own cell, not replaced by override
    expect(aoa.some((row) => row.includes(9100))).toBe(true)
    expect(aoa.some((row) => row.includes(7000))).toBe(true)
    expect(aoa.some((row) =>
      typeof row[0] === 'string'
      && row[0].includes('Total des ventes (période sélectionnée)')
      && row.includes(7000),
    )).toBe(true)
  })

  it('multi-line sale: final total once; no double-count across lines', () => {
    const lines = [
      line({
        saleId: 'sale-ml',
        receiptNumber: 'DKR-00000025',
        serialNumber: 'SN-1',
        productName: 'Bread',
        unitName: 'Piece',
        quantity: 1,
        unitPriceCfa: 600,
        lineTotalCfa: 600,
        calculatedSaleTotalCfa: 1400,
        finalSaleTotalCfa: 1400,
      }),
      line({
        saleId: 'sale-ml',
        receiptNumber: 'DKR-00000025',
        serialNumber: 'SN-2',
        productName: 'Tea',
        unitName: 'Piece',
        quantity: 2,
        unitPriceCfa: 400,
        lineTotalCfa: 800,
        calculatedSaleTotalCfa: 1400,
        finalSaleTotalCfa: 1400,
      }),
    ]
    const groups = groupSalesExportLines(lines)
    expect(groups).toHaveLength(1)
    expect(groups[0].lineSumCfa).toBe(1400)
    expect(sumFinalSaleTotalsOnce(lines)).toBe(1400)

    const aoa = salesExportSheetAoa(
      buildSalesExportDataset(lines, {
        startDate: '2026-09-18',
        endDate: '2026-09-18',
        authoritativeTotalCfa: 1400,
      }),
    )
    const finalRows = aoa.filter(
      (row) => typeof row[6] === 'string' && String(row[6]).includes('Total final de la vente'),
    )
    expect(finalRows).toHaveLength(1)
    expect(finalRows[0].includes(1400)).toBe(true)
    // Product lines keep individual totals
    expect(aoa.some((row) => row.includes('Bread') && row.includes(600))).toBe(true)
    expect(aoa.some((row) => row.includes('Tea') && row.includes(800))).toBe(true)
  })

  it('mix of overridden and normal sales: grand total counts each sale once', () => {
    const lines: SalesExportLine[] = [
      {
        saleId: 'a',
        receiptNumber: 'DKR-A',
        serialNumber: 'SN-A',
        productName: 'Item A',
        unitName: 'Piece',
        quantity: 1,
        unitPriceCfa: 9100,
        lineTotalCfa: 9100,
        saleCreatedAt: '2026-09-18T10:00:00.000Z',
        adminOverrideTotalCfa: 7000,
        calculatedSaleTotalCfa: 9100,
        finalSaleTotalCfa: 7000,
      },
      {
        saleId: 'b',
        receiptNumber: 'DKR-B',
        serialNumber: 'SN-B1',
        productName: 'Item B1',
        unitName: 'Carton',
        quantity: 1,
        unitPriceCfa: 5000,
        lineTotalCfa: 5000,
        saleCreatedAt: '2026-09-18T11:00:00.000Z',
        adminOverrideTotalCfa: null,
        calculatedSaleTotalCfa: 8000,
        finalSaleTotalCfa: 8000,
      },
      {
        saleId: 'b',
        receiptNumber: 'DKR-B',
        serialNumber: 'SN-B2',
        productName: 'Item B2',
        unitName: 'Package',
        quantity: 1,
        unitPriceCfa: 3000,
        lineTotalCfa: 3000,
        saleCreatedAt: '2026-09-18T11:00:00.000Z',
        adminOverrideTotalCfa: null,
        calculatedSaleTotalCfa: 8000,
        finalSaleTotalCfa: 8000,
      },
      {
        saleId: 'c',
        receiptNumber: 'DKR-C',
        serialNumber: 'SN-C',
        productName: 'Item C',
        unitName: 'Piece',
        quantity: 1,
        unitPriceCfa: 2000,
        lineTotalCfa: 2000,
        saleCreatedAt: '2026-09-18T12:00:00.000Z',
        adminOverrideTotalCfa: null,
        calculatedSaleTotalCfa: 2000,
        finalSaleTotalCfa: 2000,
      },
    ]
    expect(sumLineTotals(lines)).toBe(9100 + 5000 + 3000 + 2000)
    expect(sumFinalSaleTotalsOnce(lines)).toBe(7000 + 8000 + 2000)
    expect(groupSalesExportLines(lines)).toHaveLength(3)

    const dataset = buildSalesExportDataset(lines, {
      startDate: '2026-09-14',
      endDate: '2026-09-18',
      authoritativeTotalCfa: 17000,
    })
    expect(dataset.lines).toHaveLength(4)
    expect(dataset.authoritativeTotalCfa).toBe(sumFinalSaleTotalsOnce(lines))

    const aoa = salesExportSheetAoa(dataset)
    expect(aoa.flat().join(' ')).toContain('N° ticket')
    expect(aoa.filter((row) =>
      typeof row[6] === 'string' && String(row[6]).startsWith('Total final'),
    )).toHaveLength(3)
  })

  it('export includes every qualifying line (no UI page cap)', () => {
    const many = Array.from({ length: 58 }, (_, i) =>
      line({
        saleId: `sale-${i}`,
        receiptNumber: `DKR-${i}`,
        serialNumber: `SN-${i}`,
        productName: `Item ${i}`,
        unitName: i % 3 === 0 ? 'Carton' : i % 3 === 1 ? 'Package' : 'Piece',
        lineTotalCfa: 100,
        calculatedSaleTotalCfa: 100,
        finalSaleTotalCfa: 100,
      }),
    )
    const dataset = buildSalesExportDataset(many, {
      startDate: '2026-09-18',
      endDate: '2026-09-18',
      authoritativeTotalCfa: 5800,
    })
    expect(dataset.lines).toHaveLength(58)
    expect(dataset.lines.some((l) => l.unitName === 'Carton')).toBe(true)
  })

  it('Excel/PDF headers use Total ligne and Receipt Number; omit Shift', () => {
    const dataset = buildSalesExportDataset(
      [line({ unitName: 'Piece', lineTotalCfa: 6000 })],
      { startDate: '2026-09-18', endDate: '2026-09-18', authoritativeTotalCfa: 6000 },
    )
    const aoa = salesExportSheetAoa(dataset)
    const header = aoa.find((row) => row.includes('N° série'))
    expect(header).toEqual([
      'Date',
      'N° ticket',
      'N° série',
      'Produit',
      'Unité',
      'Quantité',
      'Prix unitaire',
      'Total ligne',
    ])
    expect(aoa.flat().join(' ')).not.toMatch(/\bShift\b/)

    const html = salesExportPrintHtml(dataset)
    expect(html).toContain('Total ligne')
    expect(html).toContain('N° ticket')
    expect(html).toContain('Total final de la vente')
    expect(html).not.toMatch(/>\s*Shift\s*</)
  })

  it('PDF shows Total final de la vente once per multi-line receipt', () => {
    const dataset = buildSalesExportDataset(
      [
        line({
          saleId: 'ml',
          receiptNumber: 'DKR-ML',
          unitName: 'Carton',
          lineTotalCfa: 6000,
          calculatedSaleTotalCfa: 8500,
          finalSaleTotalCfa: 8500,
        }),
        line({
          saleId: 'ml',
          receiptNumber: 'DKR-ML',
          serialNumber: 'SN-002',
          unitName: 'Package',
          lineTotalCfa: 2500,
          calculatedSaleTotalCfa: 8500,
          finalSaleTotalCfa: 8500,
        }),
      ],
      { startDate: '2026-09-01', endDate: '2026-09-18', authoritativeTotalCfa: 8500 },
    )
    const html = salesExportPrintHtml(dataset)
    const matches = html.match(/Total final de la vente — DKR-ML/g) ?? []
    expect(matches).toHaveLength(1)
    expect(html).toContain('Total des ventes (période sélectionnée)')
  })
})

describe('customer account export', () => {
  const fatouLines: CustomerSaleExportRow[] = [
    customerLine({ productName: 'Sliced Bread', quantity: 1, unitPriceCfa: 600, lineTotalCfa: 600 }),
    customerLine({ productName: 'Tea Biscuits', quantity: 2, unitPriceCfa: 400, lineTotalCfa: 800 }),
    customerLine({ productName: 'Milk', quantity: 2, unitPriceCfa: 800, lineTotalCfa: 1600 }),
    customerLine({ productName: 'Sugar', quantity: 1, unitPriceCfa: 1000, lineTotalCfa: 1000 }),
    customerLine({ productName: 'Salt', quantity: 1, unitPriceCfa: 250, lineTotalCfa: 250 }),
    customerLine({ productName: 'Oil', quantity: 1, unitPriceCfa: 2500, lineTotalCfa: 2500 }),
    customerLine({ productName: 'Soap', quantity: 2, unitPriceCfa: 600, lineTotalCfa: 1200 }),
    customerLine({ productName: 'Tissue A', quantity: 1, unitPriceCfa: 650, lineTotalCfa: 650 }),
    customerLine({ productName: 'Tissue B', quantity: 1, unitPriceCfa: 650, lineTotalCfa: 650 }),
    customerLine({ productName: 'Rice Sack', quantity: 1, unitPriceCfa: 18000, lineTotalCfa: 18000 }),
    customerLine({ productName: 'Pasta', quantity: 2, unitPriceCfa: 900, lineTotalCfa: 1800 }),
    customerLine({ productName: 'Juice', quantity: 2, unitPriceCfa: 1100, lineTotalCfa: 2200 }),
    customerLine({ productName: 'Eggs', quantity: 1, unitPriceCfa: 1000, lineTotalCfa: 1000 }),
    customerLine({ productName: 'Butter', quantity: 1, unitPriceCfa: 800, lineTotalCfa: 800 }),
    customerLine({ productName: 'Yogurt', quantity: 1, unitPriceCfa: 400, lineTotalCfa: 400 }),
    customerLine({ productName: 'Cheese', quantity: 1, unitPriceCfa: 3900, lineTotalCfa: 3900 }),
  ].map((row) => ({
    ...row,
    saleId: 'sale-fatou',
    receiptNumber: 'DKR-00000025',
    finalSaleTotalCfa: 37350,
    calculatedSaleTotalCfa: 37350,
    hasOverride: false,
  }))

  const dataset: CustomerAccountExportDataset = {
    customerId: 'cust-1',
    customerName: 'Fatou Diallo',
    sales: fatouLines,
    returns: [
      {
        date: '2026-09-11T12:00:00.000Z',
        receiptNumber: 'DKR-00000025',
        returnId: 'ret-1',
        serialNumber: 'SN-A',
        productName: 'Soap',
        unitName: 'Piece',
        quantity: 1,
        returnLineTotalCfa: 500,
        returnTransactionTotalCfa: 500,
      },
    ],
    payments: [
      {
        date: '2026-09-12T12:00:00.000Z',
        reference: 'AABBCCDD',
        amountCfa: 5000,
        note: 'Cash',
      },
    ],
    totalSalesCfa: 37350,
    totalReturnsCfa: 500,
    totalPaymentsCfa: 5000,
    currentBalanceCfa: 31850,
    generatedAt: '2026-09-18T10:00:00.000Z',
  }

  it('product rows use Total ligne = qty × price; never repeat whole-sale total', () => {
    const aoa = customerAccountSheetAoa(dataset)
    const header = aoa.find((row) => row.includes('Total ligne'))
    expect(header).toContain('Total ligne')
    expect(header).not.toContain('Sale Total')

    const bread = aoa.find((row) => row.includes('Sliced Bread'))
    expect(bread).toBeTruthy()
    expect(bread!.includes(600)).toBe(true)
    expect(bread!.includes(37350)).toBe(false)

    const biscuits = aoa.find((row) => row.includes('Tea Biscuits'))
    expect(biscuits!.includes(800)).toBe(true)
    expect(biscuits!.includes(37350)).toBe(false)

    // Whole sale total appears exactly once as a sale-summary row
    const saleTotalRows = aoa.filter(
      (row) => typeof row[6] === 'string' && String(row[6]).includes('Total de la vente'),
    )
    expect(saleTotalRows).toHaveLength(1)
    expect(saleTotalRows[0].includes(37350)).toBe(true)

    // No product data row carries the whole-sale total in Total ligne column
    const productDataRows = aoa.filter(
      (row) =>
        row.length >= 8
        && typeof row[3] === 'string'
        && (row[3] as string).length > 0
        && typeof row[4] === 'string'
        && (row[4] as string).length > 0
        && typeof row[5] === 'number'
        && typeof row[7] === 'number',
    )
    expect(productDataRows.length).toBe(16)
    expect(productDataRows.every((row) => row[7] !== 37350)).toBe(true)
  })

  it('groups multi-line receipt and shows sale total once', () => {
    const groups = groupCustomerSaleRows(dataset.sales)
    expect(groups).toHaveLength(1)
    expect(groups[0].lines).toHaveLength(16)
    expect(groups[0].lines.reduce((s, l) => s + l.lineTotalCfa, 0)).toBe(37350)
    expect(groups[0].finalSaleTotalCfa).toBe(37350)
  })

  it('keeps authoritative summary totals and balance', () => {
    const aoa = customerAccountSheetAoa(dataset)
    const flat = aoa.flat().map(String).join('\n')
    expect(flat).toContain('Fatou Diallo')
    expect(flat).toContain('Total des ventes client')
    expect(flat).toContain('Total des retours')
    expect(flat).toContain('Total des paiements')
    expect(flat).toContain('SOLDE RESTANT')
    expect(aoa.some((row) => row.includes(37350))).toBe(true)
    expect(aoa.some((row) => row.includes(500))).toBe(true)
    expect(aoa.some((row) => row.includes(5000))).toBe(true)
    expect(aoa.some((row) => row.includes(31850))).toBe(true)
  })

  it('return lines use Total ligne retour; transaction total once', () => {
    const multiReturn: CustomerAccountExportDataset = {
      ...dataset,
      returns: [
        {
          date: '2026-09-11T12:00:00.000Z',
          receiptNumber: 'DKR-00000025',
          returnId: 'ret-2',
          serialNumber: 'SN-1',
          productName: 'Soap',
          unitName: 'Piece',
          quantity: 1,
          returnLineTotalCfa: 300,
          returnTransactionTotalCfa: 800,
        },
        {
          date: '2026-09-11T12:00:00.000Z',
          receiptNumber: 'DKR-00000025',
          returnId: 'ret-2',
          serialNumber: 'SN-2',
          productName: 'Salt',
          unitName: 'Piece',
          quantity: 1,
          returnLineTotalCfa: 500,
          returnTransactionTotalCfa: 800,
        },
      ],
      totalReturnsCfa: 800,
    }
    const aoa = customerAccountSheetAoa(multiReturn)
    expect(aoa.flat().join(' ')).toContain('Total ligne retour')
    const txnRows = aoa.filter(
      (row) => typeof row[5] === 'string' && String(row[5]).includes('Total du retour'),
    )
    expect(txnRows).toHaveLength(1)
    expect(txnRows[0].includes(800)).toBe(true)
  })

  it('shows clean no-returns state', () => {
    const emptyReturns = { ...dataset, returns: [], totalReturnsCfa: 0 }
    const aoa = customerAccountSheetAoa(emptyReturns)
    expect(aoa.flat().join(' ')).toContain('Aucun retour')
    const html = customerAccountPrintHtml(emptyReturns)
    expect(html).toContain('Aucun retour')
  })

  it('PDF: Total lignes per product; sale total once; summary intact', () => {
    const html = customerAccountPrintHtml(dataset)
    expect(html).toContain('Fatou Diallo')
    expect(html).toContain('Total ligne')
    expect(html).toContain('Sliced Bread')
    expect(html).toContain('Total de la vente — DKR-00000025')
    const saleTotalMatches = html.match(/Total de la vente — DKR-00000025/g) ?? []
    expect(saleTotalMatches).toHaveLength(1)
    expect(html).toContain('SOLDE RESTANT')
    expect(html).toContain('Total des ventes')
    expect(html).not.toContain('Vitest')
  })

  it('ajusté admin on customer sale uses final total once', () => {
    const overridden: CustomerAccountExportDataset = {
      ...dataset,
      sales: [
        customerLine({
          productName: 'Item',
          quantity: 1,
          unitPriceCfa: 9100,
          lineTotalCfa: 9100,
          saleId: 'ov',
          receiptNumber: 'DKR-OV',
          calculatedSaleTotalCfa: 9100,
          finalSaleTotalCfa: 7000,
          hasOverride: true,
        }),
      ],
      totalSalesCfa: 7000,
      currentBalanceCfa: 1500,
    }
    const aoa = customerAccountSheetAoa(overridden)
    const product = aoa.find((row) => row.includes('Item'))
    expect(product!.includes(9100)).toBe(true)
    expect(product!.includes(7000)).toBe(false)
    expect(aoa.some((row) =>
      typeof row[6] === 'string'
      && String(row[6]).includes('ajusté admin')
      && row.includes(7000),
    )).toBe(true)
  })
})

describe('report filenames', () => {
  it('builds professional sales and customer names', () => {
    expect(salesReportFilename('2026-09-18', '2026-09-18', 'xlsx')).toBe('Rapport_Ventes_2026-09-18.xlsx')
    expect(salesReportFilename('2026-09-01', '2026-09-18', 'pdf')).toBe(
      'Rapport_Ventes_2026-09-01_au_2026-09-18.pdf',
    )
    expect(customerAccountFilename('Amadou Diallo', 'xlsx')).toBe(
      'Customer_Amadou_Diallo_Account_Report.xlsx',
    )
    expect(sanitizeFilenamePart('A/B:C*')).not.toMatch(/[/:*]/)
  })
})

describe('internal QA narrative must not appear in export builders', () => {
  const banned = [
    '## Final report',
    '### A. Tests',
    'Vitest:',
    'Focused CEO suite',
    '### B. Live E2E',
    'NOT READY',
    'validate_product_units',
    '### F. Remaining blockers',
  ]

  it('sales and customer export text exclude QA narrative', () => {
    const salesHtml = salesExportPrintHtml(
      buildSalesExportDataset([line({ unitName: 'Piece', lineTotalCfa: 100 })], {
        startDate: '2026-09-18',
        endDate: '2026-09-18',
        authoritativeTotalCfa: 100,
      }),
    )
    const customerHtml = customerAccountPrintHtml({
      customerId: 'c',
      customerName: 'Test',
      sales: [],
      returns: [],
      payments: [],
      totalSalesCfa: 0,
      totalReturnsCfa: 0,
      totalPaymentsCfa: 0,
      currentBalanceCfa: 0,
      generatedAt: '2026-09-18T00:00:00.000Z',
    })
    for (const token of banned) {
      expect(salesHtml).not.toContain(token)
      expect(customerHtml).not.toContain(token)
    }
  })
})
