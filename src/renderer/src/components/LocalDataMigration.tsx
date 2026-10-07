import { useCallback, useEffect, useState } from 'react'
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
        toastError(outcome.error ?? 'Import failed')
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
      <h2 className="text-base font-semibold text-[var(--text-primary)]">
        Bring in your existing local team data
      </h2>
      <p className="text-xs text-[var(--text-secondary)] mt-1 mb-3">
        This organization was created after Execd already had local team members and tasks on this
        device. Nothing local is deleted or changed by this — it only invites members by email and
        queues their tasks to sync, same as normal.
      </p>

      {hasWork && (
        <ul className="text-xs text-[var(--text-secondary)] mb-3 space-y-0.5">
          {preview.unlinkedMembersWithEmail > 0 && (
            <li>{preview.unlinkedMembersWithEmail} member(s) will be invited by email</li>
          )}
          {preview.unlinkedMembersWithoutEmail > 0 && (
            <li>
              {preview.unlinkedMembersWithoutEmail} member(s) have no email on file and can&apos;t
              be invited — add one on the Members tab first
            </li>
          )}
          {preview.legacyTasks > 0 && (
            <li>{preview.legacyTasks} local task(s) will be queued to sync</li>
          )}
        </ul>
      )}

      {hasWork && (
        <button
          onClick={run}
          disabled={busy}
          className="bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 text-white text-sm px-4 py-2 rounded cursor-pointer transition-colors"
        >
          {busy ? 'Importing...' : 'Import now'}
        </button>
      )}

      {result && (
        <div className="mt-3 text-xs text-[var(--text-secondary)] bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded p-3">
          <p className="text-[var(--text-primary)] font-medium mb-1">Import summary</p>
          <p>{result.invitationsSent} invitation(s) sent</p>
          {result.invitationsSkippedNoEmail > 0 && (
            <p>{result.invitationsSkippedNoEmail} member(s) skipped — no email on file</p>
          )}
          <p>{result.tasksQueued} task(s) queued to sync</p>
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
