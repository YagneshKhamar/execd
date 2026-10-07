import { useEffect, useState } from 'react'

interface HistoryEntry {
  action: string
  note: string
  actor: string
  at: string
}

function formatWhen(iso: string): string {
  const d = new Date(iso.includes('T') || iso.endsWith('Z') ? iso : `${iso.replace(' ', 'T')}Z`)
  return d.toLocaleString(undefined, {
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
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || entries !== null) return
    let cancelled = false
    fetchHistory(taskId).then((result) => {
      if (cancelled) return
      if (result.success) setEntries(result.history ?? [])
      else setError(result.error ?? 'Could not load history')
    })
    return () => {
      cancelled = true
    }
  }, [open, entries, taskId, fetchHistory])

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-[10px] font-mono text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline bg-transparent border-none cursor-pointer"
      >
        {open ? 'Hide history' : 'History'}
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 border-l-2 border-[var(--border-subtle)] pl-2">
          {error && <p className="text-[10px] text-[var(--accent-red)]">{error}</p>}
          {entries === null && !error && (
            <p className="text-[10px] text-[var(--text-muted)]">Loading...</p>
          )}
          {entries?.length === 0 && (
            <p className="text-[10px] text-[var(--text-muted)]">No history yet</p>
          )}
          {entries?.map((entry, i) => (
            <div key={i} className="text-[10px]">
              <span className="text-[var(--text-secondary)]">{formatWhen(entry.at)}</span>
              {' — '}
              <span className="text-[var(--text-primary)]">{entry.actor}</span>
              {': '}
              <span className="text-[var(--text-secondary)]">{entry.action}</span>
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
