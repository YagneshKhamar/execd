import { useState, useEffect, useRef } from 'react'
import { Download } from 'lucide-react'
import { useToast } from '../components/Toast'

interface Task {
  id: string
  title: string
  effort: 'light' | 'medium' | 'heavy'
  status: 'pending' | 'completed' | 'carried' | 'dropped' | 'missed'
  proof_value: string | null
}

const EFFORT_WEIGHT: Record<string, number> = { light: 1, medium: 2, heavy: 3 }

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function getTomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function formatDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function DailyReport(): React.JSX.Element {
  const reportRef = useRef<HTMLDivElement>(null)
  const [todayTasks, setTodayTasks] = useState<Task[]>([])
  const [tomorrowTasks, setTomorrowTasks] = useState<Task[]>([])
  const [dayLog, setDayLog] = useState<{
    execution_score: number
    ai_feedback: string
    tasks_completed: number
    tasks_missed: number
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const { error, success } = useToast()

  useEffect(() => {
    async function load(): Promise<void> {
      const [today, tomorrow, log] = await Promise.all([
        window.api.tasks.getByDate(getToday()) as Promise<Task[]>,
        window.api.tasks.getByDate(getTomorrow()) as Promise<Task[]>,
        window.api.reports.dayLog(getToday()),
      ])
      setTodayTasks(today)
      setTomorrowTasks(tomorrow)
      setDayLog(log)
      setLoading(false)
    }
    load()
  }, [])

  const scorableTasks = todayTasks.filter((t) => t.status !== 'dropped')
  const totalWeight = scorableTasks.reduce((sum, t) => sum + EFFORT_WEIGHT[t.effort], 0)
  const completedWeight = scorableTasks
    .filter((t) => t.status === 'completed')
    .reduce((sum, t) => sum + EFFORT_WEIGHT[t.effort], 0)
  const score = totalWeight > 0 ? Math.round((completedWeight / totalWeight) * 100) : 0

  async function handleSaveImage(): Promise<void> {
    if (!reportRef.current) return

    try {
      setSaving(true)

      // 1. Enable isolate mode
      document.body.classList.add('capture-mode')

      // 2. Wait for DOM update (important)
      await new Promise((r) => requestAnimationFrame(r))

      // 3. Capture FULL window (no rect)
      const base64 = await window.api.electronAPI.captureReport()

      // 4. Download
      const link = document.createElement('a')
      link.download = `daily-report-${getToday()}.png`
      link.href = `data:image/png;base64,${base64}`
      link.click()
      success('Report saved as image.')
    } catch (captureError) {
      console.error('Failed to capture report:', captureError)
      error('Failed to capture report image.')
    } finally {
      // 5. Always cleanup
      document.body.classList.remove('capture-mode')
      setSaving(false)
    }
  }

  function statusLabel(status: Task['status']): React.JSX.Element {
    if (status === 'completed')
      return (
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20">
          completed
        </span>
      )
    if (status === 'missed')
      return (
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20">
          missed
        </span>
      )
    if (status === 'carried')
      return (
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-orange)]/10 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20">
          carried
        </span>
      )
    if (status === 'dropped')
      return (
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--border-default)]/30 text-[var(--text-muted)] border border-[var(--border-default)]">
          dropped
        </span>
      )
    return (
      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--border-default)]/30 text-[var(--text-secondary)] border border-[var(--border-default)]">
        pending
      </span>
    )
  }

  if (loading) {
    return (
      <div className="h-screen w-screen overflow-y-auto bg-[var(--bg-base)] flex items-center justify-center">
        <p className="text-[var(--text-muted)] text-sm font-mono">loading...</p>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen overflow-y-auto bg-[var(--bg-base)]">
      <div ref={reportRef} data-report-capture="daily-report" className="max-w-2xl px-8 py-8">
        <div className="mb-6">
          <p className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase mb-1">
            DAILY REPORT
          </p>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">
            {formatDate(getToday())}
          </h1>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-6 mb-6">
          <div
            className={`font-mono text-6xl font-semibold leading-none ${
              score >= 80
                ? 'text-[var(--accent-green)]'
                : score >= 50
                  ? 'text-[var(--accent-yellow)]'
                  : 'text-[var(--accent-red)]'
            }`}
          >
            {score}%
          </div>
          <p className="font-mono text-sm text-[var(--text-muted)] mt-1">
            {completedWeight} / {totalWeight} weight
          </p>
          <div className="h-0.5 bg-[var(--border-default)] rounded mt-4">
            <div
              className={`h-full rounded ${
                score >= 80
                  ? 'bg-[var(--accent-green)]'
                  : score >= 50
                    ? 'bg-[var(--accent-yellow)]'
                    : 'bg-[var(--accent-red)]'
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {dayLog && dayLog.ai_feedback && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5 mb-6">
            <p className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase mb-3">
              AI Feedback
            </p>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {dayLog.ai_feedback}
            </p>
          </div>
        )}

        <section className="mb-6">
          <h2 className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase mb-3">
            Today
          </h2>
          {todayTasks.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-2">No tasks recorded.</p>
          ) : (
            <div>
              {todayTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start justify-between gap-4 py-3 border-b border-[var(--border-subtle)]"
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${
                        task.status === 'completed'
                          ? 'text-[var(--text-muted)] line-through'
                          : task.status === 'missed'
                            ? 'text-[var(--text-secondary)]'
                            : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.proof_value && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                        {task.proof_value}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">{statusLabel(task.status)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-mono text-xs tracking-widest text-[var(--text-muted)] uppercase mb-3">
            Tomorrow
          </h2>
          {tomorrowTasks.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] py-2">No tasks planned.</p>
          ) : (
            <div>
              {tomorrowTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start justify-between gap-4 py-3 border-b border-[var(--border-subtle)]"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)]">{task.title}</p>
                    {task.proof_value && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                        {task.proof_value}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">{statusLabel(task.status)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <button
          onClick={handleSaveImage}
          disabled={saving}
          className="flex items-center gap-2 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 text-white text-sm font-medium px-5 py-2.5 rounded cursor-pointer transition-colors mt-6"
        >
          <Download className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save as Image'}
        </button>
      </div>
    </div>
  )
}
