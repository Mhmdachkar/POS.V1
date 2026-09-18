import { bi } from './types'

export const DEPOT = {
  overviewTitle: bi("Vue d'ensemble dépôt", 'Depot overview'),
  overviewDesc: (name: string) =>
    bi(`${name} — commandes et stock en un coup d'œil`, `${name} — orders and stock at a glance`),
  failedOverview: bi("Impossible de charger la vue d'ensemble", 'Could not load overview'),
  pendingOrders: bi('Commandes en attente', 'Pending orders'),
  lowStock: bi('Stock faible', 'Low stock'),
  recentSales: bi('Ventes récentes', 'Recent sales'),
  pendingRelease: bi('En attente de libération', 'Pending release'),
  releasedToday: bi('Libérées aujourd\'hui', 'Released today'),
  lowStockSkus: bi('SKU stock faible', 'Low stock SKUs'),
  outOfStockSkus: bi('Rupture de stock', 'Out of stock'),
  noPendingRelease: bi(
    'Aucune commande en attente de libération.',
    'No orders waiting for release.',
  ),
  openSalePrefix: bi('Ouvrir la vente', 'Open sale'),
  depotCount: (n: number) => bi(`${n} dépôt${n !== 1 ? 's' : ''}`, `${n} depot${n !== 1 ? 's' : ''}`),
  depotsDesc: bi('Emplacements physiques des produits', 'Physical locations that own products'),
  newDepot: bi('Nouveau dépôt', 'New Depot'),
  searchDepots: bi('Nom, code, lieu…', 'Name, code, location…'),
  colLocation: bi('Lieu', 'Location'),
  colCode: bi('Code', 'Code'),
  orderTicketTitle: bi('COMMANDE DÉPÔT', 'DEPOT ORDER'),
  pickWhenReady: bi('Retirer quand prêt', 'Pick & release when ready'),
  walkInCustomer: bi('Client comptoir', 'Walk-in'),
  printKvDate: bi('Date', 'Date'),
  printKvCashier: bi('Caissier', 'Cashier'),
  printKvCustomer: bi('Client', 'Customer'),
  printKvSubtotal: bi('Sous-total', 'Subtotal'),
  printKvTotal: bi('TOTAL', 'TOTAL'),
} as const
