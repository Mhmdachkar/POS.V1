/**
 * Phase 13D — Enter-to-complete gates.
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  hasBlockingOverlay,
  shouldCompleteSaleOnEnter,
} from '@/lib/posEnterComplete'

function enterEvent(
  overrides: Partial<Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'isComposing'>> = {},
) {
  return {
    key: 'Enter' as const,
    defaultPrevented: false,
    isComposing: false,
    ...overrides,
  }
}

function focusTag(
  tag: string,
  attrs: Record<string, string> = {},
): HTMLElement {
  const el = document.createElement(tag)
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
  if (tag === 'a') el.setAttribute('href', '#')
  document.body.appendChild(el)
  el.tabIndex = 0
  el.focus()
  return el
}

describe('shouldCompleteSaleOnEnter', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    document.body.removeAttribute('tabindex')
  })

  it('submits when valid state and body is focused', () => {
    document.body.tabIndex = 0
    document.body.focus()
    expect(shouldCompleteSaleOnEnter(enterEvent(), true)).toBe(true)
  })

  it('does not submit when an input is focused', () => {
    focusTag('input', { type: 'number' })
    expect(shouldCompleteSaleOnEnter(enterEvent(), true)).toBe(false)
  })

  it('does not submit when a textarea is focused', () => {
    focusTag('textarea')
    expect(shouldCompleteSaleOnEnter(enterEvent(), true)).toBe(false)
  })

  it('does not submit when a select is focused', () => {
    focusTag('select')
    expect(shouldCompleteSaleOnEnter(enterEvent(), true)).toBe(false)
  })

  it('does not submit when a contenteditable element is focused', () => {
    const el = document.createElement('div')
    el.setAttribute('contenteditable', 'true')
    document.body.appendChild(el)
    el.tabIndex = 0
    el.focus()
    expect(shouldCompleteSaleOnEnter(enterEvent(), true)).toBe(false)
  })

  it('does not submit when a button is focused', () => {
    focusTag('button', { type: 'button' })
    expect(shouldCompleteSaleOnEnter(enterEvent(), true)).toBe(false)
  })

  it('does not submit when a link is focused', () => {
    focusTag('a')
    expect(shouldCompleteSaleOnEnter(enterEvent(), true)).toBe(false)
  })

  it('does not submit when an overlay is open', () => {
    document.body.tabIndex = 0
    document.body.focus()
    const overlay = document.createElement('div')
    overlay.setAttribute('data-state', 'open')
    document.body.appendChild(overlay)
    expect(hasBlockingOverlay()).toBe(true)
    expect(shouldCompleteSaleOnEnter(enterEvent(), true)).toBe(false)
  })

  it('does not submit when a dialog is open', () => {
    document.body.tabIndex = 0
    document.body.focus()
    const dialog = document.createElement('div')
    dialog.setAttribute('role', 'dialog')
    document.body.appendChild(dialog)
    expect(shouldCompleteSaleOnEnter(enterEvent(), true)).toBe(false)
  })

  it('does not submit when defaultPrevented is true', () => {
    document.body.tabIndex = 0
    document.body.focus()
    expect(shouldCompleteSaleOnEnter(enterEvent({ defaultPrevented: true }), true)).toBe(false)
  })

  it('does not submit when isComposing is true', () => {
    document.body.tabIndex = 0
    document.body.focus()
    expect(shouldCompleteSaleOnEnter(enterEvent({ isComposing: true }), true)).toBe(false)
  })

  it('does not submit when canSubmit is false', () => {
    document.body.tabIndex = 0
    document.body.focus()
    expect(shouldCompleteSaleOnEnter(enterEvent(), false)).toBe(false)
  })

  it('submits when every gate passes', () => {
    document.body.tabIndex = 0
    document.body.focus()
    expect(shouldCompleteSaleOnEnter(enterEvent(), true)).toBe(true)
  })
})
