import { useState, useEffect } from 'react'
import { ChevronDown, ExternalLink, FileText, Paperclip } from 'lucide-react'

interface Task {
  id: string
  title: string
  effort: 'light' | 'medium' | 'heavy'
  status: 'pending' | 'completed' | 'carried' | 'dropped' | 'missed'
  proof_type: 'none' | 'comment' | 'link'
  proof_value: string | null
  carry_count: number
  notes: string
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export default function Overlay(): React.JSX.Element {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [expandedNote, setExpandedNote] = useState<string | null>(null)
  const [openProofTaskId, setOpenProofTaskId] = useState<string | null>(null)
  const [proofInputs, setProofInputs] = useState<Record<string, string>>({})
  const [noteInput, setNoteInput] = useState<Record<string, string>>({})
  const [savingNote, setSavingNote] = useState<string | null>(null)

  useEffect(() => {
    loadTasks()
    const interval = setInterval(loadTasks, 60000)
    return () => clearInterval(interval)
  }, [])

  async function loadTasks(): Promise<void> {
    try {
      const todayTasks = (await window.api.tasks.getByDate(getToday())) as Task[]
      setTasks(todayTasks)
      const initial: Record<string, string> = {}
      todayTasks.forEach((t) => {
        initial[t.id] = t.notes || ''
      })
      setNoteInput(initial)
    } catch (e) {
      console.error('Overlay failed to load tasks:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleTaskClick(task: Task): Promise<void> {
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
              <div key={task.id}>
                <div
                  className={`flex items-start gap-3 px-2 py-2.5 rounded-lg mb-1 transition-colors ${
                    task.status === 'completed' ? 'opacity-40' : 'hover:bg-white/[0.03]'
                  }`}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleTaskClick(task)
                    }}
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
                  <div className="flex items-start gap-1 shrink-0 mt-0.5">
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono text-[10px] text-white/25">
                        {task.effort === 'light' ? 'L' : task.effort === 'medium' ? 'M' : 'H'}
                      </span>
                    </div>
                    <button
                      onClick={() => {
                        setExpandedNote(expandedNote === task.id ? null : task.id)
                      }}
                      className={`no-drag shrink-0 cursor-pointer transition-colors ${
                        task.notes
                          ? 'text-[var(--accent-blue)]/60'
                          : 'text-white/10 hover:text-white/30'
                      }`}
                    >
                      <FileText className="w-3 h-3" />
                    </button>
                    {task.proof_type !== 'none' && (
                      <button
                        onClick={() => {
                          setOpenProofTaskId(openProofTaskId === task.id ? null : task.id)
                        }}
                        title="Add proof"
                        className={`no-drag shrink-0 cursor-pointer transition-colors ${
                          task.proof_value
                            ? 'text-[var(--accent-blue)]/60 hover:text-white/50'
                            : 'text-white/20 hover:text-white/50'
                        }`}
                      >
                        <Paperclip className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                {expandedNote === task.id && (
                  <div className="no-drag px-1 pb-2">
                    <textarea
                      value={noteInput[task.id] || ''}
                      onChange={(e) =>
                        setNoteInput((prev) => ({ ...prev, [task.id]: e.target.value }))
                      }
                      placeholder="Notes..."
                      rows={2}
                      className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[10px] text-white/70 placeholder-white/20 outline-none resize-none font-mono"
                    />
                    <button
                      onClick={async () => {
                        setSavingNote(task.id)
                        await window.api.tasks.updateNotes(task.id, noteInput[task.id] || '')
                        await loadTasks()
                        setSavingNote(null)
                      }}
                      disabled={savingNote === task.id}
                      className="no-drag mt-1 text-[10px] bg-[var(--accent-blue)]/80 hover:bg-[var(--accent-blue)] disabled:opacity-40 text-white px-2 py-0.5 rounded cursor-pointer transition-colors"
                    >
                      {savingNote === task.id ? '...' : 'Save'}
                    </button>
                  </div>
                )}
                {openProofTaskId === task.id && task.proof_type !== 'none' && (
                  <div className="no-drag px-1 pb-2">
                    {task.proof_type === 'link' ? (
                      <input
                        type="text"
                        value={proofInputs[task.id] ?? task.proof_value ?? ''}
                        onChange={(e) =>
                          setProofInputs((prev) => ({ ...prev, [task.id]: e.target.value }))
                        }
                        placeholder="Paste link..."
                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[10px] text-white/70 placeholder-white/20 outline-none font-mono"
                      />
                    ) : (
                      <textarea
                        value={proofInputs[task.id] ?? task.proof_value ?? ''}
                        onChange={(e) =>
                          setProofInputs((prev) => ({ ...prev, [task.id]: e.target.value }))
                        }
                        placeholder="Add Proof..."
                        rows={2}
                        className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-[10px] text-white/70 placeholder-white/20 outline-none resize-none font-mono"
                      />
                    )}
                    <button
                      onClick={async () => {
                        const proof = proofInputs[task.id] ?? task.proof_value ?? ''
                        await window.api.tasks.updateProof(task.id, proof)
                        await loadTasks()
                        setOpenProofTaskId(null)
                      }}
                      className="no-drag mt-1 text-[10px] bg-[var(--accent-blue)]/80 hover:bg-[var(--accent-blue)] disabled:opacity-40 text-white px-2 py-0.5 rounded cursor-pointer transition-colors"
                    >
                      Save
                    </button>
                  </div>
                )}
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
            {pending.length > 0
              ? `${completed}/${total} done · ${pending.length} left`
              : 'all done ✓'}
          </p>
        </div>
      </div>
    </div>
  )
}
