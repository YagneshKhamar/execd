import { useState, useEffect, useRef } from 'react'
import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../components/Toast'

interface Task {
  id: string
  title: string
  effort: 'light' | 'medium' | 'heavy'
  status: 'pending' | 'completed' | 'carried' | 'dropped' | 'missed'
  proof_value: string | null
  notes: string
}

const EFFORT_WEIGHT: Record<string, number> = { light: 1, medium: 2, heavy: 3 }

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
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
  const reportRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation()
  const [todayTasks, setTodayTasks] = useState<Task[]>([])
  const [dayLog, setDayLog] = useState<{
    execution_score: number
    ai_feedback: string
    tasks_completed: number
    tasks_missed: number
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const { error, success } = useToast()

  useEffect(() => {
    async function load(): Promise<void> {
      const [today, log] = await Promise.all([
        window.api.tasks.getByDate(getToday()) as Promise<Task[]>,
        window.api.reports.dayLog(getToday()),
      ])
      setTodayTasks(today)
      setDayLog(log)
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

      document.body.classList.add('capture-mode')
      await new Promise((r) => setTimeout(r, 150))
      await new Promise((r) => requestAnimationFrame(r))
      await new Promise((r) => requestAnimationFrame(r))

      const rect = reportRef.current.getBoundingClientRect()

      const base64 = await window.api.electronAPI.captureReport({
        x: Math.floor(rect.left),
        y: Math.floor(rect.top),
        width: Math.ceil(rect.width),
        height: Math.ceil(reportRef.current.scrollHeight),
      })

      const link = document.createElement('a')
      link.download = `daily-report-${getToday()}.png`
      link.href = `data:image/png;base64,${base64}`
      link.click()
      success(t('toast.reportSaved'))
    } catch (captureError) {
      console.error('Failed to capture report:', captureError)
      error(t('toast.reportFailed'))
    } finally {
      document.body.classList.remove('capture-mode')
      setSaving(false)
    }
  }

  function triggerCsvDownload(csv: string, filename: string): void {
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  async function handleExportTasksCsv(): Promise<void> {
    try {
      const result = await window.api.reports.exportTasksCsv({})
      if (!result.success) {
        error(t('toast.exportTasksFailed'))
        return
      }
      triggerCsvDownload(result.csv, result.filename)
      success(t('toast.exportTasksSuccess'))
    } catch {
      error(t('toast.exportTasksFailed'))
    }
  }

  async function handleExportSummaryCsv(): Promise<void> {
    try {
      const result = await window.api.reports.exportSummaryCsv({})
      if (!result.success) {
        error(t('toast.exportSummaryFailed'))
        return
      }
      triggerCsvDownload(result.csv, result.filename)
      success(t('toast.exportSummarySuccess'))
    } catch {
      error(t('toast.exportSummaryFailed'))
    }
  }

  function statusLabel(status: Task['status']): React.JSX.Element {
    if (status === 'completed')
      return (
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-green)]/10 text-[var(--accent-green)] border border-[var(--accent-green)]/20">
          {t('dailyReport.completed')}
        </span>
      )
    if (status === 'missed')
      return (
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-red)]/10 text-[var(--accent-red)] border border-[var(--accent-red)]/20">
          {t('dailyReport.missed')}
        </span>
      )
    if (status === 'carried')
      return (
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-orange)]/10 text-[var(--accent-orange)] border border-[var(--accent-orange)]/20">
          {t('dailyReport.carried')}
        </span>
      )
    if (status === 'dropped')
      return (
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--border-default)]/30 text-[var(--text-muted)] border border-[var(--border-default)]">
          {t('dailyReport.dropped')}
        </span>
      )
    return (
      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--border-default)]/30 text-[var(--text-secondary)] border border-[var(--border-default)]">
        {t('dailyReport.pending')}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="h-screen w-screen overflow-y-auto bg-[var(--bg-base)] flex items-center justify-center">
        <p className="text-[var(--text-muted)] text-sm font-mono">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="h-screen w-full overflow-y-auto bg-[var(--bg-base)]">
      {/* Save button — outside capture area, always visible at top */}
      <div className="w-full px-6 pt-5 pb-4 flex items-center gap-4" data-hide-on-capture>
        <div className="flex items-end gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase mb-1">
              {t('dailyReport.title')}
            </p>
            <h1 className="text-lg font-semibold text-[var(--text-primary)]">
              {formatDate(getToday())}
            </h1>
          </div>
          <button
            onClick={handleSaveImage}
            disabled={saving}
            className="flex items-center gap-2 bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 text-white text-sm font-medium px-4 py-2 rounded cursor-pointer transition-colors mb-0.5"
          >
            <Download className="w-4 h-4" />
            {saving ? t('dailyReport.saving') : t('dailyReport.saveImage')}
          </button>
          <button
            onClick={handleExportTasksCsv}
            className="flex items-center gap-2 bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:text-[var(--text-primary)] text-sm font-medium px-4 py-2 rounded cursor-pointer transition-colors mb-0.5"
          >
            <Download className="w-4 h-4" />
            {t('dailyReport.exportTasksCsv')}
          </button>
          <button
            onClick={handleExportSummaryCsv}
            className="flex items-center gap-2 bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:text-[var(--text-primary)] text-sm font-medium px-4 py-2 rounded cursor-pointer transition-colors mb-0.5"
          >
            <Download className="w-4 h-4" />
            {t('dailyReport.exportSummaryCsv')}
          </button>
        </div>
      </div>

      {/* CAPTURE AREA — everything below save button */}
      <div
        ref={reportRef}
        data-report-capture="daily-report"
        className="w-full px-6 pb-8 bg-[var(--bg-base)]"
      >
        {/* Score card — full width */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5 mb-5">
          <div className="flex items-start gap-8 flex-wrap mb-4">
            <div>
              <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase mb-2">
                {t('dailyReport.executionScore')}
              </p>
              <div
                className={`font-mono text-5xl font-bold leading-none ${
                  score >= 80
                    ? 'text-[var(--accent-green)]'
                    : score >= 50
                      ? 'text-[var(--accent-yellow)]'
                      : 'text-[var(--accent-red)]'
                }`}
              >
                {score}%
              </div>
              <p className="font-mono text-xs text-[var(--text-muted)] mt-2">
                {completedWeight} / {totalWeight} {t('dailyReport.weight')}
              </p>
            </div>
            <div className="flex gap-6 pt-1">
              {[
                {
                  label: t('dailyReport.done'),
                  value: todayTasks.filter((t) => t.status === 'completed').length,
                  color: 'text-[var(--accent-green)]',
                },
                {
                  label: t('dailyReport.missed'),
                  value: todayTasks.filter((t) => t.status === 'missed').length,
                  color: 'text-[var(--accent-red)]',
                },
                {
                  label: t('dailyReport.pending'),
                  value: todayTasks.filter((t) => t.status === 'pending').length,
                  color: 'text-[var(--text-secondary)]',
                },
                {
                  label: t('dailyReport.total'),
                  value: todayTasks.length,
                  color: 'text-[var(--text-secondary)]',
                },
              ].map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <p className={`font-mono text-2xl font-semibold ${color}`}>{value}</p>
                  <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-wider mt-1">
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="h-0.5 bg-[var(--border-default)] rounded">
            <div
              className={`h-full rounded transition-all ${
                score >= 80
                  ? 'bg-[var(--accent-green)]'
                  : score >= 50
                    ? 'bg-[var(--accent-yellow)]'
                    : 'bg-[var(--accent-red)]'
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
          {dayLog && dayLog.ai_feedback && (
            <div className="mt-4 pt-4 border-t border-[var(--border-subtle)]">
              <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase mb-2">
                {t('dailyReport.aiFeedback')}
              </p>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic">
                {dayLog.ai_feedback}
              </p>
            </div>
          )}
        </div>

        {/* Tasks — two equal columns, NO scroll, full height */}
        <div className="grid grid-cols-2 gap-5">
          {/* Left column */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
                {t('dailyReport.todaysTasks')}
              </p>
              <span className="font-mono text-[10px] text-[var(--text-muted)]">
                1 - {Math.ceil(todayTasks.length / 2)}
              </span>
            </div>
            <div>
              {todayTasks.slice(0, Math.ceil(todayTasks.length / 2)).map((task) => (
                <div
                  key={task.id}
                  className="flex items-start justify-between gap-3 py-2.5 border-b border-[var(--border-subtle)] last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-snug ${
                        task.status === 'completed'
                          ? 'text-[var(--text-muted)] line-through'
                          : task.status === 'missed'
                            ? 'text-[var(--text-secondary)]'
                            : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.proof_value && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                        {task.proof_value}
                      </p>
                    )}
                    {task.notes && (
                      <p className="text-[10px] text-[var(--text-muted)] font-mono mt-1 leading-relaxed whitespace-pre-wrap">
                        {task.notes}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1 mt-0.5">
                    {statusLabel(task.status)}
                    <span
                      className={`font-mono text-[9px] ${
                        task.effort === 'light'
                          ? 'text-[var(--accent-green)]'
                          : task.effort === 'medium'
                            ? 'text-[var(--accent-yellow)]'
                            : 'text-[var(--accent-red)]'
                      }`}
                    >
                      {task.effort === 'light' ? '30m' : task.effort === 'medium' ? '1h' : '2h'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono text-[10px] tracking-widest text-[var(--text-muted)] uppercase">
                {t('dailyReport.todaysTasks')}
              </p>
              <span className="font-mono text-[10px] text-[var(--text-muted)]">
                {Math.ceil(todayTasks.length / 2) + 1} - {todayTasks.length}
              </span>
            </div>
            <div>
              {todayTasks.slice(Math.ceil(todayTasks.length / 2)).map((task) => (
                <div
                  key={task.id}
                  className="flex items-start justify-between gap-3 py-2.5 border-b border-[var(--border-subtle)] last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm leading-snug ${
                        task.status === 'completed'
                          ? 'text-[var(--text-muted)] line-through'
                          : task.status === 'missed'
                            ? 'text-[var(--text-secondary)]'
                            : 'text-[var(--text-primary)]'
                      }`}
                    >
                      {task.title}
                    </p>
                    {task.proof_value && (
                      <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate">
                        {task.proof_value}
                      </p>
                    )}
                    {task.notes && (
                      <p className="text-[10px] text-[var(--text-muted)] font-mono mt-1 leading-relaxed whitespace-pre-wrap">
                        {task.notes}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1 mt-0.5">
                    {statusLabel(task.status)}
                    <span
                      className={`font-mono text-[9px] ${
                        task.effort === 'light'
                          ? 'text-[var(--accent-green)]'
                          : task.effort === 'medium'
                            ? 'text-[var(--accent-yellow)]'
                            : 'text-[var(--accent-red)]'
                      }`}
                    >
                      {task.effort === 'light' ? '30m' : task.effort === 'medium' ? '1h' : '2h'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
