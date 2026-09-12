import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

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
 * - persistSession: true  → tokens stored in localStorage so page refresh
 *   doesn't force re-login.
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
    storageKey: 'vhm-pos-auth',
  },
})
