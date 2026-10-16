-- ============================================================
-- Test: extending a contract keeps its previous end dates
-- (migration 20261017000002_contract_previous_expiry_dates.sql)
--
-- Run:  supabase db query --linked -f supabase/tests/contract_extend.sql
--
-- Extends a real contract twice as a CRM admin, checks the list of previous
-- end dates and the refusals, and rolls everything back.
-- ============================================================
begin;

create temp table t (n serial, test text, ok boolean, detail text) on commit drop;
grant all on t to authenticated;
grant usage on sequence t_n_seq to authenticated;

-- The latest contract on some unit (nothing after it to run into).
create temp table ctx on commit drop as
select c.id, c.contract_code, c.expiry_date as first_end
  from contracts c
 where c.expiry_date is not null
   and not exists (select 1 from contracts o where o.unit_id = c.unit_id and o.id <> c.id and o.effective_date > c.effective_date)
 order by c.expiry_date desc
 limit 1;
grant all on ctx to authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', (select user_id::text from admin_users order by user_id limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into t (test, ok, detail)
select 'Extend by 3 months', previous_expiry_dates = array[(select first_end from ctx)] and expiry_date = (select first_end from ctx) + 90,
       contract_code || ': ' || array_to_string(previous_expiry_dates, ', ') || ' → ' || expiry_date
  from extend_contract((select id from ctx), (select first_end from ctx) + 90);

insert into t (test, ok, detail)
select 'Extend again: two previous end dates', cardinality(previous_expiry_dates) = 2,
       array_to_string(previous_expiry_dates, ', ') || ' → ' || expiry_date
  from extend_contract((select id from ctx), (select first_end from ctx) + 180);

do $$ begin
  perform extend_contract((select id from ctx), (select first_end from ctx) + 100);
  insert into t (test, ok, detail) values ('Refuse an earlier end date', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse an earlier end date', true, sqlerrm);
end $$;

-- Fixing the end date by hand is not an extension.
update contracts set expiry_date = (select first_end from ctx) + 200 where id = (select id from ctx);
insert into t (test, ok, detail)
select 'Editing the end date by hand adds nothing', cardinality(previous_expiry_dates) = 2, cardinality(previous_expiry_dates) || ' previous'
  from contracts where id = (select id from ctx);

select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
do $$ begin
  perform extend_contract((select id from ctx), (select first_end from ctx) + 400);
  insert into t (test, ok, detail) values ('Non-admin can''t extend', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Non-admin can''t extend', true, sqlerrm);
end $$;

reset role;
select n as "#", case when ok then 'PASS' else 'FAIL' end as result, test, detail from t order by n;
rollback;
