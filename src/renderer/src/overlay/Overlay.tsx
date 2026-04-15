import { useState, useEffect } from 'react'
import { ChevronDown, ExternalLink } from 'lucide-react'

interface Task {
  id: string
  title: string
  effort: 'light' | 'medium' | 'heavy'
  status: 'pending' | 'completed' | 'carried' | 'dropped' | 'missed'
  proof_type: 'none' | 'comment' | 'link'
  carry_count: number
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function Overlay(): React.JSX.Element {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [completingId, setCompletingId] = useState<string | null>(null)

  useEffect(() => {
    loadTasks()
    const interval = setInterval(loadTasks, 60000)
    return () => clearInterval(interval)
  }, [])

  async function loadTasks(): Promise<void> {
    try {
      const todayTasks = (await window.api.tasks.getByDate(getToday())) as Task[]
      setTasks(todayTasks)
    } catch (e) {
      console.error('Overlay failed to load tasks:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleTaskClick(task: Task): Promise<void> {
    // Tasks requiring proof — open main app
    if (task.proof_type !== 'none' && task.status !== 'completed') {
      window.api.overlay.openMain()
      return
    }

    setCompletingId(task.id)
    try {
      if (task.status === 'completed') {
        // Uncheck
        await window.api.tasks.uncompleteTask(task.id)
      } else {
        // Check
        await window.api.tasks.completeTask(task.id, null)
      }
      await loadTasks()
    } catch (e) {
      console.error('Failed to toggle task:', e)
    } finally {
      setCompletingId(null)
    }
  }

  const completed = tasks.filter((t) => t.status === 'completed').length
  const total = tasks.length
  const score = total > 0 ? Math.round((completed / total) * 100) : 0
  const pending = tasks.filter((t) => t.status === 'pending')

  return (
    <div className="h-screen w-screen overflow-hidden">
      <div className="drag-region h-full flex flex-col bg-[#0d0d0d]/90 backdrop-blur-xl border border-white/[0.06] rounded-xl overflow-hidden p-0">
        <div className="drag-region px-4 pt-4 pb-3 flex items-center justify-between shrink-0">
          <span
            className={`font-mono text-base font-bold ${
              score >= 80
                ? 'text-[var(--accent-green)]'
                : score >= 50
                  ? 'text-[var(--accent-yellow)]'
                  : 'text-[var(--accent-red)]'
            }`}
          >
            {score}%
          </span>
          <div className="no-drag flex items-center gap-1">
            <button
              onClick={() => window.api.overlay.hide()}
              className="no-drag text-white/20 hover:text-white/60 cursor-pointer transition-colors p-0.5"
              title="Minimize overlay"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => window.api.overlay.openMain()}
              className="no-drag text-white/20 hover:text-white/60 cursor-pointer transition-colors p-0.5"
              title="Open app"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="mx-4 mb-0 h-0.5 rounded-full overflow-hidden bg-white/5 shrink-0">
          <div
            className="h-full bg-[var(--accent-blue)] rounded-full transition-all duration-500"
            style={{ width: `${score}%` }}
          />
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-white/20 font-mono">loading...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-xs text-white/20 font-mono">no tasks today</p>
          </div>
        ) : (
          <div className="no-drag flex-1 overflow-y-auto overlay-scroll px-3 py-2 pb-2">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`flex items-start gap-3 px-2 py-2.5 rounded-lg mb-1 transition-colors ${
                  task.status === 'completed' ? 'opacity-40' : 'hover:bg-white/[0.03]'
                }`}
              >
                <button
                  onClick={() => handleTaskClick(task)}
                  disabled={completingId === task.id}
                  className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-all cursor-pointer ${
                    task.status === 'completed'
                      ? 'bg-[var(--accent-green)] border-[var(--accent-green)]'
                      : 'border-white/25 hover:border-white/60 bg-transparent'
                  }`}
                >
                  {task.status === 'completed' && (
                    <span className="text-white text-[10px] font-bold">✓</span>
                  )}
                  {completingId === task.id && (
                    <span className="text-white/40 text-[10px]">...</span>
                  )}
                </button>
                <p
                  className={`text-sm flex-1 leading-snug break-words ${
                    task.status === 'completed' ? 'text-white/30 line-through' : 'text-white/85'
                  }`}
                >
                  {task.title}
                </p>
                <div className="flex flex-col items-end gap-1 shrink-0 mt-0.5">
                  <span className="font-mono text-[10px] text-white/25">
                    {task.effort === 'light' ? 'L' : task.effort === 'medium' ? 'M' : 'H'}
                  </span>
                  {task.proof_type !== 'none' && task.status !== 'completed' && (
                    <span className="font-mono text-[9px] text-white/20">↗</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="drag-region px-4 py-3 border-t border-white/[0.04] shrink-0">
          <p
            className={`font-mono text-xs ${
              pending.length > 0 ? 'text-white/30' : 'text-[var(--accent-green)]/50'
            }`}
          >
            {pending.length > 0 ? `${completed}/${total} done · ${pending.length} left` : 'all done ✓'}
          </p>
        </div>
      </div>
    </div>
  )
}
