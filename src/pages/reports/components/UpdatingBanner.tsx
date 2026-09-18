import { BilingualText } from '@/components/ui/BilingualText'
import { REPORTS } from '@/lib/bilingual/reports'

export function UpdatingBanner({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <div
      role="status"
      className="text-xs text-text-muted bg-surface-alt border border-border rounded-md px-3 py-1.5 mb-4"
    >
      <BilingualText {...REPORTS.updatingBanner} variant="caption" />
    </div>
  )
}
