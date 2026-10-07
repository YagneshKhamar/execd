import { ipcMain } from 'electron'
import { getSupabaseClient } from '../supabase/client'
import { clearSyncContextCache } from '../supabase/syncEngine'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

export function registerInvitationHandlers(): void {
  ipcMain.handle('invitations:list', async (_e, organizationId: string) => {
    const supabase = getSupabaseClient()
    if (!supabase) return { success: false, error: 'Supabase is not configured' }
    if (!isUuid(organizationId)) return { success: false, error: 'Invalid organization' }

    const [invitations, members] = await Promise.all([
      supabase
        .from('invitations')
        .select('id, email, role, status, expires_at, accepted_at, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false }),
      supabase
        .from('organization_members')
        .select('user_id, role, status, joined_at')
        .eq('organization_id', organizationId)
        .eq('status', 'active')
        .order('joined_at', { ascending: true }),
    ])

    if (invitations.error) return { success: false, error: invitations.error.message }
    if (members.error) return { success: false, error: members.error.message }

    // organization_members references auth.users, not profiles, so PostgREST cannot embed
    // the profile; fetch display names separately.
    const ids = members.data.map((m) => m.user_id)
    const profileById = new Map<string, { display_name: string; email: string }>()
    if (ids.length) {
      const profiles = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .in('id', ids)
      if (profiles.error) return { success: false, error: profiles.error.message }
      for (const p of profiles.data as { id: string; display_name: string; email: string }[]) {
        profileById.set(p.id, p)
      }
    }
    const now = Date.now()

    return {
      success: true,
      invitations: invitations.data.map((inv) => ({
        ...inv,
        status:
          (inv.status === 'pending' || inv.status === 'sent') &&
          new Date(inv.expires_at).getTime() <= now
            ? 'expired'
            : inv.status,
      })),
      members: members.data.map((m) => ({
        userId: m.user_id,
        role: m.role,
        joinedAt: m.joined_at,
        displayName: profileById.get(m.user_id)?.display_name ?? '',
        email: profileById.get(m.user_id)?.email ?? '',
      })),
    }
  })

  ipcMain.handle(
    'invitations:create',
    async (_e, data: { organizationId: string; email: string; role: string }) => {
      const supabase = getSupabaseClient()
      if (!supabase) return { success: false, error: 'Supabase is not configured' }

      if (!isUuid(data?.organizationId)) return { success: false, error: 'Invalid organization' }
      if (typeof data.email !== 'string' || !EMAIL_PATTERN.test(data.email.trim())) {
        return { success: false, error: 'Enter a valid email address' }
      }
      if (data.role !== 'manager' && data.role !== 'member') {
        return { success: false, error: 'Role must be manager or member' }
      }

      const { data: id, error } = await supabase.rpc('create_invitation', {
        org_id: data.organizationId,
        invite_email: data.email.trim(),
        invite_role: data.role,
      })
      if (error) return { success: false, error: error.message }
      return { success: true, id: id as string }
    },
  )

  ipcMain.handle('invitations:revoke', async (_e, invitationId: string) => {
    const supabase = getSupabaseClient()
    if (!supabase) return { success: false, error: 'Supabase is not configured' }
    if (!isUuid(invitationId)) return { success: false, error: 'Invalid invitation' }

    const { error } = await supabase.rpc('revoke_invitation', { invitation_id: invitationId })
    if (error) return { success: false, error: error.message }
    return { success: true }
  })

  ipcMain.handle('invitations:get-mine', async () => {
    const supabase = getSupabaseClient()
    if (!supabase) return { success: false, error: 'Supabase is not configured' }

    const { data, error } = await supabase.rpc('get_my_invitations')
    if (error) return { success: false, error: error.message }

    return {
      success: true,
      invitations: (
        data as {
          id: string
          organization_id: string
          organization_name: string
          role: string
          invited_by_name: string | null
          expires_at: string
        }[]
      ).map((inv) => ({
        id: inv.id,
        organizationName: inv.organization_name,
        role: inv.role,
        invitedByName: inv.invited_by_name ?? '',
        expiresAt: inv.expires_at,
      })),
    }
  })

  ipcMain.handle('invitations:accept', async (_e, invitationId: string) => {
    const supabase = getSupabaseClient()
    if (!supabase) return { success: false, error: 'Supabase is not configured' }
    if (!isUuid(invitationId)) return { success: false, error: 'Invalid invitation' }

    const { error } = await supabase.rpc('accept_invitation', { invitation_id: invitationId })
    clearSyncContextCache()
    if (error) return { success: false, error: error.message }
    return { success: true }
  })
}
