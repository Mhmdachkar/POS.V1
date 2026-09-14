/**
 * PosShiftIndicator — current POS shift badge + explicit picker.
 *
 * Never auto-selects. Soft warning when no current shift; sales stay enabled.
 * Cashier: own-depot open shifts. Admin: any accessible open shift.
 */

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { authorizedOpenShifts, useOpenShifts } from '@/hooks/useShifts'
import { formatDateTime } from '@/lib/formatters'
import { useAuthStore } from '@/stores/authStore'
import { usePOSStore } from '@/stores/posStore'

export function PosShiftIndicator() {
  const [pickerOpen, setPickerOpen] = useState(false)
  const staff = useAuthStore((s) => s.staff)
  const shiftId = usePOSStore((s) => s.shiftId)
  const setShiftId = usePOSStore((s) => s.setShiftId)
  const { data: openShifts } = useOpenShifts()

  const selectable = authorizedOpenShifts(staff, openShifts)
  const current = selectable.find((s) => s.id === shiftId) ?? null
  const hasCurrent = !!shiftId && !!current

  return (
    <div className={cn(
      'flex-shrink-0 px-4 py-2 border-b border-border flex items-center justify-between gap-3',
      hasCurrent ? 'bg-success-bg' : 'bg-warning-bg',
    )}>
      <div className="min-w-0">
        {hasCurrent ? (
          <p className="text-sm font-medium text-success-foreground">
            Shift: Active
            <span className="ml-2 font-normal text-text-secondary">
              {current.depot_name} · {current.cashier_name ?? '—'}
            </span>
          </p>
        ) : (
          <p className="text-sm font-medium text-warning-foreground">
            No active shift — sales will not be attributed to a shift.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        {selectable.length > 0 && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setPickerOpen((v) => !v)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {hasCurrent ? 'Change shift' : 'Select for POS'}
            </button>
            {pickerOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 w-72 rounded-md border border-border bg-surface shadow-md p-2 space-y-1">
                <p className="text-xs text-text-secondary px-1 pb-1">
                  Choose an open shift. None is selected automatically.
                </p>
                {selectable.map((shift) => (
                  <button
                    key={shift.id}
                    type="button"
                    onClick={() => {
                      setShiftId(shift.id)
                      setPickerOpen(false)
                    }}
                    className={cn(
                      'w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-surface-muted',
                      shiftId === shift.id && 'bg-primary-subtle',
                    )}
                  >
                    <span className="block truncate">{shift.depot_name} · {shift.cashier_name ?? '—'}</span>
                    <span className="block text-xs text-text-secondary">
                      Opened {formatDateTime(shift.opened_at)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <Link to="/shifts" className="text-xs font-medium text-text-secondary hover:text-text-primary">
          Shifts
        </Link>
      </div>
    </div>
  )
}
