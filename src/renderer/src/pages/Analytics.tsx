import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { useToast } from '../components/Toast'

interface AnalyticsData {
  trend: { date: string; execution_score: number; tasks_completed: number; tasks_missed: number }[]
  byEffort: { effort: string; completed: number; missed: number }[]
  bySlot: { slot: string; completed: number; missed: number }[]
  carryTrend: { date: string; tasks_carried: number }[]
}

function formatDayLabel(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export default function Analytics(): React.JSX.Element {
  const { t } = useTranslation()
  const [range, setRange] = useState<7 | 14 | 30>(30)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [insight, setInsight] = useState<{ heading: string; body: string } | null>(null)
  const [loadingInsight, setLoadingInsight] = useState(false)
  const { error } = useToast()

  useEffect(() => {
    setLoading(true)
    window.api.reports
      .analytics(range)
      .then((result) => {
        setData(result)
      })
      .catch(() => {
        error(t('toast.loadAnalyticsFailed'))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [range, error])

  useEffect(() => {
    if (!data) return

    const trend = data.trend
    const avgScore = trend.reduce((s, d) => s + d.execution_score, 0) / (trend.length || 1)

    const firstHalf = trend.slice(0, Math.floor(trend.length / 2))
    const secondHalf = trend.slice(Math.floor(trend.length / 2))
    const firstAvg = firstHalf.reduce((s, d) => s + d.execution_score, 0) / (firstHalf.length || 1)
    const secondAvg =
      secondHalf.reduce((s, d) => s + d.execution_score, 0) / (secondHalf.length || 1)
    const trendDir =
      secondAvg > firstAvg + 0.05 ? 'improving' : secondAvg < firstAvg - 0.05 ? 'declining' : 'flat'

    const topMissedEffort =
      [...data.byEffort].sort((a, b) => Number(b.missed) - Number(a.missed))[0]?.effort ?? 'none'
    const topMissedSlot =
      [...data.bySlot].sort((a, b) => Number(b.missed) - Number(a.missed))[0]?.slot ?? 'none'
    const carryRate =
      data.carryTrend.filter((d) => Number(d.tasks_carried) > 0).length /
      (data.carryTrend.length || 1)

    setLoadingInsight(true)
    setInsight(null)
    window.api.ai
      .generateAnalyticsInsight({
        avgScore,
        trend: trendDir,
        topMissedEffort,
        topMissedSlot,
        carryRate,
        days: range,
      })
      .then((res) => {
        if (res.success && res.data) setInsight(res.data)
      })
      .catch(() => {
        setInsight(null)
      })
      .finally(() => {
        setLoadingInsight(false)
      })
  }, [data, range])

  const effortData = useMemo(() => {
    const order = ['light', 'medium', 'heavy']
    return order.map(
      (effort) =>
        data?.byEffort.find((row) => row.effort === effort) ?? { effort, completed: 0, missed: 0 },
    )
  }, [data])

  const slotData = useMemo(() => {
    const order = ['morning', 'afternoon', 'anytime']
    return order.map(
      (slot) => data?.bySlot.find((row) => row.slot === slot) ?? { slot, completed: 0, missed: 0 },
    )
  }, [data])

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
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-1">
              {t('analytics.header')}
            </p>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">
              {t('analytics.title')}
            </h1>
          </div>
          <div className="flex items-center gap-1">
            {[7, 14, 30].map((value) => (
              <button
                key={value}
                onClick={() => setRange(value as 7 | 14 | 30)}
                className={`font-mono text-xs px-3 py-1 rounded ${
                  range === value
                    ? 'bg-[var(--bg-elevated)] border border-[var(--border-active)] text-[var(--text-primary)]'
                    : 'border border-transparent text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer'
                }`}
              >
                {value}D
              </button>
            ))}
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5 mb-6">
          <p className="font-mono text-[10px] text-[var(--text-muted)] uppercase tracking-widest mb-2">
            {t('analytics.executionAnalysis')}
          </p>
          {loadingInsight ? (
            <p className="text-xs text-[var(--text-muted)] font-mono">{t('analytics.analyzing')}</p>
          ) : insight ? (
            <>
              <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1">
                {insight.heading}
              </h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{insight.body}</p>
            </>
          ) : (
            <p className="text-xs text-[var(--text-muted)] font-mono">No insight available.</p>
          )}
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5 mb-4">
          <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-4">
            {t('analytics.scoreTrend')}
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data?.trend ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
              <XAxis dataKey="date" tickFormatter={formatDayLabel} interval="preserveStartEnd" />
              <YAxis
                domain={[0, 1]}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                width={40}
              />
              <Tooltip
                contentStyle={{
                  background: '#111',
                  border: '1px solid #2a2a2a',
                  borderRadius: 4,
                  fontSize: 12,
                }}
                formatter={(v: unknown) => [`${Math.round(Number(v ?? 0) * 100)}%`, 'Score']}
                labelFormatter={(l) => String(l)}
              />
              <Line dataKey="execution_score" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5 mb-4">
          <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-4">
            {t('analytics.dailyTasks')}
          </p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data?.trend ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
              <XAxis dataKey="date" tickFormatter={formatDayLabel} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} width={30} />
              <Tooltip
                contentStyle={{
                  background: '#111',
                  border: '1px solid #2a2a2a',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="tasks_completed" fill="#16a34a" name="Done" radius={[2, 2, 0, 0]} />
              <Bar dataKey="tasks_missed" fill="#dc2626" name="Missed" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5 mb-4">
          <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-4">
            {t('analytics.byEffort')}
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={effortData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
              <XAxis
                dataKey="effort"
                tickFormatter={(v: string) => `${v.charAt(0).toUpperCase()}${v.slice(1)}`}
              />
              <YAxis allowDecimals={false} width={30} />
              <Tooltip
                contentStyle={{
                  background: '#111',
                  border: '1px solid #2a2a2a',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="completed" fill="#16a34a" name="Done" radius={[2, 2, 0, 0]} />
              <Bar dataKey="missed" fill="#dc2626" name="Missed" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5 mb-4">
          <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-4">
            {t('analytics.byTimeSlot')}
          </p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={slotData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
              <XAxis
                dataKey="slot"
                tickFormatter={(v: string) => `${v.charAt(0).toUpperCase()}${v.slice(1)}`}
              />
              <YAxis allowDecimals={false} width={30} />
              <Tooltip
                contentStyle={{
                  background: '#111',
                  border: '1px solid #2a2a2a',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="completed" fill="#16a34a" name="Done" radius={[2, 2, 0, 0]} />
              <Bar dataKey="missed" fill="#dc2626" name="Missed" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded p-5 mb-4">
          <p className="font-mono text-xs text-[var(--text-muted)] uppercase tracking-widest mb-4">
            CARRY-OVERS
          </p>
          <ResponsiveContainer width="100%" height={120}>
            <LineChart data={data?.carryTrend ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
              <XAxis dataKey="date" tickFormatter={formatDayLabel} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} domain={[0, 'auto']} width={30} />
              <Tooltip
                contentStyle={{
                  background: '#111',
                  border: '1px solid #2a2a2a',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              />
              <Line dataKey="tasks_carried" stroke="#ea580c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
