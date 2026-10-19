-- ============================================================
-- Test: private files stay private
-- (production readiness, 2026-10-19)
--
-- Run:  supabase db query --linked -f tests/database/storage_access.sql
--
-- Counts which stored files each kind of user can see in the private
-- buckets (cleaning photos, contract PDFs, expense proofs), and tries to
-- add files where they shouldn't. Everything is rolled back.
-- ============================================================
begin;

create temp table t (n serial, test text, ok boolean, detail text) on commit drop;
grant all on t to anon, authenticated;
grant usage on sequence t_n_seq to anon, authenticated;

create temp table ctx on commit drop as
select
  (select user_id from admin_users order by user_id limit 1) as admin_uid,
  (select u.id from auth.users u
     where u.id not in (select user_id from admin_users)
       and u.id not in (select user_id from housekeepers where user_id is not null)
       and u.id not in (select user_id from owners where user_id is not null)
       and u.id not in (select user_id from specialists where user_id is not null)
       and u.id not in (select user_id from affiliates where user_id is not null)
       and u.id not in (select user_id from property_managers where user_id is not null)
     order by u.created_at limit 1) as plain_uid,
  (select o.user_id from owners o where o.user_id is not null and o.user_id not in (select user_id from admin_users) limit 1) as owner_uid,
  (select id from cleanings order by created_at desc limit 1) as some_cleaning;
grant select on ctx to anon, authenticated;

-- Files in the private buckets, and the expense proofs that belong to the owner's contracts.
create temp table expected on commit drop as
select
  (select count(*) from storage.objects where bucket_id in ('cleaning-photos', 'contract-pdfs', 'expense-proofs')) as private_total,
  (select count(*) from storage.objects o
    where o.bucket_id = 'expense-proofs'
      and (storage.foldername(o.name))[1] in (
        select c.id::text from contracts c join owners w on w.id = c.owner_id
         where w.user_id = (select owner_uid from ctx))) as owner_proofs;
grant select on expected to anon, authenticated;

create or replace function pg_temp.private_visible() returns bigint language sql as $$
  select count(*) from storage.objects where bucket_id in ('cleaning-photos', 'contract-pdfs', 'expense-proofs')
$$;
grant execute on function pg_temp.private_visible() to anon, authenticated;

create or replace function pg_temp.can_add(p_bucket text, p_name text) returns boolean language plpgsql as $$
begin
  insert into storage.objects (bucket_id, name) values (p_bucket, p_name);
  return true;
exception when others then
  return false;
end $$;
grant execute on function pg_temp.can_add(text, text) to anon, authenticated;

-- Visitor
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;
insert into t (test, ok, detail) select 'Visitor sees no private files', pg_temp.private_visible() = 0, pg_temp.private_visible() || ' visible';
insert into t (test, ok, detail) select 'Visitor can''t upload a cleaning photo', not pg_temp.can_add('cleaning-photos', 'x/test.jpg'), 'insert';
insert into t (test, ok, detail) select 'Visitor can''t upload to the email images', not pg_temp.can_add('email-assets', 'test/x.jpg'), 'insert';
reset role;

-- Signed in, no role
select set_config('request.jwt.claims', json_build_object('sub', (select plain_uid::text from ctx), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into t (test, ok, detail) select 'No-role account sees no private files', pg_temp.private_visible() = 0, pg_temp.private_visible() || ' visible';
insert into t (test, ok, detail) select 'No-role account can''t upload a cleaning photo',
  not pg_temp.can_add('cleaning-photos', (select some_cleaning::text from ctx) || '/test.jpg'), 'insert';
insert into t (test, ok, detail) select 'No-role account can''t upload an expense proof', not pg_temp.can_add('expense-proofs', 'x/test.jpg'), 'insert';
insert into t (test, ok, detail) select 'No-role account can''t upload a contract PDF', not pg_temp.can_add('contract-pdfs', 'x/test.pdf'), 'insert';
insert into t (test, ok, detail) select 'No-role account can''t change site photos', not pg_temp.can_add('hero-images', 'home/test.jpg'), 'insert';
reset role;

-- Owner: only their own contracts' expense proofs
select set_config('request.jwt.claims', json_build_object('sub', (select owner_uid::text from ctx), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into t (test, ok, detail) select 'Owner sees only their own expense proofs',
  pg_temp.private_visible() = (select owner_proofs from expected),
  pg_temp.private_visible() || ' visible, ' || (select owner_proofs from expected) || ' are theirs';
insert into t (test, ok, detail) select 'Owner can''t upload an expense proof', not pg_temp.can_add('expense-proofs', 'x/test.jpg'), 'insert';
reset role;

-- Admin sees everything
select set_config('request.jwt.claims', json_build_object('sub', (select admin_uid::text from ctx), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into t (test, ok, detail) select 'Admin sees every private file',
  pg_temp.private_visible() = (select private_total from expected), pg_temp.private_visible() || ' of ' || (select private_total from expected);
reset role;

select n as "#", case when ok then 'PASS' else 'FAIL' end as result, test, detail from t order by n;
rollback;
