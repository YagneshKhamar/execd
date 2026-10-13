import Link from 'next/link'
import { redirect } from 'next/navigation'
import ThemeToggle from '@/components/ThemeToggle'
import { createClient } from '@/lib/supabase/server'

async function signIn(formData: FormData) {
  'use server'
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = String(formData.get('next') ?? '/dashboard')
  const supabase = createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`)

  // Role decides where you land: platform admins go to the superadmin console, everyone else
  // to their organization dashboard. (Server-side check against platform_admins.)
  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : ''
  if (isAdmin === true) redirect(safeNext.startsWith('/admin') ? safeNext : '/admin')
  redirect(safeNext && !safeNext.startsWith('/admin') ? safeNext : '/dashboard')
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; next?: string }
}) {
  return (
    <div className="login card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Link href="/" className="muted">
          ← Back to home
        </Link>
        <ThemeToggle />
      </div>
      <h1>Login</h1>
      <p className="muted">Sign in with your Execd account.</p>
      <form action={signIn}>
        <input type="hidden" name="next" value={searchParams.next ?? '/dashboard'} />
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required style={{ width: '100%' }} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" required style={{ width: '100%' }} />
        </div>
        {searchParams.error && <p className="error">{searchParams.error}</p>}
        <button className="primary" type="submit" style={{ width: '100%' }}>
          Sign in
        </button>
      </form>
    </div>
  )
}
