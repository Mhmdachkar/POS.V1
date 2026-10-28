/**
 * Load a proforma into the POS cart for conversion (complete_sale + p_proforma_id).
 */

import { supabase } from '@/lib/supabase'
import { fetchProformaDetail, type ProformaItemRow } from '@/hooks/useProformas'
import { usePOSStore } from '@/stores/posStore'
import type { CartItem } from '@/types'
import type { Customer } from '@/types/database'

export type ProformaPriceMode = 'quote' | 'catalog'

export interface CatalogUnitPrice {
  product_id: string
  unit_level: number
  selling_price_cfa: number
  cost_price_cfa: number
  conversion_to_base: number
  unit_name: string
  product_name: string
  product_photo_url: string
}

async function fetchCatalogUnits(
  items: ProformaItemRow[],
): Promise<Map<string, CatalogUnitPrice>> {
  const productIds = [...new Set(items.map((i) => i.product_id))]
  const map = new Map<string, CatalogUnitPrice>()
  if (productIds.length === 0) return map

  const [{ data: units, error: uErr }, { data: products, error: pErr }] = await Promise.all([
    supabase
      .from('product_units')
      .select('product_id, unit_level, selling_price_cfa, cost_price_cfa, conversion_to_base, unit_name')
      .in('product_id', productIds),
    supabase.from('products').select('id, name, photo_url').in('id', productIds),
  ])
  if (uErr) throw uErr
  if (pErr) throw pErr

  const productById = new Map((products ?? []).map((p) => [p.id as string, p]))
  for (const u of units ?? []) {
    const product = productById.get(u.product_id as string)
    const key = `${u.product_id}:${u.unit_level}`
    map.set(key, {
      product_id: u.product_id as string,
      unit_level: u.unit_level as number,
      selling_price_cfa: Number(u.selling_price_cfa),
      cost_price_cfa: Number(u.cost_price_cfa),
      conversion_to_base: Number(u.conversion_to_base),
      unit_name: String(u.unit_name),
      product_name: product ? String(product.name) : '',
      product_photo_url: product?.photo_url ? String(product.photo_url) : '',
    })
  }
  return map
}

export function proformaHasPriceDrift(
  items: ProformaItemRow[],
  catalog: Map<string, CatalogUnitPrice>,
): boolean {
  return items.some((it) => {
    const cat = catalog.get(`${it.product_id}:${it.unit_level}`)
    if (!cat) return false
    return Number(it.unit_price_cfa) !== Number(cat.selling_price_cfa)
  })
}

function toCartItems(
  items: ProformaItemRow[],
  catalog: Map<string, CatalogUnitPrice>,
  mode: ProformaPriceMode,
): CartItem[] {
  return items.map((it) => {
    const cat = catalog.get(`${it.product_id}:${it.unit_level}`)
    const unitPrice =
      mode === 'quote' ? Number(it.unit_price_cfa) : Number(cat?.selling_price_cfa ?? it.unit_price_cfa)
    const lineDiscount = mode === 'quote' ? Number(it.line_discount_cfa) : 0
    const qty = Number(it.quantity_in_unit)
    return {
      product_id: it.product_id,
      product_name: it.product_name || cat?.product_name || '',
      product_photo_url: cat?.product_photo_url ?? '',
      unit_level: it.unit_level as 0 | 1 | 2,
      unit_name: it.unit_name || cat?.unit_name || '',
      quantity_in_unit: qty,
      unit_price_cfa: unitPrice,
      cost_price_cfa: Number(cat?.cost_price_cfa ?? it.cost_price_cfa),
      conversion_to_base: Number(cat?.conversion_to_base ?? 1),
      line_discount_cfa: lineDiscount,
      line_total_cfa: Math.round(qty * unitPrice * 100) / 100 - lineDiscount,
    }
  })
}

async function fetchCustomerRow(id: string): Promise<Customer | null> {
  const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Customer | null) ?? null
}

/** Prefetch catalog + drift flag before showing price-choice dialog. */
export async function prepareProformaConvert(proformaId: string) {
  const detail = await fetchProformaDetail(proformaId)
  if (detail.proforma.status === 'converted' || detail.proforma.status === 'cancelled') {
    return { detail, catalog: new Map<string, CatalogUnitPrice>(), hasDrift: false, blocked: true as const }
  }
  const catalog = await fetchCatalogUnits(detail.items)
  const hasDrift = proformaHasPriceDrift(detail.items, catalog)
  return { detail, catalog, hasDrift, blocked: false as const }
}

export async function loadProformaIntoPosCart(opts: {
  proformaId: string
  priceMode: ProformaPriceMode
  prepared?: Awaited<ReturnType<typeof prepareProformaConvert>>
}): Promise<{ number: string }> {
  const prepared = opts.prepared ?? (await prepareProformaConvert(opts.proformaId))
  if (prepared.blocked) {
    throw new Error('PROFORMA_NOT_CONVERTIBLE')
  }
  const { detail, catalog } = prepared
  const cartItems = toCartItems(detail.items, catalog, opts.priceMode)

  let customer: Customer | null = null
  if (detail.proforma.customer_id) {
    customer = await fetchCustomerRow(detail.proforma.customer_id)
  }

  const store = usePOSStore.getState()
  store.startNewSale()
  store.restoreCart(cartItems)
  store.setCustomer(customer)
  store.setDiscountType(detail.proforma.discount_type)
  store.setDiscountValue(Number(detail.proforma.discount_value ?? 0))
  store.setDocumentDateYmd(detail.proforma.document_date)
  store.setExternalRef(detail.proforma.external_ref ?? '')
  store.setPendingProformaId(detail.proforma.id)
  return { number: detail.proforma.number }
}
