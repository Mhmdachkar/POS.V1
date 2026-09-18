/**
 * Gated Enter-to-complete for the POS payment stage.
 *
 * Submit only when every check passes. Callers must not preventDefault
 * unless this returns true.
 */

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])
const NATIVE_ACTION_TAGS = new Set(['BUTTON', 'A'])

function isVisible(el: Element): boolean {
  if (el.getAttribute('aria-hidden') === 'true') return false
  if (el.hasAttribute('hidden')) return false
  const html = el as HTMLElement
  if (html.hidden) return false
  const inline = html.style?.display
  if (inline === 'none') return false
  return true
}

export function hasBlockingOverlay(doc: Document = document): boolean {
  const overlays = doc.querySelectorAll(
    '[role="dialog"], [role="listbox"], [data-state="open"], [aria-modal="true"]',
  )
  for (const node of overlays) {
    if (isVisible(node)) return true
  }
  return false
}

export function shouldCompleteSaleOnEnter(
  event: Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'isComposing'>,
  canSubmit: boolean,
  doc: Document = document,
): boolean {
  if (event.key !== 'Enter') return false
  if (!canSubmit) return false
  if (event.defaultPrevented) return false
  if (event.isComposing) return false

  const el = doc.activeElement
  if (el instanceof HTMLElement || el instanceof SVGElement) {
    const tag = el.tagName
    if (EDITABLE_TAGS.has(tag)) return false
    if (el instanceof HTMLElement && el.isContentEditable) return false
    const contentEditableRoot = el.closest('[contenteditable]')
    if (
      contentEditableRoot &&
      contentEditableRoot.getAttribute('contenteditable') !== 'false'
    ) {
      return false
    }
    if (NATIVE_ACTION_TAGS.has(tag)) return false
    if (
      el.closest(
        'button, a, [role="button"], [role="link"], [role="menuitem"], [role="option"], [role="tab"], [role="combobox"]',
      )
    ) {
      return false
    }
  }

  if (hasBlockingOverlay(doc)) return false
  return true
}
