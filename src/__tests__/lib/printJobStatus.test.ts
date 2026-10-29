import { describe, expect, it } from 'vitest'
import {
  canRequeuePrintJob,
  isStaleQueuedPrintJob,
  printJobStatusLabel,
  STALE_QUEUED_PRINT_MS,
} from '@/lib/printJobStatus'

describe('printJobStatus', () => {
  it('labels honest statuses', () => {
    expect(printJobStatusLabel('queued')).toBe('En file')
    expect(printJobStatusLabel('claimed')).toBe('Pris en charge')
    expect(printJobStatusLabel('sent')).toBe("Envoyé à l'imprimante")
    expect(printJobStatusLabel('failed')).toBe('Échec')
  })

  it('labels stale queued jobs as Non imprimé', () => {
    const now = new Date('2026-10-29T12:00:00.000Z')
    const stale = new Date(now.getTime() - STALE_QUEUED_PRINT_MS - 1).toISOString()
    const fresh = new Date(now.getTime() - STALE_QUEUED_PRINT_MS + 60_000).toISOString()
    expect(isStaleQueuedPrintJob('queued', stale, now)).toBe(true)
    expect(printJobStatusLabel('queued', stale, now)).toBe('Non imprimé')
    expect(printJobStatusLabel('queued', fresh, now)).toBe('En file')
    expect(printJobStatusLabel('sent', stale, now)).toBe("Envoyé à l'imprimante")
  })

  it('allows requeue for failed and sent', () => {
    expect(canRequeuePrintJob('failed')).toBe(true)
    expect(canRequeuePrintJob('sent')).toBe(true)
    expect(canRequeuePrintJob('queued')).toBe(true)
    expect(canRequeuePrintJob('claimed')).toBe(false)
  })
})
