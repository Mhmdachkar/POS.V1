import { forwardRef } from 'react'
import { Search } from 'lucide-react'
import { Input, type InputProps } from './Input'

export type SearchInputProps = Omit<InputProps, 'type' | 'prefix'>

/**
 * VHM POS — SearchInput
 *
 * Reuses Input styling. Search icon is the prefix; type is always "search".
 */
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ autoComplete = 'off', ...props }, ref) => {
    return (
      <Input
        ref={ref}
        autoComplete={autoComplete}
        prefix={<Search className="h-4 w-4" aria-hidden="true" />}
        {...props}
        type="search"
      />
    )
  },
)

SearchInput.displayName = 'SearchInput'
