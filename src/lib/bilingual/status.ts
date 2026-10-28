import type { BilingualPair } from './types'
import { bi } from './types'
import type { SaleStatus, StockStatus, TransferStatus, ShiftStatus } from '@/types'

export const SALE_STATUS: Record<SaleStatus, BilingualPair> = {
  completed: bi('Terminée', 'Completed'),
  voided: bi('Annulée', 'Voided'),
  partially_returned: bi('Partiellement retournée', 'Partially returned'),
  returned: bi('Retournée', 'Returned'),
}

export const TRANSFER_STATUS: Record<TransferStatus, BilingualPair> = {
  pending: bi('En attente', 'Pending'),
  completed: bi('Terminé', 'Completed'),
  cancelled: bi('Annulé', 'Cancelled'),
}

export const STOCK_STATUS: Record<StockStatus, BilingualPair> = {
  healthy: bi('En stock', 'In stock'),
  low_stock: bi('Stock faible', 'Low stock'),
  out_of_stock: bi('Rupture de stock', 'Out of stock'),
  untracked: bi('Sans alerte', 'No alert'),
}

export const SHIFT_STATUS: Record<ShiftStatus, BilingualPair> = {
  open: bi('Ouvert', 'Open'),
  closed: bi('Fermé', 'Closed'),
}

export const FULFILLMENT = {
  pendingRelease: bi('À préparer', 'To pick'),
  released: bi('Préparée', 'Picked'),
  releaseOrder: bi('Marquer comme préparée', 'Mark order picked'),
  releasedBy: bi('Préparée par', 'Picked by'),
  releasedAt: bi('Préparée le', 'Picked at'),
  pendingOrders: bi('Commandes en attente', 'Pending orders'),
  salesOrders: bi('Ventes / commandes', 'Sales / orders'),
} as const satisfies Record<string, BilingualPair>
