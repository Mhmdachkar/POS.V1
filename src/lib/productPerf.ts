/**
 * Dev-only product-management timing. No-ops in production builds.
 * Marks are visible in the Performance panel and as console.debug lines.
 */

export function productPerfMark(label: string, extra?: Record<string, unknown>): void {
  if (!import.meta.env.DEV) return
  const t = Math.round(performance.now())
  performance.mark(label)
  if (extra) {
    console.debug(`[product-perf ${t}ms]`, label, extra)
  } else {
    console.debug(`[product-perf ${t}ms]`, label)
  }
}

export function productPerfMeasure(name: string, startMark: string, endMark: string): void {
  if (!import.meta.env.DEV) return
  try {
    performance.measure(name, startMark, endMark)
    const entries = performance.getEntriesByName(name)
    const last = entries[entries.length - 1]
    if (last) {
      console.debug(`[product-perf] ${name}: ${Math.round(last.duration)}ms`)
    }
  } catch {
    /* missing marks */
  }
}
