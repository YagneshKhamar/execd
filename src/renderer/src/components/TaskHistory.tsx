import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { translateError } from '../i18n/errors'
import { localeFor } from '../i18n/locale'

interface HistoryEntry {
  action: string
  type?: string
  note: string
  actor: string
  actorKind?: 'you' | 'someone'
  at: string
}

function formatWhen(iso: string, language: string): string {
  const d = new Date(iso.includes('T') || iso.endsWith('Z') ? iso : `${iso.replace(' ', 'T')}Z`)
  return d.toLocaleString(localeFor(language), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * Inline, collapsible audit trail for one task. `fetch` is injected so the same component
 * serves the manager's team-task history and a member's own-task history, which are backed by
 * different IPC calls and different underlying tables.
 */
export default function TaskHistory({
  taskId,
  fetch: fetchHistory,
}: {
  taskId: string
  fetch: (taskId: string) => Promise<{ success: boolean; history?: HistoryEntry[]; error?: string }>
}): React.JSX.Element {
  const { t, i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || entries !== null) return
    let cancelled = false
    fetchHistory(taskId).then((result) => {
      if (cancelled) return
      if (result.success) setEntries(result.history ?? [])
      else setError(translateError(t, result.error, 'taskHistory.loadFailed'))
    })
    return () => {
      cancelled = true
    }
  }, [open, entries, taskId, fetchHistory, t])

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline bg-transparent border-none cursor-pointer"
      >
        {open ? t('taskHistory.hide') : t('taskHistory.show')}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 border-l-2 border-[var(--border-subtle)] pl-2">
          {error && <p className="text-[10px] text-[var(--accent-red)]">{error}</p>}
          {entries === null && !error && (
            <p className="text-[10px] text-[var(--text-muted)]">{t('taskHistory.loading')}</p>
          )}
          {entries?.length === 0 && (
            <p className="text-[10px] text-[var(--text-muted)]">{t('taskHistory.none')}</p>
          )}
          {entries?.map((entry, i) => (
            <div key={i} className="text-[10px]">
              <span className="text-[var(--text-secondary)]">
                {formatWhen(entry.at, i18n.language)}
              </span>
              {' — '}
              <span className="text-[var(--text-primary)]">
                {entry.actorKind === 'you'
                  ? t('taskHistory.you')
                  : entry.actorKind === 'someone'
                    ? t('taskHistory.someone')
                    : entry.actor}
              </span>
              {': '}
              <span className="text-[var(--text-secondary)]">
                {entry.type
                  ? t(`taskHistory.events.${entry.type}`, { defaultValue: entry.action })
                  : entry.action}
              </span>
              {entry.note && (
                <span className="text-[var(--text-muted)] italic"> — {entry.note}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
