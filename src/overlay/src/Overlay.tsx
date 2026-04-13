import { useState, useEffect } from 'react'

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

  const completed = tasks.filter((t) => t.status === 'completed').length
  const total = tasks.length
  const score = total > 0 ? Math.round((completed / total) * 100) : 0
  const pending = tasks.filter((t) => t.status === 'pending')

  return (
    <div
      className="h-screen w-screen bg-gray-950/90 backdrop-blur-sm flex flex-col p-3 select-none overflow-hidden"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between mb-2"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <span className="text-white text-xs font-bold">{score}%</span>
        <button
          onClick={() => window.api.overlay.openMain()}
          className="text-gray-500 hover:text-gray-300 text-xs cursor-pointer transition-colors"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          Open App →
        </button>
      </div>

      {/* Progress */}
      <div
        className="h-1 bg-gray-800 rounded-full mb-3 overflow-hidden"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div
          className="h-full bg-blue-600 rounded-full transition-all duration-500"
          style={{ width: `${score}%` }}
        />
      </div>

      {/* Tasks */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-700 text-xs">Loading...</p>
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-gray-700 text-xs">No tasks today. Open app to generate.</p>
        </div>
      ) : (
        <div
          className="flex-1 space-y-1.5 overflow-hidden"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {tasks.slice(0, 5).map((task) => (
            <div
              key={task.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${
                task.status === 'completed' ? 'opacity-40' : 'bg-gray-900/60'
              }`}
            >
              <div
                className={`w-3 h-3 rounded-sm border flex-shrink-0 flex items-center justify-center ${
                  task.status === 'completed' ? 'bg-green-600 border-green-600' : 'border-gray-600'
                }`}
              >
                {task.status === 'completed' && (
                  <span className="text-white" style={{ fontSize: '8px' }}>
                    ✓
                  </span>
                )}
              </div>
              <p
                className={`text-xs flex-1 truncate ${
                  task.status === 'completed' ? 'text-gray-600 line-through' : 'text-gray-200'
                }`}
              >
                {task.title}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Footer nudge */}
      {pending.length > 0 && (
        <div
          className="mt-2 pt-2 border-t border-gray-800"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <p className="text-gray-600 text-xs">
            {pending.length} task{pending.length > 1 ? 's' : ''} remaining
          </p>
        </div>
      )}
    </div>
  )
}
