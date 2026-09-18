import { CashInput } from './CashInput'
import { ExactCashButton } from './ExactCashButton'

export function CashSection() {
  return (
    <div className="flex items-start gap-2">
      <CashInput />
      <ExactCashButton />
    </div>
  )
}
