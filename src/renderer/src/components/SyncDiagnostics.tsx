import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import { useToast } from './Toast'

type SyncErrorEntry = Awaited<ReturnType<Window['api']['team']['syncErrors']>>[number]

function triggerJsonDownload(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

/**
 * Manager-only diagnostics: what's currently failing to sync, a manual backup export, and a
 * kill-switch to fall back to local-only SQLite without a new build (see setSyncDisabled in
 * syncEngine.ts). This is deliberately separate from SyncStatusBar, which is the everyday
 * connection indicator — this panel is for troubleshooting, not routine use.
 */
export default function SyncDiagnostics(): React.JSX.Element | null {
  const { state } = useAuth()
  const { error: toastError, success: toastSuccess } = useToast()
  const [disabled, setDisabled] = useState(false)
  const [errors, setErrors] = useState<SyncErrorEntry[]>([])
  const [expanded, setExpanded] = useState(false)

  const isManager = state?.organization?.role === 'owner' || state?.organization?.role === 'manager'

  const load = useCallback(async () => {
    if (!isManager) return
    const [d, e] = await Promise.all([
      window.api.team.getSyncDisabled(),
      window.api.team.syncErrors(),
    ])
    setDisabled(d)
    setErrors(e)
  }, [isManager])

  useEffect(() => {
    async function run(): Promise<void> {
      await load()
    }
    run()
  }, [load])

  if (!isManager) return null

  async function toggleDisabled(next: boolean): Promise<void> {
    await window.api.team.setSyncDisabled(next)
    setDisabled(next)
    toastSuccess(next ? 'Cloud sync disabled — switched to local-only' : 'Cloud sync re-enabled')
    await load()
  }

  async function exportBackup(): Promise<void> {
    const result = await window.api.team.exportData()
    if (!result.success) {
      toastError('Could not export data')
      return
    }
    triggerJsonDownload(result.json, result.filename)
    toastSuccess('Backup downloaded')
  }

  return (
    <section className="mb-8 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-xs font-semibold text-[var(--text-primary)] bg-transparent border-none cursor-pointer p-0"
      >
        {expanded ? '▾' : '▸'} Sync diagnostics
      </button>

      {expanded && (
        <div className="mt-3 space-y-4">
          <div>
            <button
              onClick={exportBackup}
              className="text-xs bg-transparent border border-[var(--border-default)] hover:border-[var(--border-active)] text-[var(--text-secondary)] px-3 py-1.5 rounded cursor-pointer transition-colors"
            >
              Download local backup (JSON)
            </button>
            <p className="text-[10px] text-[var(--text-muted)] mt-1">
              A snapshot of this device&apos;s local team data. Supabase itself is backed up
              separately on paid plans — this is an extra copy you keep yourself.
            </p>
          </div>

          {errors.length > 0 && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)] mb-2">
                Currently failing to sync ({errors.length})
              </p>
              <div className="space-y-1">
                {errors.map((e) => (
                  <div
                    key={e.entityId}
                    className="text-xs bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded px-3 py-2"
                  >
                    <p className="text-[var(--text-primary)]">{e.title}</p>
                    <p className="text-[10px] text-[var(--accent-red)]">
                      {e.error || e.status} (attempt {e.retryCount})
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={disabled}
              onChange={(e) => toggleDisabled(e.target.checked)}
              className="cursor-pointer"
            />
            <span className="text-xs text-[var(--text-secondary)]">
              Disable cloud sync and use local-only team data (troubleshooting)
            </span>
          </label>
        </div>
      )}
    </section>
  )
}
