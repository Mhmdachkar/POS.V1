import { describe, expect, it } from 'vitest'
import { auditEventSummary } from '@/lib/auditPresentation'
import { bilingualPlain } from '@/lib/bilingual/types'
import type { AuditLogRow } from '@/hooks/useAuditLog'

function row(partial: Partial<AuditLogRow> & Pick<AuditLogRow, 'action' | 'after_value'>): AuditLogRow {
  return {
    id: 'evt',
    actor_id: 'staff-1',
    entity_type: 'sale',
    entity_id: 'id-1',
    depot_id: null,
    before_value: null,
    occurred_at: '2026-11-02T23:51:00.000Z',
    actor_name: null,
    actor_username: null,
    ...partial,
  }
}

describe('auditEventSummary', () => {
  it('shows receipt, final total, and a proforma conversion flag', () => {
    const text = bilingualPlain(auditEventSummary(row({
      action: 'complete_sale',
      after_value: {
        receipt_number: 'MAIN-00000099',
        final_total_cfa: 1500,
        proforma_id: 'pf-1',
      },
    })))
    expect(text).toContain('MAIN-00000099')
    expect(text).toMatch(/1[\s\u202f\u00a0]500/)
    expect(text).toContain('proforma')
  })

  it('still reads an older total_cfa when final_total_cfa is absent', () => {
    const text = bilingualPlain(auditEventSummary(row({
      action: 'complete_sale',
      after_value: { total_cfa: 1500 },
    })))
    expect(text).toMatch(/1[\s\u202f\u00a0]500/)
    expect(text).not.toContain('proforma')
  })

  it('shows client, amount, and receipt on a payment', () => {
    const text = bilingualPlain(auditEventSummary(row({
      action: 'record_payment',
      entity_type: 'payment',
      after_value: {
        customer_name: 'Kone',
        amount_cfa: 2500,
        receipt_number: 'RGF-9',
      },
    })))
    expect(text).toContain('Kone')
    expect(text).toContain('RGF-9')
    expect(text).toMatch(/2[\s\u202f\u00a0]500/)
  })

  it('shows the adjustment reason and the cash-movement note', () => {
    const adjust = bilingualPlain(auditEventSummary(row({
      action: 'adjust_inventory',
      entity_type: 'inventory_adjustment',
      before_value: { current_stock_pieces: 60 },
      after_value: {
        adjustment_type: 'COUNT_CORRECTION',
        quantity_pieces: 1,
        new_stock_pieces: 61,
        reason: 'comptage',
      },
    })))
    expect(adjust).toContain('comptage')

    const cash = bilingualPlain(auditEventSummary(row({
      action: 'record_cash_movement',
      entity_type: 'shift',
      after_value: { direction: 'in', amount_cfa: 1000, note: 'fond' },
    })))
    expect(cash).toContain('fond')
    expect(cash).toMatch(/1[\s\u202f\u00a0]000/)
  })
})
