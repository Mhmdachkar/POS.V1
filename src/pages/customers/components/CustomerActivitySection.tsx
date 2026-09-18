/**

 * Shared customer account-activity presentation (drawer + full history).

 *

 * Events only — not a fake invoice ledger. Payments are never shown as

 * allocated to a receipt.

 */



import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

import { Badge, MoneyDisplay, Tabs, type TabItem } from '@/components/ui'

import { BilingualText } from '@/components/ui/BilingualText'

import { formatDate } from '@/lib/formatters'

import type {

  CustomerActivityEvent,

  CustomerActivityType,

  CustomerActivityTypeFilter,

} from '@/hooks/useCustomerActivity'

import { CUSTOMERS } from '@/lib/bilingual/customers'

import { BiTabLabel } from '@/lib/bilingual/ui'

import { bilingualAriaLabel, type BilingualPair } from '@/lib/bilingual/types'



export const ACTIVITY_FILTER_TABS: TabItem[] = [

  { value: 'all', label: <BiTabLabel {...CUSTOMERS.activityFilterAll} /> },

  { value: 'sale', label: <BiTabLabel {...CUSTOMERS.activityFilterSales} /> },

  { value: 'return', label: <BiTabLabel {...CUSTOMERS.activityFilterReturns} /> },

  { value: 'payment', label: <BiTabLabel {...CUSTOMERS.activityFilterPayments} /> },

]



const TYPE_BADGE: Record<CustomerActivityType, { pair: BilingualPair; variant: 'neutral' | 'warning' | 'success' }> = {

  sale: { pair: CUSTOMERS.activityTypeSale, variant: 'neutral' },

  return: { pair: CUSTOMERS.activityTypeReturn, variant: 'warning' },

  payment: { pair: CUSTOMERS.activityTypePayment, variant: 'success' },

}



export function ActivityTypeBadge({ type }: { type: CustomerActivityType }) {

  const config = TYPE_BADGE[type]

  return (

    <Badge variant={config.variant}>

      <BilingualText {...config.pair} variant="badge" enClassName="normal-case" />

    </Badge>

  )

}



export function SignedActivityAmount({

  event,

  className,

}: {

  event: CustomerActivityEvent

  className?: string

}) {

  const abs = Math.abs(event.amountCfa)

  const sign = event.amountCfa > 0 ? '+' : event.amountCfa < 0 ? '−' : ''

  const tone =

    event.isReversed

      ? 'text-text-muted'

      : event.type === 'payment'

        ? 'text-success-foreground'

        : event.type === 'return'

          ? 'text-warning-foreground'

          : 'text-text-primary'

  const label = `${sign} ${abs} CFA, ${event.description}`



  return (

    <span

      className={cn(

        'inline-flex items-baseline gap-0 tabular-nums',

        tone,

        event.isReversed && 'line-through',

        className,

      )}

      aria-label={label}

    >

      {sign}

      <MoneyDisplay

        amount={abs}

        size="small"

        className={cn(tone, event.isReversed && 'line-through text-text-muted')}

      />

    </span>

  )

}



export function ActivityFilterTabs({

  value,

  onChange,

  className,

}: {

  value: CustomerActivityTypeFilter

  onChange: (value: CustomerActivityTypeFilter) => void

  className?: string

}) {

  return (

    <Tabs

      tabs={ACTIVITY_FILTER_TABS}

      active={value}

      onChange={(next) => onChange(next as CustomerActivityTypeFilter)}

      className={className}

    />

  )

}



interface ActivityEventRowProps {

  event: CustomerActivityEvent

  onOpenSale?: (saleId: string) => void

}



export function ActivityEventRow({ event, onOpenSale }: ActivityEventRowProps) {

  const clickable = Boolean(event.saleId && onOpenSale && event.type !== 'payment')

  const typePair = TYPE_BADGE[event.type].pair

  const content = (

    <>

      <div className="min-w-0">

        <div className="flex items-center gap-2">

          <ActivityTypeBadge type={event.type} />

          <p className="font-mono text-sm font-semibold text-text-primary truncate">

            {event.reference}

          </p>

        </div>

        <p className="text-xs text-text-muted mt-0.5">{formatDate(event.occurredAt)}</p>

        <p className="text-xs text-text-secondary mt-0.5 truncate">{event.description}</p>

        {event.isReversed && (

          <Badge variant="neutral" className="text-[10px] mt-0.5">

            <BilingualText {...CUSTOMERS.activityReversed} variant="badge" enClassName="normal-case" />

          </Badge>

        )}

      </div>

      <div className="text-right flex-shrink-0">

        <SignedActivityAmount event={event} />

      </div>

    </>

  )



  const rowClass =

    'flex items-start justify-between gap-3 px-3 py-2 bg-surface border-b border-border last:border-0 w-full text-left'



  if (clickable) {

    return (

      <button

        type="button"

        className={cn(rowClass, 'hover:bg-surface-muted focus:outline-none focus:bg-primary-subtle')}

        onClick={() => onOpenSale?.(event.saleId!)}

        aria-label={bilingualAriaLabel(typePair) + ` ${event.reference}`}

      >

        {content}

      </button>

    )

  }



  return <div className={rowClass}>{content}</div>

}

