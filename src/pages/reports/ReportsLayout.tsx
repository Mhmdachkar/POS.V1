import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { rememberReport } from './lastReport'

export function ReportsLayout() {
  const location = useLocation()

  useEffect(() => {
    if (location.pathname.startsWith('/reports/')) {
      rememberReport(location.pathname, location.search)
    }
  }, [location.pathname, location.search])

  return (
    <div className="min-w-0">
      <Outlet />
    </div>
  )
}
