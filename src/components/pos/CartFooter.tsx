import { MoneyDisplay } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { POS } from '@/lib/bilingual/pos'

export interface CartFooterProps {
  lineCount: number
  subtotalCfa: number
}

/**
 * Compact cart footer. Must not render a 36px Total — CheckoutSummary owns that in 13D.
 */
export function CartFooter({ lineCount, subtotalCfa }: CartFooterProps) {
  return (
    <div className="flex-shrink-0 px-4 py-2.5 border-t border-border bg-surface flex items-center justify-between gap-3">
      <BilingualText {...POS.footerLines(lineCount)} variant="caption" />
      <div className="flex items-center gap-2">
        <BilingualText {...POS.subtotal} variant="caption" />
        <MoneyDisplay amount={subtotalCfa} size="small" />
      </div>
    </div>
  )
}
