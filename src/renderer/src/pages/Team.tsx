import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '../components/Toast'

interface TeamMember {
  id: string
  name: string
  role: string
  email: string
}

interface TeamTask {
  id: string
  member_id: string
  member_name: string
  title: string
  description: string
  effort: 'light' | 'medium' | 'heavy'
  status: 'pending' | 'completed' | 'blocked'
  due_date: string
  week_start: string
  notes: string
  proof_value: string | null
  days_overdue?: number
}

interface Followup {
  id: string
  member_id: string
  team_task_id: string
  member_name: string
  task_title: string
  note: string
  scheduled_date: string
}

const EFFORT_COLORS = {
  light:
    'font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20',
  medium:
    'font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)] border border-[var(--accent-yellow)]/20',
  heavy:
    'font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20',
}

function getWeekStart(): string {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function getTomorrow(): string {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  return tomorrow.toISOString().slice(0, 10)
}

function getWeekRangeLabel(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00`)
  const end = new Date(`${weekStart}T00:00:00`)
  end.setDate(start.getDate() + 6)
  const fmt = (d: Date): string =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  return `${fmt(start)} — ${fmt(end)}`
}

function getDefaultDueDate(weekStart: string): string {
  const friday = new Date(`${weekStart}T00:00:00`)
  friday.setDate(friday.getDate() + 4)
  return friday.toISOString().slice(0, 10)
}

export default function Team(): React.JSX.Element {
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const weekStart = useMemo(() => getWeekStart(), [])
  const [tab, setTab] = useState<'members' | 'week' | 'followups'>('week')
  const [members, setMembers] = useState<TeamMember[]>([])
  const [weekTasks, setWeekTasks] = useState<TeamTask[]>([])
  const [followups, setFollowups] = useState<Followup[]>([])
  const [overdue, setOverdue] = useState<TeamTask[]>([])
  const [selectedMember, setSelectedMember] = useState<string | null>(null)
  const [showAddMember, setShowAddMember] = useState(false)
  const [showAddTask, setShowAddTask] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showFollowupModalForTask, setShowFollowupModalForTask] = useState<TeamTask | null>(null)
  const [activeNoteTaskId, setActiveNoteTaskId] = useState<string | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({})
  const [newMember, setNewMember] = useState({ name: '', role: '', email: '' })
  const [newTask, setNewTask] = useState({
    member_id: '',
    title: '',
    description: '',
    effort: 'medium' as 'light' | 'medium' | 'heavy',
    due_date: getDefaultDueDate(weekStart),
  })
  const [followupDraft, setFollowupDraft] = useState({ scheduled_date: getTomorrow(), note: '' })
  const { error, success } = useToast()

  async function loadData(): Promise<void> {
    try {
      const [membersData, tasksData, followupsData, overdueData] = await Promise.all([
        window.api.team.getMembers(),
        window.api.team.getAllTasks(weekStart),
        window.api.team.getFollowups(getToday()),
        window.api.team.getOverdue(),
      ])
      setMembers(membersData as TeamMember[])
      setWeekTasks(tasksData as TeamTask[])
      setFollowups(followupsData as Followup[])
      setOverdue(overdueData as TeamTask[])
    } catch {
      error(t('toast.loadTeamFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'followups') setTab('followups')
  }, [searchParams])

  async function handleAddMember(): Promise<void> {
    if (!newMember.name.trim()) return
    const result = await window.api.team.addMember(newMember)
    if (result.success) {
      success(t('toast.memberAdded'))
      setShowAddMember(false)
      setNewMember({ name: '', role: '', email: '' })
      await loadData()
    } else {
      error(t('toast.memberAddFailed'))
    }
  }

  async function handleAssignTask(): Promise<void> {
    if (!newTask.member_id || !newTask.title.trim()) return
    const result = await window.api.team.addTask({
      member_id: newTask.member_id,
      title: newTask.title.trim(),
      description: newTask.description.trim(),
      effort: newTask.effort,
      due_date: newTask.due_date,
      week_start: weekStart,
    })
    if (result.success) {
      success(t('toast.taskAssigned'))
      setShowAddTask(false)
      setNewTask({
        member_id: members[0]?.id ?? '',
        title: '',
        description: '',
        effort: 'medium',
        due_date: getDefaultDueDate(weekStart),
      })
      await loadData()
    } else {
      error(t('toast.taskAssignFailed'))
    }
  }

  async function handleStatus(
    taskId: string,
    status: 'pending' | 'completed' | 'blocked',
  ): Promise<void> {
    const result = await window.api.team.updateTaskStatus(taskId, status)
    if (result.success) {
      await loadData()
    } else {
      error(t('toast.statusUpdateFailed'))
    }
  }

  async function handleSaveNote(taskId: string): Promise<void> {
    const note = (noteDrafts[taskId] ?? '').trim()
    if (!note) return
    const result = await window.api.team.addNote(taskId, note)
    if (result.success) {
      success(t('toast.noteSaved'))
      setActiveNoteTaskId(null)
      await loadData()
    } else {
      error(t('toast.noteSaveFailed'))
    }
  }

  async function handleScheduleFollowup(): Promise<void> {
    if (!showFollowupModalForTask) return
    const result = await window.api.team.addFollowup({
      member_id: showFollowupModalForTask.member_id,
      team_task_id: showFollowupModalForTask.id,
      note: followupDraft.note.trim(),
      scheduled_date: followupDraft.scheduled_date,
    })
    if (result.success) {
      success(t('toast.followupScheduled'))
      setShowFollowupModalForTask(null)
      setFollowupDraft({ scheduled_date: getTomorrow(), note: '' })
      await loadData()
    } else {
      error(t('toast.followupFailed'))
    }
  }

  if (loading) {
    return (
      <div className="h-full w-full bg-[var(--bg-base)] flex items-center justify-center">
        <p className="text-[var(--text-muted)] text-sm font-mono">{t('common.loading')}</p>
      </div>
    )
  }

  const tasksByMember = members
    .map((member) => ({
      member,
      tasks: weekTasks.filter(
        (task) => task.member_id === member.id && (!selectedMember || selectedMember === member.id),
      ),
    }))
    .filter(
      (group) => group.tasks.length > 0 || !selectedMember || selectedMember === group.member.id,
    )

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg-base)] p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex gap-1 mb-6 bg-[var(--bg-surface)] p-1 rounded border border-[var(--border-subtle)] w-fit">
          {(
            [
              { id: 'members', label: t('team.members') },
              { id: 'week', label: t('team.thisWeek') },
              { id: 'followups', label: t('team.followups') },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`font-mono text-xs px-4 py-2 rounded cursor-pointer transition-colors ${
                tab === item.id
                  ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'members' && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">Team Members</h2>
              <button
                onClick={() => setShowAddMember(true)}
                disabled={members.length >= 10}
                title={members.length >= 10 ? 'Max 10 members' : ''}
                className="bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded cursor-pointer transition-colors"
              >
                {t('team.addMember')}
              </button>
            </div>
            <div className="space-y-2">
              {members.map((member) => {
                const count = weekTasks.filter((task) => task.member_id === member.id).length
                return (
                  <div
                    key={member.id}
                    className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {member.name}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)] font-mono">
                          {member.role || '—'}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">{member.email || '—'}</p>
                        <p className="font-mono text-xs text-[var(--accent-blue)] mt-2">
                          {count} tasks this week
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          await window.api.team.removeMember(member.id)
                          await loadData()
                        }}
                        className="text-xs text-[var(--accent-red)] hover:text-red-300 cursor-pointer transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {tab === 'week' && (
          <section>
            <p className="font-mono text-xs text-[var(--text-muted)] mb-4">
              {getWeekRangeLabel(weekStart)}
            </p>

            {overdue.length > 0 && (
              <div className="bg-[var(--accent-red)]/5 border border-[var(--accent-red)]/20 rounded p-3 mb-4">
                <div className="flex items-center gap-2 text-[var(--accent-red)] text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>{overdue.length} overdue tasks need attention</span>
                </div>
                <div className="mt-2 space-y-1">
                  {overdue.map((task) => (
                    <p key={task.id} className="text-xs text-[var(--text-secondary)]">
                      {task.member_name} — {task.title}{' '}
                      <span className="text-[var(--accent-red)]">
                        ({task.days_overdue} days overdue)
                      </span>
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex gap-1.5 flex-wrap">
                <button
                  onClick={() => setSelectedMember(null)}
                  className={`font-mono text-xs px-3 py-1.5 rounded cursor-pointer transition-colors ${
                    selectedMember === null
                      ? 'bg-[var(--accent-blue)] text-white border border-[var(--accent-blue)]'
                      : 'bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)]'
                  }`}
                >
                  {t('team.all')}
                </button>
                {members.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => setSelectedMember(member.id)}
                    className={`font-mono text-xs px-3 py-1.5 rounded cursor-pointer transition-colors ${
                      selectedMember === member.id
                        ? 'bg-[var(--accent-blue)] text-white border border-[var(--accent-blue)]'
                        : 'bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)]'
                    }`}
                  >
                    {member.name}
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  setNewTask((prev) => ({
                    ...prev,
                    member_id: selectedMember ?? members[0]?.id ?? '',
                  }))
                  setShowAddTask(true)
                }}
                className="bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] text-white text-sm font-medium px-4 py-2 rounded cursor-pointer transition-colors"
              >
                {t('team.assignTask')}
              </button>
            </div>

            <div className="space-y-4">
              {tasksByMember.map(({ member, tasks }) => (
                <div key={member.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {member.name}
                    </p>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--border-default)] text-[var(--text-secondary)]">
                      {member.role || 'member'}
                    </span>
                    <span className="font-mono text-xs text-[var(--text-muted)]">
                      {tasks.length} tasks
                    </span>
                  </div>
                  <div className="space-y-2">
                    {tasks.map((task) => (
                      <div
                        key={task.id}
                        className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4 ml-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {task.title}
                          </p>
                          <span className={EFFORT_COLORS[task.effort]}>{task.effort}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono text-xs text-[var(--text-muted)]">
                            {task.due_date}
                          </span>
                          <span
                            className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${
                              task.status === 'completed'
                                ? 'bg-[var(--accent-green)]/10 text-[var(--accent-green)] border-[var(--accent-green)]/20'
                                : task.status === 'blocked'
                                  ? 'bg-[var(--accent-red)]/10 text-[var(--accent-red)] border-[var(--accent-red)]/20'
                                  : 'bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)] border-[var(--accent-yellow)]/20'
                            }`}
                          >
                            {task.status}
                          </span>
                        </div>
                        {task.notes && (
                          <p className="text-xs text-[var(--text-secondary)] italic mt-1">
                            {task.notes}
                          </p>
                        )}
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleStatus(task.id, 'completed')}
                            className="text-xs bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] text-white px-2.5 py-1 rounded cursor-pointer transition-colors"
                          >
                            Mark Done
                          </button>
                          <button
                            onClick={() =>
                              setActiveNoteTaskId((prev) => (prev === task.id ? null : task.id))
                            }
                            className="text-xs bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] px-2.5 py-1 rounded cursor-pointer transition-colors"
                          >
                            Add Note
                          </button>
                          <button
                            onClick={() => setShowFollowupModalForTask(task)}
                            className="text-xs bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] px-2.5 py-1 rounded cursor-pointer transition-colors"
                          >
                            Schedule Follow-up
                          </button>
                        </div>
                        {activeNoteTaskId === task.id && (
                          <div className="mt-2">
                            <textarea
                              value={noteDrafts[task.id] ?? ''}
                              onChange={(e) =>
                                setNoteDrafts((prev) => ({ ...prev, [task.id]: e.target.value }))
                              }
                              rows={2}
                              className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-2.5 py-2 text-xs text-[var(--text-primary)] outline-none"
                            />
                            <button
                              onClick={() => handleSaveNote(task.id)}
                              className="mt-1 text-xs bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] text-white px-2.5 py-1 rounded cursor-pointer transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {tab === 'followups' && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">Today</h2>
              <p className="font-mono text-xs text-[var(--text-muted)]">{getToday()}</p>
            </div>
            {followups.length === 0 ? (
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-6 flex items-center gap-2 text-[var(--text-secondary)]">
                <CheckCircle className="w-4 h-4" />
                <span className="text-sm">No follow-ups scheduled for today</span>
              </div>
            ) : (
              <div className="space-y-2">
                {followups.map((followup) => (
                  <div
                    key={followup.id}
                    className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-xs text-[var(--accent-blue)]">
                          {followup.member_name}
                        </p>
                        <p className="text-sm text-[var(--text-primary)]">{followup.task_title}</p>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">
                          {followup.note || '—'}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          await window.api.team.completeFollowup(followup.id)
                          setFollowups((prev) => prev.filter((f) => f.id !== followup.id))
                        }}
                        className="text-xs bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] text-white px-2.5 py-1 rounded cursor-pointer transition-colors"
                      >
                        Mark Done
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {showAddMember && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-4">Add Member</h3>
            <div className="space-y-2">
              <input
                type="text"
                placeholder="Name"
                value={newMember.name}
                onChange={(e) => setNewMember((prev) => ({ ...prev, name: e.target.value }))}
                className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              />
              <input
                type="text"
                placeholder="Role"
                value={newMember.role}
                onChange={(e) => setNewMember((prev) => ({ ...prev, role: e.target.value }))}
                className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              />
              <input
                type="email"
                placeholder="Email"
                value={newMember.email}
                onChange={(e) => setNewMember((prev) => ({ ...prev, email: e.target.value }))}
                className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              />
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAddMember(false)}
                className="flex-1 bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm py-2 rounded cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddMember}
                disabled={!newMember.name.trim()}
                className="flex-1 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm py-2 rounded cursor-pointer transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddTask && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg p-6 w-full max-w-md">
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-4">
              {t('team.assignTaskTitle')}
            </h3>
            <div className="space-y-2">
              <select
                value={newTask.member_id}
                onChange={(e) => setNewTask((prev) => ({ ...prev, member_id: e.target.value }))}
                className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              >
                <option value="">{t('team.selectMember')}</option>
                {members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder={t('team.taskTitle')}
                value={newTask.title}
                onChange={(e) => setNewTask((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              />
              <textarea
                rows={3}
                placeholder={t('team.descriptionOptional')}
                value={newTask.description}
                onChange={(e) => setNewTask((prev) => ({ ...prev, description: e.target.value }))}
                className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              />
              <div className="flex gap-1.5">
                {(['light', 'medium', 'heavy'] as const).map((effort) => (
                  <button
                    key={effort}
                    onClick={() => setNewTask((prev) => ({ ...prev, effort }))}
                    className={`font-mono text-xs px-3 py-1.5 rounded transition-colors ${
                      newTask.effort === effort
                        ? 'bg-[var(--accent-blue)] text-white border border-[var(--accent-blue)]'
                        : 'bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)] cursor-pointer'
                    }`}
                  >
                    {effort}
                  </button>
                ))}
              </div>
              <input
                type="date"
                value={newTask.due_date}
                onChange={(e) => setNewTask((prev) => ({ ...prev, due_date: e.target.value }))}
                className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              />
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAddTask(false)}
                className="flex-1 bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm py-2 rounded cursor-pointer transition-colors"
              >
                {t('team.cancel')}
              </button>
              <button
                onClick={handleAssignTask}
                disabled={!newTask.member_id || !newTask.title.trim()}
                className="flex-1 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm py-2 rounded cursor-pointer transition-colors"
              >
                {t('team.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showFollowupModalForTask && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-6">
          <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg p-6 w-full max-w-sm">
            <h3 className="text-base font-semibold text-[var(--text-primary)] mb-4">
              Schedule Follow-up
            </h3>
            <div className="space-y-2">
              <input
                type="date"
                value={followupDraft.scheduled_date}
                onChange={(e) =>
                  setFollowupDraft((prev) => ({ ...prev, scheduled_date: e.target.value }))
                }
                className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              />
              <input
                type="text"
                placeholder="Follow-up note"
                value={followupDraft.note}
                onChange={(e) => setFollowupDraft((prev) => ({ ...prev, note: e.target.value }))}
                className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
              />
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowFollowupModalForTask(null)}
                className="flex-1 bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-sm py-2 rounded cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleFollowup}
                className="flex-1 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] text-white text-sm py-2 rounded cursor-pointer transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
