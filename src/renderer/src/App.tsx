import { useEffect, useState } from 'react'
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Setup from './pages/Setup'
import Goals from './pages/Goals'
import MonthlyPlan from './pages/MonthlyPlan'
import Today from './pages/Today'
import DailyReport from './pages/DailyReport'
import WeeklyReport from './pages/WeeklyReport'

function AppRouter(): React.JSX.Element {
  const [startPath, setStartPath] = useState<string | null>(null)

  useEffect(() => {
    async function checkSetup(): Promise<void> {
      try {
        const config = await window.api.config.get()
        console.log('config:', config)
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
      } catch (e) {
        console.log('error:', e)
        setStartPath('/setup')
      }
    }
    checkSetup()
  }, [])

  if (startPath === null) {
    return (
      <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-600 text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={startPath} replace />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/goals" element={<Goals />} />
      <Route path="/plan" element={<MonthlyPlan />} />
      <Route path="/today" element={<Today />} />
      <Route path="/report/daily" element={<DailyReport />} />
      <Route path="/report/weekly" element={<WeeklyReport />} />
    </Routes>
  )
}

export default function App(): React.JSX.Element {
  return (
    <div className="h-screen w-screen bg-gray-950 text-white overflow-hidden">
      <AppRouter />
    </div>
  )
}
