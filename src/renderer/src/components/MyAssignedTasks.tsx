import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import SyncStatusBar from './SyncStatusBar'
import TaskHistory from './TaskHistory'
import { useToast } from './Toast'

type MyTask = NonNullable<Awaited<ReturnType<Window['api']['team']['myTasks']>>['tasks']>[number]
type Status = 'pending' | 'completed' | 'blocked' | 'awaiting_review' | 'needs_changes'

const STATUS_STYLES: Record<string, string> = {
  completed:
    'bg-[var(--accent-green)]/10 text-[var(--accent-green)] border-[var(--accent-green)]/20',
  blocked: 'bg-[var(--accent-red)]/10 text-[var(--accent-red)] border-[var(--accent-red)]/20',
  needs_changes: 'bg-[var(--accent-red)]/10 text-[var(--accent-red)] border-[var(--accent-red)]/20',
  awaiting_review:
    'bg-[var(--accent-blue)]/10 text-[var(--accent-blue)] border-[var(--accent-blue)]/20',
  pending:
    'bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)] border-[var(--accent-yellow)]/20',
}

export default function MyAssignedTasks(): React.JSX.Element {
  const { state } = useAuth()
  const requireApproval = state?.organization?.requireApproval ?? false
  const { error: toastError, success: toastSuccess } = useToast()
  const [tasks, setTasks] = useState<MyTask[]>([])
  const [loading, setLoading] = useState(true)
  const [proofDrafts, setProofDrafts] = useState<Record<string, string>>({})
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const result = await window.api.team.myTasks()
    if (!result.success) {
      toastError(result.error ?? 'Could not load your tasks')
    } else {
      setTasks(result.tasks ?? [])
    }
    setLoading(false)
  }, [toastError])

  useEffect(() => {
    async function run(): Promise<void> {
      await load()
    }
    run()
  }, [load])

  async function update(task: MyTask, status: Status): Promise<void> {
    if (busyId) return
    setBusyId(task.id)
    try {
      const result = await window.api.team.updateMyTask({
        taskId: task.id,
        status,
        proofValue:
          status === 'completed' || status === 'awaiting_review'
            ? (proofDrafts[task.id] ?? '')
            : undefined,
      })
      if (!result.success) {
        toastError(result.error ?? 'Could not update the task')
      } else if (status === 'completed') {
        toastSuccess('Marked as done')
      } else if (status === 'awaiting_review') {
        toastSuccess('Sent for review')
      }
      await load()
    } finally {
      setBusyId(null)
    }
  }

  const open = tasks.filter((t) => t.status !== 'completed' && t.status !== 'awaiting_review')
  const awaitingReview = tasks.filter((t) => t.status === 'awaiting_review')
  const done = tasks.filter((t) => t.status === 'completed')

  function renderTask(task: MyTask): React.JSX.Element {
    const isDone = task.status === 'completed'
    const isAwaitingReview = task.status === 'awaiting_review'
    return (
      <div
        key={task.id}
        className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4"
      >
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-[var(--text-primary)]">{task.title}</p>
          <span className="font-mono text-[10px] text-[var(--text-secondary)]">{task.effort}</span>
        </div>
        {task.description && (
          <p className="text-xs text-[var(--text-secondary)] mt-1">{task.description}</p>
        )}
        <div className="flex items-center gap-2 mt-2">
          <span className="font-mono text-xs text-[var(--text-muted)]">due {task.due_date}</span>
          <span
            className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${STATUS_STYLES[task.status] ?? ''}`}
          >
            {task.status.replace('_', ' ')}
          </span>
          {task.sync_status === 'pending' && (
            <span className="font-mono text-[10px] text-[var(--accent-yellow)]">pending sync</span>
          )}
          {task.sync_status === 'failed' && (
            <span
              title={task.sync_error ?? ''}
              className="font-mono text-[10px] text-[var(--accent-red)]"
            >
              sync failed
            </span>
          )}
        </div>
        {task.proof_value && (
          <p className="text-xs text-[var(--text-secondary)] italic mt-1">
            Proof: {task.proof_value}
          </p>
        )}
        {task.notes && (
          <p className="text-xs text-[var(--text-secondary)] italic mt-1">{task.notes}</p>
        )}
        {task.status === 'needs_changes' && (
          <p className="text-xs text-[var(--accent-red)] mt-1">
            Your manager requested changes — see history below, then resubmit.
          </p>
        )}

        {!isDone && !isAwaitingReview && (
          <div className="mt-3 space-y-2">
            <input
              type="text"
              placeholder="Proof, comment or link (optional)"
              value={proofDrafts[task.id] ?? ''}
              onChange={(e) => setProofDrafts((prev) => ({ ...prev, [task.id]: e.target.value }))}
              className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-2.5 py-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)]"
            />
            <div className="flex gap-2">
              <button
                onClick={() => update(task, requireApproval ? 'awaiting_review' : 'completed')}
                disabled={busyId !== null}
                className="text-xs bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 text-white px-2.5 py-1 rounded cursor-pointer transition-colors"
              >
                {requireApproval ? 'Submit for Review' : 'Mark Done'}
              </button>
              {task.status === 'blocked' ? (
                <button
                  onClick={() => update(task, 'pending')}
                  disabled={busyId !== null}
                  className="text-xs bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] px-2.5 py-1 rounded cursor-pointer transition-colors"
                >
                  Unblock
                </button>
              ) : (
                <button
                  onClick={() => update(task, 'blocked')}
                  disabled={busyId !== null}
                  className="text-xs bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] px-2.5 py-1 rounded cursor-pointer transition-colors"
                >
                  Mark Blocked
                </button>
              )}
            </div>
          </div>
        )}
        {isAwaitingReview && (
          <p className="text-xs text-[var(--accent-blue)] mt-2">Waiting for manager review</p>
        )}
        <TaskHistory taskId={task.id} fetch={window.api.team.myTaskHistory} />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm font-mono">
        loading...
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg-base)] p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">My tasks</h2>
          <button
            onClick={load}
            className="font-mono text-xs bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] px-2.5 py-1 rounded cursor-pointer transition-colors"
          >
            Refresh
          </button>
        </div>
        <p className="text-xs text-[var(--text-secondary)] mb-6">
          Tasks assigned to you in {state?.organization?.name}.
        </p>

        <SyncStatusBar onChange={load} />

        {tasks.length === 0 && (
          <p className="text-sm text-[var(--text-muted)]">Nothing assigned to you yet.</p>
        )}

        {awaitingReview.length > 0 && (
          <div className="space-y-2 mb-6">{awaitingReview.map(renderTask)}</div>
        )}

        {open.length > 0 && <div className="space-y-2 mb-6">{open.map(renderTask)}</div>}

        {done.length > 0 && (
          <>
            <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)] mb-2">
              Completed
            </p>
            <div className="space-y-2">{done.map(renderTask)}</div>
          </>
        )}
      </div>
    </div>
  )
}
