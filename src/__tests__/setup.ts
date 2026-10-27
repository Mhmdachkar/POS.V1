Element.prototype.scrollIntoView = function () {}
/**
 * Vitest global setup — runs before every test file.
 */
import { afterEach } from 'vitest'
import '@testing-library/jest-dom'
import { useLocaleStore } from '@/stores/localeStore'

afterEach(() => {
  vi.useRealTimers()
  useLocaleStore.setState({ locale: 'fr' })
  try {
    localStorage.setItem('vhm-pos-locale', 'fr')
  } catch {
    /* jsdom */
  }
})

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as typeof ResizeObserver
}

// ─── Mock Supabase client ────────────────────────────────────────
// The Supabase client makes real network calls. We intercept it
// at the module level so tests stay offline and deterministic.
//
// Individual tests can override specific methods via vi.mocked().

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: {
          subscription: { unsubscribe: vi.fn() },
        },
      }),
    },
    from:  vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    gte:    vi.fn().mockReturnThis(),
    lte:    vi.fn().mockReturnThis(),
    gt:     vi.fn().mockReturnThis(),
    neq:    vi.fn().mockReturnThis(),
    in:     vi.fn().mockReturnThis(),
    or:     vi.fn().mockReturnThis(),
    limit:  vi.fn().mockReturnThis(),
    range:  vi.fn().mockReturnThis(),
    order:  vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null, count: 0 }).then(resolve),
    rpc:    vi.fn().mockResolvedValue({ data: null, error: null }),
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'photo.jpg' }, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({
          data: { publicUrl: 'https://cdn.example.com/product-photos/photo.jpg' },
        }),
      })),
    },
  },
}))

if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:mock-product-photo'
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {}
}
