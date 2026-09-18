import type { PrintJobStatus } from '@/lib/printPayload'

export function printJobStatusLabel(status: PrintJobStatus): string {
  switch (status) {
    case 'queued':
      return 'En file'
    case 'claimed':
      return 'Pris en charge'
    case 'sent':
      return 'Envoyé à l\'imprimante'
    case 'failed':
      return 'Échec'
    default:
      return status
  }
}

export function canRequeuePrintJob(status: PrintJobStatus): boolean {
  return status === 'failed' || status === 'sent' || status === 'queued'
}
