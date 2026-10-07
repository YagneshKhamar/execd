import { ipcMain } from 'electron'
import { getSupabaseClient } from '../supabase/client'
import { getDatabase } from '../db/database'
import { clearStoredContext, clearSyncContextCache, syncNow } from '../supabase/syncEngine'

interface AuthUser {
  id: string
  email: string
  displayName: string
}

interface AuthOrganization {
  id: string
  name: string
  role: 'owner' | 'manager' | 'member'
  requireApproval: boolean
}

interface AuthState {
  configured: boolean
  signedIn: boolean
  user: AuthUser | null
  organization: AuthOrganization | null
  error?: string
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function isNonEmptyString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max
}

async function buildState(): Promise<AuthState> {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return { configured: false, signedIn: false, user: null, organization: null }
  }

  const { data, error } = await supabase.auth.getSession()
  const session = data.session
  if (error || !session) {
    return { configured: true, signedIn: false, user: null, organization: null }
  }

  const authUser = session.user
  const user: AuthUser = {
    id: authUser.id,
    email: authUser.email ?? '',
    displayName: (authUser.user_metadata?.display_name as string | undefined) ?? '',
  }

  const { data: memberships, error: memberError } = await supabase
    .from('organization_members')
    .select('role, organizations(id, name, require_approval)')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)

  if (memberError) {
    return {
      configured: true,
      signedIn: true,
      user,
      organization: null,
      error: memberError.message,
    }
  }

  const row = memberships?.[0] as unknown as
    | {
        role: AuthOrganization['role']
        organizations: { id: string; name: string; require_approval: boolean } | null
      }
    | undefined

  return {
    configured: true,
    signedIn: true,
    user,
    organization: row?.organizations
      ? {
          id: row.organizations.id,
          name: row.organizations.name,
          role: row.role,
          requireApproval: row.organizations.require_approval,
        }
      : null,
  }
}

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:get-state', async () => {
    clearSyncContextCache()
    try {
      const state = await buildState()
      // Record who is signed in and their role so offline changes can be queued right away.
      if (state.signedIn && state.organization) syncNow(getDatabase()).catch(console.error)
      return state
    } catch (err) {
      return {
        configured: true,
        signedIn: false,
        user: null,
        organization: null,
        error: err instanceof Error ? err.message : 'Failed to read auth state',
      } satisfies AuthState
    }
  })

  ipcMain.handle(
    'auth:sign-up',
    async (_e, data: { email: string; password: string; displayName: string }) => {
      const supabase = getSupabaseClient()
      if (!supabase) return { success: false, error: 'Supabase is not configured' }

      if (!isNonEmptyString(data?.email, 254) || !EMAIL_PATTERN.test(data.email.trim())) {
        return { success: false, error: 'Enter a valid email address' }
      }
      if (typeof data.password !== 'string' || data.password.length < 8) {
        return { success: false, error: 'Password must be at least 8 characters' }
      }
      if (!isNonEmptyString(data.displayName, 100)) {
        return { success: false, error: 'Enter your name' }
      }

      const { data: result, error } = await supabase.auth.signUp({
        email: data.email.trim(),
        password: data.password,
        options: { data: { display_name: data.displayName.trim() } },
      })
      if (error) return { success: false, error: error.message }

      return { success: true, needsConfirmation: !result.session }
    },
  )

  ipcMain.handle('auth:sign-in', async (_e, data: { email: string; password: string }) => {
    const supabase = getSupabaseClient()
    if (!supabase) return { success: false, error: 'Supabase is not configured' }

    if (!isNonEmptyString(data?.email, 254) || typeof data.password !== 'string') {
      return { success: false, error: 'Enter your email and password' }
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: data.email.trim(),
      password: data.password,
    })
    if (error) return { success: false, error: error.message }

    return { success: true }
  })

  ipcMain.handle('auth:sign-out', async () => {
    const supabase = getSupabaseClient()
    if (!supabase) return { success: true }

    const { error } = await supabase.auth.signOut()
    if (error) return { success: false, error: error.message }
    clearStoredContext(getDatabase())
    return { success: true }
  })

  ipcMain.handle('auth:create-organization', async (_e, name: string) => {
    const supabase = getSupabaseClient()
    if (!supabase) return { success: false, error: 'Supabase is not configured' }

    if (!isNonEmptyString(name, 100)) {
      return { success: false, error: 'Organization name must be 1-100 characters' }
    }

    const { data, error } = await supabase.rpc('create_organization', { org_name: name.trim() })
    if (error) return { success: false, error: error.message }

    return { success: true, id: data as string }
  })

  ipcMain.handle(
    'auth:set-require-approval',
    async (_e, data: { organizationId: string; requireApproval: boolean }) => {
      const supabase = getSupabaseClient()
      if (!supabase) return { success: false, error: 'Supabase is not configured' }
      if (typeof data?.organizationId !== 'string' || typeof data.requireApproval !== 'boolean') {
        return { success: false, error: 'Invalid request' }
      }

      const { error } = await supabase
        .from('organizations')
        .update({ require_approval: data.requireApproval })
        .eq('id', data.organizationId)
      if (error) return { success: false, error: error.message }
      return { success: true }
    },
  )
}
