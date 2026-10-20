import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { Toaster } from 'sonner'
import { queryClient } from '@/lib/queryClient'
import { AppRoutes } from '@/routes'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { useLocaleStore } from '@/stores/localeStore'

function HtmlLang() {
  const locale = useLocaleStore((s) => s.locale)
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  return null
}

export function App() {
  const enableDevtools = import.meta.env.VITE_ENABLE_QUERY_DEVTOOLS === 'true'

  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <HtmlLang />
          <AppRoutes />
        </AuthProvider>

        {/* Toast notifications — positioned top-right, stays above modals */}
        <Toaster
          position="top-right"
          richColors
          closeButton
          toastOptions={{
            duration: 4000,
            style: {
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '14px',
            },
          }}
        />

        {enableDevtools && <ReactQueryDevtools initialIsOpen={false} />}
      </QueryClientProvider>
    </BrowserRouter>
  )
}
