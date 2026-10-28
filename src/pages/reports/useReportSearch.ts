import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { resolveReportDateRange, type ReportPreset } from '@/lib/reportDates'
import { useDepotStore } from '@/stores/depotStore'

const PRESETS: ReportPreset[] = ['today', 'yesterday', 'this_week', 'this_month', 'custom']

function asPreset(value: string | null): ReportPreset {
  return PRESETS.includes(value as ReportPreset) ? (value as ReportPreset) : 'today'
}

export function useReportSearch() {
  const [params, setParams] = useSearchParams()
  const depotId = useDepotStore((s) => s.currentDepotId)
  const depotName = useDepotStore((s) => s.currentDepotName)
  const setCurrentDepot = useDepotStore((s) => s.setCurrentDepot)
  const availableDepots = useDepotStore((s) => s.availableDepots)

  const preset = asPreset(params.get('preset'))
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const cashier = params.get('cashier') ?? ''
  const category = params.get('category') ?? ''
  const product = params.get('product') ?? ''
  const service = params.get('service') ?? ''
  const depotParam = params.get('depot')

  const range = useMemo(
    () => resolveReportDateRange(preset, from, to),
    [preset, from, to],
  )

  const patch = useCallback((next: Record<string, string | null | undefined>) => {
    const merged = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value == null || value === '') merged.delete(key)
      else merged.set(key, value)
    }
    if (depotId) merged.set('depot', depotId)
    else merged.delete('depot')
    setParams(merged, { replace: true })
  }, [params, setParams, depotId])

  useEffect(() => {
    // All Depots selected: drop stale ?depot= so reload keeps Tous les dépôts
    if (depotId == null && depotParam) {
      const merged = new URLSearchParams(params)
      merged.delete('depot')
      setParams(merged, { replace: true })
      return
    }
    if (!depotParam || depotParam === depotId || !setCurrentDepot) return
    const match = (availableDepots ?? []).find((d) => d.id === depotParam)
    if (match) setCurrentDepot(match.id, match.name)
  }, [availableDepots, depotId, depotParam, params, setCurrentDepot, setParams])

  return {
    preset,
    from,
    to,
    cashier,
    category,
    product,
    service,
    depotId,
    depotName,
    range,
    setPreset: (value: ReportPreset) => patch({
      preset: value === 'today' ? null : value,
      from: value === 'custom' ? from || range.startDate : null,
      to: value === 'custom' ? to || range.endDate : null,
    }),
    setFrom: (value: string) => patch({ preset: 'custom', from: value }),
    setTo: (value: string) => patch({ preset: 'custom', to: value }),
    setCashier: (value: string) => patch({ cashier: value || null }),
    setCategory: (value: string) => patch({ category: value || null }),
    setProduct: (value: string) => patch({ product: value || null }),
    setService: (value: string) => patch({ service: value || null }),
  }
}
