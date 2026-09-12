import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui'
import { useAuthStore } from '@/stores/authStore'

export function NotFoundPage() {
  const navigate = useNavigate()
  const staff = useAuthStore((s) => s.staff)

  function goHome() {
    if (!staff) { navigate('/login'); return }
    switch (staff.role) {
      case 'admin': navigate('/dashboard'); break
      case 'cashier': navigate('/pos'); break
      case 'depot_staff': navigate('/inventory'); break
      default: navigate('/login')
    }
  }

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="text-center max-w-sm">
        <p className="text-5xl font-bold text-text-muted mb-4">404</p>
        <h1 className="text-xl font-semibold text-text-primary mb-2">Page not found</h1>
        <p className="text-sm text-text-secondary mb-6">
          The page you're looking for doesn't exist or you don't have access to it.
        </p>
        <Button variant="primary" onClick={goHome}>
          Go to Home
        </Button>
      </div>
    </div>
  )
}
