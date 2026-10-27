import { bi, type BilingualPair } from '@/lib/bilingual/types'

/** Shown at top of forms when submit is blocked — tells users what to fix. */
export const FORM_GUIDANCE = {
  completeBeforeSubmit: bi(
    'Complétez les étapes ci-dessous, puis réessayez.',
    'Complete the steps below, then try again.',
  ),
  checkRequiredFields: bi(
    'Remplissez tous les champs obligatoires marqués *.',
    'Fill in all required fields marked with *.',
  ),

  productPhoto: bi('Ajoutez une photo du produit.', 'Add a product photo.'),
  productCategory: bi(
    'Choisissez une catégorie dans la liste.',
    'Choose a category from the list.',
  ),
  productUnits: bi('Pour chaque unité active : nom, n° de série, prix d’achat et prix de vente. Paquet : pièces par paquet. Carton : paquets par carton.', 'For each active unit: name, serial no., cost and sale price. Package: pieces per package. Carton: packages per carton.'),
  productDepot: bi(
    'Sélectionnez un dépôt en haut de la page Inventaire avant de créer le produit.',
    'Select a depot at the top of the Inventory page before creating the product.',
  ),
  lowStockThreshold: bi(
    'Si le suivi stock bas est activé, entrez un seuil en pièces (> 0).',
    'If low-stock tracking is on, enter a threshold in pieces (> 0).',
  ),

  adjustmentUnit: bi(
    'Choisissez l’unité (pièce, paquet ou carton), puis entrez la quantité dans cette unité.',
    'Choose the unit (piece, package, or carton), then enter the quantity in that unit.',
  ),
  adjustmentQtyReduction: bi(
    'Pour Dommage / Perte / Péremption : entrez une quantité positive à retirer.',
    'For Damage / Loss / Expiry: enter a positive quantity to remove.',
  ),
  adjustmentQtySigned: bi('Correction : + ajoute, - retire (dans l’unité choisie).', 'Correction: + adds, - removes (in chosen unit).'),
  adjustmentReasonOther: bi(
    'Pour le type Autre, décrivez le motif dans le champ Raison.',
    'For type Other, describe the reason in the Reason field.',
  ),

  restockUnitQty: bi('Choisissez l’unité, puis une quantité > 0.', 'Choose the unit, then a quantity > 0.'),

  transferDepots: bi(
    'Choisissez un dépôt source et un dépôt destination (différents).',
    'Choose a source depot and a destination depot (they must differ).',
  ),
  transferLines: bi(
    'Pour chaque ligne : produit source, produit destination, unité et quantité > 0.',
    'For each line: source product, destination product, unit, and quantity > 0.',
  ),
  transferDuplicate: bi(
    'Chaque produit source ne peut apparaître qu’une seule fois — supprimez les lignes en double.',
    'Each source product can only appear once — remove duplicate lines.',
  ),

  customerName: bi(
    'Entrez le nom complet du client (obligatoire).',
    'Enter the customer full name (required).',
  ),

  staffUsername: bi(
    'Choisissez un identifiant de connexion (lettres, chiffres, . _ -).',
    'Choose a login username (letters, numbers, . _ -).',
  ),
  staffFullName: bi("Entrez le nom de l'employé.", 'Enter the staff name.'),
  staffPassword: bi(
    'Définissez un mot de passe pour le nouveau compte.',
    'Set a password for the new account.',
  ),
  staffDepot: bi('Caissier ou magasinier : choisissez le dépôt.', 'Cashier or stock keeper: choose the depot.'),
} as const satisfies Record<string, BilingualPair>
