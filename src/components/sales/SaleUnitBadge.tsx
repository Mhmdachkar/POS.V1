import { Badge, type BadgeVariant } from '@/components/ui/Badge'
import { resolvedSaleUnitName } from '@/lib/saleQuantityDisplay'

function variantForLevel(unitLevel: number): BadgeVariant {
  if (unitLevel === 2) return 'info'
  if (unitLevel === 1) return 'warning'
  return 'neutral'
}

export function SaleUnitBadge({
  unitLevel,
  unitName,
  className,
}: {
  unitLevel: number
  unitName: string | null | undefined
  className?: string
}) {
  const label = resolvedSaleUnitName(unitName, unitLevel)
  return (
    <Badge variant={variantForLevel(unitLevel)} className={className}>
      {label}
    </Badge>
  )
}
