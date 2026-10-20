import { Button } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { POS } from '@/lib/bilingual/pos'
import { t, bi, bilingualAriaLabel } from '@/lib/bilingual/types'
import { formatCFA } from '@/lib/formatters'
import { effectiveFinalTotal, usePOSStore } from '@/stores/posStore'
import { useShallow } from 'zustand/react/shallow'

export function ExactCashButton() {
  const { calculatedTotal, overrideTotalCfa, setCashTendered } = usePOSStore(
    useShallow((s) => ({
      calculatedTotal: s.totals.total_cfa,
      overrideTotalCfa: s.overrideTotalCfa,
      setCashTendered: s.setCashTendered,
    })),
  )
  const total = effectiveFinalTotal(calculatedTotal, overrideTotalCfa)
  const label = bi(`${t(POS.exactPrefix)} : ${formatCFA(total)}`, `${POS.exactPrefix.en}: ${formatCFA(total)}`)

  return (
    <Button
      type="button"
      variant="secondary"
      size="lg"
      className="h-11 flex-shrink-0 px-3"
      aria-label={bilingualAriaLabel(label)}
      onClick={() => setCashTendered(total)}
    >
      <BilingualText {...label} variant="buttonInline" />
    </Button>
  )
}
