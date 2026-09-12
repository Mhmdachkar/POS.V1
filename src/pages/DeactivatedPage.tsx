import { useState } from 'react'
import { ShieldOff, LogOut } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { LoadingButton } from '@/components/ui'

/**
 * DeactivatedPage — shown when staff.is_active = false.
 *
 * This page renders INSIDE AuthGuard (not as a separate route) when
 * authLoadState transitions to 'deactivated'. The URL does not change.
 *
 * The user sees a clear message explaining their account was deactivated
 * and a "Sign out" button. They must consciously initiate sign-out.
 *
 * After clicking "Sign out":
 *   1. supabase.auth.signOut() is called.
 *   2. AuthProvider's onAuthStateChange handler fires (SIGNED_OUT).
 *   3. AuthProvider calls clear() → authLoadState = 'unauthenticated'.
 *   4. AuthGuard redirects to /login.
 *
 * Design decision: No automatic sign-out. Showing the deactivated
 * message and letting the user acknowledge it is better UX and
 * ensures they understand WHY they're being signed out.
 */
export function DeactivatedPage() {
  const [isSigningOut, setIsSigningOut] = useState(false)
  const staffName = useAuthStore((s) => s.staff?.full_name)

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        toast.error('Sign-out failed. Please close the browser tab.')
        console.error('[DeactivatedPage] signOut error:', error)
      }
      // AuthProvider's SIGNED_OUT handler will call clear() and
      // transition authLoadState → 'unauthenticated' → /login redirect
    } catch (err) {
      toast.error('Unexpected error during sign-out.')
      console.error('[DeactivatedPage] unexpected error:', err)
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm text-center">

        {/* Icon */}
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-danger/10 mb-6 mx-auto">
          <ShieldOff className="h-8 w-8 text-danger" />
        </div>

        {/* Heading */}
        <h1 className="text-2xl font-bold text-text-primary mb-2">
          Account Deactivated
        </h1>

        {/* Message */}
        <p className="text-text-secondary text-sm leading-relaxed mb-2">
          {staffName
            ? <>Your account (<strong className="text-text-primary">{staffName}</strong>) has been deactivated.</>
            : 'Your account has been deactivated.'
          }
        </p>
        <p className="text-text-secondary text-sm leading-relaxed mb-8">
          Please contact your system administrator to restore access.
        </p>

        {/* Sign out */}
        <LoadingButton
          onClick={handleSignOut}
          variant="danger"
          size="lg"
          loading={isSigningOut}
          loadingLabel="Signing out…"
          className="w-full"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </LoadingButton>

        <p className="text-xs text-text-muted mt-6">
          VHM Multi-Depot POS &amp; Inventory System
        </p>
      </div>
    </div>
  )
}
