import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui'
import { BilingualText } from '@/components/ui/BilingualText'
import { AUTH } from '@/lib/bilingual/auth'
import { BiButtonStack, BiPageDescription, BiPageTitle } from '@/lib/bilingual/ui'
import { useAuthStore } from '@/stores/authStore'

export function NotFoundPage() {
  const navigate = useNavigate()
  const staff = useAuthStore((s) => s.staff)

  function goHome() {
    if (!staff) { navigate('/login'); return }
    switch (staff.role) {
      case 'admin': navigate('/pos'); break
      case 'cashier': navigate('/pos'); break
      case 'depot_staff': navigate('/inventory'); break
      default: navigate('/login')
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <p className="text-5xl font-bold text-text-muted mb-4">404</p>
        <div className="text-xl font-semibold text-text-primary mb-2">
          <BiPageTitle {...AUTH.pageNotFound} />
        </div>
        <div className="mb-6">
          <BiPageDescription {...AUTH.pageNotFoundBody} />
        </div>
        <Button variant="primary" onClick={goHome}>
          <BiButtonStack {...AUTH.goHome} />
        </Button>
      </div>
    </div>
  )
}
