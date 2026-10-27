import { NavPictogram } from '@/components/layout/NavPictogram'
import { BiPageTitle } from '@/lib/bilingual/ui'
import { REPORTS } from '@/lib/bilingual/reports'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ReportNavSelect, ReportSubNav } from './components/ReportSubNav'
import { DEFAULT_REPORT_PATH, REPORTS_FLAT, reportByPath, type ReportId } from './reportCatalog'

export function ReportsLayout() {
  const location = useLocation()
  const navigate = useNavigate()
  const report = reportByPath(location.pathname === '/reports' ? DEFAULT_REPORT_PATH : location.pathname)

  function go(id: ReportId) {
    const found = REPORTS_FLAT.find((row) => row.id === id)
    if (found) navigate(`${found.path}${location.search}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background lg:flex-row">
      <aside className="flex shrink-0 flex-col border-b border-border bg-surface lg:h-full lg:w-64 lg:border-b-0 lg:border-r">
        <div className="hidden items-center gap-3 px-4 pb-2 pt-5 lg:flex">
          <NavPictogram path="/reports" size="header" />
          <p className="text-title text-text-primary">
            <BiPageTitle {...REPORTS.pageTitle} />
          </p>
        </div>
        <div className="p-3 lg:hidden">
          <h1 className="mb-2 text-title text-text-primary">
            <BiPageTitle {...REPORTS.pageTitle} />
          </h1>
          <ReportNavSelect active={report.id} onChange={go} />
        </div>
        <ReportSubNav active={report.id} onChange={go} />
      </aside>
      <Outlet />
    </div>
  )
}
