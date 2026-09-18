import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export interface ReportSectionProps {
  title: ReactNode
  children: React.ReactNode
  className?: string
  action?: React.ReactNode
}

export function ReportSection({ title, children, className, action }: ReportSectionProps) {
  return (
    <section className={cn('space-y-3', className)}>
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
