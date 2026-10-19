-- ============================================================
-- Test: every CRM change is written to the work log
-- (migration 20261019000001_work_log.sql)
--
-- Run:  supabase db query --linked -f supabase/tests/work_log.sql
--
-- Edits a real booking, cleaning and unit as a CRM admin, checks what the
-- trigger wrote to audit_logs, and rolls everything back.
-- ============================================================
begin;

create temp table t (n serial, test text, ok boolean, detail text) on commit drop;
grant all on t to authenticated;
grant usage on sequence t_n_seq to authenticated;

create temp table ctx on commit drop as
select (select id from bookings where deleted_at is null order by created_at desc limit 1) as booking_id,
       (select id from cleanings where status <> 'cancelled' order by created_at desc limit 1) as cleaning_id,
       (select id from units order by unit_code limit 1) as unit_id,
       (select id from housekeepers order by name limit 1) as hk_id,
       (select name from housekeepers order by name limit 1) as hk_name,
       (select user_id from admin_users order by user_id limit 1) as admin_id,
       now() as started;
grant all on ctx to authenticated;

select set_config('request.jwt.claims',
  json_build_object('sub', (select admin_id::text from ctx), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. A field edit is logged with who, what and from → to.
update bookings set notes = 'Work log test' where id = (select booking_id from ctx);
insert into t (test, ok, detail)
select 'Booking edit logged', count(*) = 1
       and bool_and(a.user_id = (select admin_id from ctx))
       and bool_and(a.details -> 'changes' -> 'notes' ->> 'to' = 'Work log test')
       and bool_and(a.details ->> 'label' is not null),
       string_agg(a.details::text, ' | ')
  from audit_logs a
 where a.action = 'UPDATE' and a.table_name = 'bookings' and a.record_id = (select booking_id from ctx)
   and a.created_at >= (select started from ctx);

-- 2. Saving without changing anything writes nothing.
update bookings set notes = notes where id = (select booking_id from ctx);
insert into t (test, ok, detail)
select 'No-change save not logged', count(*) = 1, count(*)::text || ' row(s)'
  from audit_logs a
 where a.action = 'UPDATE' and a.table_name = 'bookings' and a.record_id = (select booking_id from ctx)
   and a.created_at >= (select started from ctx);

-- 3. Cleanings a booking update touches through its own triggers are not listed separately.
insert into t (test, ok, detail)
select 'Trigger cascades not logged', count(*) = 0, count(*)::text || ' cleaning row(s)'
  from audit_logs a
 where a.table_name = 'cleanings' and a.created_at >= (select started from ctx);

-- 4. A dropdown that stores an id shows the name people know.
update cleanings set housekeeper_id = (select hk_id from ctx), notes = repeat('x', 200)
 where id = (select cleaning_id from ctx);
insert into t (test, ok, detail)
select 'Housekeeper shown by name, long text shortened',
       count(*) = 1
       and bool_and(a.details -> 'changes' -> 'housekeeper_id' ->> 'to' = (select hk_name from ctx)
                    or not (a.details -> 'changes' ? 'housekeeper_id'))
       and bool_and(length(a.details -> 'changes' -> 'notes' ->> 'to') = 120),
       string_agg(a.details::text, ' | ')
  from audit_logs a
 where a.table_name = 'cleanings' and a.record_id = (select cleaning_id from ctx)
   and a.created_at >= (select started from ctx);

-- 5. Units are labelled by their code.
update units set marketing_title = 'Work log test title' where id = (select unit_id from ctx);
insert into t (test, ok, detail)
select 'Unit edit labelled by code',
       count(*) = 1 and bool_and(a.details ->> 'label' = (select unit_code from units where id = (select unit_id from ctx))),
       string_agg(a.details::text, ' | ')
  from audit_logs a
 where a.table_name = 'units' and a.record_id = (select unit_id from ctx)
   and a.created_at >= (select started from ctx);

-- 6. Admins can read the entries (the dashboard reads them as the signed-in admin).
insert into t (test, ok, detail)
select 'Admin can read today''s entries', count(*) >= 3, count(*)::text || ' row(s)'
  from audit_logs a
 where a.action in ('INSERT', 'UPDATE', 'DELETE') and a.created_at >= (select started from ctx);

reset role;
select n, test, ok, detail from t order by n;

rollback;
