import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Setup from './pages/Setup'
import Goals from './pages/Goals'
import Today from './pages/Today'
import DailyReport from './pages/DailyReport'
import Reports from './pages/Reports'
import History from './pages/History'
import Business from './pages/Business'
import Analytics from './pages/Analytics'
import Team from './pages/Team'
import UpdateNotifier from './components/UpdateNotifier'

function AppLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  const location = useLocation()
  const hideSidebar = location.pathname === '/setup' || location.pathname === '/business/setup'

  return (
    <div className="h-screen w-screen flex bg-[var(--bg-base)] overflow-hidden">
      {!hideSidebar && <Sidebar />}
      <main className="flex-1 overflow-hidden">{children}</main>
      <UpdateNotifier />
    </div>
  )
}

function AppRouter(): React.JSX.Element {
  const [startPath, setStartPath] = useState<string | null>(null)

  useEffect(() => {
    async function checkSetup(): Promise<void> {
      try {
        const config = await window.api.config.get()
        if (!config) {
          setStartPath('/setup')
          return
        }
        const profile = await window.api.business.get()
        if (!profile || !profile.business_name) {
          setStartPath('/business/setup')
          return
        }
        setStartPath('/today')
      } catch {
        setStartPath('/setup')
      }
    }
    checkSetup()
  }, [])

  if (startPath === null) {
    return (
      <div className="h-screen w-screen bg-[var(--bg-base)] flex items-center justify-center">
        <div className="text-[var(--text-muted)] text-sm font-mono">loading...</div>
      </div>
    )
  }

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<Navigate to={startPath} replace />} />
        <Route path="/setup" element={<Setup />} />
        <Route path="/settings" element={<Setup />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/business" element={<Business />} />
        <Route path="/business/setup" element={<Business isSetup={true} />} />
        <Route path="/today" element={<Today />} />
        <Route path="/report/daily" element={<DailyReport />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/history" element={<History />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/team" element={<Team />} />
      </Routes>
    </AppLayout>
  )
}

export default function App(): React.JSX.Element {
  return <AppRouter />
}
