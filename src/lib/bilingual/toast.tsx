import { toast } from 'sonner'
import { BilingualText } from '@/components/ui/BilingualText'
import type { BilingualPair } from './types'
import type { VhmErrorCode } from '@/lib/errors'
import { messageForCodeBilingual } from './errors'

function toastBody({ fr, en }: BilingualPair) {
  return (
    <BilingualText fr={fr} en={en} variant="toast" as="div" ariaLabel />
  )
}

export function toastSuccessBi(pair: BilingualPair) {
  toast.success(toastBody(pair))
}

export function toastErrorBi(pair: BilingualPair) {
  toast.error(toastBody(pair))
}

export function toastInfoBi(pair: BilingualPair) {
  toast.info(toastBody(pair))
}

export function toastErrorFromCode(code: VhmErrorCode, details?: Record<string, unknown>) {
  toastErrorBi(messageForCodeBilingual(code, details))
}

/** Bilingual toast with optional dynamic English/French segments in `fr`/`en` strings. */
export function toastSuccessMessage(fr: string, en: string) {
  toastSuccessBi({ fr, en })
}

export function toastErrorMessage(fr: string, en: string) {
  toastErrorBi({ fr, en })
}
