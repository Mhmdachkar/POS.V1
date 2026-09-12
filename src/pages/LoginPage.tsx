import { useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore, selectAuthLoadState, selectIsAdmin } from '@/stores/authStore'
import { LoadingButton } from '@/components/ui'
import { cn } from '@/lib/cn'

// ─────────────────────────────────────────────────────────────────
// Validation schema
// ─────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  username: z
    .string()
    .min(1, 'Username is required')
    .max(60, 'Username too long')
    .regex(
      /^[a-zA-Z0-9._-]+$/,
      'Username may only contain letters, numbers, dots, hyphens, and underscores',
    ),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormData = z.infer<typeof loginSchema>

// ─────────────────────────────────────────────────────────────────
// LoginPage
// ─────────────────────────────────────────────────────────────────

/**
 * LoginPage — username/password entry.
 *
 * AUTH FLOW:
 *   1. User submits username + password.
 *   2. LoginPage maps username → synthetic email ({username}@vhm-pos.internal).
 *   3. supabase.auth.signInWithPassword is called.
 *   4. On success: Supabase fires SIGNED_IN auth state change event.
 *   5. AuthProvider's onAuthStateChange handler:
 *        a. Fetches staff record from DB (authoritative).
 *        b. Checks is_active.
 *        c. If active:     transitions to 'authorized' → AuthGuard renders app.
 *        d. If deactivated: transitions to 'deactivated' → AuthGuard renders DeactivatedPage.
 *   6. LoginPage navigates to the intended route after successful signIn.
 *
 * STATE MACHINE INTEGRATION:
 *   If authLoadState is already 'authorized' (user navigated back to /login
 *   while logged in), redirect immediately to their home route.
 *
 * IMPORTANT: This page does NOT call setSession/setStaff directly.
 * AuthProvider owns all state transitions. This avoids duplicated
 * logic and race conditions between the login flow and auth events.
 *
 * SECURITY: The synthetic email pattern is an implementation detail.
 * Real users never see or interact with the @vhm-pos.internal domain.
 */
export function LoginPage() {
  const navigate    = useNavigate()
  const location    = useLocation()
  const [showPassword, setShowPassword] = useState(false)

  const authLoadState = useAuthStore(selectAuthLoadState)
  const isAdmin       = useAuthStore(selectIsAdmin)

  // ALL hooks must be called unconditionally before any early returns
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/'

  // Redirect away if already authorized (user navigated back to /login)
  if (authLoadState === 'authorized') {
    const defaultHome = isAdmin ? '/dashboard' : from === '/login' ? '/' : from
    return <Navigate to={defaultHome} replace />
  }

  async function onSubmit(data: LoginFormData) {
    // Map username → synthetic email (never exposed to users)
    const syntheticEmail = `${data.username.toLowerCase()}@vhm-pos.internal`

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: syntheticEmail,
      password: data.password,
    })

    if (authError) {
      // Show a generic error — never expose whether the username exists
      setError('root', { message: 'Invalid username or password.' })
      return
    }

    // Success: Supabase fires SIGNED_IN event → AuthProvider handles everything.
    // AuthProvider will:
    //   - Fetch staff from DB
    //   - Set authLoadState to 'authorized' OR 'deactivated'
    //   - Trigger AuthGuard re-render (app shows or DeactivatedPage shows)
    //
    // Navigate optimistically: if staff is deactivated, AuthGuard will
    // intercept and show DeactivatedPage before protected content renders.
    toast.success('Signing in…')
    navigate(from === '/login' ? '/' : from, { replace: true })
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-xl bg-primary mb-4">
            <span className="text-primary-foreground text-xl font-bold">V</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">VHM POS</h1>
          <p className="text-sm text-text-secondary mt-1">Sign in to continue</p>
        </div>

        {/* Login card */}
        <div className="bg-surface rounded-xl border border-border shadow-md p-6">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

            {/* Username field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-sm font-medium text-text-primary">
                Username
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                placeholder="Enter your username"
                {...register('username')}
                className={cn(
                  'h-9 w-full rounded-md border bg-surface text-text-primary text-sm px-3',
                  'placeholder:text-text-muted transition-colors duration-150',
                  'focus:outline-none focus:ring-2',
                  errors.username
                    ? 'border-danger focus:border-danger focus:ring-danger/20'
                    : 'border-border focus:border-primary focus:ring-primary/20',
                  'disabled:opacity-50 disabled:cursor-not-allowed',
                )}
                disabled={isSubmitting}
              />
              {errors.username && (
                <p className="text-xs text-danger">{errors.username.message}</p>
              )}
            </div>

            {/* Password field */}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-text-primary">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  {...register('password')}
                  className={cn(
                    'h-9 w-full rounded-md border bg-surface text-text-primary text-sm pl-3 pr-10',
                    'placeholder:text-text-muted transition-colors duration-150',
                    'focus:outline-none focus:ring-2',
                    errors.password
                      ? 'border-danger focus:border-danger focus:ring-danger/20'
                      : 'border-border focus:border-primary focus:ring-primary/20',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                  )}
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-danger">{errors.password.message}</p>
              )}
            </div>

            {/* Root / server error */}
            {errors.root && (
              <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2.5">
                <p className="text-sm text-danger-foreground">{errors.root.message}</p>
              </div>
            )}

            {/* Submit */}
            <LoadingButton
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting}
              loadingLabel="Signing in…"
              className="w-full mt-2"
            >
              Sign In
            </LoadingButton>
          </form>
        </div>

        <p className="text-center text-xs text-text-muted mt-6">
          VHM Multi-Depot POS &amp; Inventory System
        </p>
      </div>
    </div>
  )
}
