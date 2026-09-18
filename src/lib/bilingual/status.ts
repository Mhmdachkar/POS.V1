import type { BilingualPair } from './types'
import { bi } from './types'
import type { SaleStatus, StockStatus, TransferStatus, ShiftStatus } from '@/types'

export const SALE_STATUS: Record<SaleStatus, BilingualPair> = {
  completed: bi('Terminée', 'Completed'),
  voided: bi('Annulée', 'Voided'),
  partially_returned: bi('Partiellement retournée', 'Partially Returned'),
  returned: bi('Retournée', 'Returned'),
}

export const TRANSFER_STATUS: Record<TransferStatus, BilingualPair> = {
  pending: bi('En attente', 'Pending'),
  completed: bi('Terminée', 'Completed'),
  cancelled: bi('Annulée', 'Cancelled'),
}

export const STOCK_STATUS: Record<StockStatus, BilingualPair> = {
  healthy: bi('Stock OK', 'Healthy'),
  low_stock: bi('Stock faible', 'Low Stock'),
  out_of_stock: bi('Rupture de stock', 'Out of Stock'),
}

export const SHIFT_STATUS: Record<ShiftStatus, BilingualPair> = {
  open: bi('Ouvert', 'Open'),
  closed: bi('Fermé', 'Closed'),
}

export const FULFILLMENT = {
  pendingRelease: bi('À libérer', 'Pending Release'),
  released: bi('Libérée', 'Released'),
  releaseOrder: bi('Libérer la commande', 'Release Order'),
  releasedBy: bi('Libérée par', 'Released by'),
  releasedAt: bi('Libérée le', 'Released at'),
  pendingOrders: bi('Commandes en attente', 'Pending Orders'),
  salesOrders: bi('Ventes / Commandes', 'Sales / Orders'),
} as const satisfies Record<string, BilingualPair>
