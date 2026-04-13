import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

interface Task {
  id: string
  title: string
  effort: 'light' | 'medium' | 'heavy'
  proof_type: 'none' | 'comment' | 'link'
  status: 'pending' | 'completed' | 'carried' | 'dropped' | 'missed'
  proof_value: string | null
  subgoal_id: string
  scheduled_time_slot: 'morning' | 'afternoon' | 'anytime'
  carry_count: number
}

interface DayPlan {
  id: string
  date: string
  available_minutes: number
  locked: number
  replan_used: number
}

const EFFORT_LABELS = { light: '30m', medium: '1h', heavy: '2h' }
const EFFORT_COLORS = {
  light: 'text-green-400 bg-green-950 border-green-800',
  medium: 'text-yellow-400 bg-yellow-950 border-yellow-800',
  heavy: 'text-red-400 bg-red-950 border-red-800',
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

export default function Today(): React.JSX.Element {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<Task[]>([])
  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [locking, setLocking] = useState(false)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [proofInput, setProofInput] = useState<Record<string, string>>({})
  const [showProof, setShowProof] = useState<Record<string, boolean>>({})
  const [error, setError] = useState('')
  const [missedFromYesterday, setMissedFromYesterday] = useState<Task[]>([])
  const [showCarryOver, setShowCarryOver] = useState(false)
  const [carryOverProcessing, setCarryOverProcessing] = useState(false)

  useEffect(() => {
    loadTodayData()
  }, [])

  async function loadTodayData(): Promise<void> {
    try {
      // Check yesterday for missed tasks
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      const yesterdayStr = yesterday.toISOString().slice(0, 10)

      const missedTasks = (await window.api.tasks.getMissed(yesterdayStr)) as Task[]
      if (missedTasks.length > 0) {
        setMissedFromYesterday(missedTasks)
        setShowCarryOver(true)
      }

      const plan = (await window.api.tasks.getDayPlan(getToday())) as DayPlan | null
      const todayTasks = (await window.api.tasks.getByDate(getToday())) as Task[]
      setDayPlan(plan)
      setTasks(todayTasks)
    } catch (e) {
      console.error('Failed to load today data:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleCarryOver(task: Task): Promise<void> {
    const currentCount = await window.api.tasks.getCarryOverCount(getToday())
    if (currentCount >= 2) {
      setError('Max 2 carry-over tasks allowed. Drop one first.')
      return
    }
    setCarryOverProcessing(true)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    await window.api.tasks.carryOver(task.id, getToday())
    setMissedFromYesterday((prev) => prev.filter((t) => t.id !== task.id))
    await loadTodayData()
    setCarryOverProcessing(false)
  }

  async function handleDrop(task: Task): Promise<void> {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    await window.api.tasks.drop(task.id, yesterday.toISOString().slice(0, 10))
    setMissedFromYesterday((prev) => prev.filter((t) => t.id !== task.id))
  }

  async function handleDismissCarryOver(): Promise<void> {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    await window.api.tasks.markMissed(yesterday.toISOString().slice(0, 10))
    setShowCarryOver(false)
    setMissedFromYesterday([])
  }

  async function handleGenerateTasks(): Promise<void> {
    setGenerating(true)
    setError('')
    try {
      const config = (await window.api.config.get()) as Record<string, string>
      const month = getCurrentMonth()
      const goals = (await window.api.goals.get(month)) as { id: string }[]

      if (!goals || goals.length === 0) {
        setError('No goals found for this month. Set up your goals first.')
        setGenerating(false)
        return
      }

      const allSubgoals: { id: string; title: string; priority: string }[] = []
      for (const goal of goals) {
        const subs = (await window.api.subgoals.getByGoal(goal.id)) as {
          id: string
          title: string
          priority: string
        }[]
        allSubgoals.push(...subs)
      }

      const workStart = config.working_start || '09:00'
      const workEnd = config.working_end || '18:00'
      const breakStart = config.break_start || '13:00'
      const breakEnd = config.break_end || '14:00'

      const [startH, startM] = workStart.split(':').map(Number)
      const [endH, endM] = workEnd.split(':').map(Number)
      const [bStartH, bStartM] = breakStart.split(':').map(Number)
      const [bEndH, bEndM] = breakEnd.split(':').map(Number)

      const totalMinutes = endH * 60 + endM - (startH * 60 + startM)
      const breakMinutes = bEndH * 60 + bEndM - (bStartH * 60 + bStartM)
      const availableMinutes = totalMinutes - breakMinutes

      const result = await window.api.ai.generateDailyTasks({
        availableMinutes,
        workingStart: workStart,
        workingEnd: workEnd,
        subgoals: allSubgoals,
        carryOvers: [],
        behaviorFlags: [],
      })

      if (!result.success || !result.data) {
        setError('Failed to generate tasks. Check your API key.')
        setGenerating(false)
        return
      }

      const generated = result.data as {
        title: string
        effort: string
        proof_type: string
        subgoal_id: string
        scheduled_time_slot: string
      }[]

      await window.api.tasks.saveDayPlan({
        date: getToday(),
        available_minutes: availableMinutes,
      })

      await window.api.tasks.saveTasks(
        generated.map((t) => ({
          ...t,
          scheduled_date: getToday(),
          status: 'pending',
        })),
      )

      await loadTodayData()
    } catch (e) {
      setError('Something went wrong generating tasks.')
      console.error(e)
    } finally {
      setGenerating(false)
    }
  }

  async function handleLockPlan(): Promise<void> {
    if (!dayPlan) return
    setLocking(true)
    await window.api.tasks.lockDayPlan(getToday())
    await loadTodayData()
    setLocking(false)
  }

  async function handleComplete(task: Task): Promise<void> {
    if (task.proof_type !== 'none') {
      setShowProof((prev) => ({ ...prev, [task.id]: true }))
      return
    }
    await completeTask(task, null)
  }

  async function handleProofSubmit(task: Task): Promise<void> {
    const proof = proofInput[task.id]?.trim()
    if (!proof) {
      setError('Proof is required to complete this task.')
      return
    }
    if (task.proof_type === 'link' && !proof.startsWith('http')) {
      setError('Please enter a valid URL starting with http.')
      return
    }
    setError('')
    await completeTask(task, proof)
    setShowProof((prev) => ({ ...prev, [task.id]: false }))
  }

  async function completeTask(task: Task, proof: string | null): Promise<void> {
    setCompletingId(task.id)
    await window.api.tasks.completeTask(task.id, proof)
    await loadTodayData()
    setCompletingId(null)
  }

  const completedCount = tasks.filter((t) => t.status === 'completed').length
  const totalCount = tasks.length
  const score = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const isLocked = dayPlan?.locked === 1

  if (loading) {
    return (
      <div className="h-screen w-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-600 text-sm">Loading...</p>
      </div>
    )
  }

  return (
    <div className="h-screen w-screen bg-gray-950 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Carry Over Modal */}
        {showCarryOver && missedFromYesterday.length > 0 && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-6">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md">
              <h2 className="text-white font-bold text-lg mb-1">Missed Tasks</h2>
              <p className="text-gray-500 text-xs mb-4">
                You missed {missedFromYesterday.length} task
                {missedFromYesterday.length > 1 ? 's' : ''} yesterday. Max 2 can carry forward.
              </p>

              <div className="space-y-3 mb-5">
                {missedFromYesterday.map((task) => (
                  <div key={task.id} className="bg-gray-800 border border-gray-700 rounded-xl p-3">
                    <p className="text-white text-sm mb-2">{task.title}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCarryOver(task)}
                        disabled={carryOverProcessing}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white text-xs font-semibold py-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        Carry Forward
                      </button>
                      <button
                        onClick={() => handleDrop(task)}
                        disabled={carryOverProcessing}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-700 text-gray-300 text-xs font-semibold py-1.5 rounded-lg cursor-pointer transition-colors"
                      >
                        Drop
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleDismissCarryOver}
                className="w-full text-gray-600 hover:text-gray-400 text-xs cursor-pointer transition-colors"
              >
                Mark all as missed and continue
              </button>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">Today</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              {new Date().toLocaleDateString('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/goals')}
              className="text-gray-600 hover:text-gray-400 text-xs transition-colors cursor-pointer"
            >
              Goals ↗
            </button>
            <button
              onClick={() => navigate('/report/daily')}
              className="text-gray-600 hover:text-gray-400 text-xs transition-colors cursor-pointer"
            >
              Report
            </button>
          </div>
        </div>

        {/* Score Bar */}
        {tasks.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-gray-400 text-xs">
                {completedCount} of {totalCount} completed
              </span>
              <span className="text-white text-sm font-bold">{score}%</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${score}%` }}
              />
            </div>
          </div>
        )}

        {/* No tasks state */}
        {tasks.length === 0 && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center mb-6">
            <p className="text-gray-400 text-sm mb-1">No tasks for today.</p>
            <p className="text-gray-600 text-xs">Generate your daily plan to get started.</p>
          </div>
        )}

        {/* Tasks */}
        {tasks.length > 0 && (
          <div className="space-y-3 mb-6">
            {tasks.map((task) => (
              <div
                key={task.id}
                className={`bg-gray-900 border rounded-xl p-4 transition-colors ${
                  task.status === 'completed' ? 'border-green-900 opacity-60' : 'border-gray-800'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={() => task.status !== 'completed' && handleComplete(task)}
                    disabled={task.status === 'completed' || completingId === task.id || !isLocked}
                    className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors cursor-pointer ${
                      task.status === 'completed'
                        ? 'bg-green-600 border-green-600'
                        : 'border-gray-600 hover:border-blue-500'
                    }`}
                  >
                    {task.status === 'completed' && <span className="text-white text-xs">✓</span>}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${
                        task.status === 'completed' ? 'text-gray-500 line-through' : 'text-white'
                      }`}
                    >
                      {task.title}
                    </p>

                    <div className="flex items-center gap-2 mt-1.5">
                      <span
                        className={`text-xs font-medium px-1.5 py-0.5 rounded border ${EFFORT_COLORS[task.effort]}`}
                      >
                        {EFFORT_LABELS[task.effort]}
                      </span>
                      {task.proof_type !== 'none' && (
                        <span className="text-xs text-gray-600">
                          {task.proof_type === 'link' ? '🔗 link required' : '💬 comment required'}
                        </span>
                      )}
                      {task.carry_count > 0 && (
                        <span className="text-xs text-orange-500">carried {task.carry_count}×</span>
                      )}
                    </div>

                    {/* Proof completed */}
                    {task.status === 'completed' && task.proof_value && (
                      <p className="text-xs text-gray-600 mt-1.5 truncate">✓ {task.proof_value}</p>
                    )}

                    {/* Proof input */}
                    {showProof[task.id] && task.status !== 'completed' && (
                      <div className="mt-3 space-y-2">
                        <input
                          type={task.proof_type === 'link' ? 'url' : 'text'}
                          placeholder={
                            task.proof_type === 'link' ? 'https://...' : 'Describe what you did...'
                          }
                          value={proofInput[task.id] || ''}
                          onChange={(e) =>
                            setProofInput((prev) => ({ ...prev, [task.id]: e.target.value }))
                          }
                          className="w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-xs placeholder-gray-700 focus:outline-none focus:border-blue-500"
                        />
                        <button
                          onClick={() => handleProofSubmit(task)}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold px-4 py-1.5 rounded-lg cursor-pointer transition-colors"
                        >
                          Mark Complete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-950 border border-red-800 rounded-lg px-4 py-2.5 mb-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {!isLocked && (
            <button
              onClick={handleGenerateTasks}
              disabled={generating}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold py-3 rounded-lg transition-colors text-sm cursor-pointer"
            >
              {generating ? 'Generating tasks...' : "Generate Today's Tasks"}
            </button>
          )}

          {tasks.length > 0 && !isLocked && (
            <button
              onClick={handleLockPlan}
              disabled={locking}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white font-semibold py-3 rounded-lg transition-colors text-sm cursor-pointer"
            >
              {locking ? 'Locking...' : '🔒 Lock Plan & Start Day'}
            </button>
          )}

          {isLocked && tasks.every((t) => t.status === 'completed') && (
            <div className="bg-green-950 border border-green-800 rounded-xl p-4 text-center">
              <p className="text-green-400 font-semibold text-sm">All tasks complete. 100%.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
