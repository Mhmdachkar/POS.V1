import type { PrintJobStatus } from '@/lib/printPayload'

/** Queued jobs older than this are shown as not printed (agent never claimed). */
export const STALE_QUEUED_PRINT_MS = 60 * 60 * 1000

export function isStaleQueuedPrintJob(
  status: PrintJobStatus,
  createdAt: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (status !== 'queued' || !createdAt) return false
  const created = new Date(createdAt).getTime()
  if (Number.isNaN(created)) return false
  return now.getTime() - created >= STALE_QUEUED_PRINT_MS
}

export function printJobStatusLabel(
  status: PrintJobStatus,
  createdAt?: string | null,
  now: Date = new Date(),
): string {
  if (isStaleQueuedPrintJob(status, createdAt, now)) {
    return 'Non imprimé'
  }
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
