import { describe, expect, it } from 'vitest'
import { canRequeuePrintJob, printJobStatusLabel } from '@/lib/printJobStatus'

describe('printJobStatus', () => {
  it('labels honest statuses', () => {
    expect(printJobStatusLabel('queued')).toBe('En file')
    expect(printJobStatusLabel('claimed')).toBe('Pris en charge')
    expect(printJobStatusLabel('sent')).toBe("Envoyé à l'imprimante")
    expect(printJobStatusLabel('failed')).toBe('Échec')
  })

  it('allows requeue for failed and sent', () => {
    expect(canRequeuePrintJob('failed')).toBe(true)
    expect(canRequeuePrintJob('sent')).toBe(true)
    expect(canRequeuePrintJob('queued')).toBe(true)
    expect(canRequeuePrintJob('claimed')).toBe(false)
  })
})
