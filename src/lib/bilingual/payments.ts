import { bi } from './types'

export const PAYMENTS = {
  pageTitle: bi('Paiements clients', 'Customer Payments'),
  pageDesc: bi(
    'Paiements en espèces enregistrés sur les comptes clients',
    'Cash payments recorded against customer accounts',
  ),
  failedToLoad: bi('Impossible de charger les paiements', 'Failed to load payments'),
  noPayments: bi('Aucun paiement client', 'No customer payments found'),
  noPaymentsHint: bi('Aucun paiement sur la période ou les filtres.', 'No payments for this period or filters.'),
  amount: bi('Montant', 'Amount'),
  recordedBy: bi('Enregistré par', 'Recorded by'),
  recordedAt: bi('Enregistré le', 'Recorded at'),
  pageDescLong: bi(
    'Paiements qui réduisent la dette client. Non liés à un ticket.',
    'Payments that reduce what a customer owes. Not tied to one receipt.',
  ),
  excludingReversed: bi('Hors annulations', 'Excluding reversed'),
  includingReversed: bi('Avec annulations', 'Showing reversed'),
  searchCustomer: bi('Nom du client…', 'Customer name…'),
  noPaymentsFor: (q: string) =>
    bi(`Aucun paiement pour « ${q} ».`, `No payments found for "${q}".`),
  noPaymentsRecorded: bi(
    'Aucun remboursement de dette enregistré.',
    'No customer debt repayments have been recorded yet.',
  ),
  colNote: bi('Note', 'Note'),
  statusRecorded: bi('Enregistré', 'Recorded'),
  statusReversed: bi('Annulé', 'Reversed'),
} as const
