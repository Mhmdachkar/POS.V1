import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/cn'

export interface PosNavTileProps {
  to: string
  label: string
  Icon: React.ElementType
  end?: boolean
  /** Short description under the label (register nav only) */
  hint?: string
  variant?: 'segment' | 'pill'
  /** When used inside PosNavRail, omit per-tile surface (sliding indicator handles it) */
  accent?: 'default' | 'rail'
  registerRef?: (el: HTMLElement | null) => void
}

/**
 * POS workspace control — default is a segment inside the header rail
 * (icon badge + title + hint), not uppercase underline tabs.
 */
export function PosNavTile({
  to,
  label,
  Icon,
  end,
  hint,
  variant = 'segment',
  accent = 'default',
  registerRef,
}: PosNavTileProps) {
  if (variant === 'pill') {
    return (
      <NavLink
        to={to}
        end={end}
        className={({ isActive }) =>
          cn(
            'inline-flex items-center justify-center gap-2',
            'min-w-[7.5rem] h-11 px-3 rounded-lg border',
            'text-sm font-semibold transition-colors duration-150 select-none',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
            isActive
              ? 'border-primary bg-primary text-primary-foreground shadow-sm'
              : 'border-border bg-surface text-text-primary hover:bg-surface-muted hover:border-primary/30',
          )
        }
      >
        <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
        <span className="leading-none">{label}</span>
      </NavLink>
    )
  }

  return (
    <NavLink
      to={to}
      end={end}
      aria-label={label}
      title={`${label}${hint ? ` · ${hint}` : ''}`}
      ref={(el) => registerRef?.(el)}
      className={({ isActive }) =>
        cn(
          'group relative z-[1] flex items-center gap-1 sm:gap-2 rounded-xl px-1 sm:px-2.5 py-1.5 sm:py-2 min-h-[2.5rem] sm:min-h-[2.875rem]',
          'min-w-[2.5rem] sm:min-w-[6.75rem] flex-shrink-0 select-none',
          'transition-[color,transform] duration-200 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'active:scale-[0.98]',
          isActive
            ? accent === 'rail'
              ? 'text-text-primary'
              : 'bg-surface text-text-primary shadow-sm ring-1 ring-primary/15'
            : accent === 'rail'
              ? 'text-text-secondary hover:text-text-primary'
              : 'text-text-secondary hover:bg-surface/60 hover:text-text-primary hover:ring-1 hover:ring-border/80',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'flex h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 items-center justify-center rounded-lg',
              'transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
              isActive
                ? 'bg-primary text-primary-foreground shadow-sm scale-105'
                : 'bg-surface-muted text-text-muted group-hover:bg-surface group-hover:text-text-primary group-hover:scale-100',
            )}
          >
            <Icon
              className={cn(
                'h-[18px] w-[18px] transition-transform duration-300',
                isActive && 'scale-110',
              )}
              aria-hidden="true"
            />
          </span>
          <span className="hidden sm:flex flex-col items-start min-w-0 leading-tight">
            <span
              className={cn(
                'text-sm font-semibold truncate max-w-[5.75rem]',
                isActive && 'text-primary',
              )}
            >
              {label}
            </span>
            {hint && (
              <span
                className={cn(
                  'hidden xl:block text-[11px] truncate max-w-[5.75rem]',
                  isActive ? 'text-text-secondary' : 'text-text-muted',
                )}
              >
                {hint}
              </span>
            )}
          </span>
          {isActive && accent === 'default' && (
            <span
              className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary"
              aria-hidden="true"
            />
          )}
        </>
      )}
    </NavLink>
  )
}
