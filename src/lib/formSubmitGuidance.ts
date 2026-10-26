import type { FieldErrors, FieldValues } from 'react-hook-form'
import { FORM_GUIDANCE } from '@/lib/bilingual/formGuidance'
import type { BilingualPair } from '@/lib/bilingual/types'

/** Map react-hook-form field paths to actionable bilingual steps. */
export type FieldGuidanceMap = Record<string, BilingualPair>

function messageFromUnknown(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  if ('message' in value && typeof (value as { message?: unknown }).message === 'string') {
    return (value as { message: string }).message
  }
  return null
}

function walkErrors(
  errors: FieldErrors<FieldValues>,
  prefix: string,
  map: FieldGuidanceMap,
  out: BilingualPair[],
): void {
  for (const [key, raw] of Object.entries(errors)) {
    const path = prefix ? `${prefix}.${key}` : key
    const msg = messageFromUnknown(raw)
    if (msg) {
      const guided = map[path] ?? map[key]
      if (guided) {
        if (!out.some((s) => s.fr === guided.fr)) out.push(guided)
      }
      continue
    }
    if (raw && typeof raw === 'object') {
      walkErrors(raw as FieldErrors<FieldValues>, path, map, out)
    }
  }
}

export function guidanceStepsFromFieldErrors(
  errors: FieldErrors<FieldValues>,
  map: FieldGuidanceMap,
): BilingualPair[] {
  const steps: BilingualPair[] = []
  walkErrors(errors, '', map, steps)
  if (steps.length === 0) {
    steps.push(FORM_GUIDANCE.checkRequiredFields)
  }
  return steps
}
