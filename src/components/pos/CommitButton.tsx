import { LoadingButton } from '@/components/ui'
import { BiButtonStack } from '@/lib/bilingual/ui'
import { COMMON } from '@/lib/bilingual/common'
import { POS } from '@/lib/bilingual/pos'
import { bilingualAriaLabel } from '@/lib/bilingual/types'

export interface CommitButtonProps {
  canSubmit: boolean
  isSubmitting: boolean
  onComplete: () => void
  describedBy?: string
}

export function CommitButton({
  canSubmit,
  isSubmitting,
  onComplete,
  describedBy,
}: CommitButtonProps) {
  const disabled = !canSubmit

  return (
    <LoadingButton
      variant="primary"
      size="xl"
      loading={isSubmitting}
      disabled={disabled}
      onClick={onComplete}
      className="w-full h-14 mt-1"
      aria-label={bilingualAriaLabel(POS.completeSaleAria)}
      aria-disabled={disabled || isSubmitting}
      aria-describedby={describedBy}
      loadingLabel={bilingualAriaLabel(COMMON.processing)}
    >
      {isSubmitting ? (
        <BiButtonStack {...COMMON.processing} />
      ) : (
        <BiButtonStack {...POS.completeSale} />
      )}
    </LoadingButton>
  )
}
