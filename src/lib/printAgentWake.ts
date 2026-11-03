/** Local print agent. One health check; no /wake while it is known offline. */

const DEFAULT_PORT = 9277

export type PrintAgentStatus = 'unknown' | 'online' | 'offline'

let status: PrintAgentStatus = 'unknown'
let probe: Promise<PrintAgentStatus> | null = null
const listeners = new Set<() => void>()

function emit(next: PrintAgentStatus) {
  status = next
  listeners.forEach((listener) => listener())
}

export function getPrintAgentStatus(): PrintAgentStatus {
  return status
}

export function subscribePrintAgentStatus(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function resetPrintAgentStatusForTests(): void {
  status = 'unknown'
  probe = null
  listeners.clear()
}

async function healthOk(port: number): Promise<boolean> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 800)
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
    })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Probe /health. Callers that already know the agent is offline should not call this on every sale. */
export function refreshPrintAgentStatus(port = DEFAULT_PORT): Promise<PrintAgentStatus> {
  if (probe) return probe
  probe = healthOk(port)
    .then((ok) => {
      const next: PrintAgentStatus = ok ? 'online' : 'offline'
      emit(next)
      return next
    })
    .finally(() => {
      probe = null
    })
  return probe
}

/** Wake only when the last probe said the agent is up. A failed probe does not call /wake. */
export async function wakeLocalPrintAgent(port = DEFAULT_PORT): Promise<void> {
  if (status === 'offline') return
  if (status !== 'online') {
    const next = await refreshPrintAgentStatus(port)
    if (next !== 'online') return
  }
  void fetch(`http://127.0.0.1:${port}/wake`, { method: 'POST', mode: 'no-cors' }).catch(() => {
    /* agent optional */
  })
}
