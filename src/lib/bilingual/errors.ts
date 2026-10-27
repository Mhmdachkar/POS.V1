import type { VhmErrorCode } from '@/lib/errors'
import type { BilingualPair } from './types'
import { bi, bilingualPlain } from './types'

export const ERROR_MESSAGES_BI: Record<VhmErrorCode, BilingualPair> = {
  INSUFFICIENT_STOCK: bi(
    'Stock insuffisant pour ce produit.',
    'Not enough stock available for this product.',
  ),
  INVALID_PRICE: bi(
    'Prix du produit invalide. Contactez un administrateur.',
    'Product has an invalid price configuration. Contact an administrator.',
  ),
  INVALID_UNIT: bi(
    'Configuration d\'unité invalide. Contactez un administrateur.',
    'Product unit configuration is invalid. Contact an administrator.',
  ),
  INVALID_CART: bi(
    'Le total du panier doit être supérieur à zéro.',
    'Cart total must be greater than zero.',
  ),
  INVALID_DISCOUNT: bi(
    'Remise invalide. Vérifiez le type et le montant.',
    'Invalid discount value. Check the discount type and amount.',
  ),
  INVALID_CURRENCY: bi(
    'Devise d\'affichage invalide. Utilisez CFA ou USD.',
    'Invalid display currency. Use CFA or USD.',
  ),
  PRODUCT_NOT_IN_DEPOT: bi(
    'Produit introuvable dans ce dépôt.',
    'Product not found in this depot.',
  ),
  PRODUCT_INACTIVE: bi(
    'Ce produit n\'est plus disponible.',
    'This product is no longer available.',
  ),
  DEPOT_INACTIVE: bi(
    'Ce dépôt est inactif.',
    'This depot is currently inactive.',
  ),
  CUSTOMER_REQUIRED: bi(
    'Un client est requis pour une vente à crédit.',
    'A customer must be selected for credit sales.',
  ),
  CUSTOMER_NOT_FOUND: bi('Client introuvable.', 'Customer not found.'),
  RETURN_QTY_EXCEEDED: bi(
    'La quantité retournée dépasse le reste retournable.',
    'Return quantity exceeds the remaining returnable amount.',
  ),
  SALE_FULLY_RETURNED: bi(
    'Cette vente a déjà été entièrement retournée.',
    'This sale has already been fully returned.',
  ),
  SALE_VOIDED: bi(
    'Cette vente est annulée et ne peut plus être traitée.',
    'This sale was cancelled and cannot be processed further.',
  ),
  SALE_NOT_FOUND: bi('Vente introuvable.', 'Sale not found.'),
  PAYMENT_EXCEEDS_BALANCE: bi('Montant supérieur au solde dû du client.', 'Amount exceeds the customer balance due.'),
  TRANSFER_ALREADY_COMPLETED: bi(
    'Ce transfert est déjà terminé.',
    'This transfer has already been completed.',
  ),
  TRANSFER_CANCELLED: bi(
    'Ce transfert a été annulé.',
    'This transfer was cancelled.',
  ),
  TRANSFER_NOT_FOUND: bi('Transfert introuvable.', 'Transfer not found.'),
  UNAUTHORIZED: bi(
    'Vous n\'avez pas la permission d\'effectuer cette action.',
    'You don\'t have permission to perform this action.',
  ),
  INVALID_DEPOT: bi(
    'Dépôt invalide ou accès non autorisé.',
    'Invalid depot or unauthorized depot access.',
  ),
  SHIFT_ALREADY_CLOSED: bi(
    'Ce service est déjà fermé.',
    'This shift is already closed.',
  ),
  SHIFT_NOT_FOUND: bi('Service introuvable.', 'Shift not found.'),
  SHIFT_NOT_OPEN: bi(
    'Ouvrez un service pour encaisser, rembourser ou enregistrer un paiement.',
    'Open a shift to complete a sale, process a refund, or record a payment.',
  ),
  CONCURRENT_UPDATE: bi(
    'Enregistrement modifié par une autre opération. Réessayez.',
    'This record was modified by another operation. Please try again.',
  ),
  RECEIPT_GENERATION_FAILED: bi(
    'Impossible de générer le numéro de ticket. Réessayez.',
    'Unable to generate receipt number. Please try again.',
  ),
  INVALID_ADJUSTMENT_SIGN: bi(
    'Les ajustements dommage, perte et péremption doivent réduire le stock.',
    'Damage, loss, and expiry adjustments must reduce stock (negative quantity).',
  ),
  ADJUSTMENT_NEGATIVE_RESULT: bi(
    'Cet ajustement entraînerait un stock négatif.',
    'This adjustment would result in negative stock.',
  ),
  INVALID_QUANTITY: bi(
    'Entrez une quantité valide supérieure à zéro.',
    'Please enter a valid quantity greater than zero.',
  ),
  INVALID_AMOUNT: bi(
    'Entrez un montant valide supérieur à zéro.',
    'Please enter a valid amount greater than zero.',
  ),
  CART_EMPTY: bi(
    'Votre panier est vide. Ajoutez des produits avant de payer.',
    'Your cart is empty. Add products before checking out.',
  ),
  PRODUCT_NOT_FOUND: bi('Produit introuvable.', 'Product not found.'),
  UNIT_NOT_FOUND: bi(
    'Unité de vente introuvable pour ce produit.',
    'Unit configuration not found for this product.',
  ),
  CATEGORY_NAME_CONFLICT: bi(
    'Une catégorie porte déjà ce nom sous le même parent.',
    'A category with this name already exists in the same parent.',
  ),
  DUPLICATE_PRODUCT_NAME: bi(
    'Un produit porte déjà ce nom dans ce dépôt.',
    'A product with this name already exists in this depot.',
  ),
  STAFF_ALREADY_DEACTIVATED: bi(
    'Ce compte personnel est déjà désactivé.',
    'This staff account is already deactivated.',
  ),
  CANNOT_DEACTIVATE_SELF: bi(
    'Vous ne pouvez pas désactiver votre propre compte.',
    'You cannot deactivate your own account.',
  ),
  LAST_ADMIN_REQUIRED: bi(
    'Le dernier administrateur actif ne peut pas être désactivé ou rétrogradé.',
    'The last active admin cannot be deactivated or demoted.',
  ),
  STAFF_HAS_OPEN_SHIFT: bi("Cet employé a un service ouvert. Fermez-le d'abord.", 'This staff member has an open shift. Close it first.'),
  AUTH_SYNC_FAILED: bi("Compte mis à jour, mais l'accès n'est pas synchronisé. Réessayez.", 'Account updated, but login not synced. Try again.'),
  STAFF_ROLE_SLOT_TAKEN: bi(
    'Ce dépôt a déjà un membre actif pour ce rôle.',
    'This depot already has an active staff member in that role.',
  ),
  USERNAME_TAKEN: bi(
    'Ce nom d\'utilisateur est déjà pris.',
    'That username is already taken.',
  ),
  DEPOT_HAS_ACTIVE_STAFF: bi(
    'Ce dépôt a encore du personnel actif.',
    'This depot still has active staff assigned.',
  ),
  DEPOT_HAS_OPEN_SHIFTS: bi(
    'Ce dépôt a des services ouverts. Fermez-les avant de désactiver.',
    'This depot has open shifts. Close them before deactivating.',
  ),
  DEPOT_HAS_PENDING_TRANSFERS: bi(
    'Ce dépôt a des transferts en attente.',
    'This depot has pending transfers.',
  ),
  DEPOT_CODE_CONFLICT: bi(
    'Un dépôt avec ce code existe déjà.',
    'A depot with this code already exists.',
  ),
  CATEGORY_HAS_ACTIVE_CHILDREN: bi(
    'Cette catégorie a des sous-catégories actives.',
    'This category has active child categories.',
  ),
  CATEGORY_HAS_ACTIVE_PRODUCTS: bi(
    'Cette catégorie contient encore des produits actifs.',
    'This category still has active products.',
  ),
  CATEGORY_INACTIVE: bi(
    'Cette catégorie est inactive.',
    'This category is inactive.',
  ),
  PRODUCT_IN_PENDING_TRANSFER: bi(
    'Ce produit est sur un transfert en attente.',
    'This product is on a pending transfer.',
  ),
  INVALID_PHOTO_URL: bi(
    'Téléversez une photo produit depuis cet appareil.',
    'Upload a product photo from this device.',
  ),
  INVALID_LOGO_URL: bi(
    'Le logo doit être une URL HTTPS.',
    'Logo must be an HTTPS URL.',
  ),
  INVALID_EXCHANGE_RATE: bi(
    'Entrez un taux CFA/USD valide supérieur à zéro.',
    'Enter a valid CFA per USD rate greater than zero.',
  ),
  UNIT_LEVEL_REQUIRED: bi(
    'Chaque produit doit avoir au moins une unité de vente.',
    'Each product needs at least one selling unit.',
  ),
  INVALID_CONVERSION: bi(
    'La conversion doit être positive. La plus petite unité doit valoir 1.',
    'Unit conversion must be a positive number. The smallest selling unit must convert as 1.',
  ),
  INVALID_INPUT: bi(
    'Saisie invalide. Vérifiez vos entrées.',
    'Invalid input. Please check your entries and try again.',
  ),
  DUPLICATE_TRANSFER_LINE: bi(
    'Chaque produit source ne peut apparaître qu\'une fois sur un transfert.',
    'Each source product may appear only once on a transfer.',
  ),
  UNKNOWN: bi(
    'Une erreur est survenue. Veuillez réessayer.',
    'An unexpected error occurred. Please try again.',
  ),
}

const CASH_REFUND_MISMATCH_REASON = 'cash_refund_does_not_match_computed'
const CASH_REFUND_MISMATCH_BI = bi(
  'Le remboursement espèces ne correspond pas au montant calculé. Vérifiez l\'aperçu.',
  'Cash refund does not match the calculated refund. Review the refund preview and try again.',
)

export function messageForCodeBilingual(
  code: VhmErrorCode,
  details?: Record<string, unknown>,
): BilingualPair {
  if (code === 'INVALID_AMOUNT' && details?.reason === CASH_REFUND_MISMATCH_REASON) {
    return CASH_REFUND_MISMATCH_BI
  }
  if (code === 'INVALID_AMOUNT' && details?.reason === 'refund_exceeds_line') {
    return bi(
      'Le montant du retour dépasse la valeur des articles sélectionnés.',
      'Refund amount exceeds the value of the selected items.',
    )
  }
  if (code === 'INVALID_AMOUNT' && details?.reason === 'refund_amount_cannot_be_negative') {
    return bi(
      'Le montant du retour ne peut pas être négatif.',
      'Refund amount cannot be negative.',
    )
  }
  if (code === 'INVALID_AMOUNT' && details?.reason === 'refund_amount_invalid') {
    return bi(
      'Entrez un montant de retour valide.',
      'Enter a valid refund amount.',
    )
  }
  if (code === 'UNAUTHORIZED' && details?.reason === 'zero_total_requires_admin') {
    return bi(
      'Un total de 0 CFA doit être validé par un administrateur.',
      'A total of CFA 0 must be approved by an administrator.',
    )
  }
  if (code === 'INVALID_AMOUNT' && details?.reason === 'override_total_out_of_range') {
    return bi(
      'Le total modifié doit être entre 1 et le total calculé.',
      'Adjusted total must be between 1 and the calculated total.',
    )
  }
  if (code === 'INVALID_INPUT' && details?.reason === 'override_requires_reason') {
    return bi(
      'Indiquez un motif pour modifier le total.',
      'Enter a reason to adjust the total.',
    )
  }
  if (code === 'INVALID_INPUT' && details?.reason === 'zero_total_requires_reason') {
    return bi(
      'Indiquez un motif pour un total de 0 CFA.',
      'Enter a reason for a total of CFA 0.',
    )
  }
  if (code === 'INVALID_INPUT' && details?.reason === 'low_stock_threshold_required') {
    return bi(
      'Entrez un seuil de stock faible lorsque le suivi est activé.',
      'Enter a low-stock threshold when tracking is on.',
    )
  }
  if (code === 'INVALID_INPUT' && details?.reason === 'low_stock_threshold_invalid') {
    return bi(
      'Le seuil de stock faible doit être ≥ 0.',
      'Low-stock threshold must be 0 or greater.',
    )
  }
  if (code === 'INSUFFICIENT_STOCK' && details?.available_pieces != null) {
    const n = Number(details.available_pieces)
    if (Number.isFinite(n)) {
      const qty = parseFloat(n.toFixed(3))
      return bi(
        `Stock insuffisant. Seulement ${qty} disponibles.`,
        `Stock changed. Only ${qty} available.`,
      )
    }
  }
  return ERROR_MESSAGES_BI[code] ?? ERROR_MESSAGES_BI.UNKNOWN
}

export function messageForCodePlain(
  code: VhmErrorCode,
  details?: Record<string, unknown>,
): string {
  return bilingualPlain(messageForCodeBilingual(code, details))
}

/** French map matching production UI (messageForCodePlain). */
export function errorMessagesFrench(): Record<VhmErrorCode, string> {
  return Object.fromEntries(
    Object.entries(ERROR_MESSAGES_BI).map(([k, v]) => [k, v.fr]),
  ) as Record<VhmErrorCode, string>
}

/** English-only map for catalogs and bilingual pair access. */
export function errorMessagesEnglish(): Record<VhmErrorCode, string> {
  return Object.fromEntries(
    Object.entries(ERROR_MESSAGES_BI).map(([k, v]) => [k, v.en]),
  ) as Record<VhmErrorCode, string>
}
