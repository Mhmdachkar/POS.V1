/**
 * ShiftChip — DEPRECATED by CEO Notes phase.
 * Active shift workflow has been removed. Shows a static "no shift" label
 * so the POS context bar still has a presence without selection UI.
 */

import { BilingualText } from '@/components/ui/BilingualText'
import { POS } from '@/lib/bilingual/pos'

export function ShiftChip(_props: { posDepotId?: string | null }) {
  return (
    <div
      data-testid="shift-chip"
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-muted px-2.5 py-1 text-xs text-text-secondary"
    >
      <BilingualText {...POS.noOpenShift} variant="inline" layout="inline" />
    </div>
  )
}
