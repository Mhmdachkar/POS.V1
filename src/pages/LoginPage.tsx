import { useMemo, useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuthStore, selectAuthLoadState } from '@/stores/authStore'
import { useLocaleStore } from '@/stores/localeStore'
import { resolvePostLoginPath, waitForAuthSettlement } from '@/lib/postLoginRedirect'
import { LoadingButton } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
import { cn } from '@/lib/cn'
import { AUTH } from '@/lib/bilingual/auth'
import { BiButtonStack } from '@/lib/bilingual/ui'
import { toastSuccessBi } from '@/lib/bilingual/toast'
import { bilingualAriaLabel, bilingualPlain, t } from '@/lib/bilingual/types'

function buildLoginSchema() {
  return z.object({
    username: z
      .string()
      .min(1, bilingualPlain(AUTH.usernameRequired))
      .max(60, bilingualPlain(AUTH.usernameTooLong))
      .regex(/^[a-zA-Z0-9._-]+$/, bilingualPlain(AUTH.usernameInvalid)),
    password: z.string().min(1, bilingualPlain(AUTH.passwordRequired)),
  })
}

type LoginFormData = z.infer<ReturnType<typeof buildLoginSchema>>

export function LoginPage() {
  const locale = useLocaleStore((s) => s.locale)
  const navigate    = useNavigate()
  const location    = useLocation()
  const [showPassword, setShowPassword] = useState(false)

  const authLoadState = useAuthStore(selectAuthLoadState)
  const staff         = useAuthStore((s) => s.staff)
  const loginSchema = useMemo(() => buildLoginSchema(), [locale])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/'

  if (authLoadState === 'authorized' && staff) {
    return <Navigate to={resolvePostLoginPath(staff, from)} replace />
  }

  async function onSubmit(data: LoginFormData) {
    const syntheticEmail = `${data.username.toLowerCase()}@vhm-pos.internal`

    const { error: authError } = await supabase.auth.signInWithPassword({
      email: syntheticEmail,
      password: data.password,
    })

    if (authError) {
      setError('root', { message: bilingualPlain(AUTH.invalidCredentials) })
      return
    }

    const settlement = await waitForAuthSettlement()
    if (settlement === 'failed') {
      setError('root', { message: bilingualPlain(AUTH.signInSlow) })
      return
    }
    if (settlement === 'deactivated') {
      navigate('/', { replace: true })
      return
    }

    const authorizedStaff = useAuthStore.getState().staff
    if (!authorizedStaff) {
      setError('root', { message: bilingualPlain(AUTH.profileLoadFailed) })
      return
    }

    const firstName = authorizedStaff.full_name?.split(' ')[0]
    toastSuccessBi(AUTH.welcomeBack(firstName))
    navigate(resolvePostLoginPath(authorizedStaff, from), { replace: true })
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed top-4 right-4">
        <LanguageSwitch />
      </div>
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-md bg-[#111827] mb-4">
            <span className="text-white text-sm font-semibold">V</span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary">VHM POS</h1>
          <BilingualText {...AUTH.signInToContinue} variant="pageDescription" className="mt-1" />
        </div>

        <div className="bg-surface rounded-xl border border-border shadow-md p-6">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-sm font-medium text-text-primary">
                <BilingualText {...AUTH.username} variant="body" layout="inline" />
              </label>
              <input
                id="username"
                type="text"
                autoComplete="username"
                autoFocus
                placeholder={t(AUTH.enterUsername)}
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

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-text-primary">
                <BilingualText {...AUTH.password} variant="body" layout="inline" />
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder={t(AUTH.enterPassword)}
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
                  aria-label={bilingualAriaLabel(showPassword ? AUTH.hidePassword : AUTH.showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-xs text-danger">{errors.password.message}</p>
              )}
            </div>

            {errors.root && (
              <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2.5">
                <p className="text-sm text-danger-foreground">{errors.root.message}</p>
              </div>
            )}

            <LoadingButton
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting}
              loadingLabel={bilingualPlain(AUTH.signingIn)}
              className="w-full mt-2"
            >
              <BiButtonStack {...AUTH.signIn} />
            </LoadingButton>
          </form>
        </div>

        <BilingualText {...AUTH.systemTagline} variant="caption" className="text-center text-text-muted mt-6" />
      </div>
    </div>
  )
}
