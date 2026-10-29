/**
 * POS customer picker: overlay, Walk-in, search, keyboard, store updates.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CustomerChip } from '@/components/pos/CustomerChip'
import { useCustomerSearch } from '@/hooks/useCustomers'
import { usePOSStore } from '@/stores/posStore'
import type { Customer } from '@/types/database'
import { POS } from '@/lib/bilingual/pos'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { getByBilingualRole } from '../helpers/bilingualQueries'

vi.mock('@/hooks/useCustomers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCustomers')>()
  return {
    ...actual,
    useCustomerSearch: vi.fn(),
    useCreateCustomer: vi.fn(() => ({ mutateAsync: vi.fn(), isPending: false })),
  }
})

function customer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: 'cust-1',
    name: 'Aminata Diallo',
    phone: '77000000',
    address: null,
    balance_owed_cfa: 1500,
    is_active: true,
    deactivated_at: null,
    created_by: 'admin-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  usePOSStore.getState().startNewSale()
  vi.mocked(useCustomerSearch).mockReturnValue({
    data: [
      customer(),
      customer({
        id: 'cust-2',
        name: 'Fatou Diallo',
        phone: '771112222',
        balance_owed_cfa: 0,
      }),
    ],
    isLoading: false,
  } as never)
})

describe('CustomerChip picker', () => {
  it('opens a max-height overlay without changing walk-in store state', async () => {
    const user = userEvent.setup()
    render(<CustomerChip />)

    expect(usePOSStore.getState().isWalkIn).toBe(true)
    await user.click(getByBilingualRole('button', POS.selectCustomer))

    const picker = screen.getByTestId('pos-customer-picker')
    expect(picker).toHaveClass('max-h-full')
    expect(usePOSStore.getState().isWalkIn).toBe(true)
    expect(usePOSStore.getState().customer).toBeNull()
  })

  it('lists Walk-in first and shows balance as secondary text', async () => {
    const user = userEvent.setup()
    render(<CustomerChip />)
    await user.click(getByBilingualRole('button', POS.selectCustomer))

    const options = screen.getAllByRole('option')
    expect(options[0]).toHaveTextContent(POS.walkIn.fr)
    expect(options[0]).toHaveTextContent(CUSTOMERS.walkInNoAccount.fr)
    expect(screen.getByRole('option', { name: /Aminata Diallo/ })).toHaveTextContent('CFA')
    expect(screen.getByRole('option', { name: /Aminata Diallo/ })).toHaveTextContent('1')
    expect(screen.getByRole('option', { name: /Fatou Diallo/ })).not.toHaveTextContent('CFA')
  })

  it('selects a customer with Enter after ArrowDown', async () => {
    const user = userEvent.setup()
    render(<CustomerChip />)
    await user.click(getByBilingualRole('button', POS.selectCustomer))

    const search = screen.getByRole('combobox')
    search.focus()
    await user.keyboard('{ArrowDown}{Enter}')

    expect(usePOSStore.getState().customer?.name).toBe('Aminata Diallo')
    expect(usePOSStore.getState().isWalkIn).toBe(false)
    expect(screen.queryByTestId('pos-customer-picker')).not.toBeInTheDocument()
  })

  it('selects Walk-in from the list and clears a named customer', async () => {
    const user = userEvent.setup()
    usePOSStore.getState().setCustomer(customer())
    render(<CustomerChip />)

    expect(screen.getByText('Aminata Diallo')).toBeInTheDocument()
    await user.click(getByBilingualRole('button', POS.selectCustomer))
    await user.click(screen.getByRole('option', { name: new RegExp(POS.walkIn.fr, 'i') }))

    expect(usePOSStore.getState().isWalkIn).toBe(true)
    expect(usePOSStore.getState().customer).toBeNull()
  })

  it('filters through the existing name/phone search hook', async () => {
    const user = userEvent.setup()
    render(<CustomerChip />)
    await user.click(getByBilingualRole('button', POS.selectCustomer))
    await user.type(screen.getByRole('combobox'), '77')

    expect(useCustomerSearch).toHaveBeenCalledWith('77', true, true)
  })

  it('closes on Escape without selecting', async () => {
    const user = userEvent.setup()
    render(<CustomerChip />)
    await user.click(getByBilingualRole('button', POS.selectCustomer))
    await user.keyboard('{Escape}')

    expect(screen.queryByTestId('pos-customer-picker')).not.toBeInTheDocument()
    expect(usePOSStore.getState().isWalkIn).toBe(true)
  })
})
