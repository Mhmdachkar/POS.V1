import { Input } from '@/components/ui'
import { POS } from '@/lib/bilingual/pos'
import { t, bilingualAriaLabel, bilingualPlain } from '@/lib/bilingual/types'
import { parseCFAInput } from '@/lib/formatters'
import { usePOSStore } from '@/stores/posStore'

export function CashInput() {
  const cashTendered = usePOSStore((s) => s.cashTendered)
  const setCashTendered = usePOSStore((s) => s.setCashTendered)

  return (
    <div className="flex-1 min-w-0">
      <Input
        id="pos-cash-received"
        type="number"
        min={0}
        step={100}
        value={cashTendered || ''}
        onChange={(e) => {
          const val = parseCFAInput(e.target.value)
          setCashTendered(isNaN(val) || val < 0 ? 0 : val)
        }}
        placeholder="0"
        prefix="CFA"
        aria-label={bilingualAriaLabel(POS.cashReceived)}
        className="h-11 pl-12 text-base font-semibold"
        error={cashTendered < 0 ? bilingualPlain(POS.cashNegative) : undefined}
      />
    </div>
  )
}
