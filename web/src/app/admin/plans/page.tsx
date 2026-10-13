import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireUser, type Plan } from '@/lib/data'

export const dynamic = 'force-dynamic'

function parsePlan(formData: FormData) {
  const maxMembers = String(formData.get('max_members') ?? '').trim()
  return {
    slug: String(formData.get('slug') ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
    name: String(formData.get('name') ?? '').trim(),
    description: String(formData.get('description') ?? '').trim(),
    price_monthly: Number(formData.get('price_monthly') ?? 0),
    price_yearly: Number(formData.get('price_yearly') ?? 0),
    currency: String(formData.get('currency') ?? 'USD').trim().toUpperCase() || 'USD',
    max_members: maxMembers === '' ? null : Number(maxMembers),
    features: String(formData.get('features') ?? '')
      .split('\n')
      .map((f) => f.trim())
      .filter(Boolean),
    is_active: formData.get('is_active') === 'on',
    sort_order: Number(formData.get('sort_order') ?? 0),
  }
}

async function savePlan(formData: FormData) {
  'use server'
  const { supabase } = await requireUser()
  const id = String(formData.get('id') ?? '')
  const values = parsePlan(formData)
  if (!values.name || !values.slug) redirect('/admin/plans?error=Name and slug are required')
  const { error } = id
    ? await supabase.from('plans').update(values).eq('id', id)
    : await supabase.from('plans').insert(values)
  if (error) redirect(`/admin/plans?error=${encodeURIComponent(error.message)}`)
  revalidatePath('/admin/plans')
  revalidatePath('/')
  redirect('/admin/plans')
}

async function deletePlan(formData: FormData) {
  'use server'
  const { supabase } = await requireUser()
  const { error } = await supabase.from('plans').delete().eq('id', String(formData.get('id')))
  if (error) redirect(`/admin/plans?error=${encodeURIComponent(error.message)}`)
  revalidatePath('/admin/plans')
  revalidatePath('/')
  redirect('/admin/plans')
}

function PlanForm({ plan }: { plan?: Plan }) {
  return (
    <form action={savePlan} className="card">
      {plan && <input type="hidden" name="id" value={plan.id} />}
      <div className="row">
        <div className="field">
          <label>Name</label>
          <input name="name" defaultValue={plan?.name} required />
        </div>
        <div className="field">
          <label>Slug</label>
          <input name="slug" defaultValue={plan?.slug} required />
        </div>
        <div className="field">
          <label>Monthly price</label>
          <input name="price_monthly" type="number" step="0.01" min="0" defaultValue={plan?.price_monthly ?? 0} style={{ width: 110 }} />
        </div>
        <div className="field">
          <label>Yearly price</label>
          <input name="price_yearly" type="number" step="0.01" min="0" defaultValue={plan?.price_yearly ?? 0} style={{ width: 110 }} />
        </div>
        <div className="field">
          <label>Currency</label>
          <input name="currency" defaultValue={plan?.currency ?? 'USD'} style={{ width: 80 }} />
        </div>
        <div className="field">
          <label>Max members (blank = unlimited)</label>
          <input name="max_members" type="number" min="1" defaultValue={plan?.max_members ?? ''} style={{ width: 150 }} />
        </div>
        <div className="field">
          <label>Order</label>
          <input name="sort_order" type="number" defaultValue={plan?.sort_order ?? 0} style={{ width: 70 }} />
        </div>
      </div>
      <div className="field">
        <label>Description</label>
        <input name="description" defaultValue={plan?.description} style={{ width: '100%' }} />
      </div>
      <div className="field">
        <label>Features (one per line)</label>
        <textarea name="features" rows={4} defaultValue={plan?.features.join('\n')} style={{ width: '100%' }} />
      </div>
      <div className="row">
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', margin: 0 }}>
          <input type="checkbox" name="is_active" defaultChecked={plan?.is_active ?? true} />
          Active (shown on the public pricing page)
        </label>
        <button className="primary" type="submit">
          {plan ? 'Save changes' : 'Create plan'}
        </button>
        {plan && (
          <button className="danger" type="submit" formAction={deletePlan}>
            Delete
          </button>
        )}
      </div>
    </form>
  )
}

export default async function AdminPlans({ searchParams }: { searchParams: { error?: string } }) {
  const { supabase } = await requireUser()
  const { data: plans } = await supabase.from('plans').select('*').order('sort_order')
  return (
    <>
      <h1>Pricing plans</h1>
      <p className="muted" style={{ marginBottom: 16 }}>
        Active plans appear on the public landing page. Assign plans to organizations on the
        Organizations tab.
      </p>
      {searchParams.error && <p className="error">{searchParams.error}</p>}
      {((plans ?? []) as Plan[]).map((p) => (
        <PlanForm key={p.id} plan={p} />
      ))}
      <h2>New plan</h2>
      <PlanForm />
    </>
  )
}
