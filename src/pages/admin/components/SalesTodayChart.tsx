import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BilingualText } from '@/components/ui/BilingualText'
import { ADMIN } from '@/lib/bilingual/admin'
import { formatCFA, formatCompactMoney } from '@/lib/formatters'
import { t } from '@/lib/bilingual/types'
import type { DashboardHourlySale } from '@/types/rpc'

interface SalesTodayChartProps {
  hourlySales: DashboardHourlySale[]
}

function hourLabel(hour: number): string {
  return t(ADMIN.hourLabel(hour))
}

export function SalesTodayChart({ hourlySales }: SalesTodayChartProps) {
  const points = Array.from({ length: 24 }, (_, hour) => {
    const row = hourlySales.find((h) => Number(h.hour) === hour)
    return {
      hour,
      label: hourLabel(hour),
      sales: Number(row?.sales_cfa ?? 0),
    }
  })

  const total = points.reduce((sum, p) => sum + p.sales, 0)
  const peak = points.reduce((best, p) => (p.sales > best.sales ? p : best), points[0])
  const hasSales = total > 0

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text-primary">
            <BilingualText {...ADMIN.salesToday} variant="body" layout="inline" />
          </h2>
          {hasSales && peak.sales > 0 && (
            <p className="text-xs text-text-muted mt-0.5">
              {t(ADMIN.salesTodayPeak(peak.label, formatCFA(peak.sales)))}
            </p>
          )}
        </div>
        <p className="text-lg font-bold tabular-nums text-text-primary flex-shrink-0">
          {formatCFA(total)}
        </p>
      </div>

      {!hasSales ? (
        <p className="text-sm text-text-muted py-8 text-center">
          <BilingualText {...ADMIN.noSalesToday} variant="caption" />
        </p>
      ) : (
        <div className="h-44 w-full max-h-44 shrink-0 overflow-hidden">
          <ResponsiveContainer width="100%" height={176} debounce={50}>
            <BarChart data={points} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="18%">
              <defs>
                <linearGradient id="salesTodayBar" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.95} />
                  <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.45} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                width={88}
                tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => formatCompactMoney(Number(v))}
              />
              <Tooltip
                cursor={{ fill: 'var(--color-primary-subtle)' }}
                contentStyle={{
                  borderRadius: 10,
                  border: '1px solid var(--color-border)',
                  fontSize: 12,
                }}
                formatter={(value) => [formatCFA(Number(value ?? 0)), t(ADMIN.salesToday)]}
                labelFormatter={(label) => String(label)}
              />
              <Bar dataKey="sales" radius={[6, 6, 2, 2]} maxBarSize={18}>
                {points.map((p) => (
                  <Cell
                    key={p.hour}
                    fill={p.hour === peak.hour && p.sales > 0 ? 'url(#salesTodayBar)' : 'var(--color-primary)'}
                    fillOpacity={p.sales > 0 ? (p.hour === peak.hour ? 1 : 0.55) : 0.12}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
