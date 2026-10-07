import { useEffect, useState } from 'react'
import { useAuth } from './AuthProvider'
import { useToast } from './Toast'

const INPUT_CLASS =
  'w-full bg-[var(--bg-base)] border border-[var(--border-default)] rounded px-3 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-blue)] transition-colors'
const PRIMARY_BUTTON_CLASS =
  'w-full bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm py-2.5 rounded cursor-pointer transition-colors'
const LINK_BUTTON_CLASS =
  'bg-transparent border-none text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-xs cursor-pointer underline'

function Card({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="h-full flex items-center justify-center px-6">
      <div className="bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-4">{title}</h2>
        {children}
      </div>
    </div>
  )
}

function CredentialsForm(): React.JSX.Element {
  const { refresh, continueLocalOnly } = useAuth()
  const toast = useToast()
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const isSignUp = mode === 'sign-up'
  const canSubmit =
    !busy && email.trim() && password && (!isSignUp || (displayName.trim() && password.length >= 8))

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    try {
      if (isSignUp) {
        const result = await window.api.auth.signUp({ email, password, displayName })
        if (!result.success) {
          toast.error(result.error ?? 'Sign up failed')
          return
        }
        if (result.needsConfirmation) {
          toast.info('Check your email to confirm your account, then sign in.')
          setMode('sign-in')
          setPassword('')
          return
        }
      } else {
        const result = await window.api.auth.signIn({ email, password })
        if (!result.success) {
          toast.error(result.error ?? 'Sign in failed')
          return
        }
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={isSignUp ? 'Create your account' : 'Sign in to Execd Team'}>
      <form onSubmit={submit} className="space-y-2">
        {isSignUp && (
          <input
            type="text"
            placeholder="Your name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={INPUT_CLASS}
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className={INPUT_CLASS}
        />
        <input
          type="password"
          placeholder={isSignUp ? 'Password (min 8 characters)' : 'Password'}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          className={INPUT_CLASS}
        />
        <button type="submit" disabled={!canSubmit} className={`${PRIMARY_BUTTON_CLASS} mt-2`}>
          {busy ? 'Please wait...' : isSignUp ? 'Create account' : 'Sign in'}
        </button>
      </form>
      <div className="flex justify-between mt-4">
        <button
          onClick={() => setMode(isSignUp ? 'sign-in' : 'sign-up')}
          className={LINK_BUTTON_CLASS}
        >
          {isSignUp ? 'Have an account? Sign in' : 'New here? Create an account'}
        </button>
        <button onClick={continueLocalOnly} className={LINK_BUTTON_CLASS}>
          Use local team data only
        </button>
      </div>
    </Card>
  )
}

type PendingInvitation = NonNullable<
  Awaited<ReturnType<Window['api']['invitations']['getMine']>>['invitations']
>[number]

function CreateOrganizationForm(): React.JSX.Element {
  const { refresh, signOut, continueLocalOnly } = useAuth()
  const toast = useToast()
  const { error: toastError } = toast
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [invitations, setInvitations] = useState<PendingInvitation[]>([])

  useEffect(() => {
    async function loadInvitations(): Promise<void> {
      const result = await window.api.invitations.getMine()
      if (result.success) setInvitations(result.invitations ?? [])
      else toastError(result.error ?? 'Could not check for invitations')
    }
    loadInvitations()
  }, [toastError])

  async function accept(id: string): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      const result = await window.api.invitations.accept(id)
      if (!result.success) {
        toast.error(result.error ?? 'Could not accept invitation')
        return
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const result = await window.api.auth.createOrganization(name)
      if (!result.success) {
        toast.error(result.error ?? 'Could not create organization')
        return
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title="Set up your organization">
      {invitations.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)]">
            You have been invited
          </p>
          {invitations.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center gap-3 bg-[var(--bg-base)] border border-[var(--border-subtle)] rounded px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--text-primary)] truncate">
                  {inv.organizationName}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] truncate">
                  as {inv.role}
                  {inv.invitedByName ? ` · from ${inv.invitedByName}` : ''}
                </p>
              </div>
              <button
                onClick={() => accept(inv.id)}
                disabled={busy}
                className="bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded cursor-pointer transition-colors"
              >
                Join
              </button>
            </div>
          ))}
          <p className="text-[10px] text-[var(--text-muted)]">
            Or create your own organization below.
          </p>
        </div>
      )}
      <p className="text-xs text-[var(--text-secondary)] mb-3">
        Create the organization your team will belong to. You will be its owner. If you were invited
        to an existing one, accept the invitation instead.
      </p>
      <form onSubmit={submit} className="space-y-2">
        <input
          type="text"
          placeholder="Organization name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          className={INPUT_CLASS}
        />
        <button type="submit" disabled={!name.trim() || busy} className={PRIMARY_BUTTON_CLASS}>
          {busy ? 'Creating...' : 'Create organization'}
        </button>
      </form>
      <div className="flex justify-between mt-4">
        <button onClick={signOut} className={LINK_BUTTON_CLASS}>
          Sign out
        </button>
        <button onClick={continueLocalOnly} className={LINK_BUTTON_CLASS}>
          Use local team data only
        </button>
      </div>
    </Card>
  )
}

/**
 * Gates shared-team features behind sign-in + organization membership. When Supabase is not
 * configured, or the user chooses local-only, children render unchanged so existing local
 * team data stays reachable.
 */
export default function AuthGate({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { state, localOnly, refresh, continueLocalOnly } = useAuth()

  if (state === null) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm font-mono">
        loading...
      </div>
    )
  }

  if (!state.configured || localOnly) return <>{children}</>
  if (!state.signedIn) return <CredentialsForm />

  if (state.error && !state.organization) {
    return (
      <Card title="Could not load your organization">
        <p className="text-xs text-[var(--text-secondary)] mb-3">{state.error}</p>
        <button onClick={refresh} className={PRIMARY_BUTTON_CLASS}>
          Retry
        </button>
        <div className="flex justify-end mt-4">
          <button onClick={continueLocalOnly} className={LINK_BUTTON_CLASS}>
            Use local team data only
          </button>
        </div>
      </Card>
    )
  }

  if (!state.organization) return <CreateOrganizationForm />

  return <>{children}</>
}
