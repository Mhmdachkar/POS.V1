/**
 * Depot-scoped POS catalog stock lookup (UX only — not a second authority).
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { ProductWithUnits } from '@/types'

export type PosStockLookup = {
  /** null when stock is unknown (allow; server still wins). */
  getAvailablePieces: (productId: string) => number | null
  catalogById: Map<string, ProductWithUnits>
}

const PosStockContext = createContext<PosStockLookup | null>(null)

export function buildCatalogStockMap(
  products: ProductWithUnits[] | null | undefined,
): Map<string, ProductWithUnits> {
  const map = new Map<string, ProductWithUnits>()
  for (const p of products ?? []) {
    map.set(p.id, p)
  }
  return map
}

export function createPosStockLookup(
  catalog: Map<string, ProductWithUnits>,
  detailFallback?: (productId: string) => number | null | undefined,
): PosStockLookup {
  return {
    catalogById: catalog,
    getAvailablePieces: (productId: string) => {
      const fromCatalog = catalog.get(productId)
      if (fromCatalog) return Number(fromCatalog.current_stock_pieces)
      const fromDetail = detailFallback?.(productId)
      if (fromDetail != null) return Number(fromDetail)
      return null
    },
  }
}

const emptyLookup: PosStockLookup = {
  catalogById: new Map(),
  getAvailablePieces: () => null,
}

export function usePosCatalogStock(): PosStockLookup {
  return useContext(PosStockContext) ?? emptyLookup
}

export function PosStockProvider({
  products,
  children,
}: {
  products: ProductWithUnits[] | null | undefined
  children: ReactNode
}) {
  const value = useMemo(() => {
    const catalog = buildCatalogStockMap(products)
    return createPosStockLookup(catalog)
  }, [products])

  return (
    <PosStockContext.Provider value={value}>{children}</PosStockContext.Provider>
  )
}
