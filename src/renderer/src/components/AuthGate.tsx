import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { translateError } from '../i18n/errors'
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
  const { t } = useTranslation()
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
          toast.error(translateError(t, result.error, 'auth.signUpFailed'))
          return
        }
        if (result.needsConfirmation) {
          toast.info(t('auth.checkEmail'))
          setMode('sign-in')
          setPassword('')
          return
        }
      } else {
        const result = await window.api.auth.signIn({ email, password })
        if (!result.success) {
          toast.error(translateError(t, result.error, 'auth.signInFailed'))
          return
        }
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={isSignUp ? t('auth.createYourAccount') : t('auth.signInTitle')}>
      <form onSubmit={submit} className="space-y-2">
        {isSignUp && (
          <input
            type="text"
            placeholder={t('auth.yourName')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={INPUT_CLASS}
          />
        )}
        <input
          type="email"
          placeholder={t('auth.email')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className={INPUT_CLASS}
        />
        <input
          type="password"
          placeholder={isSignUp ? t('auth.passwordMin') : t('auth.password')}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
          className={INPUT_CLASS}
        />
        <button type="submit" disabled={!canSubmit} className={`${PRIMARY_BUTTON_CLASS} mt-2`}>
          {busy ? t('auth.pleaseWait') : isSignUp ? t('auth.createAccount') : t('auth.signIn')}
        </button>
      </form>
      <div className="flex justify-between mt-4">
        <button
          onClick={() => setMode(isSignUp ? 'sign-in' : 'sign-up')}
          className={LINK_BUTTON_CLASS}
        >
          {isSignUp ? t('auth.haveAccount') : t('auth.newHere')}
        </button>
        <button onClick={continueLocalOnly} className={LINK_BUTTON_CLASS}>
          {t('auth.useLocalOnly')}
        </button>
      </div>
    </Card>
  )
}

type PendingInvitation = NonNullable<
  Awaited<ReturnType<Window['api']['invitations']['getMine']>>['invitations']
>[number]

function CreateOrganizationForm(): React.JSX.Element {
  const { t } = useTranslation()
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
      else toastError(translateError(t, result.error, 'auth.checkInvitationsFailed'))
    }
    loadInvitations()
  }, [toastError, t])

  async function accept(id: string): Promise<void> {
    if (busy) return
    setBusy(true)
    try {
      const result = await window.api.invitations.accept(id)
      if (!result.success) {
        toast.error(translateError(t, result.error, 'auth.acceptFailed'))
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
        toast.error(translateError(t, result.error, 'auth.createOrgFailed'))
        return
      }
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card title={t('auth.setupOrgTitle')}>
      {invitations.length > 0 && (
        <div className="mb-4 space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)]">
            {t('auth.youAreInvited')}
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
                  {t('auth.asRole', { role: t(`roles.${inv.role}`) })}
                  {inv.invitedByName ? ` · ${t('auth.fromName', { name: inv.invitedByName })}` : ''}
                </p>
              </div>
              <button
                onClick={() => accept(inv.id)}
                disabled={busy}
                className="bg-[var(--accent-blue)] hover:bg-[var(--accent-blue-dim)] disabled:opacity-40 text-white text-xs px-3 py-1.5 rounded cursor-pointer transition-colors"
              >
                {t('auth.join')}
              </button>
            </div>
          ))}
          <p className="text-[10px] text-[var(--text-muted)]">{t('auth.orCreateBelow')}</p>
        </div>
      )}
      <p className="text-xs text-[var(--text-secondary)] mb-3">{t('auth.createOrgHelp')}</p>
      <form onSubmit={submit} className="space-y-2">
        <input
          type="text"
          placeholder={t('auth.orgName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          className={INPUT_CLASS}
        />
        <button type="submit" disabled={!name.trim() || busy} className={PRIMARY_BUTTON_CLASS}>
          {busy ? t('auth.creating') : t('auth.createOrganization')}
        </button>
      </form>
      <div className="flex justify-between mt-4">
        <button onClick={signOut} className={LINK_BUTTON_CLASS}>
          {t('nav.signOut')}
        </button>
        <button onClick={continueLocalOnly} className={LINK_BUTTON_CLASS}>
          {t('auth.useLocalOnly')}
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
  const { t } = useTranslation()
  const { state, localOnly, refresh, continueLocalOnly } = useAuth()

  if (state === null) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm font-mono">
        {t('common.loading')}
      </div>
    )
  }

  if (!state.configured || localOnly) return <>{children}</>
  if (!state.signedIn) return <CredentialsForm />

  if (state.error && !state.organization) {
    return (
      <Card title={t('auth.loadOrgFailed')}>
        <p className="text-xs text-[var(--text-secondary)] mb-3">{state.error}</p>
        <button onClick={refresh} className={PRIMARY_BUTTON_CLASS}>
          {t('common.retry')}
        </button>
        <div className="flex justify-end mt-4">
          <button onClick={continueLocalOnly} className={LINK_BUTTON_CLASS}>
            {t('auth.useLocalOnly')}
          </button>
        </div>
      </Card>
    )
  }

  if (!state.organization) return <CreateOrganizationForm />

  return <>{children}</>
}
