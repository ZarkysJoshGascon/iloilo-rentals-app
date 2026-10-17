-- ============================================================
-- Security hardening (from the 2026-10-17 full scan)
--
-- 1. Rate limits on the public forms never worked: check_inquiry_rate_limit
--    counted a created_at column that inquiry_rate_limit doesn't have (it's
--    submitted_at), so every check failed and the forms let the visitor
--    through. It now counts submitted_at, and the functions refuse when the
--    check itself fails.
-- 2. Owner, housekeeper and other staff records are linked to an account by
--    email at sign-in. That now also needs the account's email to be
--    confirmed, as CRM access already did, so an account made with someone
--    else's address can never claim their records (email sign-up needs
--    confirmation today, but this no longer depends on that setting).
-- 3. A housekeeper can add or remove photos of their own cleaning only until
--    it's approved or cancelled, matching what the app allows.
-- 4. Functions that only make sense for signed-in staff can't be called by
--    website visitors at all (each also checks its caller; this is a second
--    lock). The helpers the access rules use (is_admin and friends) stay
--    callable, or rules evaluated for visitors would error.
--
-- Safe to run more than once.
-- ============================================================

begin;

-- 1 ─────────────────────────────────────────────────────────
create or replace function public.check_inquiry_rate_limit(p_ip_hash text, p_max integer default 5, p_window_minutes integer default 60)
returns boolean
language plpgsql
security definer
set search_path to ''
as $$
declare
  recent_count integer;
begin
  select count(*)
    into recent_count
    from public.inquiry_rate_limit
   where ip_hash = p_ip_hash
     and submitted_at > now() - make_interval(mins => greatest(p_window_minutes, 1));

  return recent_count < p_max;
end;
$$;

-- 2 ─────────────────────────────────────────────────────────
create or replace function public.link_housekeeper_on_login()
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_email text;
begin
  select email into v_email
    from auth.users
   where id = auth.uid()
     and email_confirmed_at is not null;
  if v_email is null then return; end if;
  update public.housekeepers
     set user_id = auth.uid()
   where user_id is null
     and lower(email) = lower(v_email);
end;
$$;

do $$
declare
  v_def text;
begin
  -- link_staff_on_login: refuse to link anything for an unconfirmed email.
  -- (Matched with a pattern, so line endings in this file don't matter.)
  select pg_get_functiondef('public.link_staff_on_login'::regproc) into v_def;
  if v_def not like '%email_not_confirmed%' then
    v_def := regexp_replace(
      v_def,
      '(''no_profile''\);\s*end if;)',
      '\1' || chr(10)
        || '  -- Only a confirmed email can claim records made for that address.' || chr(10)
        || '  if not exists (select 1 from auth.users where id = v_uid and lower(email) = v_email and email_confirmed_at is not null) then' || chr(10)
        || '    return jsonb_build_object(''ok'', false, ''reason'', ''email_not_confirmed'');' || chr(10)
        || '  end if;'
    );
    if v_def not like '%email_not_confirmed%' then
      raise exception 'link_staff_on_login did not match the expected text; not changed';
    end if;
    execute v_def;
  end if;
end $$;

-- 3 ─────────────────────────────────────────────────────────
drop policy if exists cleaning_photos_housekeeper_insert on storage.objects;
create policy cleaning_photos_housekeeper_insert on storage.objects
  for insert to public
  with check (
    bucket_id = 'cleaning-photos'
    and exists (
      select 1 from public.cleanings c
       where c.id::text = (storage.foldername(objects.name))[1]
         and c.housekeeper_id = public.current_housekeeper_id()
         and c.status not in ('completed', 'cancelled')
    )
  );

drop policy if exists cleaning_photos_housekeeper_delete on storage.objects;
create policy cleaning_photos_housekeeper_delete on storage.objects
  for delete to public
  using (
    bucket_id = 'cleaning-photos'
    and (
      public.is_admin()
      or exists (
        select 1 from public.cleanings c
         where c.id::text = (storage.foldername(objects.name))[1]
           and c.housekeeper_id = public.current_housekeeper_id()
           and c.status not in ('completed', 'cancelled')
      )
    )
  );

-- 4 ─────────────────────────────────────────────────────────
do $$
declare
  v_name text;
  v_sig  text;
begin
  foreach v_name in array array[
    'admin_approve_and_pay_cleaning', 'housekeeper_submit_cleaning', 'housekeeper_update_cleaning',
    'update_laundry_payment', 'link_housekeeper_on_login', 'link_staff_on_login', 'search_profiles',
    'pm_earnings_bulk', 'team_totals_bulk', 'accounting_analytics_by_year', 'accounting_invariants_check',
    'contract_monthly_breakdown', 'contracts_lifetime_bulk', 'update_single_condo_status'
  ] loop
    -- Every overload of the name.
    for v_sig in
      select p.oid::regprocedure::text from pg_proc p
       where p.pronamespace = 'public'::regnamespace and p.proname = v_name
    loop
      execute format('revoke execute on function %s from public, anon', v_sig);
      execute format('grant execute on function %s to authenticated, service_role', v_sig);
    end loop;
  end loop;
end $$;

commit;
