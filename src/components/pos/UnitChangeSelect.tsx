import { tryChangeCartUnit } from '@/lib/posCartActions'
import { POS } from '@/lib/bilingual/pos'
import { toastErrorBi } from '@/lib/bilingual/toast'
import { t, bilingualAriaLabel } from '@/lib/bilingual/types'
import { useProductDetail } from '@/hooks/useProducts'
import type { ProductUnit } from '@/types/database'

export interface UnitChangeSelectProps {
  productId: string
  currentUnitLevel: number
  productName: string
  availablePieces?: number | null
}

export function UnitChangeSelect({
  productId,
  currentUnitLevel,
  productName,
  availablePieces = null,
}: UnitChangeSelectProps) {
  const { data: product } = useProductDetail(productId)
  const units = product?.units ?? []
  const stock =
    availablePieces ??
    (product != null ? Number(product.current_stock_pieces) : null)

  if (units.length < 2) return null

  function applyUnit(unit: ProductUnit) {
    const result = tryChangeCartUnit(
      productId,
      currentUnitLevel,
      {
        unit_level: unit.unit_level as 0 | 1 | 2,
        unit_name: unit.unit_name,
        unit_price_cfa: unit.selling_price_cfa,
        cost_price_cfa: unit.cost_price_cfa,
        conversion_to_base: unit.conversion_to_base,
      },
      stock,
    )
    if (!result.ok) {
      toastErrorBi(POS.remainingStock(result.remainingPieces))
    }
  }

  return (
    <select
      aria-label={bilingualAriaLabel(POS.changeUnitAria(productName))}
      value={currentUnitLevel}
      onChange={(e) => {
        const next = units.find((u) => u.unit_level === Number(e.target.value))
        if (next) applyUnit(next)
      }}
      className="h-9 max-w-[7.5rem] px-2 rounded-md border border-border bg-surface text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
    >
      {units.map((unit) => (
        <option key={unit.id} value={unit.unit_level}>
          {unit.unit_name}
        </option>
      ))}
    </select>
  )
}
