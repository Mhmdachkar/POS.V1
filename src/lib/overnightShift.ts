/**
 * Open shift opened on a previous Africa/Abidjan calendar day.
 */

import { ymdInDisplayTimeZone } from '@/lib/formatters'

export function isOvernightOpenShift(
  openedAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!openedAt) return false
  return ymdInDisplayTimeZone(openedAt) < ymdInDisplayTimeZone(now)
}
