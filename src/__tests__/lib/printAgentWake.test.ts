import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  acknowledgePrintQueue,
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

describe('acknowledgePrintQueue', () => {
  it('returns queued and wakes when the agent is online', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/health')) return new Response('{}', { status: 200 })
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(acknowledgePrintQueue()).resolves.toBe('queued')
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/wake'))).toBe(true)
  })

  it('returns offline and does not wake when the agent is down', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).endsWith('/health')) throw new Error('refused')
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(acknowledgePrintQueue()).resolves.toBe('offline')
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith('/wake'))).toBe(false)
  })
})
