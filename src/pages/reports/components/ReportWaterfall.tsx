import { formatMoney } from '@/lib/formatters'
import { REPORTS } from '@/lib/bilingual/reports'
import { t } from '@/lib/bilingual/types'
import { InfoTip } from './InfoTip'

export function ReportWaterfall({
  gross,
  returns,
  net,
  cogs,
  margin,
}: {
  gross: number
  returns: number
  net: number
  cogs: number
  margin: number
}) {
  const pct = net === 0 ? 0 : Math.round((margin / net) * 100)
  const steps = [
    { label: t(REPORTS.grossSales), value: gross, tip: t(REPORTS.tipGross), op: '' },
    { label: t(REPORTS.returnsMetric), value: returns, tip: t(REPORTS.tipReturns), op: '−' },
    { label: t(REPORTS.netSales), value: net, tip: t(REPORTS.tipNet), op: '=' },
    { label: t(REPORTS.cogs), value: cogs, tip: t(REPORTS.tipCogs), op: '−' },
    { label: t(REPORTS.grossProfit), value: margin, tip: t(REPORTS.tipMargin), op: '=' },
  ]
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl bg-primary-subtle px-4 py-3 text-sm ring-1 ring-primary/15">
      {steps.map((step, index) => (
        <span key={step.label} className="inline-flex items-center gap-1">
          {index > 0 && <span className="text-text-muted">{step.op}</span>}
          <span className="text-text-secondary">{step.label}</span>
          <InfoTip text={step.tip} />
          <span className="font-semibold tabular-nums text-text-primary">{formatMoney(step.value)}</span>
        </span>
      ))}
      <span className="text-text-muted">({pct} %)</span>
    </div>
  )
}
