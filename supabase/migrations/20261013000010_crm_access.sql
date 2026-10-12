-- ============================================================
-- CRM access, managed from the CRM
--
-- Admins add and remove people with CRM access in People → Team → CRM access
-- instead of editing admin_users in Supabase:
--   • someone who has signed in before gets access at once;
--   • anyone else is invited by email (admin_invites) and gets access the
--     first time they sign in with Google (link_staff_on_login, verified
--     emails only).
-- The backup sheet follows this list: backup-to-sheets shares it with every
-- admin and invite, and takes back the access it gave (sheet_shares) when
-- someone is removed.
--
-- Safe to run more than once.
-- ============================================================

create table if not exists public.admin_invites (
  email      text primary key check (email = lower(email) and email like '%_@_%'),
  invited_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.admin_invites enable row level security;  -- only the functions below touch it

-- Emails the backup gave sheet access to, so it can take exactly that back.
create table if not exists public.sheet_shares (
  email     text primary key,
  shared_at timestamptz not null default now()
);
alter table public.sheet_shares enable row level security;   -- server only

-- Everyone with CRM access, and pending invites.
create or replace function public.crm_access_list()
returns table (email text, name text, status text, last_sign_in_at timestamptz, since timestamptz, is_you boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  return query
    select lower(u.email)::text,
           coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name')::text,
           'active'::text,
           u.last_sign_in_at,
           u.created_at,
           u.id = auth.uid()
      from admin_users a
      join auth.users u on u.id = a.user_id
    union all
    select i.email, null::text, 'invited'::text, null::timestamptz, i.created_at, false
      from admin_invites i
     where not exists (
       select 1 from admin_users a join auth.users u on u.id = a.user_id where lower(u.email) = i.email
     );
end;
$$;

-- Give someone CRM access by email: at once if they have signed in before, else on their first sign-in.
create or replace function public.crm_access_add(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_uid   uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;

  select id into v_uid from auth.users where lower(email) = v_email and email_confirmed_at is not null;
  if v_uid is not null then
    if exists (select 1 from admin_users where user_id = v_uid) then
      return 'already';
    end if;
    insert into admin_users (user_id) values (v_uid);
    delete from admin_invites where email = v_email;
    perform public.log_audit('GRANT_CRM_ACCESS', 'admin_users', v_uid, jsonb_build_object('email', v_email));
    return 'added';
  end if;

  insert into admin_invites (email, invited_by) values (v_email, auth.uid())
  on conflict (email) do nothing;
  perform public.log_audit('INVITE_CRM_ACCESS', 'admin_invites', null, jsonb_build_object('email', v_email));
  return 'invited';
end;
$$;

-- Take CRM access away (or cancel an invite). Nobody can remove themselves or the last admin.
create or replace function public.crm_access_remove(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_uid   uuid;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select a.user_id into v_uid
    from admin_users a join auth.users u on u.id = a.user_id
   where lower(u.email) = v_email;

  if v_uid is not null then
    if v_uid = auth.uid() then
      raise exception 'You can''t remove your own access' using errcode = '22023';
    end if;
    if (select count(*) from admin_users) <= 1 then
      raise exception 'The CRM needs at least one admin' using errcode = '22023';
    end if;
    delete from admin_users where user_id = v_uid;
    perform public.log_audit('REVOKE_CRM_ACCESS', 'admin_users', v_uid, jsonb_build_object('email', v_email));
  end if;

  delete from admin_invites where email = v_email;
  return 'removed';
end;
$$;

revoke all on function public.crm_access_list() from public, anon;
revoke all on function public.crm_access_add(text) from public, anon;
revoke all on function public.crm_access_remove(text) from public, anon;
grant execute on function public.crm_access_list() to authenticated;
grant execute on function public.crm_access_add(text) to authenticated;
grant execute on function public.crm_access_remove(text) to authenticated;

-- Sign-in linking (from 20261013000003) now also turns a CRM invite into access.
create or replace function public.link_staff_on_login()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid        uuid := auth.uid();
  v_email      text;
  v_avatar     text;
  v_result     jsonb := '{}'::jsonb;
  v_count      int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;

  select lower(email), avatar_url
    into v_email, v_avatar
  from public.profiles
  where id = v_uid;

  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;

  update public.specialists
     set user_id   = coalesce(user_id, v_uid),
         photo_url = case when photo_url is null or photo_url = '' then v_avatar else photo_url end
   where user_id is null and lower(email) = v_email
      or (user_id = v_uid and (photo_url is null or photo_url = ''));
  get diagnostics v_count = row_count;
  if v_count > 0 then v_result := v_result || jsonb_build_object('specialists', v_count); end if;

  update public.affiliates
     set user_id   = coalesce(user_id, v_uid),
         photo_url = case when photo_url is null or photo_url = '' then v_avatar else photo_url end
   where user_id is null and lower(email) = v_email
      or (user_id = v_uid and (photo_url is null or photo_url = ''));
  get diagnostics v_count = row_count;
  if v_count > 0 then v_result := v_result || jsonb_build_object('affiliates', v_count); end if;

  update public.housekeepers
     set user_id   = coalesce(user_id, v_uid),
         photo_url = case when photo_url is null or photo_url = '' then v_avatar else photo_url end
   where user_id is null and lower(email) = v_email
      or (user_id = v_uid and (photo_url is null or photo_url = ''));
  get diagnostics v_count = row_count;
  if v_count > 0 then v_result := v_result || jsonb_build_object('housekeepers', v_count); end if;

  update public.property_managers
     set user_id   = coalesce(user_id, v_uid),
         photo_url = case when photo_url is null or photo_url = '' then v_avatar else photo_url end
   where user_id is null and lower(email) = v_email
      or (user_id = v_uid and (photo_url is null or photo_url = ''));
  get diagnostics v_count = row_count;
  if v_count > 0 then v_result := v_result || jsonb_build_object('property_managers', v_count); end if;

  -- Owners (new): same email match; fills a missing avatar from Google.
  update public.owners
     set user_id    = coalesce(user_id, v_uid),
         avatar_url = case when avatar_url is null or avatar_url = '' then v_avatar else avatar_url end
   where user_id is null and lower(email) = v_email
      or (user_id = v_uid and (avatar_url is null or avatar_url = ''));
  get diagnostics v_count = row_count;
  if v_count > 0 then v_result := v_result || jsonb_build_object('owners', v_count); end if;

  -- CRM access invited by email before this person had signed in (verified emails only).
  if exists (select 1 from public.admin_invites where email = v_email)
     and exists (select 1 from auth.users where id = v_uid and lower(email) = v_email and email_confirmed_at is not null) then
    insert into public.admin_users (user_id)
    select v_uid where not exists (select 1 from public.admin_users where user_id = v_uid);
    delete from public.admin_invites where email = v_email;
    v_result := v_result || jsonb_build_object('crm_access', true);
  end if;

  return jsonb_build_object('ok', true, 'linked', v_result);
end;
$function$;
