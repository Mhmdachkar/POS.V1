import { AlertCircle } from 'lucide-react'
import { BilingualText } from '@/components/ui/BilingualText'
import { FORM_GUIDANCE } from '@/lib/bilingual/formGuidance'
import type { BilingualPair } from '@/lib/bilingual/types'
import { cn } from '@/lib/cn'

export interface FormActionGuideProps {
  steps: BilingualPair[]
  title?: BilingualPair
  className?: string
}

/** Actionable checklist when a form submit is blocked (validation, not server bugs). */
export function FormActionGuide({
  steps,
  title = FORM_GUIDANCE.completeBeforeSubmit,
  className,
}: FormActionGuideProps) {
  if (steps.length === 0) return null

  return (
    <div
      role="alert"
      className={cn(
        'rounded-md border border-warning/35 bg-warning-bg px-3 py-2.5 text-sm text-warning-foreground',
        className,
      )}
    >
      <div className="flex gap-2">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 space-y-2">
          <p className="font-medium">
            <BilingualText {...title} variant="body" layout="inline" />
          </p>
          <ul className="list-disc pl-4 space-y-1 text-xs sm:text-sm">
            {steps.map((step) => (
              <li key={step.fr}>
                <BilingualText {...step} variant="body" layout="inline" />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
