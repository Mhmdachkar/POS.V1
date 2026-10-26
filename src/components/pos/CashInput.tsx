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
        step={100}
        value={cashTendered === 0 ? '' : cashTendered}
        onChange={(e) => {
          const raw = e.target.value
          if (raw.trim() === '') {
            setCashTendered(0)
            return
          }
          const val = parseCFAInput(raw)
          if (isNaN(val)) return
          setCashTendered(val)
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
