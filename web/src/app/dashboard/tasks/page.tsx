import Link from 'next/link'
import OrgSwitcher, { NoOrg } from '@/components/OrgSwitcher'
import { requireUser, resolveOrg } from '@/lib/data'

export const dynamic = 'force-dynamic'

const STATUSES = ['pending', 'awaiting_review', 'needs_changes', 'blocked', 'completed']

export default async function Tasks({
  searchParams,
}: {
  searchParams: { org?: string; status?: string }
}) {
  const { supabase } = await requireUser()
  const { orgs, current } = await resolveOrg(searchParams.org)
  if (!current) return <NoOrg />

  let query = supabase
    .from('team_tasks')
    .select('id, title, assigned_to, status, effort, due_date, proof_value')
    .eq('organization_id', current.id)
    .order('due_date', { ascending: false })
    .limit(200)
  if (searchParams.status) query = query.eq('status', searchParams.status)
  const { data: tasks } = await query

  const ids = Array.from(new Set((tasks ?? []).map((t) => t.assigned_to)))
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, email')
    .in('id', ids)
  const name = new Map((profiles ?? []).map((p) => [p.id, p.display_name || p.email]))
  const base = `/dashboard/tasks?org=${current.id}`

  return (
    <>
      <OrgSwitcher orgs={orgs} current={current} path="/dashboard/tasks" />
      <div className="row" style={{ marginBottom: 12 }}>
        <Link className="btn" href={base}>
          All
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} className="btn" href={`${base}&status=${s}`}>
            {s.replace('_', ' ')}
          </Link>
        ))}
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th>Assignee</th>
              <th>Status</th>
              <th>Effort</th>
              <th>Due</th>
              <th>Proof</th>
            </tr>
          </thead>
          <tbody>
            {(tasks ?? []).map((t) => (
              <tr key={t.id}>
                <td>{t.title}</td>
                <td>{name.get(t.assigned_to) ?? '—'}</td>
                <td>
                  <span className={`badge ${t.status}`}>{t.status.replace('_', ' ')}</span>
                </td>
                <td>{t.effort}</td>
                <td>{t.due_date}</td>
                <td className="muted">{t.proof_value || '—'}</td>
              </tr>
            ))}
            {!tasks?.length && (
              <tr>
                <td colSpan={6} className="muted">
                  No tasks found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
