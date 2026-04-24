import { useEffect, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

type UpdateStatus = {
  status: 'checking' | 'available' | 'latest' | 'downloading' | 'ready' | 'error'
  version?: string
  percent?: number
  message?: string
} | null

export default function UpdateNotifier(): React.JSX.Element | null {
  const { t } = useTranslation()
  const [update, setUpdate] = useState<UpdateStatus>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    window.api.updater.onStatus((data) => {
      console.log('updater status:', JSON.stringify(data))
      setUpdate(data as UpdateStatus)
      setDismissed(false)
    })
    return () => {
      window.api.updater.removeStatusListener()
    }
  }, [])

  if (!update || dismissed) return null
  if (update.status === 'checking' || update.status === 'latest') return null

  return (
    <div className="fixed bottom-5 right-5 z-50 max-w-sm w-full bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg p-4 shadow-lg">
      {update.status === 'available' && (
        <div>
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {t('updater.available')}
              </p>
              <p className="text-xs text-[var(--text-muted)] font-mono mt-0.5">v{update.version}</p>
            </div>
            <button
              onClick={() => setDismissed(true)}
              className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={() => window.api.updater.download()}
            className="flex items-center gap-2 w-full justify-center bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] text-white text-sm font-medium px-4 py-2 rounded cursor-pointer transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Update
          </button>
        </div>
      )}

      {update.status === 'downloading' && (
        <div>
          <p className="text-sm font-medium text-[var(--text-primary)] mb-2">
            Downloading update...
          </p>
          <div className="h-1.5 bg-[var(--border-default)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent-blue)] rounded-full transition-all duration-300"
              style={{ width: `${update.percent || 0}%` }}
            />
          </div>
          <p className="font-mono text-xs text-[var(--text-muted)] mt-1.5">
            {update.percent || 0}%
          </p>
        </div>
      )}

      {update.status === 'ready' && (
        <div>
          <div className="flex items-start justify-between mb-3">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {t('updater.readyToInstall')}
            </p>
            <button
              onClick={() => setDismissed(true)}
              className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mb-3">
            Update downloaded. Restart to apply.
          </p>
          <button
            onClick={() => window.api.updater.install()}
            className="flex items-center gap-2 w-full justify-center bg-[var(--accent-green)] hover:bg-[var(--accent-green)]/80 text-white text-sm font-medium px-4 py-2 rounded cursor-pointer transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Restart and Install
          </button>
        </div>
      )}

      {update.status === 'error' && (
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-[var(--accent-red)]">
              {t('updater.checkFailed')}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate max-w-xs">
              {update.message}
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors ml-2 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  )
}
