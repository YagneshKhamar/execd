import ThemeToggle from './ThemeToggle'

export default function SignOut({ email }: { email?: string }) {
  return (
    <form action="/auth/signout" method="post" className="orgs">
      <ThemeToggle />
      {email && <span className="muted">{email}</span>}
      <button type="submit">Sign out</button>
    </form>
  )
}
