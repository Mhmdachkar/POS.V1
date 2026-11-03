import { useEffect, useState } from 'react'
import { POS } from '@/lib/bilingual/pos'
import { t } from '@/lib/bilingual/types'
import {
  getPrintAgentStatus,
  refreshPrintAgentStatus,
  subscribePrintAgentStatus,
  type PrintAgentStatus,
} from '@/lib/printAgentWake'

/** Shown on the register when the local print agent is not running. Click retries /health. */
export function PrintAgentBadge() {
  const [status, setStatus] = useState<PrintAgentStatus>(getPrintAgentStatus())

  useEffect(() => subscribePrintAgentStatus(() => setStatus(getPrintAgentStatus())), [])

  useEffect(() => {
    if (getPrintAgentStatus() === 'unknown') void refreshPrintAgentStatus()
  }, [])

  if (status !== 'offline') return null

  return (
    <button
      type="button"
      onClick={() => void refreshPrintAgentStatus()}
      className="mx-3 mt-2 self-start rounded-md border border-warning/30 bg-warning-bg px-3 py-1.5 text-left text-xs font-medium text-warning-foreground"
    >
      {t(POS.printAgentOffline)}
    </button>
  )
}
