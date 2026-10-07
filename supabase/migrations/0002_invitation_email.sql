-- 0002_invitation_email.sql — idempotency marker for the invite-time email.
--
-- The send-invitation-email Edge Function (Database Webhook on `invitations`, INSERT + UPDATE)
-- claims a row by setting invitation_email_sent_at where it is still null. Database Webhooks can
-- redeliver, and the claim itself is an UPDATE that re-fires the webhook, so the marker is what
-- keeps one invite from producing several emails. create_invitation nulls it again on a renewal
-- so "invite the same address again" doubles as "resend the email".

alter table invitations add column if not exists invitation_email_sent_at timestamptz;

-- Only the renewal branch changes vs. 0001: it now resets invitation_email_sent_at.
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
        invited_by = auth.uid(),
        invitation_email_sent_at = null
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

revoke all on function create_invitation(uuid, text, text) from public, anon;
grant execute on function create_invitation(uuid, text, text) to authenticated;
