/**
 * ShiftChip — static "no shift" status for the shared TopBar.
 * Active shift workflow has been removed; the chip stays visible so cashiers
 * always see service status on /pos (including 390px).
 */

import { BilingualText } from '@/components/ui/BilingualText'
import { POS } from '@/lib/bilingual/pos'

export function ShiftChip(_props: { posDepotId?: string | null }) {
  return (
    <div
      data-testid="shift-chip"
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm font-semibold text-text-primary"
    >
      <BilingualText {...POS.noOpenShift} variant="inline" layout="inline" />
    </div>
  )
}
