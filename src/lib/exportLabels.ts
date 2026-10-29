/**
 * French UI labels for CSV/XLSX exports (match on-screen bilingual FR).
 */

import { SALE_STATUS } from '@/lib/bilingual/status'
import { t } from '@/lib/bilingual/types'
import { exportOuiNon } from '@/lib/tableExport'

export function exportSaleStatus(status: string | null | undefined): string {
  if (!status) return ''
  const pair = (SALE_STATUS as Record<string, { fr: string; en: string }>)[status]
  return pair ? t(pair) : status
}

export function exportPaymentMethod(method: string | null | undefined): string {
  switch (method) {
    case 'cash':
      return 'Espèces'
    case 'mobile':
      return 'Mobile'
    case 'bank':
      return 'Banque'
    default:
      return method ?? ''
  }
}

export function exportPurchaseReceiptStatus(status: string | null | undefined): string {
  switch (status) {
    case 'draft':
      return 'Brouillon'
    case 'validated':
      return 'Validé'
    case 'cancelled':
      return 'Annulé'
    default:
      return status ?? ''
  }
}

export function exportProformaStatus(status: string | null | undefined): string {
  switch (status) {
    case 'draft':
      return 'Brouillon'
    case 'sent':
      return 'Envoyé'
    case 'converted':
      return 'Converti'
    case 'cancelled':
      return 'Annulé'
    default:
      return status ?? ''
  }
}

export function exportActiveLabel(isActive: boolean | null | undefined): string {
  if (isActive == null) return ''
  return isActive ? 'Actif' : 'Inactif'
}

export { exportOuiNon }
