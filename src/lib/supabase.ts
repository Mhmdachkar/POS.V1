import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { AUTH_STORAGE_KEY, authSessionStorage } from '@/lib/authSessionStorage'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase environment variables.\n' +
    'Copy .env.example to .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.',
  )
}

/**
 * Supabase client — single instance for the entire application.
 *
 * Auth configuration:
 * - persistSession + sessionStorage → tokens survive in-tab refresh only;
 *   closing the tab/browser ends the session and requires login again.
 * - autoRefreshToken: true → client refreshes the JWT before it expires.
 * - detectSessionInUrl: true → handles magic-link / OAuth callbacks via URL
 *   hash (not used by this app but harmless to keep on).
 *
 * IMPORTANT: This client uses the anon key and is subject to RLS policies.
 * All privileged mutations happen through Supabase Edge Functions that use
 * the service-role key internally. Never expose the service-role key here.
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: authSessionStorage,
    storageKey: AUTH_STORAGE_KEY,
  },
})
