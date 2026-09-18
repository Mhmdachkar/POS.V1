/**
 * Phase 13D — ExactCashButton sets cashTendered only.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { act } from 'react'
import userEvent from '@testing-library/user-event'
import { ExactCashButton } from '@/components/pos/ExactCashButton'
import { formatCFA } from '@/lib/formatters'
import { POS } from '@/lib/bilingual/pos'
import { bi, bilingualAriaLabel } from '@/lib/bilingual/types'

function exactCashButtonName(total: number) {
  return bilingualAriaLabel(
    bi(`${POS.exactPrefix.fr} : ${formatCFA(total)}`, `${POS.exactPrefix.fr} : ${formatCFA(total)}`),
  )
}
import { computeTotals, usePOSStore } from '@/stores/posStore'

const originalSetCashTendered = usePOSStore.getState().setCashTendered

function addLine(qty = 70, price = 350) {
  usePOSStore.getState().addItem({
    product_id: 'prod-001',
    product_name: 'Water',
    product_photo_url: '',
    unit_level: 0,
    unit_name: 'Piece',
    quantity_in_unit: qty,
    unit_price_cfa: price,
    cost_price_cfa: price * 0.6,
    conversion_to_base: 1,
  })
}

describe('ExactCashButton', () => {
  beforeEach(() => {
    usePOSStore.setState({ setCashTendered: originalSetCashTendered })
    usePOSStore.getState().startNewSale()
  })

  it('sets cashTendered to totals.total_cfa and does not write derived fields directly', async () => {
    const user = userEvent.setup()
    addLine()
    usePOSStore.getState().setCashTendered(0)

    const original = usePOSStore.getState().setCashTendered
    const setCashTendered = vi.fn()
    usePOSStore.setState({
      setCashTendered: (amount: number) => {
        setCashTendered(amount)
        original(amount)
      },
    })

    const total = usePOSStore.getState().totals.total_cfa
    render(<ExactCashButton />)

    await user.click(screen.getByRole('button', { name: exactCashButtonName(total) }))

    expect(setCashTendered).toHaveBeenCalledTimes(1)
    expect(setCashTendered).toHaveBeenCalledWith(total)
    expect(usePOSStore.getState().cashTendered).toBe(total)

    const derived = computeTotals(
      usePOSStore.getState().items,
      usePOSStore.getState().discountType,
      usePOSStore.getState().discountValue,
      total,
    )
    const { totals } = usePOSStore.getState()
    expect(totals.amount_applied_cfa).toBe(derived.amount_applied_cfa)
    expect(totals.change_given_cfa).toBe(derived.change_given_cfa)
    expect(totals.balance_added_cfa).toBe(derived.balance_added_cfa)
    expect(totals.amount_applied_cfa).toBe(total)
    expect(totals.change_given_cfa).toBe(0)
    expect(totals.balance_added_cfa).toBe(0)
  })

  it('updates the label when the total changes', () => {
    addLine(1, 1000)
    const { rerender } = render(<ExactCashButton />)
    expect(screen.getByRole('button', { name: exactCashButtonName(1000) })).toBeInTheDocument()

    act(() => {
      usePOSStore.getState().addItem({
        product_id: 'prod-002',
        product_name: 'Cola',
        product_photo_url: '',
        unit_level: 0,
        unit_name: 'Piece',
        quantity_in_unit: 1,
        unit_price_cfa: 500,
        cost_price_cfa: 300,
        conversion_to_base: 1,
      })
    })
    rerender(<ExactCashButton />)
    expect(screen.getByRole('button', { name: exactCashButtonName(1500) })).toBeInTheDocument()
  })
})
