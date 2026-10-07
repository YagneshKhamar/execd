-- Execd — combined Supabase schema.
-- Run this once, in order, in the Supabase SQL editor (or via `supabase db push`) against a
-- fresh project. This file is the concatenation of what were originally 8 separate phase
-- migrations (0001-0008); they are combined here because nothing had been deployed yet, so
-- there was no reason to keep them separate. Each section below still layers on the one before
-- it in the same way — later sections use `create or replace function`, `drop policy if
-- exists` + `create policy`, and `alter table ... add column if not exists`, so the order
-- matters and must be preserved if this file is ever split again.
--
-- RLS is enabled as each table is created, starting deny-all; the policies section further
-- down is what actually grants access, so a table is never briefly wide-open in between.


-- ══════════════════════════════════════════════════════════════════════════
-- 0001_initial_schema.sql — Core schema: organizations, members, invitations, tasks, events
-- ══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── organizations ────────────────────────────────────────────────────────────
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table organizations enable row level security;

-- ── organization_members ─────────────────────────────────────────────────────
-- One row per (organization, user) pair. Membership is deactivated via `status`, not
-- deleted, so re-inviting a removed member does not create a duplicate row and history is
-- preserved. The primary key itself is the "one active membership per user/org" constraint.
create table if not exists organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'manager', 'member')),
  status text not null default 'active' check (status in ('active', 'removed')),
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_members_user_id_idx on organization_members (user_id);

alter table organization_members enable row level security;

-- ── invitations ───────────────────────────────────────────────────────────────
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'manager', 'member')),
  invited_by uuid not null references auth.users(id),
  status text not null default 'pending'
    check (status in ('pending', 'sent', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists invitations_organization_id_idx on invitations (organization_id);

-- Prevents inviting the same email twice while an invitation is still pending/sent;
-- revoked/expired/accepted rows don't block a fresh invite.
create unique index if not exists invitations_active_email_idx
  on invitations (organization_id, email)
  where status in ('pending', 'sent');

alter table invitations enable row level security;

-- ── team_tasks ────────────────────────────────────────────────────────────────
-- Authoritative "current state" of a task. team_task_events (below) is an append-only log,
-- never a source of truth for what is true right now — see SUPABASE_IMPLEMENTATION_PLAN.md
-- Phase 0 for the conflict-resolution policy this table's `version` column supports.
create table if not exists team_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  assigned_to uuid not null references auth.users(id),
  assigned_by uuid not null references auth.users(id),
  title text not null,
  description text not null default '',
  effort text not null default 'medium',
  status text not null default 'pending',
  due_date date not null,
  week_start date not null,
  proof_value text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  version integer not null default 1
);

create index if not exists team_tasks_organization_id_idx on team_tasks (organization_id);
create index if not exists team_tasks_assigned_to_idx on team_tasks (assigned_to);
create index if not exists team_tasks_status_idx on team_tasks (status);
create index if not exists team_tasks_due_date_idx on team_tasks (due_date);
create index if not exists team_tasks_updated_at_idx on team_tasks (updated_at);

alter table team_tasks enable row level security;

create or replace function set_team_tasks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end;
$$;

drop trigger if exists team_tasks_set_updated_at on team_tasks;
create trigger team_tasks_set_updated_at
  before update on team_tasks
  for each row
  execute function set_team_tasks_updated_at();

-- ── team_task_events ─────────────────────────────────────────────────────────
-- Append-only audit log. `client_event_id` is unique so an offline client retrying an
-- upload after a dropped connection cannot create a duplicate event.
create table if not exists team_task_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  task_id uuid not null references team_tasks(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  client_event_id text not null,
  unique (client_event_id)
);

create index if not exists team_task_events_organization_id_idx
  on team_task_events (organization_id);
create index if not exists team_task_events_task_id_idx on team_task_events (task_id);

alter table team_task_events enable row level security;

-- ══════════════════════════════════════════════════════════════════════════
-- 0002_auth_and_org_setup.sql — Auth: profiles, org creation, minimal read policies
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

drop policy if exists "profiles_select_own" on profiles;
create policy "profiles_select_own" on profiles
  for select to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_update_own" on profiles;
create policy "profiles_update_own" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, display_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();

-- Backfill profiles for any users created before this migration ran.
insert into profiles (id, display_name, email)
select u.id, coalesce(u.raw_user_meta_data ->> 'display_name', ''), coalesce(u.email, '')
from auth.users u
on conflict (id) do nothing;

-- ── minimal read policies ────────────────────────────────────────────────────
drop policy if exists "organization_members_select_own" on organization_members;
create policy "organization_members_select_own" on organization_members
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "organizations_select_member" on organizations;
create policy "organizations_select_member" on organizations
  for select to authenticated
  using (
    exists (
      select 1 from organization_members m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

-- ── create_organization ──────────────────────────────────────────────────────
-- Direct inserts into organizations/organization_members are denied by RLS, so creating an
-- org (and its owner membership) goes through this function to keep it atomic and to make
-- "creator becomes owner" something a client cannot skip or fake.
-- A user may only belong to one organization for now (see Phase 0 decisions).
create or replace function create_organization(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  clean_name text := trim(coalesce(org_name, ''));
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if clean_name = '' or length(clean_name) > 100 then
    raise exception 'Organization name must be 1-100 characters';
  end if;

  if exists (
    select 1 from organization_members
    where user_id = auth.uid() and status = 'active'
  ) then
    raise exception 'You already belong to an organization';
  end if;

  insert into organizations (name, created_by)
  values (clean_name, auth.uid())
  returning id into new_org_id;

  insert into organization_members (organization_id, user_id, role)
  values (new_org_id, auth.uid(), 'owner');

  return new_org_id;
end;
$$;

revoke all on function create_organization(text) from public, anon;
grant execute on function create_organization(text) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 0003_row_level_security.sql — Full Row Level Security policies
-- ══════════════════════════════════════════════════════════════════════════

create or replace function is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where organization_id = org_id and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function is_org_manager(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_members
    where organization_id = org_id and user_id = auth.uid() and status = 'active'
      and role in ('owner', 'manager')
  );
$$;

create or replace function shares_org_with(other_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from organization_members mine
    join organization_members theirs on theirs.organization_id = mine.organization_id
    where mine.user_id = auth.uid() and mine.status = 'active'
      and theirs.user_id = other_user_id and theirs.status = 'active'
  );
$$;

revoke all on function is_org_member(uuid), is_org_manager(uuid), shares_org_with(uuid)
  from public, anon;
grant execute on function is_org_member(uuid), is_org_manager(uuid), shares_org_with(uuid)
  to authenticated;

-- ── defense in depth: anon has no direct table access ───────────────────────
revoke all on organizations, organization_members, invitations, team_tasks,
  team_task_events, profiles from anon;

-- ── organizations ────────────────────────────────────────────────────────────
-- No insert policy: creation goes through create_organization(). No delete policy.
drop policy if exists "organizations_select_member" on organizations;
create policy "organizations_select_member" on organizations
  for select to authenticated
  using (is_org_member(id));

drop policy if exists "organizations_update_manager" on organizations;
create policy "organizations_update_manager" on organizations
  for update to authenticated
  using (is_org_manager(id))
  with check (is_org_manager(id));

-- ── organization_members ─────────────────────────────────────────────────────
-- Everyone sees their own row (even after removal, so the app can show why access ended);
-- active members also see their teammates. Rows are never inserted or deleted directly:
-- joining happens via invitation acceptance (Phase 5), removal is a status change.
drop policy if exists "organization_members_select_own" on organization_members;
drop policy if exists "organization_members_select" on organization_members;
create policy "organization_members_select" on organization_members
  for select to authenticated
  using (user_id = auth.uid() or is_org_member(organization_id));

-- Managers may change role/status of non-owner members other than themselves, and may not
-- mint owners.
drop policy if exists "organization_members_update_manager" on organization_members;
create policy "organization_members_update_manager" on organization_members
  for update to authenticated
  using (is_org_manager(organization_id) and role <> 'owner' and user_id <> auth.uid())
  with check (is_org_manager(organization_id) and role in ('manager', 'member'));

-- ── profiles ─────────────────────────────────────────────────────────────────
drop policy if exists "profiles_select_own" on profiles;
drop policy if exists "profiles_select_teammates" on profiles;
create policy "profiles_select_teammates" on profiles
  for select to authenticated
  using (id = auth.uid() or shares_org_with(id));

-- ── invitations ──────────────────────────────────────────────────────────────
-- Managers manage invitations for their org. Invitees are not members yet, so acceptance
-- is done by a SECURITY DEFINER function in Phase 5, not by a policy here.
drop policy if exists "invitations_select_manager" on invitations;
create policy "invitations_select_manager" on invitations
  for select to authenticated
  using (is_org_manager(organization_id));

drop policy if exists "invitations_insert_manager" on invitations;
create policy "invitations_insert_manager" on invitations
  for insert to authenticated
  with check (
    is_org_manager(organization_id)
    and invited_by = auth.uid()
    and role in ('manager', 'member')
    and status = 'pending'
  );

drop policy if exists "invitations_update_manager" on invitations;
create policy "invitations_update_manager" on invitations
  for update to authenticated
  using (is_org_manager(organization_id))
  with check (is_org_manager(organization_id) and role in ('manager', 'member'));

-- ── team_tasks ───────────────────────────────────────────────────────────────
drop policy if exists "team_tasks_select" on team_tasks;
create policy "team_tasks_select" on team_tasks
  for select to authenticated
  using (
    is_org_manager(organization_id)
    or (assigned_to = auth.uid() and is_org_member(organization_id))
  );

-- The assignee must be an active member of the same organization.
drop policy if exists "team_tasks_insert_manager" on team_tasks;
create policy "team_tasks_insert_manager" on team_tasks
  for insert to authenticated
  with check (
    is_org_manager(organization_id)
    and assigned_by = auth.uid()
    and exists (
      select 1 from organization_members m
      where m.organization_id = team_tasks.organization_id
        and m.user_id = team_tasks.assigned_to
        and m.status = 'active'
    )
  );

drop policy if exists "team_tasks_update" on team_tasks;
create policy "team_tasks_update" on team_tasks
  for update to authenticated
  using (
    is_org_manager(organization_id)
    or (assigned_to = auth.uid() and is_org_member(organization_id))
  )
  with check (
    is_org_manager(organization_id)
    or (assigned_to = auth.uid() and is_org_member(organization_id))
  );

-- RLS cannot restrict individual columns, so this trigger does. Nobody through the API may
-- move a task between organizations or rewrite who assigned it. Non-managers may only touch
-- status, proof_value, notes and completed_at. Reassigning is manager-only and the new
-- assignee must be an active member. auth.uid() is null for the SQL editor / service role,
-- which are left unrestricted.
create or replace function guard_team_task_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.assigned_by is distinct from old.assigned_by
     or new.created_at is distinct from old.created_at then
    raise exception 'team_tasks: organization_id, assigned_by and created_at are immutable';
  end if;

  if not is_org_manager(old.organization_id) then
    if new.assigned_to is distinct from old.assigned_to
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.effort is distinct from old.effort
       or new.due_date is distinct from old.due_date
       or new.week_start is distinct from old.week_start then
      raise exception 'Members may only update status, proof and notes on their tasks';
    end if;
  elsif new.assigned_to is distinct from old.assigned_to then
    if not exists (
      select 1 from organization_members m
      where m.organization_id = new.organization_id
        and m.user_id = new.assigned_to
        and m.status = 'active'
    ) then
      raise exception 'New assignee must be an active member of the organization';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists team_tasks_guard_update on team_tasks;
create trigger team_tasks_guard_update
  before update on team_tasks
  for each row
  execute function guard_team_task_update();

-- ── team_task_events ─────────────────────────────────────────────────────────
-- Append-only: no update or delete policies.
drop policy if exists "team_task_events_select" on team_task_events;
create policy "team_task_events_select" on team_task_events
  for select to authenticated
  using (
    is_org_manager(organization_id)
    or exists (
      select 1 from team_tasks t
      where t.id = team_task_events.task_id
        and t.assigned_to = auth.uid()
        and is_org_member(t.organization_id)
    )
  );

-- Actors can only write events as themselves, for a task they can already see, and the
-- event's organization must match the task's.
drop policy if exists "team_task_events_insert" on team_task_events;
create policy "team_task_events_insert" on team_task_events
  for insert to authenticated
  with check (
    actor_id = auth.uid()
    and exists (
      select 1 from team_tasks t
      where t.id = team_task_events.task_id
        and t.organization_id = team_task_events.organization_id
        and (
          is_org_manager(t.organization_id)
          or (t.assigned_to = auth.uid() and is_org_member(t.organization_id))
        )
    )
  );

-- ══════════════════════════════════════════════════════════════════════════
-- 0004_invitations.sql — Invitation management functions
-- ══════════════════════════════════════════════════════════════════════════

drop policy if exists "invitations_insert_manager" on invitations;
drop policy if exists "invitations_update_manager" on invitations;

-- ── create_invitation ────────────────────────────────────────────────────────
-- Also serves as "resend": inviting an email that already has an active invitation renews
-- its expiry and role instead of failing on the duplicate-active-invitation index.
create or replace function create_invitation(org_id uuid, invite_email text, invite_role text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_email text := lower(trim(coalesce(invite_email, '')));
  invitation_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if not is_org_manager(org_id) then
    raise exception 'Only managers can invite members';
  end if;

  if clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(clean_email) > 254 then
    raise exception 'Enter a valid email address';
  end if;

  if invite_role not in ('manager', 'member') then
    raise exception 'Role must be manager or member';
  end if;

  if exists (
    select 1
    from organization_members m
    join auth.users u on u.id = m.user_id
    where m.organization_id = org_id and m.status = 'active' and lower(u.email) = clean_email
  ) then
    raise exception 'That person is already a member of this organization';
  end if;

  -- Time-expired invitations still say 'pending'; flip them so they stop blocking a re-invite.
  update invitations
    set status = 'expired'
    where organization_id = org_id
      and lower(email) = clean_email
      and status in ('pending', 'sent')
      and expires_at <= now();

  update invitations
    set role = invite_role,
        expires_at = now() + interval '7 days',
        invited_by = auth.uid()
    where organization_id = org_id
      and lower(email) = clean_email
      and status in ('pending', 'sent')
  returning id into invitation_id;

  if invitation_id is not null then
    return invitation_id;
  end if;

  insert into invitations (organization_id, email, role, invited_by, status, expires_at)
  values (org_id, clean_email, invite_role, auth.uid(), 'pending', now() + interval '7 days')
  returning id into invitation_id;

  return invitation_id;
end;
$$;

-- ── revoke_invitation ────────────────────────────────────────────────────────
create or replace function revoke_invitation(invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org uuid;
begin
  select organization_id into target_org from invitations where id = invitation_id;

  if target_org is null or not is_org_manager(target_org) then
    raise exception 'Invitation not found';
  end if;

  update invitations
    set status = 'revoked'
    where id = invitation_id and status in ('pending', 'sent');
end;
$$;

-- ── get_my_invitations ───────────────────────────────────────────────────────
-- Pending, unexpired invitations addressed to the caller's confirmed email.
create or replace function get_my_invitations()
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  role text,
  invited_by_name text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.organization_id, o.name, i.role, coalesce(nullif(p.display_name, ''), p.email), i.expires_at
  from invitations i
  join organizations o on o.id = i.organization_id
  join auth.users me on me.id = auth.uid() and me.email_confirmed_at is not null
  left join profiles p on p.id = i.invited_by
  where lower(i.email) = lower(me.email)
    and i.status in ('pending', 'sent')
    and i.expires_at > now()
  order by i.created_at desc;
$$;

-- ── accept_invitation ────────────────────────────────────────────────────────
create or replace function accept_invitation(invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invitations%rowtype;
  my_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select lower(email) into my_email
    from auth.users
    where id = auth.uid() and email_confirmed_at is not null;

  if my_email is null then
    raise exception 'Confirm your email address before accepting an invitation';
  end if;

  select * into inv from invitations where id = invitation_id for update;

  if not found or lower(inv.email) <> my_email then
    raise exception 'Invitation not found';
  end if;

  if inv.status not in ('pending', 'sent') then
    raise exception 'This invitation is no longer valid';
  end if;

  if inv.expires_at <= now() then
    update invitations set status = 'expired' where id = inv.id;
    raise exception 'This invitation has expired';
  end if;

  if exists (
    select 1 from organization_members
    where user_id = auth.uid() and status = 'active' and organization_id <> inv.organization_id
  ) then
    raise exception 'You already belong to another organization';
  end if;

  insert into organization_members (organization_id, user_id, role, status, joined_at)
  values (inv.organization_id, auth.uid(), inv.role, 'active', now())
  on conflict (organization_id, user_id)
  do update set role = excluded.role, status = 'active', joined_at = now();

  update invitations set status = 'accepted', accepted_at = now() where id = inv.id;

  return inv.organization_id;
end;
$$;

revoke all on function create_invitation(uuid, text, text), revoke_invitation(uuid),
  get_my_invitations(), accept_invitation(uuid) from public, anon;
grant execute on function create_invitation(uuid, text, text), revoke_invitation(uuid),
  get_my_invitations(), accept_invitation(uuid) to authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 0005_notifications.sql — Notifications table and triggers
-- ══════════════════════════════════════════════════════════════════════════

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  type text not null check (
    type in (
      'task_assigned', 'task_due_soon', 'task_overdue', 'task_completed', 'task_blocked',
      'invitation_accepted'
    )
  ),
  task_id uuid references team_tasks(id) on delete set null,
  title text not null,
  body text not null default '',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on notifications (user_id, created_at desc)
  where read_at is null;

alter table notifications enable row level security;

drop policy if exists "notifications_select_own" on notifications;
create policy "notifications_select_own" on notifications
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "notifications_update_own" on notifications;
create policy "notifications_update_own" on notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on notifications from anon;

-- Only read_at may actually change; the update policy above only gates row ownership.
create or replace function guard_notification_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is distinct from old.user_id
     or new.organization_id is distinct from old.organization_id
     or new.type is distinct from old.type
     or new.task_id is distinct from old.task_id
     or new.title is distinct from old.title
     or new.body is distinct from old.body then
    raise exception 'notifications: only read_at may be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists notifications_guard_update on notifications;
create trigger notifications_guard_update
  before update on notifications
  for each row
  execute function guard_notification_update();

-- ── mark_notifications_read ──────────────────────────────────────────────────
-- notification_ids = null marks everything unread as read (the inbox's "mark all read").
create or replace function mark_notifications_read(notification_ids uuid[])
returns void
language sql
security definer
set search_path = public
as $$
  update notifications
    set read_at = now()
    where user_id = auth.uid()
      and read_at is null
      and (notification_ids is null or id = any(notification_ids));
$$;

revoke all on function mark_notifications_read(uuid[]) from public, anon;
grant execute on function mark_notifications_read(uuid[]) to authenticated;

-- ── org_managers: everyone who should hear about a member's activity ────────────────────
create or replace function org_managers(org_id uuid, exclude_user uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select user_id from organization_members
  where organization_id = org_id and status = 'active' and role in ('owner', 'manager')
    and user_id != exclude_user;
$$;

-- ── trigger: task assigned ───────────────────────────────────────────────────
create or replace function notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.assigned_to != new.assigned_by then
    insert into notifications (user_id, organization_id, type, task_id, title, body)
    values (new.assigned_to, new.organization_id, 'task_assigned', new.id, new.title, '');
  end if;
  return new;
end;
$$;

drop trigger if exists team_tasks_notify_assigned on team_tasks;
create trigger team_tasks_notify_assigned
  after insert on team_tasks
  for each row
  execute function notify_task_assigned();

-- ── trigger: task completed / blocked (event-driven, so it fires once per real change) ──
create or replace function notify_task_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task team_tasks%rowtype;
  manager uuid;
begin
  if new.event_type = 'completed' then
    select * into task from team_tasks where id = new.task_id;
    for manager in select org_managers(new.organization_id, new.actor_id) loop
      insert into notifications (user_id, organization_id, type, task_id, title, body)
      values (manager, new.organization_id, 'task_completed', new.task_id, coalesce(task.title, ''), '');
    end loop;
  elsif new.event_type = 'status' and new.payload ->> 'status' = 'blocked' then
    select * into task from team_tasks where id = new.task_id;
    for manager in select org_managers(new.organization_id, new.actor_id) loop
      insert into notifications (user_id, organization_id, type, task_id, title, body)
      values (manager, new.organization_id, 'task_blocked', new.task_id, coalesce(task.title, ''), '');
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists team_task_events_notify on team_task_events;
create trigger team_task_events_notify
  after insert on team_task_events
  for each row
  execute function notify_task_event();

-- ── invitation accepted: notify whoever sent it ──────────────────────────────
create or replace function accept_invitation(invitation_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  inv invitations%rowtype;
  my_email text;
  org_name text;
  my_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select lower(email) into my_email
    from auth.users
    where id = auth.uid() and email_confirmed_at is not null;

  if my_email is null then
    raise exception 'Confirm your email address before accepting an invitation';
  end if;

  select * into inv from invitations where id = invitation_id for update;

  if not found or lower(inv.email) <> my_email then
    raise exception 'Invitation not found';
  end if;

  if inv.status not in ('pending', 'sent') then
    raise exception 'This invitation is no longer valid';
  end if;

  if inv.expires_at <= now() then
    update invitations set status = 'expired' where id = inv.id;
    raise exception 'This invitation has expired';
  end if;

  if exists (
    select 1 from organization_members
    where user_id = auth.uid() and status = 'active' and organization_id <> inv.organization_id
  ) then
    raise exception 'You already belong to another organization';
  end if;

  insert into organization_members (organization_id, user_id, role, status, joined_at)
  values (inv.organization_id, auth.uid(), inv.role, 'active', now())
  on conflict (organization_id, user_id)
  do update set role = excluded.role, status = 'active', joined_at = now();

  update invitations set status = 'accepted', accepted_at = now() where id = inv.id;

  select name into org_name from organizations where id = inv.organization_id;
  select coalesce(nullif(display_name, ''), my_email) into my_name from profiles where id = auth.uid();
  insert into notifications (user_id, organization_id, type, title, body)
  values (inv.invited_by, inv.organization_id, 'invitation_accepted', org_name, my_name || ' joined ' || org_name);

  return inv.organization_id;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- 0006_approval_workflow.sql — Manager approval workflow
-- ══════════════════════════════════════════════════════════════════════════

alter table organizations add column if not exists require_approval boolean not null default false;

-- Managers can already update `organizations` (see 0003 "organizations_update_manager"), so
-- toggling this needs no new function — the app does a plain `update organizations set
-- require_approval = ...` and RLS enforces the manager-only rule that already exists.

create or replace function guard_team_task_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requires_approval boolean;
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.organization_id is distinct from old.organization_id
     or new.assigned_by is distinct from old.assigned_by
     or new.created_at is distinct from old.created_at then
    raise exception 'team_tasks: organization_id, assigned_by and created_at are immutable';
  end if;

  if not is_org_manager(old.organization_id) then
    if new.assigned_to is distinct from old.assigned_to
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.effort is distinct from old.effort
       or new.due_date is distinct from old.due_date
       or new.week_start is distinct from old.week_start then
      raise exception 'Members may only update status, proof and notes on their tasks';
    end if;

    -- 'needs_changes' is a manager-only signal (a rejection); a member can never set it.
    if new.status = 'needs_changes' then
      raise exception 'Only a manager can request changes on a task';
    end if;

    if new.status = 'completed' and old.status is distinct from 'completed' then
      select require_approval into requires_approval
        from organizations where id = old.organization_id;
      if requires_approval then
        raise exception 'This organization requires manager approval — submit for review instead of marking done';
      end if;
    end if;
  elsif new.assigned_to is distinct from old.assigned_to then
    if not exists (
      select 1 from organization_members m
      where m.organization_id = new.organization_id
        and m.user_id = new.assigned_to
        and m.status = 'active'
    ) then
      raise exception 'New assignee must be an active member of the organization';
    end if;
  end if;

  return new;
end;
$$;

-- ── notify on approve / reject ───────────────────────────────────────────────
alter table notifications drop constraint if exists notifications_type_check;
alter table notifications add constraint notifications_type_check check (
  type in (
    'task_assigned', 'task_due_soon', 'task_overdue', 'task_completed', 'task_blocked',
    'invitation_accepted', 'task_approved', 'task_rejected'
  )
);

create or replace function notify_task_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task team_tasks%rowtype;
  manager uuid;
begin
  select * into task from team_tasks where id = new.task_id;

  if new.event_type = 'completed' then
    for manager in select org_managers(new.organization_id, new.actor_id) loop
      insert into notifications (user_id, organization_id, type, task_id, title, body)
      values (manager, new.organization_id, 'task_completed', new.task_id, coalesce(task.title, ''), '');
    end loop;
  elsif new.event_type = 'status' and new.payload ->> 'status' = 'blocked' then
    for manager in select org_managers(new.organization_id, new.actor_id) loop
      insert into notifications (user_id, organization_id, type, task_id, title, body)
      values (manager, new.organization_id, 'task_blocked', new.task_id, coalesce(task.title, ''), '');
    end loop;
  elsif new.event_type = 'approved' and task.assigned_to is not null and task.assigned_to != new.actor_id then
    insert into notifications (user_id, organization_id, type, task_id, title, body)
    values (task.assigned_to, new.organization_id, 'task_approved', new.task_id, coalesce(task.title, ''), '');
  elsif new.event_type = 'rejected' and task.assigned_to is not null and task.assigned_to != new.actor_id then
    insert into notifications (user_id, organization_id, type, task_id, title, body)
    values (
      task.assigned_to, new.organization_id, 'task_rejected', new.task_id, coalesce(task.title, ''),
      coalesce(new.payload ->> 'note', '')
    );
  end if;
  return new;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- 0007_data_migration.sql — Local-data migration marker column
-- ══════════════════════════════════════════════════════════════════════════

alter table team_tasks add column if not exists import_source text;

-- ══════════════════════════════════════════════════════════════════════════
-- 0008_security_hardening.sql — Security hardening (post-review fixes)
-- ══════════════════════════════════════════════════════════════════════════

create or replace function guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'profiles: id is immutable';
  end if;
  if new.email is distinct from old.email then
    raise exception 'profiles: email is managed automatically and cannot be edited directly';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_update on profiles;
create trigger profiles_guard_update
  before update on profiles
  for each row
  execute function guard_profile_update();

-- Keep profiles.email in sync with auth.users.email going forward (e.g. after an email change),
-- since the trigger above now makes it otherwise immutable from the client.
create or replace function sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set email = new.email where id = new.id and email is distinct from new.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  execute function sync_profile_email();

-- ── 2. team_task_events.event_type is now a closed, role-checked vocabulary ────────────────
alter table team_task_events drop constraint if exists team_task_events_event_type_check;
alter table team_task_events add constraint team_task_events_event_type_check check (
  event_type in ('created', 'status', 'note', 'completed', 'approved', 'rejected')
);

create or replace function guard_task_event_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_org_manager(new.organization_id) and new.event_type in ('approved', 'rejected') then
    raise exception 'Only a manager can record an approval or rejection event';
  end if;
  return new;
end;
$$;

drop trigger if exists team_task_events_guard_insert on team_task_events;
create trigger team_task_events_guard_insert
  before insert on team_task_events
  for each row
  execute function guard_task_event_insert();
