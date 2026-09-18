/**
 * Phase 13A — UI foundation primitives.
 *
 * Covers MoneyDisplay sizes/danger, FilterBar callbacks, Tabs active
 * state, Button xl, LoadingButton xl, and returned Badge = warning.
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  Badge,
  Button,
  FilterBar,
  LoadingButton,
  MoneyDisplay,
  PageHeader,
  SaleStatusBadge,
  SearchInput,
  Select,
  Tabs,
} from '@/components/ui'
import { formatCFA } from '@/lib/formatters'

describe('MoneyDisplay', () => {
  it('renders formatCFA at all four sizes', () => {
    const amount = 24500
    const label = formatCFA(amount)
    const moneyNode = (_: string, node: Element | null) =>
      node?.tagName === 'SPAN' && node.textContent === label

    const { rerender } = render(<MoneyDisplay amount={amount} size="display" />)
    expect(screen.getByText(moneyNode)).toHaveClass('text-financial-lg', 'financial-value')

    rerender(<MoneyDisplay amount={amount} size="large" />)
    expect(screen.getByText(moneyNode)).toHaveClass('text-financial-md', 'financial-value')

    rerender(<MoneyDisplay amount={amount} size="medium" />)
    expect(screen.getByText(moneyNode)).toHaveClass('text-financial-sm', 'financial-value')

    rerender(<MoneyDisplay amount={amount} size="small" />)
    expect(screen.getByText(moneyNode)).toHaveClass('text-sm', 'financial-value')
  })

  it('applies danger foreground', () => {
    render(<MoneyDisplay amount={100} danger />)
    expect(screen.getByText(formatCFA(100))).toHaveClass('text-danger-foreground')
  })

  it('uses existing null formatting', () => {
    render(<MoneyDisplay amount={null} />)
    expect(screen.getByText(formatCFA(null))).toBeInTheDocument()
  })
})

describe('FilterBar', () => {
  it('fires search and chip callbacks exactly', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    const onChipChange = vi.fn()

    render(
      <FilterBar
        search=""
        onSearchChange={onSearchChange}
        searchPlaceholder="Find items"
        chips={[
          { value: 'all', label: 'All' },
          { value: 'open', label: 'Open' },
        ]}
        activeChip="all"
        onChipChange={onChipChange}
        count={12}
      />,
    )

    expect(screen.getByText('12')).toBeInTheDocument()
    await user.type(screen.getByPlaceholderText('Find items'), 'x')
    expect(onSearchChange).toHaveBeenCalledWith('x')

    await user.click(screen.getByRole('button', { name: 'Open' }))
    expect(onChipChange).toHaveBeenCalledTimes(1)
    expect(onChipChange).toHaveBeenCalledWith('open')
  })
})

describe('Tabs', () => {
  it('marks the active tab and calls onChange', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()

    render(
      <Tabs
        tabs={[
          { value: 'sales', label: 'Sales' },
          { value: 'stock', label: 'Stock' },
        ]}
        active="sales"
        onChange={onChange}
      />,
    )

    const sales = screen.getByRole('tab', { name: 'Sales' })
    const stock = screen.getByRole('tab', { name: 'Stock' })
    expect(sales).toHaveAttribute('aria-selected', 'true')
    expect(stock).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tablist')).toBeInTheDocument()

    await user.click(stock)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('stock')
  })
})

describe('Button', () => {
  it('renders xl at h-14', () => {
    render(<Button size="xl">Complete sale</Button>)
    expect(screen.getByRole('button', { name: 'Complete sale' })).toHaveClass('h-14', 'px-8', 'text-base')
  })
})

describe('LoadingButton', () => {
  it('forwards xl size onto Button', () => {
    render(
      <LoadingButton size="xl" loading>
        Save
      </LoadingButton>,
    )
    expect(screen.getByRole('button')).toHaveClass('h-14')
    expect(screen.getByRole('button')).toBeDisabled()
  })
})

describe('SaleStatusBadge', () => {
  it('renders returned as warning', () => {
    const { container } = render(<SaleStatusBadge status="returned" />)
    const badge = container.querySelector('.bg-warning-bg')
    expect(badge).toBeTruthy()
    expect(badge).toHaveClass('bg-warning-bg', 'text-warning-foreground')
    expect(badge).not.toHaveClass('bg-info-bg')
  })
})

describe('PageHeader / SearchInput / Select', () => {
  it('renders a title, search type, and native select', () => {
    render(
      <>
        <PageHeader title="Overview" description="Today" actions={<Button>New</Button>} />
        <SearchInput placeholder="Search products" />
        <Select label="Depot" defaultValue="a">
          <option value="a">Depot A</option>
        </Select>
      </>,
    )

    expect(screen.getByRole('heading', { name: 'Overview' })).toBeInTheDocument()
    expect(screen.getByText('Today')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Search products')).toHaveAttribute('type', 'search')
    expect(screen.getByPlaceholderText('Search products')).toHaveAttribute('autocomplete', 'off')
    expect(screen.getByLabelText('Depot')).toHaveDisplayValue('Depot A')
  })
})

describe('13A visual tokens', () => {
  it('renders the foundation gallery without throwing', () => {
    render(
      <div>
        <PageHeader title="Foundations" description="13A checkpoint" />
        <Button size="xl">Button xl</Button>
        <MoneyDisplay amount={1234} size="display" />
        <MoneyDisplay amount={1234} size="large" />
        <MoneyDisplay amount={1234} size="medium" />
        <MoneyDisplay amount={1234} size="small" />
        <FilterBar
          search=""
          chips={[{ value: 'all', label: 'All' }]}
          activeChip="all"
        />
        <Tabs tabs={[{ value: 'a', label: 'Alpha' }]} active="a" onChange={() => {}} />
        <Badge variant="warning">Returned</Badge>
      </div>,
    )

    expect(screen.getByRole('heading', { name: 'Foundations' })).toBeInTheDocument()
    expect(
      screen.getAllByText((_, node) => node?.tagName === 'SPAN' && node.textContent === formatCFA(1234)),
    ).toHaveLength(4)
  })
})
