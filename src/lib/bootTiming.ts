/** Boot performance markers — enable with ?boot=1 or localStorage boot-timing=1 */

const BOOT_TIMING_ENABLED =
  import.meta.env.DEV
  || (typeof window !== 'undefined'
    && (new URLSearchParams(window.location.search).get('boot') === '1'
      || window.localStorage?.getItem('boot-timing') === '1'))

const started = new Set<string>()

export function bootMark(label: string): void {
  if (!BOOT_TIMING_ENABLED) return
  const key = `[boot] ${label}`
  if (started.has(key)) return
  started.add(key)
  console.time(key)
}

export function bootEnd(label: string): void {
  if (!BOOT_TIMING_ENABLED) return
  const key = `[boot] ${label}`
  if (!started.has(key)) return
  console.timeEnd(key)
  started.delete(key)
}

export function bootLog(message: string, detail?: unknown): void {
  if (!BOOT_TIMING_ENABLED) return
  if (detail !== undefined) console.log(`[boot] ${message}`, detail)
  else console.log(`[boot] ${message}`)
}
