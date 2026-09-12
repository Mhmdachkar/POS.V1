import { useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useDepotStore } from '@/stores/depotStore'
import type { Staff } from '@/types/database'

/**
 * AuthProvider — subscribes to Supabase auth state changes and
 * fetches the staff record from the database to populate authStore.
 *
 * IMPORTANT: We fetch the staff record from the database on every
 * session change — not just from JWT claims. This ensures:
 * 1. is_active is always current (deactivated staff are blocked).
 * 2. Role and depot_id are authoritative from the DB.
 * 3. JWT claims cannot be manipulated to bypass authorization.
 *
 * JWT app_metadata claims are used by Supabase RLS policies for
 * performance, but Edge Functions always re-verify from the DB.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setSession, setStaff, setLoading, clear } = useAuthStore()
  const clearDepot = useDepotStore((s) => s.clear)
  const setCurrentDepot = useDepotStore((s) => s.setCurrentDepot)

  async function fetchStaff(userId: string): Promise<Staff | null> {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .eq('id', userId)
      .single()

    if (error || !data) return null
    return data as Staff
  }

  async function handleSession(session: Session | null) {
    if (!session) {
      clear()
      clearDepot()
      return
    }

    setSession(session)

    // Fetch staff record — authoritative source for role, depot, active state
    const staff = await fetchStaff(session.user.id)

    if (!staff || !staff.is_active) {
      // Staff deactivated or not found — sign out immediately
      await supabase.auth.signOut()
      clear()
      clearDepot()
      return
    }

    setStaff(staff)

    // Set initial depot context based on role
    if (staff.role !== 'admin' && staff.depot_id) {
      // Cashier and depot_staff: locked to their assigned depot
      // Depot name resolved later by a depot query hook
      setCurrentDepot(staff.depot_id, null)
    }
    // Admin: depot context defaults to null (All Depots) until they select one
  }

  useEffect(() => {
    // 1. Check existing session on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session).finally(() => setLoading(false))
    })

    // 2. Subscribe to auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        handleSession(session).finally(() => setLoading(false))
      },
    )

    return () => {
      subscription.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}
