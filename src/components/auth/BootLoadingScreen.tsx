import { COMMON } from '@/lib/bilingual/common'
import { t } from '@/lib/bilingual/types'
import { Skeleton } from '@/components/ui'

/** Full-screen loading state shared by AuthGuard (booting) and route Suspense. */
export function BootLoadingScreen() {
  return (
    <div
      className="flex h-screen flex-col items-center justify-center gap-4 bg-background"
      role="status"
      aria-busy="true"
      aria-label={t(COMMON.loadingApp)}
    >
      <div className="space-y-3 w-56">
        <Skeleton height={8} className="rounded-full" />
        <Skeleton height={8} width="80%" className="rounded-full" />
        <Skeleton height={8} width="60%" className="rounded-full" />
      </div>
      <p className="text-sm text-text-secondary">{t(COMMON.loadingApp)}</p>
    </div>
  )
}
