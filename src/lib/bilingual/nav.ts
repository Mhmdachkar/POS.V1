import type { BilingualPair } from './types'
import { bi } from './types'

export const NAV = {
  overview: bi("Vue d'ensemble", 'Overview'),
  sales: bi('Ventes', 'Sales'),
  inventory: bi('Inventaire', 'Inventory'),
  stockActivity: bi('Activité du stock', 'Stock Activity'),
  customers: bi('Clients', 'Customers'),
  payments: bi('Paiements', 'Payments'),
  transfers: bi('Transferts', 'Transfers'),
  shifts: bi('Services', 'Shifts'),
  reports: bi('Rapports', 'Reports'),
  staff: bi('Équipe', 'Staff'),
  depots: bi('Dépôts', 'Depots'),
  categories: bi('Catégories', 'Categories'),
  auditLog: bi('Journal d\'audit', 'Audit Log'),
  settings: bi('Paramètres', 'Settings'),
  pos: bi('Caisse', 'POS'),
  shift: bi('Service', 'Shift'),
  products: bi('Produits', 'Products'),
  dashboard: bi("Vue d'ensemble", 'Overview'),
} as const satisfies Record<string, BilingualPair>

export const NAV_GROUP = {
  overview: bi("Vue d'ensemble", 'Overview'),
  operations: bi('Opérations', 'Operations'),
  insights: bi('Analyses', 'Insights'),
  administration: bi('Administration', 'Administration'),
} as const satisfies Record<string, BilingualPair>

export const AUTH_NAV = {
  signOut: bi('Déconnexion', 'Sign out'),
  expandRail: bi('Développer le menu', 'Expand menu'),
  collapseRail: bi('Réduire le menu', 'Collapse menu'),
} as const satisfies Record<string, BilingualPair>
