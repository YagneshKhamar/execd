import { useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { relativeTime } from '../i18n/relativeTime'
import { useAuth } from './AuthProvider'

type Notification = NonNullable<
  Awaited<ReturnType<Window['api']['notifications']['list']>>['notifications']
>[number]

const POLL_MS = 15000

export default function NotificationBell(): React.JSX.Element | null {
  const { t } = useTranslation()
  const { state } = useAuth()
  const [items, setItems] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const enabled = Boolean(state?.signedIn && state.organization)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function load(): Promise<void> {
      const result = await window.api.notifications.list()
      if (!cancelled && result.success) setItems(result.notifications ?? [])
    }
    load()
    const timer = setInterval(load, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [enabled])

  useEffect(() => {
    function onClickOutside(e: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  if (!enabled) return null

  const unread = items.filter((n) => !n.read_at)

  async function markRead(ids: string[] | null): Promise<void> {
    const result = await window.api.notifications.markRead(ids)
    if (!result.success) return
    const now = new Date().toISOString()
    setItems((prev) =>
      prev.map((n) =>
        ids === null || ids.includes(n.id) ? { ...n, read_at: n.read_at ?? now } : n,
      ),
    )
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title={t('notifications.title')}
        className="relative flex items-center justify-center bg-transparent border-none text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer p-1"
      >
        <Bell className="w-4 h-4" />
        {unread.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-[3px] rounded-full bg-[var(--accent-red)] text-white text-[9px] font-mono leading-[14px] text-center">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-80 max-h-96 overflow-y-auto bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border-subtle)]">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              {t('notifications.title')}
            </span>
            {unread.length > 0 && (
              <button
                onClick={() => markRead(null)}
                className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline bg-transparent border-none cursor-pointer"
              >
                {t('notifications.markAllRead')}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="text-xs text-[var(--text-muted)] px-3 py-4 text-center">
              {t('notifications.none')}
            </p>
          ) : (
            <div>
              {items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => markRead([n.id])}
                  className={`w-full text-left px-3 py-2 border-b border-[var(--border-subtle)] last:border-0 cursor-pointer transition-colors hover:bg-[var(--bg-hover)] bg-transparent border-x-0 border-t-0 ${
                    n.read_at ? '' : 'bg-[var(--accent-blue)]/5'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wide text-[var(--text-secondary)]">
                      {t(`notifications.types.${n.type}`)}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] shrink-0">
                      {relativeTime(t, n.created_at)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-primary)] truncate">{n.title}</p>
                  {n.body && (
                    <p className="text-[10px] text-[var(--text-secondary)] truncate">{n.body}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
