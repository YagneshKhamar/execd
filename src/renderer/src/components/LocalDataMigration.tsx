import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { translateError } from '../i18n/errors'
import { useAuth } from './AuthProvider'
import { useToast } from './Toast'

type Preview = Awaited<ReturnType<Window['api']['migration']['preview']>>
type Result = Awaited<ReturnType<Window['api']['migration']['run']>>

/**
 * One-time(ish) card offering to bring existing local team members/tasks into Supabase, once an
 * organization exists. Safe to run more than once: members already invited are just re-invited
 * (renews their invitation), and tasks already queued are skipped (see migration.ipc.ts).
 */
export default function LocalDataMigration(): React.JSX.Element | null {
  const { t } = useTranslation()
  const { state } = useAuth()
  const { error: toastError } = useToast()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)

  const isManager = state?.organization?.role === 'owner' || state?.organization?.role === 'manager'

  const load = useCallback(async () => {
    if (!isManager) return
    setPreview(await window.api.migration.preview())
  }, [isManager])

  useEffect(() => {
    async function run(): Promise<void> {
      await load()
    }
    run()
  }, [load])

  if (!isManager || !preview?.eligible) return null

  const hasWork = preview.unlinkedMembersWithEmail > 0 || preview.legacyTasks > 0
  if (!hasWork && !result) return null

  async function run(): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      const outcome = await window.api.migration.run()
      if (!outcome.success) {
        toastError(translateError(t, outcome.error, 'migration.importFailed'))
        return
      }
      setResult(outcome)
      await load()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mb-8 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">{t('migration.title')}</h2>
      <p className="text-xs text-[var(--text-secondary)] mt-1 mb-3">{t('migration.help')}</p>

      {hasWork && (
        <ul className="text-xs text-[var(--text-secondary)] mb-3 space-y-0.5">
          {preview.unlinkedMembersWithEmail > 0 && (
            <li>{t('migration.willInvite', { count: preview.unlinkedMembersWithEmail })}</li>
          )}
          {preview.unlinkedMembersWithoutEmail > 0 && (
            <li>{t('migration.noEmail', { count: preview.unlinkedMembersWithoutEmail })}</li>
          )}
          {preview.legacyTasks > 0 && (
            <li>{t('migration.willQueue', { count: preview.legacyTasks })}</li>
          )}
        </ul>
      )}

      {hasWork && (
        <button
          onClick={run}
          disabled={busy}
          className="bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 text-white text-sm px-4 py-2 rounded cursor-pointer transition-colors"
        >
          {busy ? t('migration.importing') : t('migration.importNow')}
        </button>
      )}

      {result && (
        <div className="mt-3 text-xs text-[var(--text-secondary)] bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded p-3">
          <p className="text-[var(--text-primary)] font-medium mb-1">{t('migration.summary')}</p>
          <p>{t('migration.invitationsSent', { count: result.invitationsSent })}</p>
          {result.invitationsSkippedNoEmail > 0 && (
            <p>{t('migration.skippedNoEmail', { count: result.invitationsSkippedNoEmail })}</p>
          )}
          <p>{t('migration.tasksQueued', { count: result.tasksQueued })}</p>
          {result.invitationsFailed.length > 0 && (
            <div className="mt-1 text-[var(--accent-red)]">
              {result.invitationsFailed.map((f, i) => (
                <p key={i}>
                  {f.name}: {f.error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
