import { BilingualText } from '@/components/ui/BilingualText'
import type { BilingualPair } from './types'

/** Page / drawer H1 title band. */
export function BiPageTitle(props: BilingualPair) {
  return <BilingualText {...props} variant="heading" as="span" />
}

export function BiPageDescription(props: BilingualPair) {
  return <BilingualText {...props} variant="pageDescription" as="p" />
}

export function BiEmptyTitle(props: BilingualPair) {
  return <BilingualText {...props} variant="body" frClassName="text-base font-semibold text-text-primary" as="span" />
}

export function BiEmptyDescription(props: BilingualPair) {
  return <BilingualText {...props} variant="caption" as="span" />
}

export function BiTableHeader(props: BilingualPair) {
  return <BilingualText {...props} variant="tableHeader" />
}

export function BiModalTitle(props: BilingualPair) {
  return <BilingualText {...props} variant="body" frClassName="text-base font-semibold text-text-primary" as="span" />
}

export function BiTabLabel(props: BilingualPair) {
  return <BilingualText {...props} variant="filter" layout="stack" className="items-center" />
}

export function BiButtonStack(props: BilingualPair) {
  return <BilingualText {...props} variant="button" className="items-center" />
}

export function BiButtonInline(props: BilingualPair) {
  return <BilingualText {...props} variant="buttonInline" />
}
