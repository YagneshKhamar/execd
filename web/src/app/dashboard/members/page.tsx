import OrgSwitcher, { NoOrg } from '@/components/OrgSwitcher'
import { requireUser, resolveOrg } from '@/lib/data'

export const dynamic = 'force-dynamic'

export default async function Members({ searchParams }: { searchParams: { org?: string } }) {
  const { supabase } = await requireUser()
  const { orgs, current } = await resolveOrg(searchParams.org)
  if (!current) return <NoOrg />

  const { data: members } = await supabase
    .from('organization_members')
    .select('user_id, role, status, joined_at')
    .eq('organization_id', current.id)
    .order('joined_at')
  const ids = (members ?? []).map((m) => m.user_id)
  const [{ data: profiles }, { data: tasks }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, email').in('id', ids),
    supabase.from('team_tasks').select('assigned_to, status').eq('organization_id', current.id),
  ])
  const profile = new Map((profiles ?? []).map((p) => [p.id, p]))

  return (
    <>
      <OrgSwitcher orgs={orgs} current={current} path="/dashboard/members" />
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Tasks (done / total)</th>
              <th>Joined</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((m) => {
              const mine = (tasks ?? []).filter((t) => t.assigned_to === m.user_id)
              const done = mine.filter((t) => t.status === 'completed').length
              const p = profile.get(m.user_id)
              return (
                <tr key={m.user_id}>
                  <td>{p?.display_name || '—'}</td>
                  <td>{p?.email || '—'}</td>
                  <td>{m.role}</td>
                  <td>
                    <span className={`badge ${m.status === 'active' ? 'completed' : 'revoked'}`}>
                      {m.status}
                    </span>
                  </td>
                  <td>
                    {done} / {mine.length}
                  </td>
                  <td>{new Date(m.joined_at).toLocaleDateString()}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
