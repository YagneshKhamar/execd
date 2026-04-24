import { useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts'
import { useTranslation } from 'react-i18next'
import { useToast } from '../components/Toast'

type RangeType = '1W' | '1M' | '1Y' | 'custom'

interface DayLog {
  date: string
  execution_score: number
  tasks_completed: number
  tasks_missed: number
}

interface DayStat {
  date: string
  execution_score: number
  tasks_completed: number
  tasks_missed: number
  tasks_carried: number
}

interface MonthStat {
  month: string
  avg_score: number
  total_completed: number
  total_missed: number
  days_logged: number
}

interface MissedPattern {
  title: string
  miss_count: number
}

type ReportsData =
  | { kind: 'week'; days: DayLog[]; patterns: MissedPattern[] }
  | { kind: 'month'; days: DayStat[]; topMissed: MissedPattern[]; months: MonthStat[] }
  | { kind: 'year'; days: DayStat[]; months: MonthStat[]; topMissed: MissedPattern[] }
  | { kind: 'custom'; days: DayStat[] }

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

function scoreColor(score: number): string {
  if (score >= 0.8) return 'var(--accent-green)'
  if (score >= 0.5) return 'var(--accent-yellow)'
  return 'var(--accent-red)'
}

function daysBetween(from: string, to: string): number {
  const fromDate = new Date(`${from}T00:00:00`)
  const toDate = new Date(`${to}T00:00:00`)
  const diffMs = toDate.getTime() - fromDate.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1
  return Math.max(1, diffDays)
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

export default function Reports(): React.JSX.Element {
  const { t } = useTranslation()
  const [range, setRange] = useState<RangeType>('1W')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [data, setData] = useState<ReportsData | null>(null)
  const [loading, setLoading] = useState(true)
  const { error, success } = useToast()

  useEffect(() => {
    let cancelled = false

    async function loadReports(): Promise<void> {
      setLoading(true)
      try {
        const today = getToday()
        const currentYear = new Date().getFullYear().toString()

        if (range === '1W') {
          const week = await window.api.reports.week(today)
          if (!cancelled) {
            setData({
              kind: 'week',
              days: week.days as DayLog[],
              patterns: week.patterns as MissedPattern[],
            })
          }
          return
        }

        if (range === '1M') {
          const [analytics, yearly] = await Promise.all([
            window.api.reports.analytics(30),
            window.api.reports.year(currentYear),
          ])
          if (!cancelled) {
            setData({
              kind: 'month',
              days: analytics.trend as DayStat[],
              topMissed: yearly.topMissed as MissedPattern[],
              months: yearly.months as MonthStat[],
            })
          }
          return
        }

        if (range === '1Y') {
          const yearly = await window.api.reports.year(currentYear)
          if (!cancelled) {
            setData({
              kind: 'year',
              days: yearly.days as DayStat[],
              months: yearly.months as MonthStat[],
              topMissed: yearly.topMissed as MissedPattern[],
            })
          }
          return
        }

        if (!customFrom || !customTo) {
          if (!cancelled) {
            setData(null)
          }
          return
        }

        const analytics = await window.api.reports.analytics(daysBetween(customFrom, today))
        if (!cancelled) {
          const filtered = (analytics.trend as DayStat[]).filter(
            (day) => day.date >= customFrom && day.date <= customTo,
          )
          setData({ kind: 'custom', days: filtered })
        }
      } catch {
        if (!cancelled) {
          error(t('toast.loadReportsFailed'))
          setData(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadReports()
    return () => {
      cancelled = true
    }
  }, [range, customFrom, customTo, error])

  const rangeSubtitle =
    range === '1W'
      ? t('reports.lastWeek')
      : range === '1M'
        ? t('reports.lastMonth')
        : range === '1Y'
          ? t('reports.thisYear')
          : t('reports.customRange')

  const allDays = useMemo(() => {
    if (!data) return [] as DayStat[]
    return data.days as DayStat[]
  }, [data])

  const avgScore =
    allDays.length > 0
      ? Math.round(
          (allDays.reduce((sum, day) => sum + Number(day.execution_score || 0), 0) /
            allDays.length) *
            100,
        )
      : 0
  const daysLogged = allDays.length
  const completed = allDays.reduce((sum, day) => sum + Number(day.tasks_completed || 0), 0)
  const missed = allDays.reduce((sum, day) => sum + Number(day.tasks_missed || 0), 0)

  const dayChartData = useMemo(() => {
    if (!data || (data.kind !== 'week' && data.kind !== 'month')) return []
    return data.days.map((day) => ({
      label:
        data.kind === 'week'
          ? new Date(`${day.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
          : new Date(`${day.date}T00:00:00`).toLocaleDateString('en-US', {
              month: 'numeric',
              day: 'numeric',
            }),
      scorePercent: Math.round(day.execution_score * 100),
      scoreRaw: day.execution_score,
    }))
  }, [data])

  const recurringSkips = useMemo(() => {
    if (!data) return [] as MissedPattern[]
    if (data.kind === 'week') return data.patterns
    if (data.kind === 'month' || data.kind === 'year') return data.topMissed
    return []
  }, [data])

  const monthMap = useMemo(() => {
    if (!data || (data.kind !== 'month' && data.kind !== 'year'))
      return new Map<number, MonthStat>()
    const map = new Map<number, MonthStat>()
    for (const item of data.months) {
      const idx = Number(item.month) - 1
      if (!Number.isNaN(idx)) map.set(idx, item)
    }
    return map
  }, [data])

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

  if (loading) {
    return (
      <div className="h-full w-full overflow-y-auto bg-[var(--bg-base)] flex items-center justify-center">
        <p className="text-[var(--text-muted)] text-sm font-mono">{t('common.loading')}</p>
      </div>
    )
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-[var(--bg-base)]">
      <div className="max-w-4xl mx-auto px-8 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">{t('reports.title')}</h1>
          <p className="text-sm text-[var(--text-muted)] mt-1">{rangeSubtitle}</p>
        </div>

        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                ['1W', '1 Week'],
                ['1M', '1 Month'],
                ['1Y', '1 Year'],
                ['custom', 'Custom'],
              ] as const
            ).map(([value]) => (
              <button
                key={value}
                onClick={() => setRange(value)}
                className={`font-mono text-xs px-4 py-1.5 rounded-full cursor-pointer transition-colors ${
                  range === value
                    ? 'bg-[var(--accent-blue)] text-white'
                    : 'bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)]'
                }`}
              >
                {value === '1W'
                  ? t('reports.lastWeek')
                  : value === '1M'
                    ? t('reports.lastMonth')
                    : value === '1Y'
                      ? t('reports.thisYear')
                      : t('reports.customRange')}
              </button>
            ))}
          </div>

          {range === 'custom' && (
            <div className="mt-3 flex items-end gap-3 flex-wrap">
              <div>
                <p className="text-xs text-[var(--text-muted)] mb-1">{t('reports.from')}</p>
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none font-mono"
                />
              </div>
              <div>
                <p className="text-xs text-[var(--text-muted)] mb-1">{t('reports.to')}</p>
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none font-mono"
                />
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-4 gap-3 mb-6">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4">
            <p
              className="font-mono text-3xl font-semibold"
              style={{ color: scoreColor(avgScore / 100) }}
            >
              {avgScore}%
            </p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
              {t('reports.avgScore')}
            </p>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4">
            <p className="font-mono text-3xl font-semibold text-[var(--text-primary)]">
              {daysLogged}
            </p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
              {t('reports.daysLogged')}
            </p>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4">
            <p className="font-mono text-3xl font-semibold text-[var(--accent-green)]">
              {completed}
            </p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
              {t('reports.completed')}
            </p>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-4">
            <p className="font-mono text-3xl font-semibold text-[var(--accent-red)]">{missed}</p>
            <p className="text-xs text-[var(--text-muted)] uppercase tracking-wider mt-1">
              {t('reports.missed')}
            </p>
          </div>
        </div>

        {!data || allDays.length === 0 ? (
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-8 text-center mb-6">
            <p className="text-[var(--text-muted)] text-sm">
              {t('reports.noData')}
            </p>
          </div>
        ) : (
          <>
            {(data.kind === 'week' || data.kind === 'month') && dayChartData.length > 0 && (
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-xl p-5 mb-6">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={dayChartData}>
                    <XAxis
                      dataKey="label"
                      stroke="var(--text-muted)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      domain={[0, 100]}
                      ticks={[0, 25, 50, 75, 100]}
                      stroke="var(--text-muted)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Bar dataKey="scorePercent" radius={[4, 4, 0, 0]}>
                      {dayChartData.map((entry) => (
                        <Cell key={entry.label} fill={scoreColor(entry.scoreRaw)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {(data.kind === 'week' || data.kind === 'month') && (
              <div className="space-y-2 mb-6">
                {allDays.map((day) => {
                  const pct = Math.round(day.execution_score * 100)
                  return (
                    <div
                      key={day.date}
                      className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded px-4 py-3"
                    >
                      <div className="flex items-center">
                        <span className="font-mono text-xs text-[var(--text-secondary)] w-10 shrink-0">
                          {new Date(`${day.date}T00:00:00`).toLocaleDateString('en-US', {
                            weekday: 'short',
                          })}
                        </span>
                        <div className="flex-1 h-1 bg-[var(--border-default)] rounded mx-3 overflow-hidden">
                          <div
                            className="h-full rounded"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: scoreColor(day.execution_score),
                            }}
                          />
                        </div>
                        <span
                          className="font-mono text-sm font-semibold w-10 text-right"
                          style={{ color: scoreColor(day.execution_score) }}
                        >
                          {pct}%
                        </span>
                        <span className="font-mono text-xs text-[var(--text-muted)] w-16 text-right">
                          {day.tasks_completed}/{day.tasks_missed}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {data.kind === 'year' && (
              <div className="mb-6">
                <h2 className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">
                  MONTHLY BREAKDOWN
                </h2>
                <div>
                  {MONTH_NAMES.map((name, index) => {
                    const stat = monthMap.get(index)
                    const scorePct = stat ? Math.round(Number(stat.avg_score || 0) * 100) : 0
                    return (
                      <div key={name} className="flex items-center gap-3 py-2">
                        <span className="font-mono text-xs text-[var(--text-secondary)] w-8 shrink-0">
                          {name}
                        </span>
                        <div className="flex-1 h-2 bg-[var(--border-subtle)] rounded-full overflow-hidden relative">
                          {stat && (
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${scorePct}%`,
                                backgroundColor: scoreColor(scorePct / 100),
                              }}
                            />
                          )}
                        </div>
                        <span
                          className="font-mono text-xs w-10 text-right"
                          style={{ color: stat ? scoreColor(scorePct / 100) : 'var(--text-muted)' }}
                        >
                          {stat ? `${scorePct}%` : '—'}
                        </span>
                        <span className="font-mono text-[10px] text-[var(--text-muted)] w-14 text-right">
                          {stat ? `${Number(stat.days_logged)} days` : '—'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {recurringSkips.length > 0 && (
              <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5 mb-6">
                <h2 className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">
                  {t('reports.recurringSkips')}
                </h2>
                <div className="space-y-2">
                  {recurringSkips.map((pattern) => (
                    <div key={pattern.title} className="flex items-center justify-between">
                      <p className="text-[var(--text-primary)] text-sm truncate flex-1 mr-4">
                        {pattern.title}
                      </p>
                      <span className="font-mono text-xs text-[var(--accent-red)] font-semibold shrink-0">
                        missed {pattern.miss_count}×
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="pt-2">
          <h2 className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-3">
            {t('reports.export')}
          </h2>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={handleExportTasksCsv}
              className="bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:text-[var(--text-primary)] text-xs px-4 py-2 rounded flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {t('reports.downloadTaskHistory')}
            </button>
            <button
              onClick={handleExportSummaryCsv}
              className="bg-transparent border border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-active)] hover:text-[var(--text-primary)] text-xs px-4 py-2 rounded flex items-center gap-2 cursor-pointer transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {t('reports.downloadSummary')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
