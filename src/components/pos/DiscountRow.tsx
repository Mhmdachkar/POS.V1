import { useEffect, useState } from 'react'
import { Input, Select } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { parseCFAInput } from '@/lib/formatters'
import { POS } from '@/lib/bilingual/pos'
import { t, bilingualAriaLabel, bilingualPlain } from '@/lib/bilingual/types'
import { useShallow } from 'zustand/react/shallow'
import { usePOSStore } from '@/stores/posStore'

export function DiscountRow() {
  const { discountType, discountValue, totals, setDiscountType, setDiscountValue } = usePOSStore(
    useShallow((s) => ({
      discountType: s.discountType,
      discountValue: s.discountValue,
      totals: s.totals,
      setDiscountType: s.setDiscountType,
      setDiscountValue: s.setDiscountValue,
    })),
  )
  const [expanded, setExpanded] = useState(discountType !== null)

  useEffect(() => {
    if (discountType !== null) {
      setExpanded(true)
      return
    }
    if (totals.subtotal_cfa === 0) setExpanded(false)
  }, [discountType, totals.subtotal_cfa])

  const validateAndSet = (raw: string) => {
    const num = parseCFAInput(raw)
    if (isNaN(num) || num < 0) return
    setDiscountValue(num)
  }

  const isDiscountInvalid =
    discountType === 'flat'
      ? discountValue < 0 || discountValue > totals.subtotal_cfa
      : discountType === 'percent'
        ? discountValue < 0 || discountValue > 100
        : false

  const showExpanded = expanded || discountType !== null

  if (!showExpanded) {
    return (
      <div className="flex items-center justify-end h-6">
        <button
          type="button"
          className="text-xs font-medium text-primary hover:underline"
          onClick={() => setExpanded(true)}
        >
          <BilingualText {...POS.applyDiscount} variant="caption" layout="inline" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex gap-1.5 items-start">
      <Select
        aria-label={bilingualAriaLabel(POS.discountType)}
        value={discountType ?? ''}
        onChange={(e) => {
          const next = (e.target.value || null) as typeof discountType
          setDiscountType(next)
          if (next === null) setExpanded(false)
        }}
        className="h-9 w-[9.5rem]"
      >
        <option value="">{bilingualPlain(POS.discountNone)}</option>
        <option value="flat">{bilingualPlain(POS.discountFlat)}</option>
        <option value="percent">{bilingualPlain(POS.discountPercent)}</option>
      </Select>
      {discountType && (
        <Input
          type="number"
          min={0}
          max={discountType === 'percent' ? 100 : undefined}
          step={discountType === 'percent' ? 0.1 : 1}
          value={discountValue || ''}
          onChange={(e) => validateAndSet(e.target.value)}
          placeholder={
            discountType === 'flat'
              ? bilingualPlain(POS.amountCfaPlaceholder)
              : bilingualPlain(POS.percentPlaceholder)
          }
          aria-label={bilingualAriaLabel(POS.discountValue)}
          className="h-9"
          error={
            isDiscountInvalid
              ? discountType === 'flat'
                ? bilingualPlain(POS.discountFlatError)
                : bilingualPlain(POS.discountPercentError)
              : undefined
          }
        />
      )}
    </div>
  )
}
