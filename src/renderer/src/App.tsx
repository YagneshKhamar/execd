import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Setup from './pages/Setup'
import Goals from './pages/Goals'
import MonthlyPlan from './pages/MonthlyPlan'
import Today from './pages/Today'
import DailyReport from './pages/DailyReport'
import WeeklyReport from './pages/WeeklyReport'
import YearlyReport from './pages/YearlyReport'
import Analytics from './pages/Analytics'

function AppLayout({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="h-screen w-screen flex bg-[var(--bg-base)] overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-hidden">{children}</main>
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
        const month = new Date().toISOString().slice(0, 7)
        const goals = (await window.api.goals.get(month)) as unknown[]
        if (goals && goals.length > 0) {
          setStartPath('/today')
        } else {
          setStartPath('/goals')
        }
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
        <Route path="/goals" element={<Goals />} />
        <Route path="/plan" element={<MonthlyPlan />} />
        <Route path="/today" element={<Today />} />
        <Route path="/report/daily" element={<DailyReport />} />
        <Route path="/report/weekly" element={<WeeklyReport />} />
        <Route path="/report/yearly" element={<YearlyReport />} />
        <Route path="/analytics" element={<Analytics />} />
      </Routes>
    </AppLayout>
  )
}

export default function App(): React.JSX.Element {
  return <AppRouter />
}
