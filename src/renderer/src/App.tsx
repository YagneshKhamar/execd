import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Setup from './pages/Setup'
import Goals from './pages/Goals'
import Today from './pages/Today'
import DailyReport from './pages/DailyReport'
import Reports from './pages/Reports'
import History from './pages/History'
import Business from './pages/Business'
import Analytics from './pages/Analytics'
import ThemeToggle from './components/ThemeToggle'
import UpdateNotifier from './components/UpdateNotifier'
import TeamRoute from './components/TeamRoute'
import { AuthProvider, useAuth } from './components/AuthProvider'

function AutoEodHandler(): React.JSX.Element | null {
  const navigate = useNavigate()

  useEffect(() => {
    window.api.autoEod.onComplete(() => {
      navigate('/today')
    })
    return () => {
      window.api.autoEod.removeListener()
    }
  }, [navigate])

  return null
}

function TitleBar(): React.JSX.Element {
  const auth = useAuth()
  const user = auth.state?.signedIn ? auth.state.user : null
  const userName = user?.displayName || user?.email
  return (
    <div
      className="drag-region flex items-center gap-2 h-10 px-4 shrink-0 bg-[var(--bg-base)]"
      style={
        {
          WebkitAppRegion: 'drag',
          boxShadow: '0 1px 0 var(--border-subtle)',
        } as React.CSSProperties
      }
    >
      <img
        src="icon.png"
        style={{ width: 20, height: 20, opacity: 0.9 }}
        alt=""
        onError={(e) => {
          e.currentTarget.style.display = 'none'
        }}
      />
      <span
        style={{
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.12em',
          color: 'var(--text-secondary)',
          userSelect: 'none',
        }}
      >
        EXECD
      </span>
      <div
        className="ml-auto flex items-center gap-3 select-none no-drag"
        style={{ marginRight: 140, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <ThemeToggle />
        {userName && (
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-full bg-[var(--accent-blue)] text-white text-[10px] font-medium flex items-center justify-center">
              {userName.charAt(0).toUpperCase()}
            </div>
            <span className="text-xs text-[var(--text-primary)] max-w-[160px] truncate">
              {userName}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function AppLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  const location = useLocation()
  const hideSidebar = location.pathname === '/setup' || location.pathname === '/business/setup'

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-base)] overflow-hidden">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden min-h-0">
        {!hideSidebar && <Sidebar />}
        <main className="flex-1 overflow-hidden min-h-0">
          <AutoEodHandler />
          {children}
        </main>
      </div>
      <UpdateNotifier />
    </div>
  )
}

function AppRouter(): React.JSX.Element {
  const { t } = useTranslation()
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
        <div className="text-[var(--text-muted)] text-sm font-mono">{t('common.loading')}</div>
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
        <Route path="/team" element={<TeamRoute />} />
      </Routes>
    </AppLayout>
  )
}

export default function App(): React.JSX.Element {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  )
}
