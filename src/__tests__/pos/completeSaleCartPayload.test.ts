import { describe, expect, it } from 'vitest'
import type { CartItem } from '@/types'
import type { CompleteSaleCartItem } from '@/types/rpc'

function toRpcCart(items: CartItem[], isAdmin: boolean): CompleteSaleCartItem[] {
  return items.map((item) => ({
    product_id: item.product_id,
    unit_level: item.unit_level,
    quantity_in_unit: item.quantity_in_unit,
    ...(isAdmin
      ? {
          unit_price_cfa: item.unit_price_cfa,
          line_discount_cfa: item.line_discount_cfa ?? 0,
        }
      : {}),
  }))
}

describe('complete_sale cart payload', () => {
  const item: CartItem = {
    product_id: 'p1',
    product_name: 'X',
    product_photo_url: 'u',
    unit_level: 0,
    unit_name: 'Piece',
    quantity_in_unit: 2,
    unit_price_cfa: 1000,
    cost_price_cfa: 600,
    conversion_to_base: 1,
    line_discount_cfa: 100,
    line_total_cfa: 1900,
  }

  it('cashier omits unit_price and line_discount (catalog on server)', () => {
    const payload = toRpcCart([item], false)
    expect(payload[0]).toEqual({
      product_id: 'p1',
      unit_level: 0,
      quantity_in_unit: 2,
    })
    expect(payload[0]).not.toHaveProperty('unit_price_cfa')
  })

  it('admin sends charged P.U. and Remise', () => {
    const payload = toRpcCart([item], true)
    expect(payload[0]).toMatchObject({
      unit_price_cfa: 1000,
      line_discount_cfa: 100,
    })
  })
})