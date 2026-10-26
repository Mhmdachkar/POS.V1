import { useState } from 'react'
import { ShieldOff, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { LoadingButton } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { AUTH } from '@/lib/bilingual/auth'
import { BiButtonStack, BiPageDescription, BiPageTitle } from '@/lib/bilingual/ui'
import { toastErrorBi } from '@/lib/bilingual/toast'
import { t, bilingualPlain } from '@/lib/bilingual/types'

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
 * message and letting the user understand WHY they're being signed out.
 */
export function DeactivatedPage() {
  const [isSigningOut, setIsSigningOut] = useState(false)
  const staffName = useAuthStore((s) => s.staff?.full_name)

  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      const { error } = await supabase.auth.signOut()
      if (error) {
        toastErrorBi(AUTH.signOutFailed)
        console.error('[DeactivatedPage] signOut error:', error)
      }
      // AuthProvider's SIGNED_OUT handler will call clear() and
      // transition authLoadState → 'unauthenticated' → /login redirect
    } catch (err) {
      toastErrorBi(AUTH.signOutUnexpected)
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
          <ShieldOff className="h-8 w-8 text-danger-foreground" />
        </div>

        {/* Heading */}
        <div className="text-2xl font-bold text-text-primary mb-2">
          <BiPageTitle {...AUTH.accountDeactivated} />
        </div>

        <div className="mb-2">
          <BiPageDescription
            {...(staffName ? AUTH.accountDeactivatedNamed(staffName) : AUTH.accountDeactivatedBody)}
          />
        </div>
        <div className="mb-8">
          <BiPageDescription {...AUTH.contactAdmin} />
        </div>

        {/* Sign out */}
        <LoadingButton
          onClick={handleSignOut}
          variant="danger"
          size="lg"
          loading={isSigningOut}
          loadingLabel={bilingualPlain(AUTH.signingOut)}
          className="w-full"
        >
          <LogOut className="h-4 w-4 mr-2" />
          <BiButtonStack {...AUTH.signOut} />
        </LoadingButton>

        <BilingualText {...AUTH.systemTagline} variant="caption" className="text-text-muted mt-6" />
      </div>
    </div>
  )
}
