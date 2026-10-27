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
    <section className={cn('rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-border sm:p-5', className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-text-primary">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}
