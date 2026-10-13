-- 0003_platform_admin_and_plans.sql — superadmin role + pricing plans for the web admin (web/).
--
-- * platform_admins: users who can see every organization and manage pricing plans.
--   Bootstrap the first superadmin by hand in the SQL editor:
--     insert into platform_admins (user_id) select id from auth.users where email = 'you@example.com';
-- * plans: pricing plans. Active plans are publicly readable (landing-page pricing);
--   only platform admins can write.
-- * organizations.plan_id: which plan an organization is on (set by a platform admin).
--
-- Everything here is additive: existing policies are untouched, platform admins get extra
-- SELECT/UPDATE policies on top.

create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table platform_admins enable row level security;
revoke all on platform_admins from anon;

create or replace function is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from platform_admins where user_id = auth.uid());
$$;

revoke all on function is_platform_admin() from public, anon;
grant execute on function is_platform_admin() to authenticated;

-- A user can see only their own row (lets the web app check "am I a superadmin?").
-- No insert/update/delete policies: admins are managed from the SQL editor / service role.
drop policy if exists "platform_admins_select_own" on platform_admins;
create policy "platform_admins_select_own" on platform_admins
  for select to authenticated
  using (user_id = auth.uid());

-- ── plans ────────────────────────────────────────────────────────────────────
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  price_monthly numeric(10, 2) not null default 0 check (price_monthly >= 0),
  price_yearly numeric(10, 2) not null default 0 check (price_yearly >= 0),
  currency text not null default 'USD',
  max_members integer check (max_members is null or max_members > 0), -- null = unlimited
  features text[] not null default '{}',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table plans enable row level security;

drop policy if exists "plans_select_active" on plans;
create policy "plans_select_active" on plans
  for select to anon, authenticated
  using (is_active or is_platform_admin());

drop policy if exists "plans_insert_admin" on plans;
create policy "plans_insert_admin" on plans
  for insert to authenticated
  with check (is_platform_admin());

drop policy if exists "plans_update_admin" on plans;
create policy "plans_update_admin" on plans
  for update to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

drop policy if exists "plans_delete_admin" on plans;
create policy "plans_delete_admin" on plans
  for delete to authenticated
  using (is_platform_admin());

create or replace function set_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists plans_set_updated_at on plans;
create trigger plans_set_updated_at
  before update on plans
  for each row
  execute function set_plans_updated_at();

insert into plans (slug, name, description, price_monthly, price_yearly, max_members, features, sort_order)
values
  ('free', 'Free', 'For trying Execd with a small team.', 0, 0, 5,
    array['Up to 5 members', 'Task assignment', 'Daily reports'], 1),
  ('pro', 'Pro', 'For growing teams that need review flows.', 12, 120, 25,
    array['Up to 25 members', 'Manager approval', 'Email notifications', 'Priority support'], 2),
  ('business', 'Business', 'For larger organizations.', 39, 390, null,
    array['Unlimited members', 'Everything in Pro', 'Audit history', 'Dedicated support'], 3)
on conflict (slug) do nothing;

-- ── organizations.plan_id ────────────────────────────────────────────────────
alter table organizations
  add column if not exists plan_id uuid references plans(id) on delete set null;

-- ── platform-admin visibility across organizations ───────────────────────────
drop policy if exists "organizations_select_platform_admin" on organizations;
create policy "organizations_select_platform_admin" on organizations
  for select to authenticated
  using (is_platform_admin());

drop policy if exists "organizations_update_platform_admin" on organizations;
create policy "organizations_update_platform_admin" on organizations
  for update to authenticated
  using (is_platform_admin())
  with check (is_platform_admin());

drop policy if exists "organization_members_select_platform_admin" on organization_members;
create policy "organization_members_select_platform_admin" on organization_members
  for select to authenticated
  using (is_platform_admin());

drop policy if exists "profiles_select_platform_admin" on profiles;
create policy "profiles_select_platform_admin" on profiles
  for select to authenticated
  using (is_platform_admin());

-- Managers may update their own organization row (rename), but must not be able to change
-- their own plan: only platform admins (or the service role, where auth.uid() is null) can.
create or replace function guard_organization_plan_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.plan_id is distinct from old.plan_id
     and auth.uid() is not null
     and not is_platform_admin() then
    raise exception 'Only a platform admin can change an organization''s plan';
  end if;
  return new;
end;
$$;

drop trigger if exists organizations_guard_plan on organizations;
create trigger organizations_guard_plan
  before update on organizations
  for each row
  execute function guard_organization_plan_update();
