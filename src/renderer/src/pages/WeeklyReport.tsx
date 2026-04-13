import { useState, useEffect } from 'react'

interface DayLog {
  date: string
  execution_score: number
  tasks_completed: number
  tasks_missed: number
}

interface MissedPattern {
  title: string
  miss_count: number
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDay(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  })
}

function scoreColor(score: number): string {
  if (score >= 0.8) return 'bg-green-500'
  if (score >= 0.5) return 'bg-yellow-500'
  return 'bg-red-500'
}

export default function WeeklyReport(): React.JSX.Element {
  const [days, setDays] = useState<DayLog[]>([])
  const [patterns, setPatterns] = useState<MissedPattern[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.api.reports.week(getToday()).then((data) => {
      setDays(data.days)
      setPatterns(data.patterns)
      setLoading(false)
    })
  }, [])

  const avgScore =
    days.length > 0
      ? Math.round((days.reduce((s, d) => s + d.execution_score, 0) / days.length) * 100)
      : 0

  const totalCompleted = days.reduce((s, d) => s + d.tasks_completed, 0)
  const totalMissed = days.reduce((s, d) => s + d.tasks_missed, 0)

  if (loading) {
    return (
      <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-600 text-sm">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 overflow-y-auto">
      <div className="max-w-xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <p className="text-blue-500 text-xs font-semibold uppercase tracking-widest mb-1">
            Weekly Report
          </p>
          <h1 className="text-white text-2xl font-bold tracking-tight">Last 7 Days</h1>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-white">{avgScore}%</p>
            <p className="text-gray-600 text-xs mt-1">avg score</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-green-400">{totalCompleted}</p>
            <p className="text-gray-600 text-xs mt-1">completed</p>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center">
            <p className="text-3xl font-bold text-red-400">{totalMissed}</p>
            <p className="text-gray-600 text-xs mt-1">missed</p>
          </div>
        </div>

        {/* Day bars */}
        {days.length === 0 ? (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center mb-6">
            <p className="text-gray-600 text-sm">
              No day logs yet. Complete your first day to see data.
            </p>
          </div>
        ) : (
          <div className="space-y-3 mb-8">
            {days.map((day) => {
              const pct = Math.round(day.execution_score * 100)
              return (
                <div key={day.date} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm font-medium">{formatDay(day.date)}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-500 text-xs">
                        {day.tasks_completed}✓ {day.tasks_missed}✗
                      </span>
                      <span className="text-white text-sm font-bold w-10 text-right">{pct}%</span>
                    </div>
                  </div>
                  {/* Bar */}
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${scoreColor(day.execution_score)}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Missed patterns */}
        {patterns.length > 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">
              Recurring Skips
            </h2>
            <div className="space-y-2">
              {patterns.map((p) => (
                <div key={p.title} className="flex items-center justify-between">
                  <p className="text-white text-sm truncate flex-1 mr-4">{p.title}</p>
                  <span className="text-red-400 text-xs font-semibold shrink-0">
                    missed {p.miss_count}×
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
