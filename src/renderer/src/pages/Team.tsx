import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import InvitationsPanel from '../components/InvitationsPanel'
import LocalDataMigration from '../components/LocalDataMigration'
import SyncDiagnostics from '../components/SyncDiagnostics'
import SyncStatusBar from '../components/SyncStatusBar'
import TaskHistory from '../components/TaskHistory'
import SearchableSelect, { type SelectOption } from '../components/SearchableSelect'
import { useAuth } from '../components/AuthProvider'
import { useToast } from '../components/Toast'

interface TeamMember {
  id: string
  name: string
  role: string
  email: string
  remote_user_id: string | null
}

type SyncStatus = 'local' | 'pending' | 'unlinked' | 'synced' | 'failed'

interface TeamTask {
  id: string
  member_id: string
  member_name: string
  title: string
  description: string
  effort: 'light' | 'medium' | 'heavy'
  status: 'pending' | 'completed' | 'blocked' | 'awaiting_review' | 'needs_changes'
  due_date: string
  week_start: string
  notes: string
  proof_value: string | null
  sync_status: SyncStatus
  sync_error: string | null
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
  const [departments, setDepartments] = useState<string[]>([])
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
  const [reviewTaskId, setReviewTaskId] = useState<string | null>(null)
  const [reviewNoteDrafts, setReviewNoteDrafts] = useState<Record<string, string>>({})
  const [newMember, setNewMember] = useState({ name: '', role: '', email: '' })
  const [newTask, setNewTask] = useState({
    member_id: '',
    title: '',
    description: '',
    effort: 'medium' as 'light' | 'medium' | 'heavy',
    due_date: getDefaultDueDate(weekStart),
  })
  const [followupDraft, setFollowupDraft] = useState({ scheduled_date: getTomorrow(), note: '' })
  const { error, success, info } = useToast()
  const auth = useAuth()
  const orgConnected = Boolean(auth.state?.signedIn && auth.state.organization)

  async function loadData(): Promise<void> {
    try {
      const [membersData, tasksData, followupsData, overdueData] = await Promise.all([
        window.api.team.getMembers(),
        window.api.team.getAllTasks(weekStart),
        window.api.team.getFollowups(getToday()),
        window.api.team.getOverdue(),
      ])
      const profile = await window.api.business.get()
      setMembers(membersData as TeamMember[])
      setWeekTasks(tasksData as TeamTask[])
      setFollowups(followupsData as Followup[])
      setOverdue(overdueData as TeamTask[])
      setDepartments(profile?.departments ?? [])
    } catch {
      error(t('toast.loadTeamFailed'))
    } finally {
      setLoading(false)
    }
  }

  async function refreshFromRemote(): Promise<void> {
    await window.api.team.syncNow()
    await loadData()
  }

  function reportSync(result: { sync?: string; syncError?: string }): void {
    if (result.sync === 'failed') {
      error(`Saved locally, but could not sync: ${result.syncError ?? 'unknown error'}`)
    } else if (result.sync === 'unlinked') {
      info(
        'Saved locally. This member has not joined your organization yet, so they will not see it.',
      )
    }
  }

  useEffect(() => {
    async function init(): Promise<void> {
      await loadData()
      // Pull in organization members who joined since the last sync.
      if (orgConnected) await refreshFromRemote()
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'followups') setTab('followups')
  }, [searchParams])

  async function handleAddMember(): Promise<void> {
    if (!newMember.name.trim()) return
    const result = await window.api.team.addMember({
      ...newMember,
      role: newMember.role === '__custom__' ? '' : newMember.role,
    })
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
      reportSync(result)
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
    status: TeamTask['status'],
    reviewNote?: string,
  ): Promise<void> {
    const result = await window.api.team.updateTaskStatus(taskId, status, undefined, reviewNote)
    if (result.success) {
      reportSync(result)
      await loadData()
    } else {
      error(t('toast.statusUpdateFailed'))
    }
  }

  async function handleReject(taskId: string): Promise<void> {
    const note = (reviewNoteDrafts[taskId] ?? '').trim()
    await handleStatus(taskId, 'needs_changes', note)
    setReviewTaskId(null)
    success('Sent back for changes')
  }

  async function handleSaveNote(taskId: string): Promise<void> {
    const note = (noteDrafts[taskId] ?? '').trim()
    if (!note) return
    const result = await window.api.team.addNote(taskId, note)
    if (result.success) {
      success(t('toast.noteSaved'))
      reportSync(result)
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

        {tab === 'members' && <LocalDataMigration />}
        {tab === 'members' && <InvitationsPanel />}
        {tab === 'members' && <SyncDiagnostics />}

        {tab === 'members' && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">Team Members</h2>
              <button
                onClick={() => setShowAddMember(true)}
                className="bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] text-white text-sm font-medium px-4 py-2 rounded cursor-pointer transition-colors"
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
                        {orgConnected && (
                          <p
                            className={`font-mono text-[10px] mt-1 ${
                              member.remote_user_id
                                ? 'text-[var(--accent-green)]'
                                : 'text-[var(--text-muted)]'
                            }`}
                          >
                            {member.remote_user_id
                              ? 'Linked to organization account'
                              : 'Not linked yet — links automatically when they join with this email'}
                          </p>
                        )}
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
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono text-xs text-[var(--text-muted)]">
                {getWeekRangeLabel(weekStart)}
              </p>
              {orgConnected && (
                <button
                  onClick={refreshFromRemote}
                  className="font-mono text-xs bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] px-2.5 py-1 rounded cursor-pointer transition-colors"
                >
                  Refresh
                </button>
              )}
            </div>

            {orgConnected && <SyncStatusBar onChange={loadData} />}

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
                  if (orgConnected) refreshFromRemote()
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
                                : task.status === 'blocked' || task.status === 'needs_changes'
                                  ? 'bg-[var(--accent-red)]/10 text-[var(--accent-red)] border-[var(--accent-red)]/20'
                                  : task.status === 'awaiting_review'
                                    ? 'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-[var(--accent-blue)]/20'
                                    : 'bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)] border-[var(--accent-yellow)]/20'
                            }`}
                          >
                            {task.status.replace('_', ' ')}
                          </span>
                          {orgConnected && task.sync_status === 'failed' && (
                            <span
                              title={task.sync_error ?? ''}
                              className="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-[var(--accent-red)]/10 text-[var(--accent-red)] border-[var(--accent-red)]/20"
                            >
                              sync failed
                            </span>
                          )}
                          {orgConnected && task.sync_status === 'pending' && (
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)] border-[var(--accent-yellow)]/20">
                              pending sync
                            </span>
                          )}
                          {orgConnected && task.sync_status === 'unlinked' && (
                            <span
                              title="The assignee has not joined your organization yet"
                              className="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)] border-[var(--accent-yellow)]/20"
                            >
                              not linked
                            </span>
                          )}
                          {orgConnected && task.sync_status === 'synced' && (
                            <span className="font-mono text-[10px] text-[var(--text-muted)]">
                              synced
                            </span>
                          )}
                        </div>
                        {task.notes && (
                          <p className="text-xs text-[var(--text-secondary)] italic mt-1">
                            {task.notes}
                          </p>
                        )}
                        <div className="flex gap-2 mt-3">
                          {task.status === 'awaiting_review' ? (
                            <>
                              <button
                                onClick={() => handleStatus(task.id, 'completed')}
                                className="text-xs bg-[var(--accent-green)] hover:opacity-90 text-white px-2.5 py-1 rounded cursor-pointer transition-colors"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() =>
                                  setReviewTaskId((prev) => (prev === task.id ? null : task.id))
                                }
                                className="text-xs bg-transparent border border-[var(--accent-red)]/40 hover:border-[var(--accent-red)] text-[var(--accent-red)] px-2.5 py-1 rounded cursor-pointer transition-colors"
                              >
                                Request Changes
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => handleStatus(task.id, 'completed')}
                              className="text-xs bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] text-white px-2.5 py-1 rounded cursor-pointer transition-colors"
                            >
                              Mark Done
                            </button>
                          )}
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
                        {reviewTaskId === task.id && (
                          <div className="mt-2">
                            <textarea
                              value={reviewNoteDrafts[task.id] ?? ''}
                              onChange={(e) =>
                                setReviewNoteDrafts((prev) => ({
                                  ...prev,
                                  [task.id]: e.target.value,
                                }))
                              }
                              rows={2}
                              placeholder="What needs to change?"
                              className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-2.5 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
                            />
                            <button
                              onClick={() => handleReject(task.id)}
                              className="mt-1 text-xs bg-[var(--accent-red)] hover:opacity-90 text-white px-2.5 py-1 rounded cursor-pointer transition-colors"
                            >
                              Send back
                            </button>
                          </div>
                        )}
                        {orgConnected && (
                          <TaskHistory taskId={task.id} fetch={window.api.team.taskHistory} />
                        )}
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
              {departments.length > 0 ? (
                <SearchableSelect
                  value={newMember.role}
                  onChange={(val) => setNewMember((m) => ({ ...m, role: val }))}
                  placeholder="Select department / role"
                  options={[
                    ...departments.map((d): SelectOption => ({ value: d, label: d })),
                    { value: '__custom__', label: 'Other (type below)' },
                  ]}
                />
              ) : null}
              {(departments.length === 0 || newMember.role === '__custom__') && (
                <input
                  type="text"
                  value={newMember.role === '__custom__' ? '' : newMember.role}
                  onChange={(e) => setNewMember((m) => ({ ...m, role: e.target.value }))}
                  placeholder="Role"
                  className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)] transition-colors"
                />
              )}
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
              <SearchableSelect
                searchable
                placeholder="Select member"
                value={newTask.member_id}
                onChange={(val) => setNewTask((prev) => ({ ...prev, member_id: val }))}
                options={members.map(
                  (m): SelectOption => ({
                    value: m.id,
                    label: m.name,
                    tag: m.role,
                    tagColor: 'blue',
                  }),
                )}
              />
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
