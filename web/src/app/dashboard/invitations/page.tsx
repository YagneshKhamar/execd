import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import OrgSwitcher, { NoOrg } from '@/components/OrgSwitcher'
import { requireUser, resolveOrg } from '@/lib/data'

export const dynamic = 'force-dynamic'

async function invite(formData: FormData) {
  'use server'
  const { supabase } = await requireUser()
  const orgId = String(formData.get('org_id'))
  const email = String(formData.get('email') ?? '').trim()
  const role = String(formData.get('role') ?? 'member')
  const { error } = await supabase.rpc('create_invitation', {
    org_id: orgId,
    invite_email: email,
    invite_role: role,
  })
  if (error) redirect(`/dashboard/invitations?org=${orgId}&error=${encodeURIComponent(error.message)}`)
  revalidatePath('/dashboard/invitations')
  redirect(`/dashboard/invitations?org=${orgId}&sent=${encodeURIComponent(email)}`)
}

async function revoke(formData: FormData) {
  'use server'
  const { supabase } = await requireUser()
  const orgId = String(formData.get('org_id'))
  const { error } = await supabase.rpc('revoke_invitation', {
    invitation_id: String(formData.get('id')),
  })
  if (error) redirect(`/dashboard/invitations?org=${orgId}&error=${encodeURIComponent(error.message)}`)
  revalidatePath('/dashboard/invitations')
  redirect(`/dashboard/invitations?org=${orgId}`)
}

export default async function Invitations({
  searchParams,
}: {
  searchParams: { org?: string; error?: string; sent?: string }
}) {
  const { supabase } = await requireUser()
  const { orgs, current } = await resolveOrg(searchParams.org)
  if (!current) return <NoOrg />

  const { data: invitations } = await supabase
    .from('invitations')
    .select('id, email, role, status, expires_at, created_at')
    .eq('organization_id', current.id)
    .order('created_at', { ascending: false })

  return (
    <>
      <OrgSwitcher orgs={orgs} current={current} path="/dashboard/invitations" />
      {searchParams.sent && <div className="notice">Invitation sent to {searchParams.sent}.</div>}
      {searchParams.error && <p className="error">{searchParams.error}</p>}
      <div className="card">
        <h2>Invite someone</h2>
        <form action={invite} className="row">
          <input type="hidden" name="org_id" value={current.id} />
          <div>
            <label htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required style={{ width: 260 }} />
          </div>
          <div>
            <label htmlFor="role">Role</label>
            <select id="role" name="role" defaultValue="member">
              <option value="member">Member</option>
              <option value="manager">Manager</option>
            </select>
          </div>
          <button className="primary" type="submit">
            Send invitation
          </button>
        </form>
      </div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th>Expires</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(invitations ?? []).map((i) => (
              <tr key={i.id}>
                <td>{i.email}</td>
                <td>{i.role}</td>
                <td>
                  <span className={`badge ${i.status}`}>
                    {i.status === 'sent' ? 'pending' : i.status}
                  </span>
                </td>
                <td>{new Date(i.expires_at).toLocaleDateString()}</td>
                <td>
                  {(i.status === 'pending' || i.status === 'sent') && (
                    <form action={revoke}>
                      <input type="hidden" name="org_id" value={current.id} />
                      <input type="hidden" name="id" value={i.id} />
                      <button className="danger" type="submit">
                        Revoke
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {!invitations?.length && (
              <tr>
                <td colSpan={5} className="muted">
                  No invitations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
