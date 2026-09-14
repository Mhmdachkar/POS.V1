import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button, LoadingButton } from '@/components/ui'
import { parseError } from '@/lib/errors'
import { useCategories } from '@/hooks/useInventory'
import { isHttpsUrl, useCreateProduct, useUpdateProduct } from '@/hooks/useAdminProducts'
import type { ProductWithUnits } from '@/types'
import type { ProductUnitInput } from '@/types/rpc'

interface ProductFormModalProps {
  open: boolean
  onClose: () => void
  depotId: string | null
  product?: ProductWithUnits | null
}

interface UnitForm {
  enabled: boolean
  unit_name: string
  conversion_to_base: string
  cost_price_cfa: string
  selling_price_cfa: string
}

const emptyUnit = (name: string, conversion: string): UnitForm => ({
  enabled: false,
  unit_name: name,
  conversion_to_base: conversion,
  cost_price_cfa: '',
  selling_price_cfa: '',
})

export function ProductFormModal({ open, onClose, depotId, product }: ProductFormModalProps) {
  const isEdit = !!product
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [units, setUnits] = useState<[UnitForm, UnitForm, UnitForm]>([
    { ...emptyUnit('Piece', '1'), enabled: true },
    emptyUnit('Package', ''),
    emptyUnit('Carton', ''),
  ])
  const [general, setGeneral] = useState('')

  const { data: categories } = useCategories()
  const { mutateAsync: createProduct, isPending: creating } = useCreateProduct()
  const { mutateAsync: updateProduct, isPending: updating } = useUpdateProduct()
  const isPending = creating || updating

  useEffect(() => {
    if (!open) return
    setGeneral('')
    if (product) {
      setName(product.name)
      setCategoryId(product.category_id)
      setPhotoUrl(product.photo_url)
      const next: [UnitForm, UnitForm, UnitForm] = [
        { ...emptyUnit('Piece', '1'), enabled: true },
        emptyUnit('Package', ''),
        emptyUnit('Carton', ''),
      ]
      for (const unit of product.units) {
        next[unit.unit_level] = {
          enabled: true,
          unit_name: unit.unit_name,
          conversion_to_base: String(unit.conversion_to_base),
          cost_price_cfa: String(unit.cost_price_cfa),
          selling_price_cfa: String(unit.selling_price_cfa),
        }
      }
      next[0].enabled = true
      next[0].conversion_to_base = '1'
      setUnits(next)
    } else {
      setName('')
      setCategoryId('')
      setPhotoUrl('')
      setUnits([
        { ...emptyUnit('Piece', '1'), enabled: true },
        emptyUnit('Package', ''),
        emptyUnit('Carton', ''),
      ])
    }
  }, [open, product])

  function setUnit(level: 0 | 1 | 2, patch: Partial<UnitForm>) {
    setUnits((prev) => {
      const next = [...prev] as [UnitForm, UnitForm, UnitForm]
      next[level] = { ...next[level], ...patch }
      if (level === 0) {
        next[0].enabled = true
        next[0].conversion_to_base = '1'
      }
      return next
    })
  }

  function collectUnits(): ProductUnitInput[] | null {
    const result: ProductUnitInput[] = []
    for (const level of [0, 1, 2] as const) {
      const u = units[level]
      const existing = product?.units.some((x) => x.unit_level === level)
      if (!u.enabled && !existing) continue
      if (level > 0 && !u.enabled && !existing) continue
      const conversion = level === 0 ? 1 : Number(u.conversion_to_base)
      const cost = Number(u.cost_price_cfa)
      const selling = Number(u.selling_price_cfa)
      if (!u.unit_name.trim() || !(conversion > 0) || !(cost >= 0) || !(selling >= 0)) {
        return null
      }
      result.push({
        unit_level: level,
        unit_name: u.unit_name.trim(),
        conversion_to_base: conversion,
        cost_price_cfa: cost,
        selling_price_cfa: selling,
      })
    }
    if (!result.some((u) => u.unit_level === 0)) return null
    return result
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGeneral('')
    if (!isHttpsUrl(photoUrl.trim())) {
      setGeneral('Product photo must be an HTTPS URL.')
      return
    }
    const unitPayload = collectUnits()
    if (!unitPayload) {
      setGeneral('Each product needs a base unit. Prices and conversions must be valid.')
      return
    }
    try {
      if (isEdit && product) {
        await updateProduct({
          p_product_id: product.id,
          p_category_id: categoryId,
          p_name: name.trim(),
          p_photo_url: photoUrl.trim(),
          p_units: unitPayload,
        })
      } else {
        if (!depotId) {
          setGeneral('Select a depot before creating a product.')
          return
        }
        await createProduct({
          p_depot_id: depotId,
          p_category_id: categoryId,
          p_name: name.trim(),
          p_photo_url: photoUrl.trim(),
          p_units: unitPayload,
        })
      }
      onClose()
    } catch (err) {
      setGeneral(parseError(err).message)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Edit Product' : 'New Product'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Category</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface">
            <option value="">Select category…</option>
            {(categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">Photo URL</label>
          <input value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} required placeholder="https://…" className="w-full h-9 px-3 rounded-md border border-border text-sm bg-surface" />
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold text-text-secondary uppercase">Units</p>
          {([0, 1, 2] as const).map((level) => {
            const existing = !!product?.units.some((u) => u.unit_level === level)
            const lockedOn = level === 0 || existing
            return (
              <div key={level} className="rounded-md border border-border p-3 space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={units[level].enabled || lockedOn}
                    disabled={lockedOn}
                    onChange={(e) => setUnit(level, { enabled: e.target.checked })}
                  />
                  Level {level} {level === 0 ? '(base piece)' : level === 1 ? '(package)' : '(carton)'}
                </label>
                {(units[level].enabled || lockedOn) && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={units[level].unit_name}
                      onChange={(e) => setUnit(level, { unit_name: e.target.value })}
                      placeholder="Unit name"
                      className="h-9 px-3 rounded-md border border-border text-sm bg-surface"
                    />
                    <input
                      value={level === 0 ? '1' : units[level].conversion_to_base}
                      onChange={(e) => setUnit(level, { conversion_to_base: e.target.value })}
                      disabled={level === 0}
                      placeholder="Pieces per unit"
                      className="h-9 px-3 rounded-md border border-border text-sm bg-surface disabled:opacity-60"
                    />
                    <input
                      value={units[level].cost_price_cfa}
                      onChange={(e) => setUnit(level, { cost_price_cfa: e.target.value })}
                      placeholder="Cost CFA"
                      className="h-9 px-3 rounded-md border border-border text-sm bg-surface"
                    />
                    <input
                      value={units[level].selling_price_cfa}
                      onChange={(e) => setUnit(level, { selling_price_cfa: e.target.value })}
                      placeholder="Selling CFA"
                      className="h-9 px-3 rounded-md border border-border text-sm bg-surface"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {general && (
          <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
            <p className="text-sm text-danger">{general}</p>
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>Cancel</Button>
          <LoadingButton type="submit" loading={isPending}>{isEdit ? 'Save Changes' : 'Create Product'}</LoadingButton>
        </div>
      </form>
    </Modal>
  )
}
