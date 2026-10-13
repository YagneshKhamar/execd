import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type Role = 'owner' | 'manager' | 'member'

export interface Plan {
  id: string
  slug: string
  name: string
  description: string
  price_monthly: number
  price_yearly: number
  currency: string
  max_members: number | null
  features: string[]
  is_active: boolean
  sort_order: number
}

export interface ManagedOrg {
  id: string
  name: string
  role: Role
  plan_id: string | null
}

export async function requireUser() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, user }
}

export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = createClient()
  const { data } = await supabase.rpc('is_platform_admin')
  return data === true
}

/** Organizations where the signed-in user is an active owner or manager. */
export async function getManagedOrgs(): Promise<ManagedOrg[]> {
  const { supabase, user } = await requireUser()
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .in('role', ['owner', 'manager'])
  if (!memberships?.length) return []

  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name, plan_id')
    .in(
      'id',
      memberships.map((m) => m.organization_id),
    )
    .order('name')
  const roleByOrg = new Map(memberships.map((m) => [m.organization_id, m.role as Role]))
  return (orgs ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    plan_id: o.plan_id,
    role: roleByOrg.get(o.id)!,
  }))
}

export function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat('en', {
    style: 'currency',
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

export async function resolveOrg(orgParam: string | undefined) {
  const orgs = await getManagedOrgs()
  const current = orgs.find((o) => o.id === orgParam) ?? orgs[0] ?? null
  return { orgs, current }
}
