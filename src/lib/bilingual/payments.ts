import { bi } from './types'

export const PAYMENTS = {
  pageTitle: bi('Paiements clients', 'Customer payments'),
  pageDesc: bi('Paiements reçus sur les soldes clients', 'Payments received on customer balances'),
  failedToLoad: bi('Impossible de charger les paiements', 'Failed to load payments'),
  noPayments: bi('Aucun paiement client', 'No customer payments found'),
  noPaymentsHint: bi('Aucun paiement sur la période ou les filtres.', 'No payments for this period or filters.'),
  amount: bi('Montant', 'Amount'),
  recordedBy: bi('Enregistré par', 'Recorded by'),
  recordedAt: bi('Date', 'Date'),
  excludingReversed: bi('Actifs', 'Active'),
  includingReversed: bi('Tous (avec annulés)', 'All (incl. voided)'),
  searchCustomer: bi('Nom du client…', 'Customer name…'),
  noPaymentsFor: (q: string) =>
    bi(`Aucun paiement pour « ${q} ».`, `No payments for "${q}".`),
  noPaymentsRecorded: bi('Aucun paiement client.', 'No customer payments yet.'),
  colNote: bi('Note', 'Note'),
  statusRecorded: bi('Enregistré', 'Recorded'),
  statusReversed: bi('Annulé', 'Voided'),
  cashierScopeHint: bi('Paiements de votre dépôt', 'Payments for your depot'),
  noShift: bi('Sans service', 'No shift'),
} as const
