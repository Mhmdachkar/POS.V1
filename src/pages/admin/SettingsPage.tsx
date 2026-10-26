import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { Card, ConfirmDialog, EmptyState, LoadingButton, Skeleton } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { formatDateTime } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import { isHttpsUrl } from '@/hooks/useAdminProducts'
import { useBusinessSettings, useUpdateBusinessSettings } from '@/hooks/useBusinessSettings'
import { ADMIN } from '@/lib/bilingual/admin'
import {
  BiButtonStack,
  BiEmptyTitle,
  BiModalTitle,
  BiPageDescription,
  BiPageTitle,
  BiTableHeader,
} from '@/lib/bilingual/ui'
import { t, bilingualPlain } from '@/lib/bilingual/types'

export function SettingsPage() {
  const { data, isLoading, isError } = useBusinessSettings()
  const { mutateAsync: updateSettings, isPending } = useUpdateBusinessSettings()
  const [name, setName] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [rate, setRate] = useState('')
  const [error, setError] = useState('')
  const [confirmRate, setConfirmRate] = useState(false)

  useEffect(() => {
    if (!data) return
    setName(data.business_name)
    setLogoUrl(data.logo_url ?? '')
    setRate(String(data.cfa_to_usd_rate))
  }, [data?.business_name, data?.logo_url, data?.cfa_to_usd_rate, data?.rate_updated_at])

  const rateNumber = Number(rate)
  const rateChanged = !!data && Number(data.cfa_to_usd_rate) !== rateNumber

  async function persist() {
    setError('')
    const logo = logoUrl.trim()
    if (logo && !isHttpsUrl(logo)) {
      setError(bilingualPlain(ADMIN.logoHttpsError))
      return
    }
    if (!(rateNumber > 0)) {
      setError(bilingualPlain(ADMIN.rateInvalid))
      return
    }
    try {
      await updateSettings({
        p_business_name: name.trim(),
        p_logo_url: logo || null,
        p_cfa_to_usd_rate: rateNumber,
      })
      setConfirmRate(false)
    } catch (err) {
      setError(parseError(err).message)
      setConfirmRate(false)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (rateChanged) {
      setConfirmRate(true)
      return
    }
    void persist()
  }

  if (isLoading) {
    return <div className="p-3 sm:p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
  }
  if (isError || !data) {
    return (
      <div className="p-3 sm:p-6">
        <EmptyState icon={<Settings className="h-8 w-8" />} title={<BiEmptyTitle {...ADMIN.failedSettings} />} />
      </div>
    )
  }

  return (
    <div className="p-3 sm:p-6 max-w-xl">
      <BiPageTitle {...ADMIN.settings} />
      <div className="mt-0.5 mb-6">
        <BiPageDescription {...ADMIN.settingsDesc} />
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block mb-1.5 uppercase tracking-wide">
              <BiTableHeader {...ADMIN.businessName} />
            </label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface" />
          </div>
          <div>
            <label className="block mb-1.5 uppercase tracking-wide">
              <BiTableHeader {...ADMIN.logoUrl} />
            </label>
            <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface" />
          </div>
          <div>
            <label className="block mb-1.5 uppercase tracking-wide">
              <BiTableHeader {...ADMIN.cfaPerUsd} />
            </label>
            <input
              data-testid="settings-rate"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
              className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface"
            />
            <p className="text-xs text-text-muted mt-1">
              {t(ADMIN.lastUpdated)} {formatDateTime(data.rate_updated_at)}
              <span className="block text-[10px]">{ADMIN.lastUpdated.en} {formatDateTime(data.rate_updated_at)}</span>
            </p>
          </div>
          {error && (
            <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
              <p className="text-sm text-danger-foreground">{error}</p>
            </div>
          )}
          <div className="flex justify-end">
            <LoadingButton type="submit" loading={isPending}>
              <BiButtonStack {...ADMIN.saveSettings} />
            </LoadingButton>
          </div>
        </form>
      </Card>

      <ConfirmDialog
        open={confirmRate}
        onClose={() => setConfirmRate(false)}
        onConfirm={() => { void persist() }}
        title={<BiModalTitle {...ADMIN.updateExchangeRate} />}
        message={<BilingualText {...ADMIN.updateRateConfirm} variant="body" />}
        confirmLabel={<BiButtonStack {...ADMIN.updateRateButton} />}
        variant="primary"
        isLoading={isPending}
      />
    </div>
  )
}
