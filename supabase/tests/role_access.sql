-- ============================================================
-- Test: each kind of user sees and changes only what they should
-- (production readiness, 2026-10-19)
--
-- Run:  supabase db query --linked -f supabase/tests/role_access.sql
--
-- Acts as a signed-out visitor, a signed-in account with no role, an owner,
-- a housekeeper and a CRM admin. Each tries to read every public table,
-- write to the main ones and call functions that aren't theirs. The
-- housekeeper is a plain account linked inside this test. Everything is
-- rolled back.
-- ============================================================
begin;

create temp table t (n serial, test text, ok boolean, detail text) on commit drop;
grant all on t to anon, authenticated;
grant usage on sequence t_n_seq to anon, authenticated;

-- Accounts to act as. The owner is a real non-admin owner; the housekeeper
-- is a plain account (no role) linked to a new housekeeper row here.
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
  (select u.id from auth.users u
     where u.id not in (select user_id from admin_users)
       and u.id not in (select user_id from housekeepers where user_id is not null)
       and u.id not in (select user_id from owners where user_id is not null)
       and u.id not in (select user_id from specialists where user_id is not null)
       and u.id not in (select user_id from affiliates where user_id is not null)
       and u.id not in (select user_id from property_managers where user_id is not null)
     order by u.created_at offset 1 limit 1) as hk_uid,
  (select o.user_id from owners o where o.user_id is not null and o.user_id not in (select user_id from admin_users) limit 1) as owner_uid,
  (select o.id from owners o where o.user_id is not null and o.user_id not in (select user_id from admin_users) limit 1) as owner_id,
  null::uuid as hk_id,
  null::uuid as hk_cleaning,
  (select id from cleanings where status not in ('completed', 'cancelled') order by created_at desc limit 1 offset 1) as other_cleaning,
  (select c.id from contracts c where c.owner_id is distinct from
     (select o.id from owners o where o.user_id is not null and o.user_id not in (select user_id from admin_users) limit 1)
   order by c.created_at limit 1) as other_contract,
  (select id from units order by unit_code limit 1) as unit_id;

-- The test housekeeper and one cleaning of theirs.
insert into housekeepers (name, email, user_id, status)
select 'Role Test Housekeeper', 'role-test-hk@example.com', hk_uid, 'active' from ctx;
update ctx set hk_id = (select id from housekeepers where email = 'role-test-hk@example.com');
update ctx set hk_cleaning = (select id from cleanings where status not in ('completed', 'cancelled') order by created_at desc limit 1);
update cleanings set housekeeper_id = (select hk_id from ctx) where id = (select hk_cleaning from ctx);
-- The owner's own contracts, looked up here: owners can't read the table themselves.
alter table ctx add column owner_contracts uuid[];
update ctx set owner_contracts = array(select id from contracts where owner_id = ctx.owner_id);
grant select on ctx to anon, authenticated;

-- Every public table this user can read, with how many rows ('denied' if
-- the table is closed to them outright).
create or replace function pg_temp.visible_rows() returns table (tbl text, n text)
language plpgsql as $$
declare r record; c bigint;
begin
  for r in select tablename from pg_tables where schemaname = 'public' order by tablename loop
    begin
      execute format('select count(*) from public.%I', r.tablename) into c;
      tbl := r.tablename; n := c::text; return next;
    exception when insufficient_privilege then
      tbl := r.tablename; n := 'denied'; return next;
    end;
  end loop;
end $$;
grant execute on function pg_temp.visible_rows() to anon, authenticated;

-- A write that must not go through: true when it errors or changes nothing.
create or replace function pg_temp.blocked(p_sql text) returns boolean
language plpgsql as $$
declare k bigint;
begin
  execute p_sql;
  get diagnostics k = row_count;
  return k = 0;
exception when others then
  return true;
end $$;
grant execute on function pg_temp.blocked(text) to anon, authenticated;

-- A lookup that must come back empty: true when it errors or returns null.
create or replace function pg_temp.refused(p_sql text) returns boolean
language plpgsql as $$
declare b boolean;
begin
  execute format('select (%s) is null', p_sql) into b;
  return b;
exception when others then
  return true;
end $$;
grant execute on function pg_temp.refused(text) to anon, authenticated;

-- ── 1. Signed-out visitor ─────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;

insert into t (test, ok, detail)
select 'Visitor reads nothing private', count(*) filter (where n not in ('0', 'denied')) = 0,
       coalesce(string_agg(tbl || '=' || n, ', ') filter (where n not in ('0', 'denied')), 'every table empty or closed')
  from pg_temp.visible_rows();
insert into t (test, ok, detail) select 'Visitor can''t add a booking',
  pg_temp.blocked(format('insert into bookings (unit_id, guest_name, check_in, check_out, total_amount) values (%L, ''x'', ''2030-01-01'', ''2030-01-02'', 1)', (select unit_id from ctx))), 'insert';
insert into t (test, ok, detail) select 'Visitor can''t change a unit',
  pg_temp.blocked(format('update units set marketing_title = ''x'' where id = %L', (select unit_id from ctx))), 'update';
insert into t (test, ok, detail) select 'Visitor can''t write the work log',
  pg_temp.blocked('insert into audit_logs (action, table_name) values (''x'', ''x'')'), 'insert';
reset role;

-- ── 2. Signed-in account with no role ────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', (select plain_uid::text from ctx), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into t (test, ok, detail)
select 'No-role account reads nothing private', count(*) filter (where n not in ('0', 'denied')) = 0,
       coalesce(string_agg(tbl || '=' || n, ', ') filter (where n not in ('0', 'denied')), 'every table empty or closed')
  from pg_temp.visible_rows();
insert into t (test, ok, detail) select 'No-role account can''t add a booking',
  pg_temp.blocked(format('insert into bookings (unit_id, guest_name, check_in, check_out, total_amount) values (%L, ''x'', ''2030-01-01'', ''2030-01-02'', 1)', (select unit_id from ctx))), 'insert';
insert into t (test, ok, detail) select 'No-role account can''t change a cleaning',
  pg_temp.blocked(format('update cleanings set payment_amount = 1 where id = %L', (select other_cleaning from ctx))), 'update';
insert into t (test, ok, detail) select 'No-role account can''t list CRM access',
  pg_temp.blocked('select * from crm_access_list()'), 'crm_access_list';
insert into t (test, ok, detail) select 'No-role account can''t grant CRM access',
  pg_temp.blocked('select crm_access_add(''attacker@example.com'')'), 'crm_access_add';
insert into t (test, ok, detail) select 'No-role account can''t extend a contract',
  pg_temp.blocked(format('select * from extend_contract(%L, ''2040-01-01'')', (select other_contract from ctx))), 'extend_contract';
insert into t (test, ok, detail) select 'No-role account can''t approve and pay a cleaning',
  pg_temp.blocked(format('select admin_approve_and_pay_cleaning(%L, 100, ''cash'', null, null)', (select other_cleaning from ctx))), 'admin_approve_and_pay_cleaning';
insert into t (test, ok, detail) select 'No-role account can''t search accounts',
  pg_temp.blocked('select * from search_profiles(''a'', 10)'), 'search_profiles';
insert into t (test, ok, detail) select 'No-role account can''t read team totals',
  pg_temp.blocked('select * from team_totals_bulk()'), 'team_totals_bulk';
insert into t (test, ok, detail) select 'No-role account gets no owner data',
  coalesce(jsonb_array_length(owner_portal_overview() -> 'contracts'), 0) = 0, 'owner_portal_overview';
reset role;

-- ── 3. Owner (not an admin) ──────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', (select owner_uid::text from ctx), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into t (test, ok, detail)
select 'Owner reads no tables directly', count(*) filter (where n not in ('0', 'denied')) = 0,
       coalesce(string_agg(tbl || '=' || n, ', ') filter (where n not in ('0', 'denied')), 'every table empty or closed')
  from pg_temp.visible_rows();
insert into t (test, ok, detail)
select 'Owner portal shows only their contracts',
       jsonb_array_length(coalesce(o -> 'contracts', '[]')) > 0
       and not exists (select 1 from jsonb_array_elements(o -> 'contracts') e
                        where not (e ->> 'id')::uuid = any ((select owner_contracts from ctx)::uuid[])),
       jsonb_array_length(coalesce(o -> 'contracts', '[]')) || ' contract(s)'
  from (select owner_portal_overview() as o) x;
insert into t (test, ok, detail) select 'Owner can''t open another owner''s contract',
  pg_temp.refused(format('owner_contract_detail(%L)', (select other_contract from ctx))), 'owner_contract_detail';
insert into t (test, ok, detail) select 'Owner can''t change a contract',
  pg_temp.blocked(format('update contracts set notes = ''x'' where owner_id = %L', (select owner_id from ctx))), 'update';
reset role;

-- ── 4. Housekeeper ───────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', (select hk_uid::text from ctx), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into t (test, ok, detail)
select 'Housekeeper sees only their own cleaning',
       count(*) = 1 and bool_and(id = (select hk_cleaning from ctx)), count(*) || ' cleaning(s) visible'
  from cleanings;
insert into t (test, ok, detail)
select 'Housekeeper reads nothing else', count(*) filter (where tbl <> 'cleanings' and n not in ('0', 'denied')) = 0,
       coalesce(string_agg(tbl || '=' || n, ', ') filter (where tbl <> 'cleanings' and n not in ('0', 'denied')), 'only cleanings')
  from pg_temp.visible_rows();
insert into t (test, ok, detail)
select 'Housekeeper details list only their own', count(*) = 1, count(*) || ' row(s)'
  from housekeeper_cleaning_details();
insert into t (test, ok, detail) select 'Housekeeper can''t edit someone else''s cleaning',
  pg_temp.blocked(format('select housekeeper_update_cleaning(%L, ''ready'', null, null, null, null, null)', (select other_cleaning from ctx))), 'housekeeper_update_cleaning';
insert into t (test, ok, detail) select 'Housekeeper can''t set their own pay',
  pg_temp.blocked(format('update cleanings set payment_amount = 99999 where id = %L', (select hk_cleaning from ctx))), 'direct update';
insert into t (test, ok, detail) select 'Housekeeper can''t approve their own cleaning',
  pg_temp.blocked(format('select admin_approve_and_pay_cleaning(%L, 99999, ''cash'', null, null)', (select hk_cleaning from ctx))), 'admin_approve_and_pay_cleaning';
reset role;

-- ── 5. CRM admin ─────────────────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', (select admin_uid::text from ctx), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into t (test, ok, detail)
select 'Admin can read the CRM', count(*) filter (where tbl in ('bookings', 'cleanings', 'contracts', 'units') and n::text ~ '^[1-9]') = 4,
       string_agg(tbl || '=' || n, ', ') filter (where tbl in ('bookings', 'cleanings', 'contracts', 'units'))
  from pg_temp.visible_rows();
insert into t (test, ok, detail) select 'Admin can list CRM access',
  count(*) > 0, count(*) || ' account(s)' from crm_access_list();
reset role;

select n as "#", case when ok then 'PASS' else 'FAIL' end as result, test, detail from t order by n;
rollback;
