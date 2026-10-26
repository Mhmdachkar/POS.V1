/**
 * CreateTransferModal — pending draft via create_transfer_draft.
 *
 * Submits explicit from/to depot IDs. Never uses All Depots as a mutation target.
 * UI blocks duplicate from_product_id. Server also rejects duplicates.
 * Destination product is chosen explicitly — never auto-created.
 * quantity_pieces is display-only; server freezes pieces from source unit.
 */

import { useEffect, useMemo, useState } from 'react'
import { BiEmptyTitle, BiModalTitle, BiPageTitle, BiModalTitle as BiSectionTitle } from '@/lib/bilingual/ui'
import { COMMON } from '@/lib/bilingual/common'
import { ADMIN } from '@/lib/bilingual/admin'
import { CUSTOMERS } from '@/lib/bilingual/customers'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { SALES } from '@/lib/bilingual/sales'
import { SHIFT_COPY } from '@/lib/bilingual/shift'
import { TRANSFERS } from '@/lib/bilingual/transfers'
import { t, bilingualPlain, type BilingualPair } from '@/lib/bilingual/types'
import { toastSuccessBi } from '@/lib/bilingual/toast'
import { Plus, Trash2 } from 'lucide-react'
import { FORM_GUIDANCE } from '@/lib/bilingual/formGuidance'
import { Button, FormActionGuide, LoadingButton, Modal } from '@/components/ui'
import { formatPieces } from '@/lib/formatters'
import { parseError } from '@/lib/errors'
import { useDepotOptions } from '@/hooks/useInventory'
import { useProductSearch } from '@/hooks/useProducts'
import {
  hasDuplicateSourceProducts,
  toCreateTransferDraftParams,
  useCreateTransferDraft,
} from '@/hooks/useTransfers'
import { useAuthStore } from '@/stores/authStore'
import type { ProductWithUnits } from '@/types'

interface LineDraft {
  key: string
  from_product_id: string
  to_product_id: string
  unit_level: number
  quantity_in_unit: string
}

function emptyLine(): LineDraft {
  return {
    key: crypto.randomUUID(),
    from_product_id: '',
    to_product_id: '',
    unit_level: 0,
    quantity_in_unit: '',
  }
}

interface CreateTransferModalProps {
  open: boolean
  onClose: () => void
  onCreated: (transferId: string) => void
}

export function CreateTransferModal({
  open,
  onClose,
  onCreated,
}: CreateTransferModalProps) {
  const staff = useAuthStore((s) => s.staff)
  const { data: depots } = useDepotOptions()
  const { mutateAsync: createDraft, isPending } = useCreateTransferDraft()

  const lockedSourceDepotId = staff?.role === 'depot_staff' ? staff.depot_id : null

  const [fromDepotId, setFromDepotId] = useState('')
  const [toDepotId, setToDepotId] = useState('')
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()])
  const [note, setNote] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [guideSteps, setGuideSteps] = useState<BilingualPair[]>([])

  const activeDepots = (depots ?? []).filter((d) => {
    const full = d as { id: string; name: string; code: string; is_active?: boolean }
    return full.is_active !== false
  })

  useEffect(() => {
    if (!open) return
    setFromDepotId(lockedSourceDepotId ?? '')
    setToDepotId('')
    setLines([emptyLine()])
    setNote('')
    setFormError(null)
    setGuideSteps([])
  }, [open, lockedSourceDepotId])

  const { data: sourceProducts } = useProductSearch('', fromDepotId || null, open && !!fromDepotId)
  const { data: destProducts } = useProductSearch('', toDepotId || null, open && !!toDepotId)

  const destByName = useMemo(() => {
    const map = new Map<string, ProductWithUnits>()
    for (const product of destProducts ?? []) {
      if (!map.has(product.name)) map.set(product.name, product)
    }
    return map
  }, [destProducts])

  const usedSourceIds = lines.map((l) => l.from_product_id).filter(Boolean)

  const updateLine = (key: string, patch: Partial<LineDraft>) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line
        const next = { ...line, ...patch }
        if (patch.from_product_id !== undefined) {
          const source = (sourceProducts ?? []).find((p) => p.id === patch.from_product_id)
          next.unit_level = source?.units[0]?.unit_level ?? 0
          const suggested = source ? destByName.get(source.name) : undefined
          if (suggested && !next.to_product_id) {
            next.to_product_id = suggested.id
          }
        }
        return next
      }),
    )
    setFormError(null)
    setGuideSteps([])
  }

  const addLine = () => {
    setLines((prev) => [...prev, emptyLine()])
  }

  const removeLine = (key: string) => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((l) => l.key !== key)))
  }

  const handleFromDepotChange = (id: string) => {
    setFromDepotId(id)
    setLines([emptyLine()])
    if (id && id === toDepotId) setToDepotId('')
  }

  const handleToDepotChange = (id: string) => {
    setToDepotId(id)
    setLines((prev) => prev.map((l) => ({ ...l, to_product_id: '' })))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setGuideSteps([])

    if (!fromDepotId || !toDepotId) {
      setGuideSteps([FORM_GUIDANCE.transferDepots])
      setFormError(t(TRANSFERS.chooseDepotsError))
      return
    }
    if (fromDepotId === toDepotId) {
      setGuideSteps([FORM_GUIDANCE.transferDepots])
      setFormError(t(TRANSFERS.sameDepotError))
      return
    }

    const parsed = lines.map((line) => ({
      from_product_id: line.from_product_id,
      to_product_id: line.to_product_id,
      unit_level: line.unit_level,
      quantity_in_unit: Number(line.quantity_in_unit),
    }))

    if (parsed.some((item) => !item.from_product_id || !item.to_product_id)) {
      setGuideSteps([FORM_GUIDANCE.transferLines])
      setFormError(t(TRANSFERS.lineProductsError))
      return
    }
    if (parsed.some((item) => !(item.quantity_in_unit > 0))) {
      setGuideSteps([FORM_GUIDANCE.transferLines])
      setFormError(t(TRANSFERS.qtyPositiveError))
      return
    }
    if (hasDuplicateSourceProducts(parsed)) {
      setGuideSteps([FORM_GUIDANCE.transferDuplicate])
      setFormError(t(TRANSFERS.duplicateSourceError))
      return
    }

    try {
      const params = toCreateTransferDraftParams({
        fromDepotId,
        toDepotId,
        items: parsed,
        note,
      })
      const data = await createDraft(params)
      toastSuccessBi(TRANSFERS.draftCreated)
      onCreated(data.transfer_id)
    } catch (err) {
      setFormError(parseError(err).message)
    }
  }

  const destDepotOptions = activeDepots.filter((d) => d.id !== fromDepotId)
  const sourceLocked = staff?.role === 'depot_staff'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={<BiModalTitle {...TRANSFERS.createTransfer} />}
      description={t(TRANSFERS.createDraftDesc)}
      size="2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label
              htmlFor="transfer-from-depot"
              className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5"
            >
              Source depot
            </label>
            <select
              id="transfer-from-depot"
              value={fromDepotId}
              onChange={(e) => handleFromDepotChange(e.target.value)}
              disabled={sourceLocked || isPending}
              className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-70"
            >
              {!sourceLocked && <option value="">Select source…</option>}
              {(sourceLocked
                ? activeDepots.filter((d) => d.id === fromDepotId)
                : activeDepots
              ).map((depot) => (
                <option key={depot.id} value={depot.id}>
                  {depot.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="transfer-to-depot"
              className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5"
            >
              Destination depot
            </label>
            <select
              id="transfer-to-depot"
              value={toDepotId}
              onChange={(e) => handleToDepotChange(e.target.value)}
              disabled={isPending}
              className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Select destination…</option>
              {destDepotOptions.map((depot) => (
                <option key={depot.id} value={depot.id}>
                  {depot.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            Items
          </p>
          {lines.map((line) => {
            const source = (sourceProducts ?? []).find((p) => p.id === line.from_product_id)
            const unit = source?.units.find((u) => u.unit_level === Number(line.unit_level))
            const qty = Number(line.quantity_in_unit)
            const previewPieces =
              unit && qty > 0 ? qty * unit.conversion_to_base : null
            const taken = usedSourceIds.filter((id) => id !== line.from_product_id)

            return (
              <div
                key={line.key}
                className="grid grid-cols-[minmax(8rem,1fr)_minmax(8rem,1fr)_7rem_7rem_5.5rem_2.25rem] gap-2 items-end"
              >
                <select
                  aria-label={t(TRANSFERS.sourceProductAria)}
                  value={line.from_product_id}
                  onChange={(e) => updateLine(line.key, { from_product_id: e.target.value, to_product_id: '' })}
                  disabled={!fromDepotId || isPending}
                  className="h-9 px-2 rounded-md border border-border bg-surface text-sm text-text-primary"
                >
                  <option value="">Source product…</option>
                  {(sourceProducts ?? []).map((product) => (
                    <option
                      key={product.id}
                      value={product.id}
                      disabled={taken.includes(product.id)}
                    >
                      {product.name}
                    </option>
                  ))}
                </select>

                <select
                  aria-label={t(TRANSFERS.destProductAria)}
                  value={line.to_product_id}
                  onChange={(e) => updateLine(line.key, { to_product_id: e.target.value })}
                  disabled={!toDepotId || isPending}
                  className="h-9 px-2 rounded-md border border-border bg-surface text-sm text-text-primary"
                >
                  <option value="">Destination product…</option>
                  {(destProducts ?? []).map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>

                <select
                  aria-label={t(TRANSFERS.unitAria)}
                  value={line.unit_level}
                  onChange={(e) => updateLine(line.key, { unit_level: Number(e.target.value) })}
                  disabled={!source || isPending}
                  className="h-9 px-2 rounded-md border border-border bg-surface text-sm text-text-primary"
                >
                  {(source?.units ?? [{ unit_level: 0, unit_name: 'Piece' }]).map((u) => (
                    <option key={u.unit_level} value={u.unit_level}>
                      {u.unit_name}
                    </option>
                  ))}
                </select>

                <input
                  aria-label={t(TRANSFERS.quantityAria)}
                  type="number"
                  min="0"
                  step="any"
                  value={line.quantity_in_unit}
                  onChange={(e) => updateLine(line.key, { quantity_in_unit: e.target.value })}
                  disabled={isPending}
                  className="h-9 px-2 rounded-md border border-border bg-surface text-sm tabular-nums"
                  placeholder={bilingualPlain(TRANSFERS.qtyPlaceholder)}
                />

                <span className="text-xs text-text-muted tabular-nums whitespace-nowrap pb-2">
                  {previewPieces != null ? formatPieces(previewPieces) : '—'}
                </span>

                <button
                  type="button"
                  aria-label={t(TRANSFERS.removeLineAria)}
                  onClick={() => removeLine(line.key)}
                  disabled={lines.length === 1 || isPending}
                  className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-border text-text-secondary hover:bg-surface-muted disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )
          })}

          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="gap-1.5"
            onClick={addLine}
            disabled={isPending}
          >
            <Plus className="h-3.5 w-3.5" />
            Add line
          </Button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
            Note (optional)
          </label>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isPending}
            className="w-full h-9 px-3 rounded-md border border-border bg-surface text-sm text-text-primary"
            placeholder={bilingualPlain(TRANSFERS.internalNotePlaceholder)}
          />
        </div>

        <FormActionGuide steps={guideSteps} />
        {formError && (
          <p className="text-sm text-danger-foreground">{formError}</p>
        )}

        <div className="flex gap-3 justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            Close
          </Button>
          <LoadingButton type="submit" loading={isPending}>
            Create Draft
          </LoadingButton>
        </div>
      </form>
    </Modal>
  )
}
