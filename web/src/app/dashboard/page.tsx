import OrgSwitcher, { NoOrg } from '@/components/OrgSwitcher'
import { formatPrice, requireUser, resolveOrg, type Plan } from '@/lib/data'

export const dynamic = 'force-dynamic'

export default async function Overview({ searchParams }: { searchParams: { org?: string } }) {
  const { supabase } = await requireUser()
  const { orgs, current } = await resolveOrg(searchParams.org)
  if (!current) return <NoOrg />

  const [{ data: members }, { data: tasks }, { data: plan }] = await Promise.all([
    supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', current.id)
      .eq('status', 'active'),
    supabase.from('team_tasks').select('status, due_date').eq('organization_id', current.id),
    current.plan_id
      ? supabase.from('plans').select('*').eq('id', current.plan_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const today = new Date().toISOString().slice(0, 10)
  const all = tasks ?? []
  const count = (s: string) => all.filter((t) => t.status === s).length
  const overdue = all.filter((t) => t.status !== 'completed' && t.due_date < today).length
  const p = plan as Plan | null

  return (
    <>
      <OrgSwitcher orgs={orgs} current={current} path="/dashboard" />
      <div className="grid">
        <div className="stat">
          <div className="n">{members?.length ?? 0}</div>
          <div className="l">Active members</div>
        </div>
        <div className="stat">
          <div className="n">{all.length}</div>
          <div className="l">Total tasks</div>
        </div>
        <div className="stat">
          <div className="n">{count('completed')}</div>
          <div className="l">Completed</div>
        </div>
        <div className="stat">
          <div className="n">{count('awaiting_review')}</div>
          <div className="l">Awaiting review</div>
        </div>
        <div className="stat">
          <div className="n">{count('blocked')}</div>
          <div className="l">Blocked</div>
        </div>
        <div className="stat">
          <div className="n">{overdue}</div>
          <div className="l">Overdue</div>
        </div>
      </div>
      <div className="card">
        <h2>Plan</h2>
        {p ? (
          <p>
            <strong>{p.name}</strong> — {formatPrice(p.price_monthly, p.currency)} / month
            {p.max_members ? ` · up to ${p.max_members} members` : ' · unlimited members'}
          </p>
        ) : (
          <p className="muted">No plan assigned yet. A superadmin assigns plans.</p>
        )}
      </div>
    </>
  )
}
