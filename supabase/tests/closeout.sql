-- ============================================================
-- Test: contract close-out (20261019000005_contract_closeout.sql)
--
-- Run:  supabase db query --linked -f supabase/tests/closeout.sql
--
-- Takes an ended contract with bookings, checks what its close-out covers,
-- that only the server can run it, and that it waits while anything is
-- unfinished. Then settles everything and clears it: the term's bookings and
-- cleanings go, the contract records it, and the activity log gets one
-- CLOSEOUT entry instead of one per row. Everything is rolled back.
-- ============================================================
begin;

create temp table t (n serial, test text, ok boolean, detail text) on commit drop;
grant all on t to authenticated, anon;
grant usage on sequence t_n_seq to authenticated, anon;

-- An ended contract with bookings in its term (one whose owner can sign in, if any).
create temp table ctx on commit drop as
select c.id as contract_id, c.contract_code, o.user_id as owner_uid
  from contracts c
  join owners o on o.id = c.owner_id
 where c.expiry_date < current_date and c.records_cleared_at is null
   and exists (select 1 from bookings b where b.unit_id = c.unit_id and b.check_in between c.effective_date and c.expiry_date)
 order by (o.user_id is not null) desc, c.expiry_date desc
 limit 1;
create temp table scope on commit drop as select public.closeout_scope((select contract_id from ctx)) as s;
grant all on ctx, scope to authenticated, anon;

insert into t (test, ok, detail)
select 'Found an ended contract with bookings', count(*) = 1, coalesce(max(contract_code), 'none') from ctx;

-- 1. What it covers: the term's bookings by check-in, its cleanings by date or booking.
insert into t (test, ok, detail)
select 'Covers the bookings the statement counts',
       jsonb_array_length(s -> 'bookings') = (select count(*) from bookings b join contracts c on c.unit_id = b.unit_id
                                              where c.id = (select contract_id from ctx) and b.check_in between c.effective_date and c.expiry_date),
       jsonb_array_length(s -> 'bookings') || ' bookings, ' || jsonb_array_length(s -> 'cleanings') || ' cleanings'
  from scope;
insert into t (test, ok, detail)
select 'Covers every cleaning of those bookings',
       not exists (select 1 from cleanings cl
                    where cl.booking_id in (select x::uuid from scope, jsonb_array_elements_text(s -> 'bookings') x)
                      and cl.id not in (select x::uuid from scope, jsonb_array_elements_text(s -> 'cleanings') x)),
       'none left out' from scope;

-- 2. Only the server can run it.
select set_config('request.jwt.claims', json_build_object('sub', (select user_id::text from admin_users order by user_id limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
do $$ begin
  perform public.closeout_delete_records((select contract_id from ctx), 'x', null, 0);
  insert into t (test, ok, detail) values ('A signed-in admin cannot run the deletion directly', false, 'it ran');
exception when insufficient_privilege then
  insert into t (test, ok, detail) values ('A signed-in admin cannot run the deletion directly', true, sqlerrm);
end $$;
do $$ begin
  perform public.closeout_scope((select contract_id from ctx));
  insert into t (test, ok, detail) values ('Nor read its scope', false, 'it ran');
exception when insufficient_privilege then
  insert into t (test, ok, detail) values ('Nor read its scope', true, sqlerrm);
end $$;
reset role;

-- 3. It needs the final copy, and waits while anything is unfinished.
do $$ begin
  perform public.closeout_delete_records((select contract_id from ctx), '', null, 0);
  insert into t (test, ok, detail) values ('Refuses without a kept copy of the statement', false, 'it ran');
exception when others then
  insert into t (test, ok, detail) values ('Refuses without a kept copy of the statement', sqlerrm like '%final copy%', sqlerrm);
end $$;

-- An unfinished cleaning in the term, made for the test.
set local session_replication_role = replica;  -- no triggers while setting up
update cleanings set status = 'ready'
 where id = (select x::uuid from scope, jsonb_array_elements_text(s -> 'cleanings') x limit 1);
set local session_replication_role = origin;
do $$ begin
  perform public.closeout_delete_records((select contract_id from ctx), 'test/final.xlsx', null, 0);
  insert into t (test, ok, detail) values ('Waits while a cleaning is unfinished', false, 'it ran');
exception when others then
  insert into t (test, ok, detail) values ('Waits while a cleaning is unfinished', sqlerrm like '%unfinished%', sqlerrm);
end $$;

-- 4. Everything settled: it clears.
set local session_replication_role = replica;
update bookings set amount_paid = total_amount, balance = 0
 where id in (select x::uuid from scope, jsonb_array_elements_text(s -> 'bookings') x);
update cleanings set status = 'completed', paid_at = coalesce(paid_at, now()), laundry_paid_at = coalesce(laundry_paid_at, now())
 where id in (select x::uuid from scope, jsonb_array_elements_text(s -> 'cleanings') x) and status <> 'cancelled';
set local session_replication_role = origin;

create temp table result on commit drop as
select public.closeout_delete_records((select contract_id from ctx), 'test/final.xlsx', null, 7) as r;

insert into t (test, ok, detail)
select 'Deletes the term''s bookings and cleanings',
       (r ->> 'bookings')::int = jsonb_array_length(s -> 'bookings') and (r ->> 'cleanings')::int = jsonb_array_length(s -> 'cleanings'),
       r::text from result, scope;
insert into t (test, ok, detail)
select 'None of them are left',
       not exists (select 1 from bookings where id in (select x::uuid from scope, jsonb_array_elements_text(s -> 'bookings') x))
       and not exists (select 1 from cleanings where id in (select x::uuid from scope, jsonb_array_elements_text(s -> 'cleanings') x)),
       'gone';
insert into t (test, ok, detail)
select 'The contract records when, how many, and the kept copy',
       records_cleared_at is not null and records_archive_path = 'test/final.xlsx' and (records_cleared ->> 'photos')::int = 7 and closeout_note is null,
       records_cleared::text from contracts where id = (select contract_id from ctx);
insert into t (test, ok, detail)
select 'One CLOSEOUT entry in the activity log',
       count(*) = 1, count(*) || ' entries' from audit_logs
 where action = 'CLOSEOUT' and record_id = (select contract_id from ctx) and created_at = now();
insert into t (test, ok, detail)
select 'No entry per deleted row', count(*) = 0, count(*) || ' DELETE entries'
  from audit_logs where action = 'DELETE' and created_at = now();
do $$ begin
  perform public.closeout_delete_records((select contract_id from ctx), 'test/final.xlsx', null, 0);
  insert into t (test, ok, detail) values ('Runs only once per contract', false, 'it ran again');
exception when others then
  insert into t (test, ok, detail) values ('Runs only once per contract', sqlerrm like '%already cleared%', sqlerrm);
end $$;

-- 5. The owner portal is told the records were cleared.
do $$
declare v_uid uuid := (select owner_uid from ctx);
begin
  if v_uid is null then
    insert into t (test, ok, detail) values ('Owner portal shows when records were cleared', true, 'skipped: no owner with a login');
    return;
  end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_uid::text, 'role', 'authenticated')::text, true);
  insert into t (test, ok, detail)
  select 'Owner portal shows when records were cleared',
         (d -> 'contract' ->> 'records_cleared_at') is not null and jsonb_array_length(d -> 'bookings') = 0,
         'cleared at ' || coalesce(d -> 'contract' ->> 'records_cleared_at', 'missing')
    from (select public.owner_contract_detail((select contract_id from ctx)) as d) x;
end $$;

select n as "#", case when ok then 'PASS' else 'FAIL' end as result, test, detail from t order by n;
rollback;
