import { useEffect, useState } from 'react'
import { Paperclip } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type TaskStatus = 'completed' | 'missed' | 'pending' | 'carried' | 'dropped'

interface HistoryTask {
  id: string
  title: string
  effort: string
  proof_type: string
  proof_value: string | null
  status: string
  scheduled_date: string
  scheduled_time_slot: string
  carry_count: number
  subgoal_title: string | null
  goal_title: string | null
  completed_at: string | null
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7)
}

function getEffortLabel(effort: string): string {
  if (effort === 'light') return 'L'
  if (effort === 'medium') return 'M'
  if (effort === 'heavy') return 'H'
  return '-'
}

function getStatusBadgeClasses(status: string): string {
  if (status === 'completed') return 'bg-[var(--accent-green)]/10 text-[var(--accent-green)]'
  if (status === 'missed') return 'bg-[var(--accent-red)]/10 text-[var(--accent-red)]'
  if (status === 'carried') return 'bg-[var(--accent-yellow)]/10 text-[var(--accent-yellow)]'
  return 'bg-[var(--bg-elevated)] text-[var(--text-muted)]'
}

function getStatusBorderClass(status: string): string {
  if (status === 'completed') return 'border-l-[var(--accent-green)]'
  if (status === 'missed') return 'border-l-[var(--accent-red)]'
  if (status === 'pending') return 'border-l-[var(--border-default)]'
  if (status === 'carried') return 'border-l-[var(--accent-yellow)]'
  return 'border-l-[var(--text-muted)]'
}

export default function History(): React.JSX.Element {
  const { t } = useTranslation()
  const [filterMonth, setFilterMonth] = useState(getCurrentMonth())
  const [filterDate, setFilterDate] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [tasks, setTasks] = useState<HistoryTask[]>([])
  const [loading, setLoading] = useState(true)
  const [openProofTaskId, setOpenProofTaskId] = useState<string | null>(null)
  const [proofInputs, setProofInputs] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false

    async function loadHistory(): Promise<void> {
      setLoading(true)
      try {
        const rows = (await window.api.tasks.getHistory({
          month: filterMonth,
          date: filterDate,
          status: filterStatus,
        })) as HistoryTask[]
        if (!cancelled) {
          setTasks(rows)
        }
      } catch (e) {
        console.error('Failed to load task history:', e)
        if (!cancelled) {
          setTasks([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadHistory()
    return () => {
      cancelled = true
    }
  }, [filterMonth, filterDate, filterStatus])

  const grouped = [...tasks]
    .sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))
    .reduce(
      (acc, task) => {
        if (!acc[task.scheduled_date]) {
          acc[task.scheduled_date] = []
        }
        acc[task.scheduled_date].push(task)
        return acc
      },
      {} as Record<string, HistoryTask[]>,
    )

  const groupedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const statusOptions: { label: string; value: TaskStatus | 'all' }[] = [
    { label: t('history.all'), value: 'all' },
    { label: t('history.completed'), value: 'completed' },
    { label: t('history.missed'), value: 'missed' },
    { label: t('history.pending'), value: 'pending' },
    { label: t('history.carried'), value: 'carried' },
    { label: t('history.dropped'), value: 'dropped' },
  ]

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg-base)]">
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="mb-5">
          <h1 className="text-lg font-mono text-[var(--text-primary)]">{t('history.title')}</h1>
          <p className="text-xs text-[var(--text-muted)] mt-1">{t('history.subtitle')}</p>
        </div>

        <div className="mb-5 flex flex-wrap gap-3">
          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">{t('history.month')}</p>
            <input
              type="month"
              value={filterMonth}
              onChange={(e) => {
                setFilterMonth(e.target.value)
                setFilterDate('')
              }}
              className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none font-mono"
            />
          </div>

          <div>
            <p className="text-xs text-[var(--text-muted)] mb-1">{t('history.date')}</p>
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none font-mono"
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate('')}
                  className="text-xs px-2 py-1 rounded border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)] cursor-pointer transition-colors"
                  title="Clear date filter"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div className="min-w-[280px]">
            <p className="text-xs text-[var(--text-muted)] mb-1">{t('history.status')}</p>
            <div className="flex flex-wrap gap-2">
              {statusOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setFilterStatus(option.value)}
                  className={`text-xs px-3 py-1 rounded-full font-mono cursor-pointer transition-colors ${
                    filterStatus === option.value
                      ? 'bg-[var(--accent-blue)] text-white'
                      : 'bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)]'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-8 text-center">
            <p className="text-xs text-[var(--text-muted)] font-mono">{t('common.loading')}</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-8 text-center">
            <p className="text-sm text-[var(--text-secondary)]">{t('history.noTasks')}</p>
            <p className="text-xs text-[var(--text-muted)] mt-1">{t('history.noTasksSubtitle')}</p>
          </div>
        ) : (
          <div>
            {groupedDates.map((date) => (
              <div key={date}>
                <p className="text-xs font-mono text-[var(--text-muted)] mb-2 mt-4">
                  {new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>

                {grouped[date].map((task) => (
                  <div key={task.id}>
                    <div
                      className={`bg-[var(--bg-surface)] border border-[var(--border-subtle)] border-l-2 ${getStatusBorderClass(
                        task.status,
                      )} rounded-xl px-4 py-3 mb-2 flex items-start gap-3`}
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm ${
                            task.status === 'completed'
                              ? 'line-through text-[var(--text-secondary)]'
                              : 'text-[var(--text-primary)]'
                          }`}
                        >
                          {task.title}
                        </p>
                        {task.subgoal_title && (
                          <p className="text-xs text-[var(--text-muted)] mt-1">
                            {task.subgoal_title}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-[10px] bg-[var(--bg-elevated)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded">
                          {getEffortLabel(task.effort)}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${getStatusBadgeClasses(task.status)}`}
                        >
                          {task.status}
                        </span>
                        {task.proof_type !== 'none' && (
                          <button
                            onClick={() =>
                              setOpenProofTaskId((prev) => (prev === task.id ? null : task.id))
                            }
                            title="Add proof"
                            className={`cursor-pointer transition-colors ${
                              task.proof_value
                                ? 'text-[var(--accent-blue)]/70 hover:text-[var(--accent-blue)]'
                                : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
                            }`}
                          >
                            <Paperclip className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {openProofTaskId === task.id && task.proof_type !== 'none' && (
                      <div className="bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-lg px-3 py-2 mb-2">
                        <p className="text-xs text-[var(--text-muted)] mb-1.5">
                          {t('history.proofOptional')}
                        </p>
                        {task.proof_type === 'link' ? (
                          <input
                            type="text"
                            value={proofInputs[task.id] ?? task.proof_value ?? ''}
                            onChange={(e) =>
                              setProofInputs((prev) => ({ ...prev, [task.id]: e.target.value }))
                            }
                            placeholder={t('history.pasteLinkPlaceholder')}
                            className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none transition-colors font-mono"
                          />
                        ) : (
                          <textarea
                            rows={2}
                            value={proofInputs[task.id] ?? task.proof_value ?? ''}
                            onChange={(e) =>
                              setProofInputs((prev) => ({ ...prev, [task.id]: e.target.value }))
                            }
                            placeholder={t('history.addNotePlaceholder')}
                            className="w-full bg-[var(--bg-base)] border border-[var(--border-default)] focus:border-[var(--border-active)] rounded px-3 py-2 text-xs text-[var(--text-primary)] placeholder-[var(--text-muted)] outline-none resize-none transition-colors font-mono"
                          />
                        )}
                        <button
                          onClick={async () => {
                            const proof = proofInputs[task.id] ?? ''
                            await window.api.tasks.updateProof(task.id, proof)
                            const rows = (await window.api.tasks.getHistory({
                              month: filterMonth,
                              date: filterDate,
                              status: filterStatus,
                            })) as HistoryTask[]
                            setTasks(rows)
                            setOpenProofTaskId(null)
                          }}
                          className="mt-1.5 text-xs bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 text-white px-3 py-1 rounded cursor-pointer transition-colors"
                        >
                          {t('common.save')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
