import { useEffect, useState } from 'react'

function toDisplay(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ''
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}

function toIso(display: string): string | null {
  const m = display.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  const dt = new Date(`${iso}T12:00:00Z`)
  if (Number.isNaN(dt.getTime())) return null
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() + 1 !== month || dt.getUTCDate() !== day) return null
  return iso
}

export function ReportDateInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (ymd: string) => void
}) {
  const [text, setText] = useState(() => toDisplay(value))

  useEffect(() => {
    setText(toDisplay(value))
  }, [value])

  return (
    <label className="text-xs text-text-secondary inline-flex items-center gap-1">
      <span>{label}</span>
      <input
        type="text"
        inputMode="numeric"
        placeholder="jj/mm/aaaa"
        lang="fr-FR"
        value={text}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          const iso = toIso(next)
          if (iso) onChange(iso)
        }}
        onBlur={() => {
          const iso = toIso(text)
          setText(iso ? toDisplay(iso) : toDisplay(value))
        }}
        className="ml-2 h-11 min-h-[44px] w-[9.5rem] rounded-lg border border-border bg-surface px-2 text-sm tabular-nums"
      />
    </label>
  )
}
