import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { LoadingButton } from '@/components/ui'
import { cn } from '@/lib/cn'
import type { Staff } from '@/types/database'

// ─────────────────────────────────────────────────────────────────
// Validation schema
// ─────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  username: z
    .string()
    .min(1, 'Username is required')
    .max(60, 'Username too long')
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dots, hyphens, and underscores'),
  password: z.string().min(1, 'Password is required'),
})

type LoginFormData = z.infer<typeof loginSchema>

// ─────────────────────────────────────────────────────────────────
// LoginPage
// ─────────────────────────────────────────────────────────────────

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setSession, setStaff } = useAuthStore()
  const [showPassword, setShowPassword] = useState(false)

  const from = (location.state as { from?: Location })?.from?.pathname ?? '/'

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginFormData) {
    // Map username → synthetic email used in Supabase Auth
    // Encapsulated here: real users never see or know the synthetic email.
    const syntheticEmail = `${data.username.toLowerCase()}@vhm-pos.internal`

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: syntheticEmail,
      password: data.password,
    })

    if (authError || !authData.session) {
      setError('root', {
        message: 'Invalid username or password.',
      })
      return
    }

    // Fetch staff record — verify is_active and get role/depot
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('*')
      .eq('id', authData.session.user.id)
      .single()

    if (staffError || !staffData) {
      await supabase.auth.signOut()
      setError('root', { message: 'Account not found. Contact your administrator.' })
      return
    }

    const staff = staffData as Staff

    if (!staff.is_active) {
      await supabase.auth.signOut()
      setError('root', { message: 'Your account has been deactivated. Contact your administrator.' })
      return
    }

    setSession(authData.session)
    setStaff(staff)

    toast.success(`Welcome back, ${staff.full_name}`)
    navigate(from, { replace: true })
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
              <label
                htmlFor="username"
                className="text-sm font-medium text-text-primary"
              >
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
              <label
                htmlFor="password"
                className="text-sm font-medium text-text-primary"
              >
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
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
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
