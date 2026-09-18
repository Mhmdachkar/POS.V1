import { render, screen, within } from '@testing-library/react'
import type React from 'react'
import { bi, bilingualAriaLabel, type BilingualPair } from '@/lib/bilingual/types'
import { messageForCodeBilingual, messageForCodePlain } from '@/lib/bilingual/errors'
import type { VhmErrorCode } from '@/lib/errors'

export { bilingualAriaLabel }

/** App shell nav landmarks (match production aria-label strings). */
export const LAYOUT_ARIA = {
  mainNav: bi('Navigation principale', 'Main navigation'),
} as const

export function getByLabelBi(pair: BilingualPair) {
  return screen.getByLabelText(bilingualAriaLabel(pair))
}

export function queryByLabelBi(pair: BilingualPair) {
  return screen.queryByLabelText(bilingualAriaLabel(pair))
}

/** Visible error copy — French plain string. */
export function expectErrorMessage(code: VhmErrorCode, details?: Record<string, unknown>) {
  return messageForCodePlain(code, details)
}

/** French error text for findByText / getByText. */
export function frenchErrorText(code: VhmErrorCode, details?: Record<string, unknown>) {
  return messageForCodeBilingual(code, details).fr
}

/** @deprecated Use frenchErrorText — UI is French-only. */
export function englishErrorText(code: VhmErrorCode, details?: Record<string, unknown>) {
  return frenchErrorText(code, details)
}

function assertToastContains(
  toastFn: { mock: { calls: unknown[][] } },
  text: string,
) {
  expect(toastFn).toHaveBeenCalled()
  const arg = toastFn.mock.calls.at(-1)?.[0]
  if (typeof arg === 'string') {
    expect(arg).toContain(text)
    return
  }
  const { container } = render(arg as React.ReactElement)
  expect(container.textContent).toContain(text)
}

export function expectToastSuccessFr(
  toastSuccess: { mock: { calls: unknown[][] } },
  fr: string,
) {
  assertToastContains(toastSuccess, fr)
}

export function expectToastErrorFr(
  toastError: { mock: { calls: unknown[][] } },
  fr: string,
) {
  assertToastContains(toastError, fr)
}

/** @deprecated Use expectToastSuccessFr */
export const expectToastSuccessEn = expectToastSuccessFr
/** @deprecated Use expectToastErrorFr */
export const expectToastErrorEn = expectToastErrorFr

/** Match visible French primary line. */
export function getByFrench(text: string) {
  return screen.getByText(text, { exact: false })
}

/** Role query with French aria-label. */
export function getByBilingualRole(
  role: Parameters<typeof screen.getByRole>[0],
  pair: BilingualPair,
) {
  return screen.getByRole(role, { name: bilingualAriaLabel(pair) })
}

/**
 * English secondary is no longer rendered.
 * Prefer getByFrench(pair.fr) in new tests.
 */
export function queryByEnglishSecondary(_en: string) {
  return null
}

export function withinFrench(container: HTMLElement, fr: string) {
  return within(container).getByText(fr, { exact: false })
}
