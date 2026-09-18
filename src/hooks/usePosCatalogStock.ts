/**
 * Re-export stock lookup for hooks consumers.
 * Implementation lives in PosStockProvider (JSX).
 */

export {
  buildCatalogStockMap,
  createPosStockLookup,
  usePosCatalogStock,
  type PosStockLookup,
} from '@/components/pos/PosStockProvider'
