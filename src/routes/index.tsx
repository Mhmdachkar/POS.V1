import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { LoginPage } from '@/pages/LoginPage'
import { BootLoadingScreen } from '@/components/auth/BootLoadingScreen'
import { bootEnd, bootMark } from '@/lib/bootTiming'

bootMark('routes.lazy-chunk')
const AuthenticatedRoutes = lazy(() =>
  import('@/routes/authenticatedRoutes').then((m) => {
    bootEnd('routes.lazy-chunk')
    return m
  }),
)

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="*"
        element={(
          <Suspense fallback={<BootLoadingScreen />}>
            <AuthenticatedRoutes />
          </Suspense>
        )}
      />
    </Routes>
  )
}
