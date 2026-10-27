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
import { Input, LoadingButton } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { AppLogo } from '@/components/layout/AppLogo'
import { LanguageSwitch } from '@/components/layout/LanguageSwitch'
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
    <div className="h-full min-h-0 overflow-y-auto bg-background flex items-center justify-center p-4">
      <div className="fixed top-4 right-4">
        <LanguageSwitch />
      </div>
      <div className="w-full max-w-sm">

        <div className="text-center mb-8">
          <AppLogo size="lg" className="justify-center" />
          <BilingualText {...AUTH.signInToContinue} variant="pageDescription" className="mt-2 justify-center" />
        </div>

        <div className="bg-surface rounded-xl border border-border shadow-md p-6">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">

            <Input
              id="username"
              type="text"
              autoComplete="username"
              autoFocus
              label={t(AUTH.username)}
              placeholder={t(AUTH.enterUsername)}
              error={errors.username?.message}
              disabled={isSubmitting}
              className="text-base"
              {...register('username')}
            />

            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              label={t(AUTH.password)}
              placeholder={t(AUTH.enterPassword)}
              error={errors.password?.message}
              disabled={isSubmitting}
              className="text-base pr-10"
              suffix={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="text-text-muted hover:text-text-secondary transition-colors"
                  tabIndex={-1}
                  aria-label={bilingualAriaLabel(showPassword ? AUTH.hidePassword : AUTH.showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              }
              {...register('password')}
            />

            {errors.root && (
              <div className="rounded-md bg-danger-bg border border-danger/20 px-3 py-2.5">
                <p className="text-sm text-danger-foreground">{errors.root.message}</p>
              </div>
            )}

            <LoadingButton
              type="submit"
              variant="primary"
              size="xl"
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
