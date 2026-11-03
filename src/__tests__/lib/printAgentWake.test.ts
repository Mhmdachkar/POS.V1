import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  refreshPrintAgentStatus,
  resetPrintAgentStatusForTests,
  wakeLocalPrintAgent,
} from '@/lib/printAgentWake'

afterEach(() => {
  resetPrintAgentStatusForTests()
  vi.unstubAllGlobals()
})

describe('wakeLocalPrintAgent', () => {
  it('does not call /wake when the agent is offline, and does not probe again', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/health')) throw new Error('refused')
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await wakeLocalPrintAgent()
    await wakeLocalPrintAgent()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/health')
  })

  it('posts /wake only after health succeeds', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/health')) return new Response('{}', { status: 200 })
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await refreshPrintAgentStatus()
    await wakeLocalPrintAgent()

    const urls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(urls.filter((url) => url.endsWith('/health'))).toHaveLength(1)
    expect(urls.filter((url) => url.endsWith('/wake'))).toHaveLength(1)
  })
})
