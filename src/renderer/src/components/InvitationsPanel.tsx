import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import { useToast } from './Toast'

type ListResult = Awaited<ReturnType<Window['api']['invitations']['list']>>
type Invitation = NonNullable<ListResult['invitations']>[number]
type OrgMember = NonNullable<ListResult['members']>[number]

const STATUS_STYLES: Record<Invitation['status'], string> = {
  pending: 'text-[var(--accent-blue)]',
  sent: 'text-[var(--accent-blue)]',
  accepted: 'text-green-400',
  expired: 'text-[var(--text-muted)]',
  revoked: 'text-[var(--text-muted)]',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function InvitationsPanel(): React.JSX.Element | null {
  const { state, refresh } = useAuth()
  const { error: toastError, success: toastSuccess } = useToast()
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [members, setMembers] = useState<OrgMember[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'manager'>('member')
  const [busy, setBusy] = useState(false)

  const organization = state?.organization
  const isManager = organization?.role === 'owner' || organization?.role === 'manager'
  const organizationId = organization?.id

  const load = useCallback(async () => {
    if (!organizationId) return
    const result = await window.api.invitations.list(organizationId)
    if (!result.success) {
      toastError(result.error ?? 'Could not load invitations')
      return
    }
    setInvitations(result.invitations ?? [])
    setMembers(result.members ?? [])
  }, [organizationId, toastError])

  useEffect(() => {
    async function run(): Promise<void> {
      await load()
    }
    run()
  }, [load])

  if (!organization || !isManager) return null

  async function invite(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!email.trim() || busy || !organizationId) return
    setBusy(true)
    try {
      const result = await window.api.invitations.create({
        organizationId,
        email,
        role,
      })
      if (!result.success) {
        toastError(result.error ?? 'Could not create invitation')
        return
      }
      toastSuccess(`Invitation sent to ${email.trim()}. They can sign up or sign in to Execd with that address.`)
      setEmail('')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function revoke(id: string): Promise<void> {
    const result = await window.api.invitations.revoke(id)
    if (!result.success) {
      toastError(result.error ?? 'Could not revoke invitation')
      return
    }
    await load()
  }

  const isActive = (inv: Invitation): boolean => inv.status === 'pending' || inv.status === 'sent'

  async function toggleApproval(next: boolean): Promise<void> {
    if (!organizationId) return
    const result = await window.api.auth.setRequireApproval({
      organizationId,
      requireApproval: next,
    })
    if (!result.success) {
      toastError(result.error ?? 'Could not update the setting')
      return
    }
    await refresh()
  }

  return (
    <section className="mb-8 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-lg p-4">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">
        {organization.name} — organization
      </h2>
      <p className="text-xs text-[var(--text-secondary)] mt-1 mb-4">
        Invite people by email. They join by signing up to Execd with that address and accepting the
        invitation. Invitations expire after 7 days.
      </p>

      <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={organization.requireApproval}
          onChange={(e) => toggleApproval(e.target.checked)}
          className="cursor-pointer"
        />
        <span className="text-xs text-[var(--text-secondary)]">
          Require manager approval before a task counts as done
        </span>
      </label>

      <form onSubmit={invite} className="flex gap-2 mb-4">
        <input
          type="email"
          placeholder="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1 bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)]"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'member' | 'manager')}
          className="bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-2 text-sm text-[var(--text-primary)] outline-none"
        >
          <option value="member">Member</option>
          <option value="manager">Manager</option>
        </select>
        <button
          type="submit"
          disabled={!email.trim() || busy}
          className="bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm px-4 rounded cursor-pointer transition-colors"
        >
          Invite
        </button>
      </form>

      {invitations.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)] mb-2">
            Invitations
          </p>
          <div className="space-y-1">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex items-center gap-3 text-sm bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded px-3 py-2"
              >
                <span className="flex-1 truncate text-[var(--text-primary)]">{inv.email}</span>
                <span className="text-xs text-[var(--text-secondary)]">{inv.role}</span>
                <span className={`text-xs font-mono ${STATUS_STYLES[inv.status]}`}>
                  {inv.status === 'sent' ? 'pending' : inv.status}
                </span>
                <span className="text-xs text-[var(--text-muted)] w-28 text-right">
                  {inv.status === 'accepted' && inv.accepted_at
                    ? `joined ${formatDate(inv.accepted_at)}`
                    : isActive(inv)
                      ? `expires ${formatDate(inv.expires_at)}`
                      : ''}
                </span>
                {isActive(inv) && (
                  <button
                    onClick={() => revoke(inv.id)}
                    className="bg-transparent border-none text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] underline cursor-pointer"
                  >
                    Revoke
                  </button>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-[var(--text-muted)] mt-2">
            To resend or extend an invitation, invite the same email again. Expired or revoked
            invitations can be re-invited the same way.
          </p>
        </div>
      )}

      {members.length > 0 && (
        <div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)] mb-2">
            Members ({members.length})
          </p>
          <div className="space-y-1">
            {members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center gap-3 text-sm bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded px-3 py-2"
              >
                <span className="flex-1 truncate text-[var(--text-primary)]">
                  {m.displayName || m.email}
                </span>
                <span className="text-xs text-[var(--text-muted)] truncate">{m.email}</span>
                <span className="text-xs font-mono text-[var(--text-secondary)]">{m.role}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
