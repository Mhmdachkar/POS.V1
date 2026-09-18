/**
 * ProductFormModal — Create / edit product with three-level unit hierarchy.
 *
 * CEO Notes changes:
 *   - serial_number field per unit (required, admin-editable)
 *   - relative_quantity replaces conversion_to_base for L1 and L2
 *   - L0 (piece) has no relative_quantity input (server enforces = 1)
 *   - L1 relative_quantity = pieces per package
 *   - L2 relative_quantity = packages per carton
 *   - Derived hierarchy display shown live
 *   - Server derives conversion_to_base from hierarchy; client never sends it
 */

import { useEffect, useRef, useState } from 'react'
import { toastSuccessBi } from '@/lib/bilingual/toast'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { ImagePlus, Package2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button, LoadingButton } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { parseError } from '@/lib/errors'
import { formatThousandsInput, parseCFAInput } from '@/lib/formatters'
import { isPlaceholderPhotoUrl, resolveProductPhotoUrl } from '@/lib/productPhotos'
import {
  PRODUCT_PHOTO_ACCEPT,
  ProductPhotoUploadError,
  uploadProductPhoto,
  validateProductPhotoFile,
} from '@/lib/productPhotoUpload'
import { productPerfMark, productPerfMeasure } from '@/lib/productPerf'
import {
  DEFAULT_LOW_STOCK_THRESHOLD_PIECES,
  parseLowStockThreshold,
  validateLowStockSettings,
} from '@/lib/lowStock'
import { useCategories } from '@/hooks/useInventory'
import { useCreateProduct, useUpdateProduct } from '@/hooks/useAdminProducts'
import { CategoryPathPicker } from './CategoryPathPicker'
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
  serial_number: string
  /** L0: ignored (fixed = 1 by server). L1: pieces/package. L2: packages/carton. */
  relative_quantity: string
  cost_price_cfa: string
  selling_price_cfa: string
}

const LEVEL_NAMES = ['Pièce / Piece', 'Paquet / Package', 'Carton'] as const
const LEVEL_CODES = ['PCE', 'PKG', 'CTN'] as const

function emptyUnit(name: string): UnitForm {
  return {
    enabled: false,
    unit_name: name,
    serial_number: '',
    relative_quantity: '',
    cost_price_cfa: '',
    selling_price_cfa: '',
  }
}

function blankUnits(): [UnitForm, UnitForm, UnitForm] {
  return [
    { ...emptyUnit('Pièce'), enabled: true },
    emptyUnit('Paquet'),
    emptyUnit('Carton'),
  ]
}

/** Derive conversion_to_base from hierarchy for display only */
function derivedConversion(units: [UnitForm, UnitForm, UnitForm], level: 0 | 1 | 2): number {
  if (level === 0) return 1
  const l1 = parseCFAInput(units[1].relative_quantity)
  if (level === 1) return l1 > 0 ? l1 : 0
  const l2 = parseCFAInput(units[2].relative_quantity)
  return l1 > 0 && l2 > 0 ? l1 * l2 : 0
}

export function ProductFormModal({ open, onClose, depotId, product }: ProductFormModalProps) {
  const isEdit = !!product
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoObjectUrl, setPhotoObjectUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [units, setUnits] = useState<[UnitForm, UnitForm, UnitForm]>(() => blankUnits())
  const [trackLowStock, setTrackLowStock] = useState(false)
  const [lowStockThreshold, setLowStockThreshold] = useState('')
  const [general, setGeneral] = useState('')
  const photoInputRef = useRef<HTMLInputElement>(null)

  const { data: categories } = useCategories()
  const { mutateAsync: createProduct, isPending: creating } = useCreateProduct()
  const { mutateAsync: updateProduct, isPending: updating } = useUpdateProduct()
  const isPending = creating || updating || uploading
  const photoPreview = photoObjectUrl || resolveProductPhotoUrl(photoUrl, name)

  useEffect(() => {
    if (!photoFile) { setPhotoObjectUrl(''); return }
    const objectUrl = URL.createObjectURL(photoFile)
    setPhotoObjectUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [photoFile])

  useEffect(() => {
    if (!open) return
    setGeneral('')
    setPhotoFile(null)
    setUploading(false)
    if (photoInputRef.current) photoInputRef.current.value = ''

    if (product) {
      setName(product.name)
      setCategoryId(product.category_id)
      setPhotoUrl(product.photo_url)
      const next = blankUnits()
      for (const unit of product.units) {
        const lvl = unit.unit_level as 0 | 1 | 2
        next[lvl] = {
          enabled: true,
          unit_name: unit.unit_name,
          serial_number: unit.serial_number ?? '',
          relative_quantity: unit.relative_quantity != null
            ? formatThousandsInput(String(unit.relative_quantity))
            : '',
          cost_price_cfa: formatThousandsInput(String(unit.cost_price_cfa)),
          selling_price_cfa: formatThousandsInput(String(unit.selling_price_cfa)),
        }
      }
      setUnits(next)
      setTrackLowStock(product.track_low_stock)
      setLowStockThreshold(
        product.low_stock_threshold == null ? '' : String(product.low_stock_threshold),
      )
    } else {
      setName('')
      setCategoryId('')
      setPhotoUrl('')
      setUnits(blankUnits())
      setTrackLowStock(false)
      setLowStockThreshold('')
    }
  }, [open, product])

  function setUnit(level: 0 | 1 | 2, patch: Partial<UnitForm>) {
    setUnits((prev) => {
      const next = [...prev] as [UnitForm, UnitForm, UnitForm]
      next[level] = { ...next[level], ...patch }
      // If L2 is enabled, L1 must also be enabled
      if (level === 2 && patch.enabled && !next[1].enabled) {
        next[1] = { ...next[1], enabled: true }
      }
      // If L1 is disabled, L2 must also be disabled
      if (level === 1 && patch.enabled === false) {
        next[2] = { ...next[2], enabled: false }
      }
      return next
    })
  }

  function collectUnits(): ProductUnitInput[] | null {
    const result: ProductUnitInput[] = []
    for (const level of [0, 1, 2] as const) {
      const u = units[level]
      if (!u.enabled) continue
      const serial = u.serial_number.trim()
      if (!u.unit_name.trim() || !serial) return null
      const cost = parseCFAInput(u.cost_price_cfa)
      const selling = parseCFAInput(u.selling_price_cfa)
      if (!(cost >= 0) || !(selling >= 0)) return null

      let relQty: number | null = null
      if (level === 1) {
        relQty = parseCFAInput(u.relative_quantity)
        if (!(relQty > 0)) return null
      } else if (level === 2) {
        relQty = parseCFAInput(u.relative_quantity)
        if (!(relQty > 0)) return null
      }

      result.push({
        unit_level: level,
        unit_name: u.unit_name.trim(),
        serial_number: serial,
        relative_quantity: relQty,
        cost_price_cfa: cost,
        selling_price_cfa: selling,
      })
    }
    if (result.length === 0) return null
    return result
  }

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (!file) { setPhotoFile(null); return }
    const validation = validateProductPhotoFile(file)
    if (validation) {
      setGeneral(validation)
      setPhotoFile(null)
      e.target.value = ''
      return
    }
    setGeneral('')
    setPhotoFile(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGeneral('')
    const existingPhoto = photoUrl.trim()
    const needsUpload = !!photoFile
    if (!needsUpload && (!existingPhoto || isPlaceholderPhotoUrl(existingPhoto))) {
      setGeneral('Choisissez une photo du produit / Choose a product photo.')
      return
    }
    const unitPayload = collectUnits()
    if (!categoryId) {
      setGeneral('Choisissez une catégorie / Choose a category.')
      return
    }
    if (!unitPayload) {
      setGeneral('Activez au moins une unité et remplissez tous les champs requis.')
      return
    }
    const thresholdValue = parseLowStockThreshold(lowStockThreshold)
    const trackingError = validateLowStockSettings(trackLowStock, thresholdValue)
    if (trackingError) { setGeneral(trackingError); return }

    const trackingPayload = {
      p_track_low_stock: trackLowStock,
      p_low_stock_threshold: thresholdValue,
    }
    setUploading(needsUpload)
    productPerfMark('product_form:submit')
    try {
      productPerfMark('product_form:upload:start')
      const storedPhotoUrl = photoFile ? await uploadProductPhoto(photoFile) : existingPhoto
      productPerfMark('product_form:upload:end')
      productPerfMeasure('product_form:upload', 'product_form:upload:start', 'product_form:upload:end')
      if (isPlaceholderPhotoUrl(storedPhotoUrl)) {
        setGeneral('Image non valide. Utilisez une vraie photo.')
        return
      }
      if (isEdit && product) {
        await updateProduct({
          p_product_id: product.id,
          p_category_id: categoryId,
          p_name: name.trim(),
          p_photo_url: storedPhotoUrl,
          p_units: unitPayload,
          ...trackingPayload,
        })
        toastSuccessBi(INVENTORY.productSaved)
      } else {
        if (!depotId) {
          setGeneral('Sélectionnez un dépôt avant de créer un produit.')
          return
        }
        productPerfMark('product_form:rpc:await')
        await createProduct({
          p_depot_id: depotId,
          p_category_id: categoryId,
          p_name: name.trim(),
          p_photo_url: storedPhotoUrl,
          p_units: unitPayload,
          ...trackingPayload,
        })
        productPerfMark('product_form:rpc:resolved')
        productPerfMeasure('product_form:submit_to_rpc', 'product_form:submit', 'product_form:rpc:resolved')
        toastSuccessBi(INVENTORY.productCreated)
      }
      onClose()
      productPerfMark('product_form:closed')
    } catch (err) {
      setGeneral(
        err instanceof ProductPhotoUploadError ? err.message : parseError(err).message,
      )
    } finally {
      setUploading(false)
    }
  }

  // Derived hierarchy for display
  const l1Conv = units[1].enabled ? derivedConversion(units, 1) : 0
  const l2Conv = units[2].enabled ? derivedConversion(units, 2) : 0
  const hasL1 = units[1].enabled && l1Conv > 0
  const hasL2 = units[2].enabled && l2Conv > 0

  const fieldCls = 'w-full h-9 px-3 rounded-md border border-border text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary'

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit
        ? <BilingualText fr="Modifier le produit" en="Edit Product" variant="heading" />
        : <BilingualText fr="Nouveau produit" en="New Product" variant="heading" />
      }
      size="2xl"
      footer={
        <div className="flex flex-wrap gap-3 justify-end">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
            <BilingualText fr="Annuler" en="Cancel" variant="inline" layout="inline" />
          </Button>
          <LoadingButton type="submit" form="product-form" loading={isPending}>
            <BilingualText
              fr={isEdit ? 'Enregistrer' : 'Créer le produit'}
              en={isEdit ? 'Save Changes' : 'Create Product'}
              variant="inline"
              layout="inline"
            />
          </LoadingButton>
        </div>
      }
    >
      <form id="product-form" onSubmit={handleSubmit} className="space-y-5">

        {/* ── Product info ─────────────────────────────────────────── */}
        <section className="space-y-4">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            <BilingualText fr="Produit" en="Product" variant="caption" layout="inline" />
          </p>
          <div>
            <label htmlFor="product-name" className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
              <BilingualText fr="Nom" en="Name" variant="caption" layout="inline" />
            </label>
            <input
              id="product-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={fieldCls}
            />
          </div>
          <div>
            <CategoryPathPicker
              categories={categories ?? []}
              value={categoryId}
              onChange={setCategoryId}
              disabled={isPending}
            />
          </div>
          <div>
            <label htmlFor="product-photo" className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5">
              <BilingualText fr="Photo du produit" en="Product photo" variant="caption" layout="inline" />
            </label>
            <input
              ref={photoInputRef}
              id="product-photo"
              type="file"
              accept={PRODUCT_PHOTO_ACCEPT}
              onChange={handlePhotoChange}
              className="sr-only"
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="gap-1.5"
              >
                <ImagePlus className="h-4 w-4" />
                {photoFile
                  ? <BilingualText fr="Changer la photo" en="Change photo" variant="inline" layout="inline" />
                  : isEdit
                    ? <BilingualText fr="Remplacer la photo" en="Replace photo" variant="inline" layout="inline" />
                    : <BilingualText fr="Choisir une photo" en="Choose photo" variant="inline" layout="inline" />
                }
              </Button>
              <span className="text-sm text-text-secondary">
                {photoFile?.name ?? (isEdit && photoPreview ? 'Photo actuelle conservée' : 'Aucune photo')}
              </span>
            </div>
            {photoPreview ? (
              <div className="mt-2 h-28 w-28 overflow-hidden rounded-md border border-border bg-surface-muted">
                <img src={photoPreview} alt="Aperçu photo produit" className="h-full w-full object-contain" />
              </div>
            ) : null}
          </div>
        </section>

        {/* ── Units & hierarchy ──────────────────────────────────────── */}
        <section className="space-y-3">
          <div>
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
              <BilingualText {...INVENTORY.unitsAndPricing} variant="caption" layout="inline" />
            </p>
            <p className="mt-1 text-xs text-text-muted">
              <BilingualText
                fr="Numéro de série requis par unité. Le niveau 0 est toujours la pièce de base."
                en="Serial number required per unit. Level 0 is always the base piece."
                variant="caption"
                layout="inline"
              />
            </p>
          </div>

          {([0, 1, 2] as const).map((level) => {
            const u = units[level]
            const levelLabel = LEVEL_NAMES[level]

            return (
              <div key={level} className="rounded-lg border border-border p-3 space-y-3">
                {/* Header row with toggle */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={`unit-${level}-enabled`}
                    checked={u.enabled}
                    onChange={(e) => setUnit(level, { enabled: e.target.checked })}
                    className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    disabled={level === 0} // L0 always enabled
                  />
                  <label htmlFor={`unit-${level}-enabled`} className="text-sm font-medium text-text-primary">
                    <span className="text-text-secondary text-xs mr-1.5">L{level}</span>
                    {levelLabel}
                    {level === 0 && (
                      <span className="ml-2 text-xs text-text-muted">
                        (<BilingualText fr="unité de base" en="base unit" variant="caption" layout="inline" />)
                      </span>
                    )}
                  </label>
                </div>

                {u.enabled && (
                  <div className="space-y-3">
                    {/* Row 1: unit name + serial */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor={`unit-${level}-name`} className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                          <BilingualText fr="Nom unité" en="Unit name" variant="caption" layout="inline" />
                        </label>
                        <input
                          id={`unit-${level}-name`}
                          value={u.unit_name}
                          onChange={(e) => setUnit(level, { unit_name: e.target.value })}
                          className={fieldCls}
                          placeholder={levelLabel}
                        />
                      </div>
                      <div>
                        <label htmlFor={`unit-${level}-serial`} className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                          <BilingualText {...INVENTORY.serialNumber} variant="caption" layout="inline" />
                          <span className="text-danger ml-0.5">*</span>
                        </label>
                        <input
                          id={`unit-${level}-serial`}
                          value={u.serial_number}
                          onChange={(e) => setUnit(level, { serial_number: e.target.value })}
                          className={`${fieldCls} font-mono`}
                          placeholder={LEVEL_CODES[level] === 'PCE' ? 'ON-PCE-001' : LEVEL_CODES[level] === 'PKG' ? 'ON-PKG-001' : 'ON-CTN-001'}
                        />
                      </div>
                    </div>

                    {/* Row 2: relative_quantity (L1, L2 only) + cost + price */}
                    <div className={`grid gap-2 ${level === 0 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                      {level === 1 && (
                        <div>
                          <label htmlFor={`unit-1-rel`} className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                            <BilingualText {...INVENTORY.piecesPerPackage} variant="caption" layout="inline" />
                            <span className="text-danger ml-0.5">*</span>
                          </label>
                          <input
                            id="unit-1-rel"
                            inputMode="numeric"
                            value={u.relative_quantity}
                            onChange={(e) => setUnit(1, { relative_quantity: formatThousandsInput(e.target.value) })}
                            className={`${fieldCls} tabular-nums`}
                            placeholder="12"
                          />
                        </div>
                      )}
                      {level === 2 && (
                        <div>
                          <label htmlFor={`unit-2-rel`} className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                            <BilingualText {...INVENTORY.packagesPerCarton} variant="caption" layout="inline" />
                            <span className="text-danger ml-0.5">*</span>
                          </label>
                          <input
                            id="unit-2-rel"
                            inputMode="numeric"
                            value={u.relative_quantity}
                            onChange={(e) => setUnit(2, { relative_quantity: formatThousandsInput(e.target.value) })}
                            className={`${fieldCls} tabular-nums`}
                            placeholder="50"
                          />
                        </div>
                      )}
                      <div>
                        <label htmlFor={`unit-${level}-cost`} className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                          <BilingualText {...INVENTORY.costPrice} variant="caption" layout="inline" />
                        </label>
                        <input
                          id={`unit-${level}-cost`}
                          inputMode="numeric"
                          value={u.cost_price_cfa}
                          onChange={(e) => setUnit(level, { cost_price_cfa: formatThousandsInput(e.target.value) })}
                          className={`${fieldCls} tabular-nums`}
                        />
                      </div>
                      <div>
                        <label htmlFor={`unit-${level}-price`} className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">
                          <BilingualText {...INVENTORY.sellingPrice} variant="caption" layout="inline" />
                        </label>
                        <input
                          id={`unit-${level}-price`}
                          inputMode="numeric"
                          value={u.selling_price_cfa}
                          onChange={(e) => setUnit(level, { selling_price_cfa: formatThousandsInput(e.target.value) })}
                          className={`${fieldCls} tabular-nums`}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* Derived hierarchy display */}
          {(hasL1 || hasL2) && (
            <div className="rounded-md bg-surface-muted border border-border px-4 py-3 space-y-1.5">
              <div className="flex items-center gap-1.5 mb-2">
                <Package2 className="h-3.5 w-3.5 text-text-secondary" />
                <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
                  <BilingualText {...INVENTORY.derivedHierarchy} variant="caption" layout="inline" />
                </span>
              </div>
              {hasL2 && (
                <p className="text-sm text-text-primary font-medium">
                  1 {units[2].unit_name || 'Carton'}
                  <span className="text-text-secondary font-normal mx-1">=</span>
                  <span className="tabular-nums">{parseCFAInput(units[2].relative_quantity)}</span>
                  {' '}{units[1].unit_name || 'Paquets'}
                  <span className="text-text-secondary font-normal mx-1">=</span>
                  <span className="tabular-nums font-semibold">{l2Conv}</span>
                  {' '}pièces
                </p>
              )}
              {hasL1 && (
                <p className="text-sm text-text-primary">
                  1 {units[1].unit_name || 'Paquet'}
                  <span className="text-text-secondary font-normal mx-1">=</span>
                  <span className="tabular-nums font-semibold">{l1Conv}</span>
                  {' '}pièces
                </p>
              )}
              <p className="text-sm text-text-secondary">
                1 {units[0].unit_name || 'Pièce'}
                <span className="text-text-secondary font-normal mx-1">=</span>
                1 pièce
                <span className="text-xs text-text-muted ml-1.5">
                  (<BilingualText fr="unité de base" en="base unit" variant="caption" layout="inline" />)
                </span>
              </p>
            </div>
          )}
        </section>

        {/* ── Stock monitoring ───────────────────────────────────────── */}
        <section className="rounded-md border border-border p-3 space-y-2">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">
            <BilingualText {...INVENTORY.monitoringSection} variant="caption" layout="inline" />
          </p>
          <label className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <input
              type="checkbox"
              checked={trackLowStock}
              onChange={(e) => {
                const next = e.target.checked
                setTrackLowStock(next)
                if (next && lowStockThreshold.trim() === '') {
                  setLowStockThreshold(String(DEFAULT_LOW_STOCK_THRESHOLD_PIECES))
                }
              }}
            />
            <BilingualText {...INVENTORY.trackLowStock} variant="inline" layout="inline" />
          </label>
          {trackLowStock && (
            <div>
              <label
                htmlFor="low-stock-threshold"
                className="block text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1.5"
              >
                <BilingualText {...INVENTORY.lowStockThreshold} variant="caption" layout="inline" />
              </label>
              <input
                id="low-stock-threshold"
                type="number"
                min={0}
                step="any"
                required
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
                className={`${fieldCls} tabular-nums`}
              />
            </div>
          )}
        </section>

        {general && (
          <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2">
            <p className="text-sm text-danger">{general}</p>
          </div>
        )}
      </form>
    </Modal>
  )
}
