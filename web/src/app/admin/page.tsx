import { revalidatePath } from 'next/cache'
import { requireUser, type Plan } from '@/lib/data'

export const dynamic = 'force-dynamic'

async function assignPlan(formData: FormData) {
  'use server'
  const { supabase } = await requireUser()
  const planId = String(formData.get('plan_id') ?? '')
  await supabase
    .from('organizations')
    .update({ plan_id: planId || null })
    .eq('id', String(formData.get('org_id')))
  revalidatePath('/admin')
}

export default async function AdminOrgs() {
  const { supabase } = await requireUser()
  const [{ data: orgs }, { data: members }, { data: plans }] = await Promise.all([
    supabase.from('organizations').select('id, name, created_by, created_at, plan_id').order('created_at', { ascending: false }),
    supabase.from('organization_members').select('organization_id, user_id, role, status'),
    supabase.from('plans').select('*').order('sort_order'),
  ])
  const owners = (members ?? []).filter((m) => m.role === 'owner' && m.status === 'active')
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, display_name, email')
    .in(
      'id',
      owners.map((o) => o.user_id),
    )
  const profile = new Map((profiles ?? []).map((p) => [p.id, p]))

  return (
    <>
      <h1>Organizations</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        {orgs?.length ?? 0} organizations on the platform.
      </p>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Organization</th>
              <th>Owner</th>
              <th>Active members</th>
              <th>Created</th>
              <th>Plan</th>
            </tr>
          </thead>
          <tbody>
            {(orgs ?? []).map((o) => {
              const count = (members ?? []).filter(
                (m) => m.organization_id === o.id && m.status === 'active',
              ).length
              const owner = owners.find((m) => m.organization_id === o.id)
              const op = owner ? profile.get(owner.user_id) : undefined
              return (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td>{op?.display_name || op?.email || '—'}</td>
                  <td>{count}</td>
                  <td>{new Date(o.created_at).toLocaleDateString()}</td>
                  <td>
                    <form action={assignPlan} className="row" style={{ gap: 6 }}>
                      <input type="hidden" name="org_id" value={o.id} />
                      <select name="plan_id" defaultValue={o.plan_id ?? ''}>
                        <option value="">No plan</option>
                        {((plans ?? []) as Plan[]).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit">Save</button>
                    </form>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
