import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import Nav from '@/components/Nav'
import SignOut from '@/components/SignOut'
import { isPlatformAdmin, requireUser } from '@/lib/data'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser()
  // Authorization is enforced by RLS too (platform_admins / is_platform_admin()); this just
  // keeps non-admins out of the UI.
  if (!(await isPlatformAdmin())) redirect('/dashboard')
  return (
    <>
      <div className="topbar">
        <span className="brand">EXECD · SUPERADMIN</span>
        <Suspense fallback={<nav />}>
          <Nav
            items={[
              { href: '/admin', label: 'Organizations' },
              { href: '/admin/plans', label: 'Pricing plans' },
            ]}
          />
        </Suspense>
        <Link className="btn" href="/dashboard">
          My dashboard
        </Link>
        <SignOut email={user.email} />
      </div>
      <div className="container">{children}</div>
    </>
  )
}
