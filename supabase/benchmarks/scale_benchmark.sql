-- ============================================================
-- Benchmark: how the database copes as data grows
-- (production readiness, 2026-10-19)
--
-- !! NEVER RUN THIS AGAINST THE LIVE PROJECT. !!
-- Rolled-back rows still fill the disk until VACUUM runs: on 2026-10-19 the
-- 200k-row size crashed the live database and left it read-only until
-- `vacuum full` was run table by table in the SQL Editor. Run it only on a
-- separate test project or a local `supabase start`, and only one size per run.
--
-- Run (test project only):  supabase db query --db-url <test db url> -f supabase/benchmarks/scale_benchmark.sql
--
-- Adds test units with 6-year contracts and fills them with bookings, one
-- cleaning per booking and work-log history, to the size set in `cfg`
-- below. Triggers are paused while the data goes in (this connection only),
-- with the columns they would set filled in by hand; the rules themselves
-- are timed by the volume test in tests. Then, as a CRM admin, it times
-- what each page asks for and how much data it would download.
-- Everything is rolled back. One size per run: the query service stops a
-- run after about 100 seconds.
-- ============================================================
begin;
set local statement_timeout = '20min';

-- Units × stays per unit = bookings. 200 × 50 = 10k, 200 × 250 = 50k,
-- 400 × 250 = 100k, 400 × 500 = 200k.
create temp table cfg on commit drop as select 200 as units, 50 as slots;

create temp table timing (n serial, what text, ms numeric, kb numeric) on commit drop;
create temp table sizes (bookings bigint, cleanings bigint, log_rows bigint, mb numeric) on commit drop;
grant all on timing, sizes, cfg to authenticated;
grant usage on sequence timing_n_seq to authenticated;

set local session_replication_role = replica;

insert into units (building, unit_code, status)
select 'Scale Test', 'SCALE-' || lpad(g::text, 4, '0'), 'ACTIVE' from generate_series(1, (select units from cfg)) g;

insert into contracts (unit_id, contract_code, effective_date, expiry_date)
select id, 'CT-SCALE' || right(unit_code, 4), date '2021-01-01', date '2026-12-31' from units where building = 'Scale Test';

-- 3-night stays every 3 days; stays in the past are completed and paid.
insert into bookings (unit_id, guest_name, guest_email, check_in, check_out, total_amount, amount_paid, balance, payment_status,
                      booking_code, completed_at, booker_code, booker_commission, created_at, updated_at)
select u.id, 'Scale Guest ' || k, 'scale' || k || '@example.com', d, d + 2, amt,
       case when d < current_date then amt else 0 end,
       case when d < current_date then 0 else amt end,
       case when d < current_date then 'paid' else 'unpaid' end,
       'BK-SC' || right(u.unit_code, 4) || lpad(k::text, 4, '0'),
       case when d < current_date then (d + 2)::timestamptz end,
       (select code from specialists order by code limit 1), amt * 0.1, d::timestamptz - interval '10 days', d::timestamptz - interval '10 days'
  from units u
  cross join generate_series(0, (select slots from cfg) - 1) k
  cross join lateral (select date '2021-01-01' + k * 3 as d, (2500 + (k % 9) * 500)::numeric as amt) x
 where u.building = 'Scale Test';

insert into cleanings (booking_id, unit_id, type, status, scheduled_date, payment_amount, cleaning_code, created_at, updated_at, completed_at)
select b.id, b.unit_id, 'basic',
       case when b.check_out < current_date then 'completed' else 'scheduled' end,
       b.check_out,
       case when b.check_out < current_date then 500 end,
       'CL-SC' || substr(b.booking_code, 6),
       b.created_at, b.created_at,
       case when b.check_out < current_date then b.check_out::timestamptz end
  from bookings b where b.booking_code like 'BK-SC%';

-- Two work-log rows per booking over the years, plus a busy day today.
insert into audit_logs (user_id, action, table_name, record_id, details, created_at)
select (select user_id from admin_users limit 1), a, 'bookings', b.id, jsonb_build_object('label', b.booking_code, 'changes', '{}'::jsonb), b.created_at + (n || ' hours')::interval
  from bookings b cross join (values (1, 'INSERT'), (5, 'UPDATE')) v(n, a)
 where b.booking_code like 'BK-SC%';
insert into audit_logs (user_id, action, table_name, record_id, details, created_at)
select (select user_id from admin_users limit 1), 'UPDATE', 'bookings', null, '{"changes":{}}'::jsonb, now() - (g || ' minutes')::interval
  from generate_series(1, 300) g;

set local session_replication_role = origin;
analyze units; analyze contracts; analyze bookings; analyze cleanings; analyze audit_logs;

insert into sizes select (select count(*) from bookings), (select count(*) from cleanings), (select count(*) from audit_logs),
  round((pg_total_relation_size('bookings') + pg_total_relation_size('cleanings') + pg_total_relation_size('audit_logs')) / 1048576.0, 1);

-- Times one query (as the current role) and how much JSON it would send.
create or replace function pg_temp.clock(p_what text, p_sql text) returns void language plpgsql as $$
declare t0 timestamptz := clock_timestamp(); bytes bigint;
begin
  execute format('select coalesce(sum(octet_length(to_jsonb(q)::text)), 0) from (%s) q', p_sql) into bytes;
  insert into timing (what, ms, kb) values (p_what, round(extract(epoch from clock_timestamp() - t0) * 1000, 1), round(bytes / 1024.0));
end $$;
grant execute on function pg_temp.clock(text, text) to authenticated;

create temp table one on commit drop as
select c.id as contract_id, c.unit_id from contracts c where c.contract_code like 'CT-SCALE%' order by c.contract_code limit 1;
grant select on one to authenticated;

select set_config('request.jwt.claims', json_build_object('sub', (select user_id::text from admin_users order by user_id limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

select pg_temp.clock('Dashboard: tile counts',
  'select (select count(*) from bookings where deleted_at is null) a,
          (select count(*) from bookings where deleted_at is null and completed_at is null and checked_out_at is null and check_in <= current_date and check_out >= current_date) b,
          (select count(*) from bookings where deleted_at is null and completed_at is null and check_in > current_date) c,
          (select count(*) from cleanings where status = ''submitted'') d');
select pg_temp.clock('Dashboard: unpaid bookings list', 'select id, balance from bookings where deleted_at is null and completed_at is null and balance > 0');
select pg_temp.clock('Dashboard: yearly chart (2 years)', 'select * from dashboard_analytics_year(2026) union all select * from dashboard_analytics_year(2025)');
select pg_temp.clock('Dashboard: work done today', 'select * from audit_logs where created_at >= now() - interval ''1 day'' and action in (''INSERT'',''UPDATE'',''DELETE'') order by created_at desc limit 500');
select pg_temp.clock('Bookings page: newest 500', 'select b.*, to_jsonb(u) units from bookings b left join units u on u.id = b.unit_id where b.deleted_at is null order by b.check_in desc limit 500');
select pg_temp.clock('Housekeeping page: every cleaning (as now)', 'select c.*, to_jsonb(u) units from cleanings c left join units u on u.id = c.unit_id');
select pg_temp.clock('Accounting: one contract''s statement', 'select * from contract_monthly_breakdown((select contract_id from one))');
select pg_temp.clock('Accounting: one unit''s bookings', 'select * from bookings where unit_id = (select unit_id from one)');
select pg_temp.clock('Accounting: one unit''s cleanings', 'select * from cleanings where unit_id = (select unit_id from one)');
select pg_temp.clock('Backup: whole bookings table', 'select * from bookings');
select pg_temp.clock('Backup: whole cleanings table', 'select * from cleanings');

reset role;
select s.bookings, s.cleanings, s.log_rows, s.mb as table_mb, t.what, t.ms, t.kb from timing t cross join sizes s order by t.n;
rollback;
