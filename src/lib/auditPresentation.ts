import { ADMIN } from '@/lib/bilingual/admin'
import { INVENTORY } from '@/lib/bilingual/inventory'
import { bi, bilingualPlain, type BilingualPair } from '@/lib/bilingual/types'
import { formatCFA, formatPieces } from '@/lib/formatters'
import {
  formatDeltaInUnits,
  formatRestockAdded,
  formatStockRangeInUnits,
  type UnitLike,
} from '@/lib/stockQuantityDisplay'
import type { AuditLogRow } from '@/hooks/useAuditLog'

type JsonObj = Record<string, unknown>

function obj(v: unknown): JsonObj | null {
  if (v == null || typeof v !== 'object' || Array.isArray(v)) return null
  return v as JsonObj
}

function num(v: unknown): number | null {
  if (typeof v === 'number' && !Number.isNaN(v)) return v
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v)
    return Number.isNaN(n) ? null : n
  }
  return null
}

function str(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  return s || null
}

const ADJUSTMENT_TYPE: Record<string, BilingualPair> = {
  DAMAGE: bi('Dommage', 'Damage'),
  LOSS: bi('Perte', 'Loss'),
  EXPIRY: bi('Péremption', 'Expiry'),
  COUNT_CORRECTION: INVENTORY.countCorrection,
  OTHER: bi('Autre', 'Other'),
}

export const AUDIT_ACTION_LABELS: Record<string, BilingualPair> = {
  complete_sale: bi('Vente finalisée', 'Sale completed'),
  release_sale_fulfillment: bi('Commande préparée', 'Order marked picked'),
  record_payment: bi('Paiement enregistré', 'Payment recorded'),
  process_return: bi('Retour traité', 'Return processed'),
  void_sale: bi('Vente annulée', 'Sale cancelled'),
  void_sale_cash_reversal: bi('Annulation vente (caisse)', 'Sale cancel (cash reversal)'),
  adjust_inventory: bi('Ajustement de stock', 'Stock adjustment'),
  restock_product: bi('Réapprovisionnement', 'Restock'),
  create_transfer_draft: bi('Brouillon de transfert', 'Transfer draft created'),
  complete_transfer: bi('Transfert complété', 'Transfer completed'),
  cancel_transfer: bi('Transfert annulé', 'Transfer cancelled'),
  open_shift: bi('Service ouvert', 'Shift opened'),
  close_shift: bi('Service fermé', 'Shift closed'),
  create_customer: bi('Client créé', 'Customer created'),
  update_customer: bi('Client modifié', 'Customer updated'),
  deactivate_customer: bi('Client désactivé', 'Customer deactivated'),
  reactivate_customer: bi('Client réactivé', 'Customer reactivated'),
  create_staff: bi('Membre créé', 'Staff member created'),
  update_staff: bi('Membre modifié', 'Staff member updated'),
  deactivate_staff: bi('Membre désactivé', 'Staff member deactivated'),
  reactivate_staff: bi('Membre réactivé', 'Staff member reactivated'),
  staff_auth_reconcile: bi('Réconciliation auth', 'Auth reconciliation'),
  create_depot: bi('Dépôt créé', 'Depot created'),
  update_depot: bi('Dépôt modifié', 'Depot updated'),
  deactivate_depot: bi('Dépôt désactivé', 'Depot deactivated'),
  reactivate_depot: bi('Dépôt réactivé', 'Depot reactivated'),
  create_category: bi('Catégorie créée', 'Category created'),
  update_category: bi('Catégorie modifiée', 'Category updated'),
  deactivate_category: bi('Catégorie désactivée', 'Category deactivated'),
  reactivate_category: bi('Catégorie réactivée', 'Category reactivated'),
  create_product: bi('Produit créé', 'Product created'),
  update_product: bi('Produit modifié', 'Product updated'),
  deactivate_product: bi('Produit désactivé', 'Product deactivated'),
  reactivate_product: bi('Produit réactivé', 'Product reactivated'),
  update_business_settings: bi('Paramètres entreprise', 'Business settings updated'),
}

export const AUDIT_ENTITY_LABELS: Record<string, BilingualPair> = {
  sale: bi('Vente', 'Sale'),
  payment: bi('Paiement', 'Payment'),
  sale_return: bi('Retour', 'Return'),
  inventory_adjustment: bi('Ajustement stock', 'Stock adjustment'),
  stock_entry: bi('Entrée de stock', 'Stock receipt'),
  stock_transfer: bi('Transfert', 'Transfer'),
  shift: bi('Service caisse', 'Shift'),
  customer: bi('Client', 'Customer'),
  staff: bi('Personnel', 'Staff'),
  depot: bi('Dépôt', 'Depot'),
  category: bi('Catégorie', 'Category'),
  product: bi('Produit', 'Product'),
  business_settings: bi('Paramètres', 'Settings'),
}

export function auditActionLabel(action: string): BilingualPair {
  return AUDIT_ACTION_LABELS[action] ?? bi(action, action)
}

export function auditEntityLabel(entityType: string): BilingualPair {
  return AUDIT_ENTITY_LABELS[entityType] ?? bi(entityType, entityType)
}

export interface AuditChangeLine {
  label: BilingualPair
  value: BilingualPair
  /** true = green, false = red, undefined/null = neutral */
  isPositive?: boolean | null
}

export interface AuditHeroMetric {
  value: BilingualPair
  /** true = green (success), false = red (danger), null = neutral */
  isPositive: boolean | null
  sub: BilingualPair | null
}

/**
 * Maps an audit action to a visual category used for colour-coded accents.
 * 'sale'        → green  (revenue events)
 * 'stock'       → amber  (inventory changes)
 * 'destructive' → red    (voids, deactivations, cancellations)
 * 'admin'       → muted  (creates, edits, settings, shifts)
 */
export function auditActionCategory(
  action: string,
): 'sale' | 'stock' | 'destructive' | 'admin' {
  if (
    ['complete_sale', 'release_sale_fulfillment', 'record_payment'].includes(action)
  ) return 'sale'
  if (
    [
      'adjust_inventory',
      'restock_product',
      'create_transfer_draft',
      'complete_transfer',
      'cancel_transfer',
    ].includes(action)
  ) return 'stock'
  if (
    [
      'void_sale',
      'void_sale_cash_reversal',
      'process_return',
      'deactivate_customer',
      'deactivate_staff',
      'deactivate_depot',
      'deactivate_product',
      'deactivate_category',
    ].includes(action)
  ) return 'destructive'
  return 'admin'
}

/** Bilingual friendly label for an adjustment type code (DAMAGE, LOSS, …). */
export function adjustmentTypeLabel(type: string): string {
  return bilingualPlain(ADJUSTMENT_TYPE[type] ?? bi(type, type))
}

const L = {
  stock: bi('Stock', 'Stock'),
  stockChange: bi('Variation', 'Change'),
  adjustmentType: bi("Type d'ajustement", 'Adjustment type'),
  reason: INVENTORY.adjustmentReason,
  productName: bi('Produit', 'Product'),
  quantityAdded: bi('Quantité ajoutée', 'Quantity added'),
  newStock: bi('Nouveau stock', 'New stock'),
  saleTotal: bi('Total vente', 'Sale total'),
  status: bi('Statut', 'Status'),
  refund: bi('Remboursement', 'Refund amount'),
  customerName: bi('Client', 'Customer'),
  staffName: bi('Nom', 'Name'),
  depotName: bi('Dépôt', 'Depot'),
  note: bi('Note', 'Note'),
} as const

function stockRange(
  before: number | null,
  after: number | null,
  units?: UnitLike[] | null,
): BilingualPair {
  if (units?.length) return formatStockRangeInUnits(before, after, units)
  if (before != null && after != null) {
    return bi(`${formatPieces(before)} → ${formatPieces(after)}`, `${formatPieces(before)} → ${formatPieces(after)}`)
  }
  if (after != null) return bi(formatPieces(after), formatPieces(after))
  if (before != null) return bi(formatPieces(before), formatPieces(before))
  return bi('—', '—')
}

function productNameFrom(before: JsonObj | null, after: JsonObj | null): string | null {
  return str(after?.name) ?? str(before?.name)
}

export function auditEventSummary(row: AuditLogRow, units?: UnitLike[] | null): BilingualPair {
  const before = obj(row.before_value)
  const after = obj(row.after_value)
  const action = auditActionLabel(row.action)

  if (row.action === 'adjust_inventory' && after) {
    const typeKey = str(after.adjustment_type) ?? ''
    const typeLabel = ADJUSTMENT_TYPE[typeKey] ?? bi(typeKey, typeKey)
    const beforeStock = num(before?.current_stock_pieces)
    const afterStock = num(after.new_stock_pieces)
    const delta = num(after.quantity_pieces)
    const deltaText = delta != null ? formatDeltaInUnits(delta, units ?? null) : null
    const range = stockRange(beforeStock, afterStock, units)
    const deltaSuffix = deltaText != null ? ` (${bilingualPlain(deltaText)})` : ''
    return bi(
      `${action.fr} · ${typeLabel.fr} · ${bilingualPlain(range)}${deltaSuffix}`,
      `${action.en} · ${typeLabel.en} · ${bilingualPlain(range)}${deltaSuffix}`,
    )
  }

  if (row.action === 'restock_product' && after) {
    const beforeStock = num(before?.current_stock_pieces)
    const afterStock = num(after.new_stock_pieces)
    const name = productNameFrom(before, after)
    const prefix = name ? `${name} · ` : ''
    const addedLine = formatRestockAdded(after, units ?? null)
    const range = stockRange(beforeStock, afterStock, units)
    return bi(
      `${prefix}${action.fr} · ${bilingualPlain(addedLine)} · ${bilingualPlain(range)}`,
      `${prefix}${action.en} · ${bilingualPlain(addedLine)} · ${bilingualPlain(range)}`,
    )
  }

  if ((row.action === 'create_product' || row.action === 'update_product') && (after || before)) {
    const name = productNameFrom(before, after)
    const stock = num(after?.current_stock_pieces) ?? num(before?.current_stock_pieces)
    const stockBit = stock != null ? ` · ${formatPieces(stock)}` : ''
    return bi(
      `${action.fr}${name ? ` · ${name}` : ''}${stockBit}`,
      `${action.en}${name ? ` · ${name}` : ''}${stockBit}`,
    )
  }

  if (row.action === 'complete_sale' && after) {
    const total = num(after.total_cfa)
    return bi(
      `${action.fr}${total != null ? ` · ${formatCFA(total)}` : ''}`,
      `${action.en}${total != null ? ` · ${formatCFA(total)}` : ''}`,
    )
  }

  if (row.action === 'process_return' && after) {
    const refund = num(after.refund_amount_cfa)
    return bi(
      `${action.fr}${refund != null ? ` · ${formatCFA(refund)}` : ''}`,
      `${action.en}${refund != null ? ` · ${formatCFA(refund)}` : ''}`,
    )
  }

  const entity = auditEntityLabel(row.entity_type)
  return bi(`${action.fr} · ${entity.fr}`, `${action.en} · ${entity.en}`)
}

export function auditDetailChanges(row: AuditLogRow, units?: UnitLike[] | null): AuditChangeLine[] {
  const before = obj(row.before_value)
  const after = obj(row.after_value)
  const lines: AuditChangeLine[] = []

  if (row.action === 'adjust_inventory') {
    const beforeStock = num(before?.current_stock_pieces)
    const afterStock = num(after?.new_stock_pieces)
    const typeKey = str(after?.adjustment_type) ?? ''
    const typeLabel = ADJUSTMENT_TYPE[typeKey] ?? bi(typeKey, typeKey)
    const delta = num(after?.quantity_pieces)
    lines.push({ label: L.stock, value: stockRange(beforeStock, afterStock, units) })
    if (delta != null) {
      lines.push({
        label: L.stockChange,
        value: formatDeltaInUnits(delta, units ?? null),
        isPositive: delta > 0 ? true : delta < 0 ? false : null,
      })
    }
    lines.push({ label: L.adjustmentType, value: typeLabel })
    const reason = str(after?.reason)
    if (reason) lines.push({ label: L.reason, value: bi(reason, reason) })
    return lines
  }

  if (row.action === 'restock_product' && after) {
    const beforeStock = num(before?.current_stock_pieces)
    const afterStock = num(after.new_stock_pieces)
    lines.push({
      label: L.quantityAdded,
      value: formatRestockAdded(after, units ?? null),
      isPositive: true,
    })
    lines.push({ label: L.stock, value: stockRange(beforeStock, afterStock, units) })
    return lines
  }

  if (row.action === 'create_product' || row.action === 'update_product') {
    const name = productNameFrom(before, after)
    if (name) lines.push({ label: L.productName, value: bi(name, name) })
    const beforeStock = num(before?.current_stock_pieces)
    const afterStock = num(after?.current_stock_pieces)
    if (beforeStock != null || afterStock != null) {
      lines.push({ label: L.stock, value: stockRange(beforeStock, afterStock, units) })
    }
    return lines
  }

  if (row.action === 'complete_sale') {
    const beforeStatus = str(before?.status)
    const afterStatus = str(after?.status)
    if (beforeStatus || afterStatus) {
      lines.push({
        label: L.status,
        value: bi(
          `${beforeStatus ?? '—'} → ${afterStatus ?? '—'}`,
          `${beforeStatus ?? '—'} → ${afterStatus ?? '—'}`,
        ),
      })
    }
    const total = num(after?.total_cfa)
    if (total != null) {
      lines.push({ label: L.saleTotal, value: bi(formatCFA(total), formatCFA(total)) })
    }
    return lines
  }

  if (row.action === 'process_return') {
    const refund = num(after?.refund_amount_cfa)
    if (refund != null) {
      lines.push({ label: L.refund, value: bi(formatCFA(refund), formatCFA(refund)) })
    }
    return lines
  }

  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  for (const key of keys) {
    const b = before?.[key]
    const a = after?.[key]
    if (b === a) continue
    const label = bi(key.replace(/_/g, ' '), key.replace(/_/g, ' '))
    const value = bi(
      `${b == null ? '—' : String(b)} → ${a == null ? '—' : String(a)}`,
      `${b == null ? '—' : String(b)} → ${a == null ? '—' : String(a)}`,
    )
    lines.push({ label, value })
  }

  return lines
}

export function auditActorLine(row: AuditLogRow): BilingualPair {
  if (row.actor_name) {
    const user = row.actor_username ? `@${row.actor_username}` : ''
    const text = user ? `${row.actor_name} (${user})` : row.actor_name
    return bi(text, text)
  }
  return ADMIN.systemActor
}

export function auditDepotLine(depotId: string | null, depotName: string | null): BilingualPair {
  if (!depotId) return ADMIN.globalDepots
  if (depotName) return bi(depotName, depotName)
  return bi('Dépôt', 'Depot')
}

export function auditActionOptionLabel(action: string): string {
  return bilingualPlain(auditActionLabel(action))
}

export function auditEntityOptionLabel(entityType: string): string {
  return bilingualPlain(auditEntityLabel(entityType))
}

/**
 * Returns the single most important metric to display prominently at the top
 * of the AuditDetailDrawer (the "hero card"). Returns null for actions that
 * don't have a clear key number.
 */
export function auditHeroMetric(
  row: AuditLogRow,
  units?: UnitLike[] | null,
): AuditHeroMetric | null {
  const before = obj(row.before_value)
  const after = obj(row.after_value)

  if (row.action === 'adjust_inventory' && after) {
    const beforeStock = num(before?.current_stock_pieces)
    const afterStock = num(after.new_stock_pieces)
    const delta = num(after.quantity_pieces)
    if (delta != null) {
      return {
        value: formatDeltaInUnits(delta, units ?? null),
        isPositive: delta > 0 ? true : delta < 0 ? false : null,
        sub: stockRange(beforeStock, afterStock, units),
      }
    }
  }

  if (row.action === 'restock_product' && after) {
    const beforeStock = num(before?.current_stock_pieces)
    const afterStock = num(after.new_stock_pieces)
    return {
      value: formatRestockAdded(after, units ?? null),
      isPositive: true,
      sub: stockRange(beforeStock, afterStock, units),
    }
  }

  if (row.action === 'complete_sale' && after) {
    const total = num(after.total_cfa)
    if (total != null) {
      return {
        value: bi(formatCFA(total), formatCFA(total)),
        isPositive: null,
        sub: null,
      }
    }
  }

  if (row.action === 'process_return' && after) {
    const refund = num(after.refund_amount_cfa)
    if (refund != null) {
      return {
        value: bi(formatCFA(refund), formatCFA(refund)),
        isPositive: true,
        sub: null,
      }
    }
  }

  return null
}
