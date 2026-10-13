import Link from 'next/link'
import type { ManagedOrg } from '@/lib/data'

export default function OrgSwitcher({
  orgs,
  current,
  path,
}: {
  orgs: ManagedOrg[]
  current: ManagedOrg
  path: string
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h1>{current.name}</h1>
      {orgs.length > 1 && (
        <div className="orgs">
          <span className="muted">Switch organization:</span>
          {orgs.map((o) =>
            o.id === current.id ? (
              <strong key={o.id}>{o.name}</strong>
            ) : (
              <Link key={o.id} href={`${path}?org=${o.id}`}>
                {o.name}
              </Link>
            ),
          )}
        </div>
      )}
    </div>
  )
}

export function NoOrg() {
  return (
    <div className="card">
      <h2>No organization to manage</h2>
      <p className="muted">
        This account is not an owner or manager of any organization. Create or join one from the
        Execd desktop app, then come back.
      </p>
    </div>
  )
}
