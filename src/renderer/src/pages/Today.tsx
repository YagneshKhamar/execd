import { Fragment, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, FileText, Users } from 'lucide-react'
import { useToast } from '../components/Toast'

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
  notes: string
}

interface DayPlan {
  id: string
  date: string
  available_minutes: number
  locked: number
  replan_used: number
}

interface GoalItem {
  id: string
  type: 'business' | 'personal' | 'family'
}

interface SubgoalOption {
  id: string
  title: string
  goalType: 'business' | 'personal' | 'family'
}

const EFFORT_LABELS = { light: '30m', medium: '1h', heavy: '2h' }
const EFFORT_COLORS = {
  light:
    'font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20',
  medium:
    'font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)] border border-[var(--accent-yellow)]/20',
  heavy:
    'font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20',
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function getTomorrow(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toISOString().slice(0, 10)
}

export default function Today(): React.JSX.Element {
  const navigate = useNavigate()
  const [tasks, setTasks] = useState<Task[]>([])
  const [dayPlan, setDayPlan] = useState<DayPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [locking, setLocking] = useState(false)
  const [completingId, setCompletingId] = useState<string | null>(null)
  const [openProofTaskId, setOpenProofTaskId] = useState<string | null>(null)
  const [proofInputs, setProofInputs] = useState<Record<string, string>>({})
  const [showNotes, setShowNotes] = useState<Record<string, boolean>>({})
  const [notesInput, setNotesInput] = useState<Record<string, string>>({})
  const [savingNotes, setSavingNotes] = useState<string | null>(null)
  const [missedFromYesterday, setMissedFromYesterday] = useState<Task[]>([])
  const [showCarryOver, setShowCarryOver] = useState(false)
  const [carryOverProcessing, setCarryOverProcessing] = useState(false)
  const [endingDay, setEndingDay] = useState(false)
  const [dayEnded, setDayEnded] = useState(false)
  const [endDayResult, setEndDayResult] = useState<{
    score: number
    feedback: string
  } | null>(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [addingForDate, setAddingForDate] = useState<'today' | 'tomorrow'>('today')
  const [newTask, setNewTask] = useState({
    title: '',
    effort: 'medium' as 'light' | 'medium' | 'heavy',
    proof_type: 'none' as 'none' | 'comment' | 'link',
    scheduled_time_slot: 'anytime' as 'morning' | 'afternoon' | 'anytime',
  })
  const [addingTask, setAddingTask] = useState(false)
  const [selectedSubgoalId, setSelectedSubgoalId] = useState('')
  const [subgoalOptions, setSubgoalOptions] = useState<SubgoalOption[]>([])
  const [followupCount, setFollowupCount] = useState(0)
  const { error, success } = useToast()

  useEffect(() => {
    loadTodayData()
    loadFollowupCount()
  }, [])

  async function loadFollowupCount(): Promise<void> {
    try {
      const followups = (await window.api.team.getFollowups(getToday())) as unknown[]
      setFollowupCount(followups.length)
    } catch {
      setFollowupCount(0)
    }
  }

  useEffect(() => {
    async function loadSubgoalsForModal(): Promise<void> {
      if (!showAddTask) return
      try {
        const goals = (await window.api.goals.get(getCurrentMonth())) as GoalItem[]
        const options: SubgoalOption[] = []
        for (const goal of goals) {
          const subs = (await window.api.subgoals.getByGoal(goal.id)) as {
            id: string
            title: string
          }[]
          options.push(
            ...subs.map((sub) => ({
              id: sub.id,
              title: sub.title,
              goalType: goal.type,
            })),
          )
        }
        setSubgoalOptions(options)
      } catch (e) {
        console.error('Failed to load subgoals for add task modal:', e)
        error('Failed to load subgoals.')
      }
    }
    loadSubgoalsForModal()
  }, [showAddTask, error])

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
      const initialNotes: Record<string, string> = {}
      todayTasks.forEach((t) => {
        initialNotes[t.id] = t.notes || ''
      })
      setNotesInput(initialNotes)
    } catch (e) {
      console.error('Failed to load today data:', e)
    } finally {
      setLoading(false)
    }
  }

  async function handleCarryOver(task: Task): Promise<void> {
    const currentCount = await window.api.tasks.getCarryOverCount(getToday())
    if (currentCount >= 2) {
      error('Max 2 carry-over tasks. Drop one first.')
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
    try {
      const config = (await window.api.config.get()) as Record<string, string | number>
      const month = getCurrentMonth()
      const goals = (await window.api.goals.get(month)) as { id: string }[]

      if (!goals || goals.length === 0) {
        error('Failed to generate tasks. Check your API key.')
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
      const maxDailyTasks = Number(config.max_daily_tasks ?? 5)

      const [startH, startM] = String(workStart).split(':').map(Number)
      const [endH, endM] = String(workEnd).split(':').map(Number)
      const [bStartH, bStartM] = String(breakStart).split(':').map(Number)
      const [bEndH, bEndM] = String(breakEnd).split(':').map(Number)

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
        maxTasks: maxDailyTasks || 5,
      })

      if (!result.success || !result.data) {
        error('Failed to generate tasks. Check your API key.')
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
      success('Tasks generated for today.')
    } catch (e) {
      error('Failed to generate tasks. Check your API key.')
      console.error(e)
    } finally {
      setGenerating(false)
    }
  }

  async function handleEndDay(): Promise<void> {
    setEndingDay(true)
    try {
      const result = await window.api.tasks.endOfDay(getToday())
      setEndDayResult({ score: result.score, feedback: result.feedback })
      setDayEnded(true)
      await loadTodayData()
      success('Day complete. Good work.')
    } catch (e) {
      error('Failed to end day. Try again.')
      console.error(e)
    } finally {
      setEndingDay(false)
    }
  }

  async function handleLockPlan(): Promise<void> {
    if (!dayPlan) return
    setLocking(true)
    try {
      await window.api.tasks.lockDayPlan(getToday())
      await loadTodayData()
      success('Plan locked. Day started.')
    } catch {
      error('Failed to lock plan.')
    } finally {
      setLocking(false)
    }
  }

  async function handleComplete(task: Task): Promise<void> {
    if (task.status === 'completed') {
      await window.api.tasks.uncompleteTask(task.id)
      await loadTodayData()
      return
    }
    const proof = proofInputs[task.id]?.trim()
    await completeTask(task, proof || null)
  }

  async function completeTask(task: Task, proof: string | null): Promise<void> {
    setCompletingId(task.id)
    await window.api.tasks.completeTask(task.id, proof)
    await loadTodayData()
    setCompletingId(null)
  }

  async function handleAddTask(): Promise<void> {
    if (!newTask.title.trim() || !selectedSubgoalId) return
    setAddingTask(true)
    try {
      const targetDate = addingForDate === 'today' ? getToday() : getTomorrow()
      await window.api.tasks.saveTasks([
        {
          title: newTask.title.trim(),
          effort: newTask.effort,
          proof_type: newTask.proof_type,
          subgoal_id: selectedSubgoalId,
          scheduled_date: targetDate,
          scheduled_time_slot: newTask.scheduled_time_slot,
          status: 'pending',
        },
      ])
      await loadTodayData()
      await loadFollowupCount()
      setShowAddTask(false)
      setNewTask({
        title: '',
        effort: 'medium',
        proof_type: 'none',
        scheduled_time_slot: 'anytime',
      })
      setSelectedSubgoalId('')
      success(`Task added for ${addingForDate}.`)
    } catch (e) {
      console.error('Failed to add task:', e)
      error('Failed to add task.')
    } finally {
      setAddingTask(false)
    }
  }

  const completedCount = tasks.filter((t) => t.status === 'completed').length
  const totalCount = tasks.length
  const score = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0
  const isLocked = dayPlan?.locked === 1
  const carriedCount = tasks.reduce((sum, task) => sum + task.carry_count, 0)

  if (loading) {
    return (
      <div className="h-full w-full bg-[var(--bg-base)] flex items-center justify-center">
        <p className="text-[var(--text-muted)] text-sm font-mono">loading...</p>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg-base)]">
      <div className="max-w-4xl mx-auto px-8 py-8">
        {showAddTask && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg p-6 w-full max-w-sm">
              <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">
                Add Task for {addingForDate === 'today' ? 'Today' : 'Tomorrow'}
              </h2>
              <div className="space-y-3">
                <input
                  type="text"
                  value={newTask.title}
                  onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="What needs to be done?"
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                />
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-1">Effort</p>
                  <div className="flex gap-1.5">
                    {(
                      [
                        { label: '30m', value: 'light' },
                        { label: '1h', value: 'medium' },
                        { label: '2h', value: 'heavy' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.value}
                        onClick={() => setNewTask((prev) => ({ ...prev, effort: item.value }))}
                        className={`font-mono text-xs px-3 py-1.5 rounded transition-colors ${
                          newTask.effort === item.value
                            ? 'bg-[var(--accent-blue)] text-white border border-[var(--accent-blue)]'
                            : 'bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)] cursor-pointer'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-1">Proof type</p>
                  <div className="flex gap-1.5">
                    {(
                      [
                        { label: 'None', value: 'none' },
                        { label: 'Comment', value: 'comment' },
                        { label: 'Link', value: 'link' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.value}
                        onClick={() => setNewTask((prev) => ({ ...prev, proof_type: item.value }))}
                        className={`font-mono text-xs px-3 py-1.5 rounded transition-colors ${
                          newTask.proof_type === item.value
                            ? 'bg-[var(--accent-blue)] text-white border border-[var(--accent-blue)]'
                            : 'bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)] cursor-pointer'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-1">Time slot</p>
                  <div className="flex gap-1.5">
                    {(
                      [
                        { label: 'Morning', value: 'morning' },
                        { label: 'Afternoon', value: 'afternoon' },
                        { label: 'Anytime', value: 'anytime' },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.value}
                        onClick={() =>
                          setNewTask((prev) => ({ ...prev, scheduled_time_slot: item.value }))
                        }
                        className={`font-mono text-xs px-3 py-1.5 rounded transition-colors ${
                          newTask.scheduled_time_slot === item.value
                            ? 'bg-[var(--accent-blue)] text-white border border-[var(--accent-blue)]'
                            : 'bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)] cursor-pointer'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-[var(--text-secondary)] mb-1">Subgoal</p>
                  <select
                    value={selectedSubgoalId}
                    onChange={(e) => setSelectedSubgoalId(e.target.value)}
                    className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                  >
                    <option value="">Select subgoal</option>
                    {subgoalOptions.map((subgoal) => (
                      <option key={subgoal.id} value={subgoal.id}>
                        [{subgoal.goalType}] — {subgoal.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2 mt-5">
                  <button
                    onClick={() => setShowAddTask(false)}
                    className="flex-1 bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium py-2 rounded text-sm cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddTask}
                    disabled={!newTask.title.trim() || !selectedSubgoalId || addingTask}
                    className="flex-1 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2 rounded text-sm cursor-pointer transition-colors"
                  >
                    {addingTask ? 'Adding...' : 'Add Task'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Carry Over Modal */}
        {showCarryOver && missedFromYesterday.length > 0 && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
            <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl p-6 w-full max-w-sm">
              <h2 className="text-[var(--text-primary)] font-semibold text-base mb-1">
                Missed Yesterday
              </h2>
              <p className="text-[var(--text-secondary)] text-xs mb-4">
                You missed {missedFromYesterday.length} task
                {missedFromYesterday.length > 1 ? 's' : ''} yesterday. Max 2 can carry forward.
              </p>
              <div className="space-y-3 mb-5">
                {missedFromYesterday.map((task) => (
                  <div
                    key={task.id}
                    className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-3 mb-3"
                  >
                    <p className="text-sm text-[var(--text-primary)] mb-2">{task.title}</p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleCarryOver(task)}
                        disabled={carryOverProcessing}
                        className="flex-1 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] text-white text-xs font-medium py-1.5 rounded cursor-pointer transition-colors"
                      >
                        Carry Forward
                      </button>
                      <button
                        onClick={() => handleDrop(task)}
                        disabled={carryOverProcessing}
                        className="flex-1 bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] text-xs font-medium py-1.5 rounded cursor-pointer transition-colors"
                      >
                        Drop
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleDismissCarryOver}
                className="w-full text-[var(--text-muted)] hover:text-[var(--text-secondary)] text-xs cursor-pointer transition-colors mt-2 text-center"
              >
                Mark all as missed and continue
              </button>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              {new Date().toLocaleDateString('en-US', {
                month: 'long',
                day: 'numeric',
              })}
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              {new Date().toLocaleDateString('en-US', { weekday: 'long' })}
            </p>
          </div>
          <span
            className={`font-mono text-sm font-semibold px-2 py-1 rounded ${
              score >= 80
                ? 'bg-[var(--accent-green)]/10 text-[var(--accent-green)]'
                : score >= 50
                  ? 'bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)]'
                  : 'bg-[var(--accent-red)]/10 text-[var(--accent-red)]'
            }`}
          >
            {score}%
          </span>
        </div>

        {tasks.length > 0 && isLocked && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4">
              <div
                className={`font-mono text-2xl ${
                  score >= 80
                    ? 'text-[var(--accent-green)]'
                    : score >= 50
                      ? 'text-[var(--accent-yellow)]'
                      : 'text-[var(--accent-red)]'
                }`}
              >
                {score}%
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1 uppercase tracking-wider">
                execution score
              </div>
              <div className="h-0.5 mt-2 bg-[var(--border-default)] rounded">
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
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4">
              <div className="font-mono text-2xl text-[var(--text-primary)]">
                {completedCount} / {totalCount}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1 uppercase tracking-wider">
                tasks
              </div>
            </div>
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4">
              <div className="font-mono text-2xl text-[var(--text-secondary)]">
                {tasks.filter((t) => t.status !== 'completed').length}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1 uppercase tracking-wider">
                remaining
              </div>
            </div>
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-4">
              <div
                className={`font-mono text-2xl ${
                  carriedCount > 0 ? 'text-[var(--accent-orange)]' : 'text-[var(--text-secondary)]'
                }`}
              >
                {carriedCount}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1 uppercase tracking-wider">
                carried over
              </div>
            </div>
          </div>
        )}

        {/* No tasks state */}
        {tasks.length === 0 && (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-8 text-center mb-6">
            <p className="text-[var(--text-secondary)] text-sm mb-1">No tasks for today.</p>
            <p className="text-[var(--text-muted)] text-xs">
              Generate your daily plan to get started.
            </p>
          </div>
        )}

        {/* Tasks */}
        {followupCount > 0 && (
          <button
            onClick={() => navigate('/team?tab=followups')}
            className="w-full bg-[var(--accent-orange)]/5 border border-[var(--accent-orange)]/20 rounded p-3 mb-4 flex items-center gap-2 cursor-pointer transition-colors hover:bg-[var(--accent-orange)]/10"
          >
            <Users className="w-4 h-4 text-[var(--accent-orange)]" />
            <span className="text-sm text-[var(--accent-orange)]">
              {followupCount} team follow-up{followupCount !== 1 ? 's' : ''} scheduled for today
            </span>
          </button>
        )}

        {tasks.length > 0 && (
          <div className="mb-6">
            {!isLocked && tasks.length > 0 && (
              <div className="mb-2 border-l-2 border-[var(--accent-yellow)] bg-[var(--bg-elevated)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                Lock your plan to begin execution
              </div>
            )}
            {tasks.map((task) => (
              <Fragment key={task.id}>
                <div
                  className={`bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] rounded-xl p-4 mb-2 transition-colors ${
                    task.status === 'completed' ? 'opacity-50' : ''
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => handleComplete(task)}
                      disabled={completingId === task.id || !isLocked}
                      title={
                        !isLocked ? 'Lock your plan first to start completing tasks' : undefined
                      }
                      className={`mt-0.5 w-4 h-4 rounded-sm border border-[var(--border-default)] flex items-center justify-center shrink-0 transition-colors ${
                        task.status === 'completed'
                          ? 'bg-[var(--accent-green)] text-white'
                          : 'bg-transparent'
                      } ${!isLocked ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'} ${
                        completingId === task.id ? 'cursor-not-allowed opacity-40' : ''
                      }`}
                    >
                      {task.status === 'completed' && (
                        <span className="text-[10px] leading-none">✓</span>
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <p
                          className={`flex-1 text-sm ${
                            task.status === 'completed'
                              ? 'text-[var(--text-secondary)] line-through'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {task.title}
                        </p>
                        <span className={`${EFFORT_COLORS[task.effort]} shrink-0`}>
                          {EFFORT_LABELS[task.effort]}
                        </span>
                        <span className="text-xs text-[var(--text-secondary)] capitalize shrink-0">
                          {task.scheduled_time_slot}
                        </span>
                        {task.proof_type !== 'none' && (
                          <button
                            onClick={() =>
                              setOpenProofTaskId((prev) => (prev === task.id ? null : task.id))
                            }
                            title={task.proof_value ? 'View proof' : 'Add proof'}
                            className={`shrink-0 cursor-pointer transition-colors ${
                              task.proof_value
                                ? 'text-[var(--accent-blue)]/70'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                            }`}
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1.5">
                        {task.carry_count > 0 && (
                          <span className="font-mono text-[10px] text-[var(--accent-orange)]">
                            ×{task.carry_count} carried
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() =>
                          setShowNotes((prev) => ({
                            ...prev,
                            [task.id]: !prev[task.id],
                          }))
                        }
                        className={`flex items-center gap-1 text-[10px] font-mono cursor-pointer transition-colors mt-1.5 ${
                          task.notes
                            ? 'text-[var(--accent-blue)]'
                            : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                        }`}
                      >
                        <FileText className="w-3 h-3" />
                        {task.notes ? 'notes' : 'add note'}
                      </button>

                      {showNotes[task.id] && (
                        <div className="mt-2">
                          <textarea
                            value={notesInput[task.id] || ''}
                            onChange={(e) =>
                              setNotesInput((prev) => ({ ...prev, [task.id]: e.target.value }))
                            }
                            placeholder="Add notes, links, context..."
                            rows={3}
                            className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none resize-none transition-colors font-mono"
                          />
                          <button
                            onClick={async () => {
                              setSavingNotes(task.id)
                              await window.api.tasks.updateNotes(task.id, notesInput[task.id] || '')
                              await loadTodayData()
                              setSavingNotes(null)
                            }}
                            disabled={savingNotes === task.id}
                            className="mt-1.5 text-xs bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 text-white px-3 py-1 rounded cursor-pointer transition-colors"
                          >
                            {savingNotes === task.id ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      )}

                      {task.notes && !showNotes[task.id] && (
                        <p className="text-[10px] text-[var(--text-muted)] font-mono mt-1 truncate max-w-xs">
                          {task.notes}
                        </p>
                      )}

                      {isLocked && task.status === 'pending' && task.proof_type !== 'none' && (
                        <p className="text-xs text-[var(--text-muted)] mt-1">
                          {task.proof_type === 'link' ? 'requires link' : 'requires comment'}
                        </p>
                      )}

                      {task.status === 'completed' && task.proof_value && (
                        <p className="text-xs text-[var(--text-muted)] mt-1.5 truncate">
                          {task.proof_value}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                {openProofTaskId === task.id && task.proof_type !== 'none' && (
                  <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 mb-2">
                    <p className="text-xs text-[var(--text-muted)] mb-1.5">Proof (optional)</p>
                    {task.proof_type === 'link' ? (
                      <input
                        type="text"
                        placeholder="Paste link..."
                        value={proofInputs[task.id] ?? task.proof_value ?? ''}
                        onChange={(e) =>
                          setProofInputs((prev) => ({ ...prev, [task.id]: e.target.value }))
                        }
                        className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-colors font-mono"
                      />
                    ) : (
                      <textarea
                        rows={2}
                        placeholder="Add note..."
                        value={proofInputs[task.id] ?? task.proof_value ?? ''}
                        onChange={(e) =>
                          setProofInputs((prev) => ({ ...prev, [task.id]: e.target.value }))
                        }
                        className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none resize-none transition-colors font-mono"
                      />
                    )}
                    <button
                      onClick={async () => {
                        const proof = proofInputs[task.id] ?? task.proof_value ?? ''
                        await window.api.tasks.updateProof(task.id, proof)
                        await loadTodayData()
                        setOpenProofTaskId(null)
                      }}
                      className="mt-1.5 text-xs bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 text-white px-3 py-1 rounded cursor-pointer transition-colors"
                    >
                      Save
                    </button>
                  </div>
                )}
              </Fragment>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-3">
          {!isLocked && (
            <button
              onClick={handleGenerateTasks}
              disabled={generating}
              className="w-full bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded text-sm cursor-pointer transition-colors"
            >
              {generating ? 'Generating tasks...' : "Generate Today's Tasks"}
            </button>
          )}

          {tasks.length > 0 && !isLocked && (
            <button
              onClick={handleLockPlan}
              disabled={locking}
              className="w-full bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded text-sm cursor-pointer transition-colors"
            >
              {locking ? 'Locking...' : '🔒 Lock Plan & Start Day'}
            </button>
          )}

          {isLocked && dayPlan?.replan_used === 0 && (
            <button
              disabled
              className="w-full bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium py-2.5 rounded text-sm cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Replan Today (once)
            </button>
          )}

          {isLocked && (
            <button
              onClick={() => {
                setAddingForDate('today')
                setShowAddTask(true)
              }}
              className="w-full bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium py-2.5 rounded text-sm cursor-pointer transition-colors"
            >
              Add Task Today
            </button>
          )}

          {isLocked && (
            <button
              onClick={() => {
                setAddingForDate('tomorrow')
                setShowAddTask(true)
              }}
              className="w-full bg-transparent border border-[var(--border-subtle)] hover:border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] font-medium py-2.5 rounded text-sm cursor-pointer transition-colors"
            >
              Add Task Tomorrow
            </button>
          )}

          {isLocked &&
            tasks.length > 0 &&
            !dayEnded &&
            !tasks.every((t) => t.status === 'completed') && (
              <button
                onClick={handleEndDay}
                disabled={endingDay}
                className="w-full bg-transparent border border-[var(--accent-red)]/30 hover:border-[var(--accent-red)] text-[var(--accent-red)] font-medium py-2.5 rounded text-sm cursor-pointer transition-colors"
              >
                {endingDay ? 'Ending day...' : 'End Day'}
              </button>
            )}

          {dayEnded && endDayResult && (
            <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[var(--text-secondary)] text-xs">Execution score</span>
                <span className="text-[var(--text-primary)] font-bold text-sm">
                  {Math.round(endDayResult.score * 100)}%
                </span>
              </div>
              <p className="text-[var(--text-secondary)] text-xs leading-relaxed">
                {endDayResult.feedback}
              </p>
              <button
                onClick={() => navigate('/report/daily')}
                className="text-[var(--accent-blue)] hover:text-[var(--accent-blue-dim)] text-xs cursor-pointer transition-colors"
              >
                View full report →
              </button>
            </div>
          )}

          {isLocked && !dayEnded && tasks.every((t) => t.status === 'completed') && (
            <div className="flex items-center gap-2 text-[var(--accent-green)] text-sm">
              <CheckCircle className="w-4 h-4" />
              <p>All tasks complete</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
