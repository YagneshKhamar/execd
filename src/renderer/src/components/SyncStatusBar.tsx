import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { relativeTime } from '../i18n/relativeTime'

type SyncInfo = Awaited<ReturnType<Window['api']['team']['syncStatus']>>

const POLL_MS = 4000

/**
 * Shows connection / queue state for shared-team sync and triggers `onChange` whenever a sync
 * finished or the queue changed, so the caller can reload its list.
 */
export default function SyncStatusBar({
  onChange,
}: {
  onChange?: () => void
}): React.JSX.Element | null {
  const { t } = useTranslation()
  const [info, setInfo] = useState<SyncInfo | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)
  const onChangeRef = useRef(onChange)
  const signature = useRef<string | null>(null)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    let cancelled = false

    function apply(next: SyncInfo): void {
      if (cancelled) return
      setInfo(next)
      setNow(Date.now())
      const sig = `${next.lastSyncedAt}|${next.pending}|${next.waiting}|${next.failed}`
      if (signature.current !== null && signature.current !== sig) onChangeRef.current?.()
      signature.current = sig
    }

    async function poll(): Promise<void> {
      apply(await window.api.team.syncStatus())
    }

    async function start(): Promise<void> {
      await poll()
      apply(await window.api.team.syncNow())
    }
    start()
    const timer = setInterval(poll, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  if (!info || !info.enabled) return null

  async function run(action: () => Promise<SyncInfo>): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      setInfo(await action())
      setNow(Date.now())
      onChangeRef.current?.()
    } finally {
      setBusy(false)
    }
  }

  const queued = info.pending + info.waiting
  let tone = 'text-[var(--accent-green)]'
  let text = info.lastSyncedAt
    ? t('sync.synced', { when: relativeTime(t, info.lastSyncedAt, now) })
    : t('sync.syncedNever')

  if (info.disabledByUser) {
    tone = 'text-[var(--text-muted)]'
    text = t('sync.disabledLocal')
  } else if (info.failed > 0) {
    tone = 'text-[var(--accent-red)]'
    text = t('sync.failedChanges', { count: info.failed })
  } else if (!info.online) {
    tone = 'text-[var(--accent-yellow)]'
    text = queued ? t('sync.offlineQueued', { count: queued }) : t('sync.offline')
  } else if (info.syncing || info.pending > 0) {
    tone = 'text-[var(--accent-yellow)]'
    text = info.pending ? t('sync.syncingPending', { count: info.pending }) : t('sync.syncing')
  } else if (info.waiting > 0) {
    tone = 'text-[var(--accent-yellow)]'
    text = t('sync.waitingForAssignee', { count: info.waiting })
  }

  const buttonClass =
    'font-mono text-[11px] bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] px-2 py-0.5 rounded cursor-pointer transition-colors disabled:opacity-40'

  return (
    <div className="flex items-center justify-between gap-3 mb-4 px-3 py-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-[10px] ${tone}`}>●</span>
        <span className={`font-mono text-xs truncate ${tone}`}>{text}</span>
        {info.realtime === 'connected' && (
          <span
            title={t('sync.liveTitle')}
            className="font-mono text-[10px] px-1.5 py-0.5 rounded border bg-[var(--accent-green)]/10 text-[var(--accent-green)] border-[var(--accent-green)]/20"
          >
            {t('sync.live')}
          </span>
        )}
        {info.failed === 0 && !info.online && info.lastError && (
          <span className="text-[10px] text-[var(--text-muted)] truncate" title={info.lastError}>
            {info.lastError}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {info.disabledByUser ? null : info.failed > 0 ? (
          <>
            <button
              onClick={() => run(window.api.team.retrySync)}
              disabled={busy}
              className={buttonClass}
            >
              {t('common.retry')}
            </button>
            <button
              onClick={() => run(window.api.team.discardFailedSync)}
              disabled={busy}
              className={buttonClass}
            >
              {t('sync.discard')}
            </button>
          </>
        ) : (
          <button
            onClick={() => run(window.api.team.syncNow)}
            disabled={busy}
            className={buttonClass}
          >
            {t('sync.syncNow')}
          </button>
        )}
      </div>
    </div>
  )
}
