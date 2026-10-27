import { bi, t } from '@/lib/bilingual/types'

const UNIT_ALIASES: Record<string, { fr: string; en: string }> = {
  piece: bi('Pièce', 'Piece'),
  pieces: bi('Pièces', 'Pieces'),
  pièce: bi('Pièce', 'Piece'),
  pièces: bi('Pièces', 'Pieces'),
  package: bi('Paquet', 'Package'),
  packages: bi('Paquets', 'Packages'),
  paquet: bi('Paquet', 'Package'),
  paquets: bi('Paquets', 'Packages'),
  carton: bi('Carton', 'Carton'),
  cartons: bi('Cartons', 'Cartons'),
}

const LEVEL_FALLBACK = [
  UNIT_ALIASES.piece,
  UNIT_ALIASES.package,
  UNIT_ALIASES.carton,
] as const

/** Localized packing unit for display. Custom unit names stay as stored. */
export function localizedUnitLabel(
  unitName: string | null | undefined,
  unitLevel?: number,
): string {
  const raw = unitName?.trim()
  if (raw) {
    const pair = UNIT_ALIASES[raw.toLowerCase()]
    if (pair) return t(pair)
    return raw
  }
  const fallback = LEVEL_FALLBACK[unitLevel ?? 0] ?? UNIT_ALIASES.piece
  return t(fallback)
}

export function productInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}
