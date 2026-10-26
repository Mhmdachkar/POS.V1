import { bi, type BilingualPair } from '@/lib/bilingual/types'

/** Shown at top of forms when submit is blocked — tells users what to fix. */
export const FORM_GUIDANCE = {
  completeBeforeSubmit: bi(
    'Completez les etapes ci-dessous, puis reessayez.',
    'Complete the steps below, then try again.',
  ),
  checkRequiredFields: bi(
    'Remplissez tous les champs obligatoires marques *.',
    'Fill in all required fields marked with *.',
  ),

  productPhoto: bi(
    'Ajoutez une photo produit (pas l image placeholder grise).',
    'Add a product photo (not the grey placeholder).',
  ),
  productCategory: bi(
    'Choisissez une categorie dans la liste.',
    'Choose a category from the list.',
  ),
  productUnits: bi(
    'Pour chaque unite activee (Piece / Paquet / Carton) : nom, numero de serie, prix d achat et prix de vente. Paquet : pieces par paquet. Carton : paquets par carton (activez Paquet d abord).',
    'For each enabled unit (Piece / Package / Carton): name, serial number, cost and sell price. Package: pieces per package. Carton: packages per carton (enable Package first).',
  ),
  productDepot: bi(
    'Selectionnez un depot en haut de la page Inventaire avant de creer le produit.',
    'Select a depot at the top of the Inventory page before creating the product.',
  ),
  lowStockThreshold: bi(
    'Si le suivi stock bas est active, entrez un seuil en pieces (> 0).',
    'If low-stock tracking is on, enter a threshold in pieces (> 0).',
  ),

  adjustmentUnit: bi(
    'Choisissez l unite (piece, paquet ou carton), puis entrez la quantite dans cette unite.',
    'Choose the unit (piece, package, or carton), then enter the quantity in that unit.',
  ),
  adjustmentQtyReduction: bi(
    'Pour Dommage / Perte / Peremption : entrez une quantite positive a retirer.',
    'For Damage / Loss / Expiry: enter a positive quantity to remove.',
  ),
  adjustmentQtySigned: bi(
    'Pour Correction d inventaire : utilisez + pour ajouter ou - pour retirer (dans l unite choisie).',
    'For Count correction: use + to add or - to remove (in the selected unit).',
  ),
  adjustmentReasonOther: bi(
    'Pour le type Autre, decrivez le motif dans le champ Raison.',
    'For type Other, describe the reason in the Reason field.',
  ),

  restockUnitQty: bi(
    'Choisissez l unite de reapprovisionnement, puis une quantite superieure a zero.',
    'Choose the restock unit, then enter a quantity greater than zero.',
  ),

  transferDepots: bi(
    'Choisissez un depot source et un depot destination (differents).',
    'Choose a source depot and a destination depot (they must differ).',
  ),
  transferLines: bi(
    'Pour chaque ligne : produit source, produit destination, unite et quantite > 0.',
    'For each line: source product, destination product, unit, and quantity > 0.',
  ),
  transferDuplicate: bi(
    'Chaque produit source ne peut apparaitre qu une seule fois — supprimez les lignes en double.',
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
  staffFullName: bi(
    'Entrez le nom affiche du membre du personnel.',
    'Enter the staff member display name.',
  ),
  staffPassword: bi(
    'Definissez un mot de passe pour le nouveau compte.',
    'Set a password for the new account.',
  ),
  staffDepot: bi(
    'Pour caissier ou personnel depot : selectionnez le depot assigne.',
    'For cashier or depot staff: select the assigned depot.',
  ),
} as const satisfies Record<string, BilingualPair>