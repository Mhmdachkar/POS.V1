import { COMMON, commonPageOf } from '@/lib/bilingual/common'
import { BilingualText } from '@/components/ui/BilingualText'
import { Button } from './Button'

export interface PaginationBarProps {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function PaginationBar({ page, totalPages, onPageChange }: PaginationBarProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <span className="text-sm text-text-secondary">
        <BilingualText {...commonPageOf(page + 1, totalPages)} variant="caption" layout="inline" />
      </span>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={page === 0}
          onClick={() => onPageChange(Math.max(0, page - 1))}
        >
          <BilingualText {...COMMON.previous} variant="buttonInline" layout="inline" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
        >
          <BilingualText {...COMMON.next} variant="buttonInline" layout="inline" />
        </Button>
      </div>
    </div>
  )
}
