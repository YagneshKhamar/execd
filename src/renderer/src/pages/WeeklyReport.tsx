import { useState, useEffect } from 'react'
import { useToast } from '../components/Toast'

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

function scoreColor(score: number): string {
  if (score >= 0.8) return 'var(--accent-green)'
  if (score >= 0.5) return 'var(--accent-yellow)'
  return 'var(--accent-red)'
}

export default function WeeklyReport(): React.JSX.Element {
  const [days, setDays] = useState<DayLog[]>([])
  const [patterns, setPatterns] = useState<MissedPattern[]>([])
  const [loading, setLoading] = useState(true)
  const { error } = useToast()

  useEffect(() => {
    window.api.reports
      .week(getToday())
      .then((data) => {
        setDays(data.days)
        setPatterns(data.patterns)
      })
      .catch(() => {
        error('Failed to load weekly report.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [error])

  const avgScore =
    days.length > 0
      ? Math.round((days.reduce((s, d) => s + d.execution_score, 0) / days.length) * 100)
      : 0

  const totalCompleted = days.reduce((s, d) => s + d.tasks_completed, 0)
  const totalMissed = days.reduce((s, d) => s + d.tasks_missed, 0)

  if (loading) {
    return (
      <div className="h-screen w-screen overflow-y-auto bg-[var(--bg-base)] flex items-center justify-center">
        <p className="text-[var(--text-muted)] text-sm font-mono">loading...</p>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen overflow-y-auto bg-[var(--bg-base)]">
      <div className="max-w-2xl px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-1">
            WEEKLY REPORT
          </p>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Last 7 Days</h1>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5 text-center">
            <p
              className="font-mono text-3xl font-semibold"
              style={{ color: scoreColor(avgScore / 100) }}
            >
              {avgScore}%
            </p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
              avg score
            </p>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5 text-center">
            <p className="font-mono text-3xl font-semibold text-[var(--accent-green)]">
              {totalCompleted}
            </p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
              completed
            </p>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5 text-center">
            <p className="font-mono text-3xl font-semibold text-[var(--accent-red)]">
              {totalMissed}
            </p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">missed</p>
          </div>
        </div>

        {/* Day bars */}
        {days.length === 0 ? (
          <div className="text-center py-8 mb-8">
            <p className="text-[var(--text-muted)] text-sm">
              No day logs yet. Complete your first day to see data.
            </p>
          </div>
        ) : (
          <div className="space-y-2 mb-8">
            {days.map((day) => {
              const pct = Math.round(day.execution_score * 100)
              return (
                <div
                  key={day.date}
                  className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-4 py-3"
                >
                  <div className="flex items-center">
                    <span className="font-mono text-xs text-[var(--text-secondary)] w-10 shrink-0">
                      {new Date(`${day.date}T00:00:00`).toLocaleDateString('en-US', {
                        weekday: 'short',
                      })}
                    </span>
                    <div className="flex-1 h-1 bg-[var(--border-default)] rounded mx-3 overflow-hidden">
                      <div
                        className="h-full rounded"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: scoreColor(day.execution_score),
                        }}
                      />
                    </div>
                    <span
                      className="font-mono text-sm font-semibold w-10 text-right"
                      style={{ color: scoreColor(day.execution_score) }}
                    >
                      {pct}%
                    </span>
                    <span className="font-mono text-xs text-[var(--text-muted)] w-12 text-right">
                      {day.tasks_completed}/{day.tasks_missed}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Missed patterns */}
        {patterns.length > 0 && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5">
            <h2 className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">
              Recurring Skips
            </h2>
            <div className="space-y-2">
              {patterns.map((p) => (
                <div key={p.title} className="flex items-center justify-between">
                  <p className="text-[var(--text-primary)] text-sm truncate flex-1 mr-4">
                    {p.title}
                  </p>
                  <span className="font-mono text-xs text-[var(--accent-red)] font-semibold shrink-0">
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
