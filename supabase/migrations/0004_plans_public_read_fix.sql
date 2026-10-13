-- 0004_plans_public_read_fix.sql — fix 0003: anon could not read plans.
--
-- The single plans SELECT policy called is_platform_admin(), but that function is (deliberately)
-- not executable by anon, so any anonymous read failed with "permission denied for function".
-- Split it: anon/authenticated read active plans without the function; platform admins get a
-- separate authenticated policy that also shows inactive plans.

drop policy if exists "plans_select_active" on plans;

create policy "plans_select_active" on plans
  for select to anon, authenticated
  using (is_active);

drop policy if exists "plans_select_admin" on plans;
create policy "plans_select_admin" on plans
  for select to authenticated
  using (is_platform_admin());
