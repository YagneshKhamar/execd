import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
// to check for Olama or open router so no extra keys payment needs to be added
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
  const navigate = useNavigate()
  const reportRef = useRef<HTMLDivElement>(null)
  const [todayTasks, setTodayTasks] = useState<Task[]>([])
  const [tomorrowTasks, setTomorrowTasks] = useState<Task[]>([])
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load(): Promise<void> {
      const [today, tomorrow] = await Promise.all([
        window.api.tasks.getByDate(getToday()) as Promise<Task[]>,
        window.api.tasks.getByDate(getTomorrow()) as Promise<Task[]>,
      ])
      setTodayTasks(today)
      setTomorrowTasks(tomorrow)
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
    } catch (error) {
      console.error('Failed to capture report:', error)
    } finally {
      // 5. Always cleanup
      document.body.classList.remove('capture-mode')
      setSaving(false)
    }
  }

  function statusLabel(status: Task['status']): React.JSX.Element {
    if (status === 'completed')
      return <span className="text-green-400 font-semibold text-xs">✓ done</span>
    if (status === 'missed') return <span className="text-red-400 text-xs">✗ missed</span>
    if (status === 'carried') return <span className="text-orange-400 text-xs">↪ carried</span>
    if (status === 'dropped') return <span className="text-gray-600 text-xs">— dropped</span>
    return <span className="text-gray-500 text-xs">· pending</span>
  }

  if (loading) {
    return (
      <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-600 text-sm">Loading...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center py-10 px-6">
      <div className="w-full max-w-xl mb-4">
        <button
          onClick={() => navigate('/today')}
          className="text-gray-600 hover:text-gray-400 text-sm transition-colors cursor-pointer"
        >
          ← Back to Today
        </button>
      </div>

      {/* Capture area */}
      <div
        ref={reportRef}
        data-report-capture="daily-report"
        className="w-full max-w-xl bg-gray-950 px-8 py-10 rounded-2xl"
      >
        {/* Header */}
        <div className="mb-8">
          <p className="text-blue-500 text-xs font-semibold uppercase tracking-widest mb-1">
            Daily Report
          </p>
          <h1 className="text-white text-2xl font-bold tracking-tight">{formatDate(getToday())}</h1>
        </div>

        {/* Score */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 mb-8">
          <p className="text-gray-500 text-xs mb-2">Execution Score</p>
          <div className="flex items-end gap-3">
            <span className="text-5xl font-bold text-white">{score}%</span>
            <span className="text-gray-600 text-sm mb-1.5">
              {completedWeight} / {totalWeight} weight
            </span>
          </div>
          <div className="mt-3 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-600 rounded-full" style={{ width: `${score}%` }} />
          </div>
        </div>

        {/* Today's Tasks */}
        <section className="mb-8">
          <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">
            Today&apos;s Tasks
          </h2>
          {todayTasks.length === 0 ? (
            <p className="text-gray-700 text-sm">No tasks recorded.</p>
          ) : (
            <div className="space-y-2">
              {todayTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-start justify-between gap-4 py-2.5 border-b border-gray-900"
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${
                        task.status === 'completed'
                          ? 'text-gray-400 line-through'
                          : task.status === 'dropped'
                            ? 'text-gray-700'
                            : 'text-white'
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.status === 'completed' && task.proof_value && (
                      <p className="text-gray-600 text-xs mt-0.5 truncate">↳ {task.proof_value}</p>
                    )}
                  </div>
                  <div className="shrink-0">{statusLabel(task.status)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Tomorrow's Tasks */}
        {tomorrowTasks.length > 0 && (
          <section className="mb-8">
            <h2 className="text-gray-400 text-xs font-semibold uppercase tracking-widest mb-3">
              Planned for Tomorrow
            </h2>
            <div className="space-y-2">
              {tomorrowTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-4 py-2.5 border-b border-gray-900"
                >
                  <p className="text-gray-400 text-sm">{task.title}</p>
                  <span className="text-gray-600 text-xs flex-shrink-0">{task.effort}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <p className="text-gray-800 text-xs text-center mt-6">ExecOS · Work Planner</p>
      </div>

      {/* Save button — outside capture area */}
      <button
        onClick={handleSaveImage}
        disabled={saving}
        className="mt-6 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white text-sm font-semibold px-6 py-2.5 rounded-lg transition-colors cursor-pointer"
      >
        {saving ? 'Saving...' : 'Save as Image'}
      </button>
    </div>
  )
}
