import { useEffect, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { useToast } from '../components/Toast'

interface MonthStat {
  month: string
  avg_score: number
  total_completed: number
  total_missed: number
  days_logged: number
}

interface DayStat {
  date: string
  execution_score: number
  tasks_completed: number
  tasks_missed: number
  tasks_carried: number
}

interface MissedTask {
  title: string
  miss_count: number
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function scoreColor(score: number): string {
  if (score >= 0.8) return 'var(--accent-green)'
  if (score >= 0.5) return 'var(--accent-yellow)'
  return 'var(--accent-red)'
}

export default function YearlyReport(): React.JSX.Element {
  const [months, setMonths] = useState<MonthStat[]>([])
  const [days, setDays] = useState<DayStat[]>([])
  const [topMissed, setTopMissed] = useState<MissedTask[]>([])
  const [loading, setLoading] = useState(true)
  const [year] = useState(() => new Date().getFullYear().toString())
  const { error } = useToast()

  useEffect(() => {
    window.api.reports
      .year(year)
      .then((data) => {
        setMonths(data.months)
        setDays(data.days)
        setTopMissed(data.topMissed)
      })
      .catch(() => {
        error('Failed to load yearly report.')
      })
      .finally(() => {
        setLoading(false)
      })
  }, [error, year])

  const avgScore = useMemo(() => {
    if (months.length === 0) return 0
    return Math.round((months.reduce((sum, month) => sum + Number(month.avg_score || 0), 0) / months.length) * 100)
  }, [months])

  const daysLogged = months.reduce((sum, month) => sum + Number(month.days_logged || 0), 0)
  const tasksDone = months.reduce((sum, month) => sum + Number(month.total_completed || 0), 0)
  const tasksMissed = months.reduce((sum, month) => sum + Number(month.total_missed || 0), 0)

  const monthMap = useMemo(() => {
    const map = new Map<number, MonthStat>()
    for (const item of months) {
      const idx = Number(item.month) - 1
      if (!Number.isNaN(idx)) map.set(idx, item)
    }
    return map
  }, [months])

  if (loading) {
    return (
      <div className="h-screen w-screen overflow-y-auto bg-[var(--bg-base)] flex items-center justify-center">
        <p className="text-[var(--text-muted)] text-sm font-mono">loading...</p>
      </div>
    )
  }

  if (days.length === 0 && months.length === 0) {
    return (
      <div className="h-screen w-screen overflow-y-auto bg-[var(--bg-base)] flex items-center justify-center">
        <div className="text-center">
          <CalendarDays className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-[var(--text-primary)] text-sm font-medium">No data for this year yet.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen overflow-y-auto bg-[var(--bg-base)]">
      <div className="max-w-3xl mx-auto px-8 py-8">
        <div className="flex justify-between items-start mb-8">
          <div>
            <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-1">
              YEARLY REPORT
            </p>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">{year}</h1>
          </div>
          <p className="font-mono text-sm text-[var(--text-muted)]">{year}</p>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-8">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4">
            <p className="font-mono text-3xl font-semibold" style={{ color: scoreColor(avgScore / 100) }}>
              {avgScore}%
            </p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">avg score</p>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4">
            <p className="font-mono text-3xl font-semibold text-[var(--text-primary)]">{daysLogged}</p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">days logged</p>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4">
            <p className="font-mono text-3xl font-semibold text-[var(--accent-green)]">{tasksDone}</p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">tasks done</p>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4">
            <p className="font-mono text-3xl font-semibold text-[var(--accent-red)]">{tasksMissed}</p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">tasks missed</p>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">
            MONTHLY BREAKDOWN
          </h2>
          <div>
            {MONTH_NAMES.map((name, index) => {
              const stat = monthMap.get(index)
              const scorePct = stat ? Math.round(Number(stat.avg_score || 0) * 100) : 0
              return (
                <div key={name} className="flex items-center gap-3 py-2">
                  <span className="font-mono text-xs text-[var(--text-secondary)] w-8 shrink-0">{name}</span>
                  <div className="flex-1 h-2 bg-[var(--border-subtle)] rounded-full overflow-hidden relative">
                    {stat && (
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${scorePct}%`, backgroundColor: scoreColor(scorePct / 100) }}
                      />
                    )}
                  </div>
                  <span
                    className="font-mono text-xs w-10 text-right"
                    style={{ color: stat ? scoreColor(scorePct / 100) : 'var(--text-muted)' }}
                  >
                    {stat ? `${scorePct}%` : '—'}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--text-muted)] w-14 text-right">
                    {stat ? `${Number(stat.days_logged)} days` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {topMissed.length > 0 && (
          <div>
            <h2 className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">
              MOST AVOIDED TASKS
            </h2>
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5">
              <div className="space-y-2.5">
                {topMissed.map((task) => (
                  <div key={task.title} className="flex items-center gap-3">
                    <p className="text-sm text-[var(--text-primary)] flex-1 truncate">{task.title}</p>
                    <span className="font-mono text-xs text-[var(--accent-red)] font-semibold">
                      {task.miss_count} misses
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
