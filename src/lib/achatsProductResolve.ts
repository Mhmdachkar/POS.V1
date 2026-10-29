import type { ProductWithUnits } from '@/types'
import type { ProductUnit } from '@/types/database'

export interface AchatsResolveHit {
  product: ProductWithUnits
  unit: ProductUnit
  score: number
  matchLabel: 'exact_code' | 'code_prefix' | 'code_contains' | 'name_prefix' | 'name_contains'
}

function unitForProduct(p: ProductWithUnits, preferredLevel?: number): ProductUnit | null {
  if (preferredLevel != null) {
    const exact = p.units.find((u) => u.unit_level === preferredLevel)
    if (exact) return exact
  }
  return p.units.find((u) => u.unit_level === 0) ?? p.units[0] ?? null
}

/** Rank catalog hits: exact code, code prefix, code contains, name prefix, name contains. */
export function rankAchatsProductHits(
  query: string,
  hits: ProductWithUnits[],
): AchatsResolveHit[] {
  const needle = query.trim().toLowerCase()
  if (!needle || hits.length === 0) return []

  const ranked: AchatsResolveHit[] = []

  for (const product of hits) {
    let best: AchatsResolveHit | null = null

    for (const unit of product.units) {
      const code = unit.serial_number?.trim().toLowerCase() ?? ''
      if (!code) continue
      let score: number | null = null
      let matchLabel: AchatsResolveHit['matchLabel'] | null = null
      if (code === needle) {
        score = 0
        matchLabel = 'exact_code'
      } else if (code.startsWith(needle)) {
        score = 100 + (code.length - needle.length)
        matchLabel = 'code_prefix'
      } else if (code.includes(needle)) {
        score = 200 + code.indexOf(needle) + (code.length - needle.length)
        matchLabel = 'code_contains'
      }
      if (score == null || !matchLabel) continue
      const candidate: AchatsResolveHit = { product, unit, score, matchLabel }
      if (!best || candidate.score < best.score) best = candidate
    }

    const name = product.name.trim().toLowerCase()
    if (name) {
      let score: number | null = null
      let matchLabel: AchatsResolveHit['matchLabel'] | null = null
      if (name.startsWith(needle)) {
        score = 300 + (name.length - needle.length)
        matchLabel = 'name_prefix'
      } else if (name.includes(needle)) {
        score = 400 + name.indexOf(needle) + (name.length - needle.length)
        matchLabel = 'name_contains'
      }
      if (score != null && matchLabel) {
        const unit = unitForProduct(product)
        if (unit) {
          const candidate: AchatsResolveHit = { product, unit, score, matchLabel }
          if (!best || candidate.score < best.score) best = candidate
        }
      }
    }

    if (best) ranked.push(best)
  }

  return ranked.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score
    return a.product.name.localeCompare(b.product.name)
  })
}

export function resolveNearestAchatsProduct(
  query: string,
  hits: ProductWithUnits[],
): AchatsResolveHit | null {
  return rankAchatsProductHits(query, hits)[0] ?? null
}