/**
 * Phase 13D — CommitButton size, disabled state, and click handler.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommitButton } from '@/components/pos/CommitButton'
import { POS } from '@/lib/bilingual/pos'
import { getByBilingualRole } from '../helpers/bilingualQueries'

describe('CommitButton', () => {
  it('is disabled when canSubmit is false', () => {
    render(
      <CommitButton canSubmit={false} isSubmitting={false} onComplete={() => {}} />,
    )
    const button = getByBilingualRole('button', POS.completeSaleAria)
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('aria-disabled', 'true')
  })

  it('is enabled when canSubmit is true', () => {
    render(
      <CommitButton canSubmit={true} isSubmitting={false} onComplete={() => {}} />,
    )
    const button = getByBilingualRole('button', POS.completeSaleAria)
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('aria-disabled', 'false')
  })

  it('uses xl size / 56px height', () => {
    render(
      <CommitButton canSubmit={true} isSubmitting={false} onComplete={() => {}} />,
    )
    expect(getByBilingualRole('button', POS.completeSaleAria)).toHaveClass('h-14')
  })

  it('invokes the submit handler on click when enabled', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(
      <CommitButton canSubmit={true} isSubmitting={false} onComplete={onComplete} />,
    )
    await user.click(getByBilingualRole('button', POS.completeSaleAria))
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('does not invoke the submit handler when disabled', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(
      <CommitButton canSubmit={false} isSubmitting={false} onComplete={onComplete} />,
    )
    await user.click(getByBilingualRole('button', POS.completeSaleAria))
    expect(onComplete).not.toHaveBeenCalled()
  })
})
