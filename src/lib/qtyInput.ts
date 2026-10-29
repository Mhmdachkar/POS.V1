/** Qty digit fields: Delete/clear should leave "0", never wipe the row. */

import type { KeyboardEvent } from 'react'

export function sanitizeQtyInput(raw: string): string {
  const cleaned = raw.replace(/[^\d.]/g, '')
  if (cleaned === '' || cleaned === '.') return '0'
  return cleaned
}

export function preventQtyEmptyOnDelete(
  e: KeyboardEvent<HTMLInputElement>,
  current: string,
  setValue: (next: string) => void,
): void {
  if (e.key !== 'Backspace' && e.key !== 'Delete') return
  const input = e.currentTarget
  const start = input.selectionStart ?? 0
  const end = input.selectionEnd ?? 0
  const allSelected = start === 0 && end === current.length && current.length > 0
  const wouldEmpty =
    allSelected ||
    (e.key === 'Backspace' && start === end && start > 0 && current.length === 1) ||
    (e.key === 'Delete' && start === end && start === 0 && current.length === 1) ||
    (e.key === 'Backspace' && current === '0' && start === end)
  if (!wouldEmpty && !allSelected) return
  e.preventDefault()
  e.stopPropagation()
  setValue('0')
  requestAnimationFrame(() => {
    input.focus()
    input.setSelectionRange(0, 1)
  })
}