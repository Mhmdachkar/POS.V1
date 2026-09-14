import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { Card, ConfirmDialog, EmptyState, LoadingButton, Skeleton } from '@/components/ui'
import { formatDateTime } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import { isHttpsUrl } from '@/hooks/useAdminProducts'
import { useBusinessSettings, useUpdateBusinessSettings } from '@/hooks/useBusinessSettings'

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
      setError('Logo must be an HTTPS URL.')
      return
    }
    if (!(rateNumber > 0)) {
      setError('Enter a valid CFA per USD rate greater than zero.')
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
    return <div className="p-6 space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
  }
  if (isError || !data) {
    return <div className="p-6"><EmptyState icon={<Settings className="h-8 w-8" />} title="Failed to load settings" /></div>
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-lg font-bold text-text-primary">Settings</h1>
      <p className="text-sm text-text-secondary mt-0.5 mb-6">
        Business name, logo, and CFA per USD rate. Historical sales keep the rate locked at sale time.
      </p>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Business name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Logo URL</label>
            <input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://…" className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">CFA per 1 USD</label>
            <input
              data-testid="settings-rate"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              required
              className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface"
            />
            <p className="text-xs text-text-muted mt-1">
              Last updated {formatDateTime(data.rate_updated_at)}
            </p>
          </div>
          {error && (
            <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}
          <div className="flex justify-end">
            <LoadingButton type="submit" loading={isPending}>Save settings</LoadingButton>
          </div>
        </form>
      </Card>

      <ConfirmDialog
        open={confirmRate}
        onClose={() => setConfirmRate(false)}
        onConfirm={() => { void persist() }}
        title="Update exchange rate?"
        message="New sales will use this rate. Past sales keep the rate that was locked when they were completed."
        confirmLabel="Update rate"
        variant="primary"
        isLoading={isPending}
      />
    </div>
  )
}
