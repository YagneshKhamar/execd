import Link from 'next/link'
import { Suspense } from 'react'
import Nav from '@/components/Nav'
import SignOut from '@/components/SignOut'
import { isPlatformAdmin, requireUser } from '@/lib/data'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser()
  const admin = await isPlatformAdmin()
  return (
    <>
      <div className="topbar">
        <span className="brand">EXECD</span>
        <Suspense fallback={<nav />}>
          <Nav
            keepOrg
            items={[
              { href: '/dashboard', label: 'Overview' },
              { href: '/dashboard/members', label: 'Members' },
              { href: '/dashboard/tasks', label: 'Tasks' },
              { href: '/dashboard/invitations', label: 'Invitations' },
            ]}
          />
        </Suspense>
        {admin && (
          <Link className="btn" href="/admin">
            Superadmin
          </Link>
        )}
        <SignOut email={user.email} />
      </div>
      <div className="container">{children}</div>
    </>
  )
}
