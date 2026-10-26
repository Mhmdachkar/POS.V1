/**
 * ShiftChip — open/close the cashier shift from the TopBar.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { BilingualText } from '@/components/ui/BilingualText'
import { POS } from '@/lib/bilingual/pos'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { bilingualAriaLabel, t } from '@/lib/bilingual/types'
import { pickOpenShiftId } from '@/lib/posShiftContext'
import { persistPosShiftSelection } from '@/lib/posShiftPersistence'
import {
  authorizedOpenShifts,
  canAccessShifts,
  useOpenShifts,
  useShiftDetail,
} from '@/hooks/useShifts'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import { OpenShiftModal } from '@/pages/shifts/components/OpenShiftModal'
import { CloseShiftModal } from '@/pages/shifts/components/CloseShiftModal'
import { cn } from '@/lib/cn'

export function ShiftChip({ posDepotId }: { posDepotId?: string | null }) {
  const navigate = useNavigate()
  const staff = useAuthStore((s) => s.staff)
  const currentDepotId = useDepotStore((s) => s.currentDepotId)
  const { data: openShifts, isLoading } = useOpenShifts()
  const [showOpen, setShowOpen] = useState(false)
  const [showClose, setShowClose] = useState(false)

  const depotId = posDepotId ?? (staff?.role === 'cashier' ? staff.depot_id : currentDepotId)
  const authorized = authorizedOpenShifts(staff, openShifts)
  const activeId = pickOpenShiftId(depotId, staff?.id, authorized)
  const { data: activeDetail } = useShiftDetail(activeId)
  const canManage = canAccessShifts(staff?.role)
  const hasOpen = !!activeId

  const chipClass = cn(
    'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm font-semibold',
    'transition-colors duration-150',
    hasOpen
      ? 'border-success/30 bg-success-bg text-success-foreground'
      : 'border-border bg-surface text-text-primary hover:bg-surface-muted',
  )

  if (!canManage) {
    return (
      <div data-testid="shift-chip" className={chipClass}>
        <BilingualText {...POS.noOpenShift} variant="inline" layout="inline" />
      </div>
    )
  }

  if (!hasOpen) {
    return (
      <>
        <button
          type="button"
          data-testid="shift-chip"
          className={chipClass}
          aria-label={bilingualAriaLabel(SHIFT_COPY.openShift)}
          onClick={() => setShowOpen(true)}
          disabled={isLoading}
        >
          <BilingualText {...POS.noOpenShift} variant="inline" layout="inline" />
        </button>
        <OpenShiftModal
          open={showOpen}
          onClose={() => setShowOpen(false)}
          onOpened={(shiftId) => persistPosShiftSelection(shiftId)}
        />
      </>
    )
  }

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            data-testid="shift-chip"
            className={chipClass}
            aria-label={bilingualAriaLabel(POS.shiftActive)}
          >
            <BilingualText {...POS.shiftActive} variant="inline" layout="inline" />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className={cn(
              'z-50 min-w-[12rem] bg-surface rounded-lg border border-border shadow-md p-1',
              'data-[state=open]:animate-in data-[state=closed]:animate-out',
            )}
            align="end"
            sideOffset={6}
          >
            <DropdownMenu.Item
              className="flex items-center px-2.5 py-2 text-sm rounded-md cursor-pointer text-text-primary hover:bg-surface-muted focus:outline-none focus:bg-surface-muted"
              onSelect={() => setShowClose(true)}
            >
              {t(SHIFT_COPY.closeShift)}
            </DropdownMenu.Item>
            <DropdownMenu.Item
              className="flex items-center px-2.5 py-2 text-sm rounded-md cursor-pointer text-text-primary hover:bg-surface-muted focus:outline-none focus:bg-surface-muted"
              onSelect={() => navigate('/shifts')}
            >
              {t(SHIFT_COPY.viewShifts)}
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <OpenShiftModal
        open={showOpen}
        onClose={() => setShowOpen(false)}
        onOpened={(shiftId) => persistPosShiftSelection(shiftId)}
      />
      {activeDetail && (
        <CloseShiftModal
          open={showClose}
          onClose={() => {
            setShowClose(false)
            persistPosShiftSelection(null)
          }}
          shift={activeDetail}
        />
      )}
    </>
  )
}
