/**
 * Vitest global setup — runs before every test file.
 */
import '@testing-library/jest-dom'

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
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    rpc:    vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}))
