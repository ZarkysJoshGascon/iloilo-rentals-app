-- ============================================================
-- Test: late check-out until 1 PM before a same-day arrival, extending
-- nights and hours in one go, cancelled bookings not holding dates
-- (migration 20261017000000_late_checkout_turnover.sql)
--
-- Run:  supabase db query --linked -f supabase/tests/late_checkout_turnover.sql
--
-- Makes four throwaway bookings in a unit that's free around today, runs
-- every rule as a CRM admin, prints PASS/FAIL for each, and rolls
-- everything back: nothing is kept, nothing is broadcast.
--
--   Guest A  stayed 2 nights, checks out today
--   Guest B  checks in today (same day A leaves), checks out in 2 days
--   Guest X  cancelled, would have checked in the day B leaves
--   Guest C  arrives 4 days from now
-- ============================================================
begin;

create temp table t (n serial, test text, ok boolean, detail text) on commit drop;
grant all on t to authenticated;
grant usage on sequence t_n_seq to authenticated;

-- A unit with a contract and no bookings from 3 days ago to 8 days ahead.
create temp table ctx on commit drop as
select u.id as unit, u.unit_code, (now() at time zone 'Asia/Manila')::date as today
  from units u
 where exists (
         select 1 from contracts c
          where c.unit_id = u.id
            and c.effective_date <= (now() at time zone 'Asia/Manila')::date - 3
            and (c.expiry_date is null or c.expiry_date >= (now() at time zone 'Asia/Manila')::date + 12))
   and not exists (
         select 1 from bookings b
          where b.unit_id = u.id and b.deleted_at is null
            and b.check_in <= (now() at time zone 'Asia/Manila')::date + 8
            and b.check_out >= (now() at time zone 'Asia/Manila')::date - 3)
 order by u.unit_code
 limit 1;
grant all on ctx to authenticated;

do $$ begin
  if not exists (select 1 from ctx) then
    raise exception 'No unit is free around today to test with.';
  end if;
end $$;

insert into bookings (guest_name, unit_id, check_in, check_out, total_amount)
select 'TEST Guest A', unit, today - 2, today, 3000 from ctx;
insert into bookings (guest_name, unit_id, check_in, check_out, total_amount)
select 'TEST Guest B', unit, today, today + 2, 3000 from ctx;
insert into bookings (guest_name, unit_id, check_in, check_out, total_amount, cancelled_at, cancelled_reason)
select 'TEST Guest X', unit, today + 2, today + 3, 1500, now(), 'TEST · guest cancelled' from ctx;
insert into bookings (guest_name, unit_id, check_in, check_out, total_amount)
select 'TEST Guest C', unit, today + 4, today + 6, 3000 from ctx;

create temp table ids on commit drop as
select (select id from bookings where guest_name = 'TEST Guest A' and unit_id = (select unit from ctx)) as a,
       (select id from bookings where guest_name = 'TEST Guest B' and unit_id = (select unit from ctx)) as b,
       (select id from bookings where guest_name = 'TEST Guest X' and unit_id = (select unit from ctx)) as x,
       (select id from bookings where guest_name = 'TEST Guest C' and unit_id = (select unit from ctx)) as c;
grant all on ids to authenticated;

insert into t (test, ok, detail)
select 'Setup: four bookings in one unit', count(*) = 4, 'unit ' || (select unit_code from ctx)
  from bookings where id in (select a from ids union all select b from ids union all select x from ids union all select c from ids);

-- ── As a CRM admin ───────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_id::text from admin_users order by user_id limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

-- B arrives today at 3 PM, so A's late check-out ends by 1 PM.
insert into t (test, ok, detail)
select 'A late until 1 PM (B arrives 3 PM)', late_checkout_at is not null and late_checkout_by_name is not null,
       to_char(late_checkout_at at time zone 'Asia/Manila', 'FMHH12:MI AM') || ' by ' || late_checkout_by_name
  from set_late_checkout((select a from ids), stay_moment((select today from ctx), time '13:00'));

do $$ begin
  perform set_late_checkout((select a from ids), stay_moment((select today from ctx), time '14:00'));
  insert into t (test, ok, detail) values ('Refuse A late until 2 PM (B arrives 3 PM)', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse A late until 2 PM (B arrives 3 PM)', true, sqlerrm);
end $$;

-- The only arrival the day B leaves is cancelled, so any time that day.
update bookings set late_checkout_at = stay_moment((select today from ctx) + 2, time '20:00') where id = (select b from ids);
insert into t (test, ok, detail)
select 'B late until 8 PM (the only arrival that day, X, is cancelled)',
       late_checkout_at = stay_moment((select today from ctx) + 2, time '20:00') and late_checkout_by_name is not null,
       'set straight on the table, by ' || coalesce(late_checkout_by_name, 'nobody')
  from bookings where id = (select b from ids);

-- More nights and more hours at once: B to the day C arrives, out by 1 PM.
update bookings
   set check_out = (select today from ctx) + 4,
       late_checkout_at = stay_moment((select today from ctx) + 4, time '13:00')
 where id = (select b from ids);
insert into t (test, ok, detail)
select 'Extend B 2 nights (over cancelled X) + late until 1 PM, in one update',
       check_out = (select today from ctx) + 4 and late_checkout_at = stay_moment((select today from ctx) + 4, time '13:00'),
       'check-out ' || check_out || ' at ' || to_char(late_checkout_at at time zone 'Asia/Manila', 'FMHH12:MI AM')
  from bookings where id = (select b from ids);

do $$ begin
  update bookings
     set check_out = (select today from ctx) + 4,
         late_checkout_at = stay_moment((select today from ctx) + 4, time '14:00')
   where id = (select b from ids);
  insert into t (test, ok, detail) values ('Refuse B late until 2 PM on the day C arrives', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse B late until 2 PM on the day C arrives', true, sqlerrm);
end $$;

do $$ begin
  update bookings set check_out = (select today from ctx) + 5 where id = (select b from ids);
  insert into t (test, ok, detail) values ('Refuse extending B past C''s check-in', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse extending B past C''s check-in', true, sqlerrm);
end $$;

-- A new check-out date on its own drops the late check-out from the old one.
update bookings set check_out = (select today from ctx) + 3 where id = (select b from ids);
insert into t (test, ok, detail)
select 'Moving B''s check-out alone drops the old late check-out', late_checkout_at is null and late_checkout_by_name is null,
       'check-out now ' || check_out
  from bookings where id = (select b from ids);

-- B stays past 1 PM on a day: nobody can check in that day...
update bookings set late_checkout_at = stay_moment((select today from ctx) + 3, time '18:00') where id = (select b from ids);
do $$ begin
  update bookings set check_in = (select today from ctx) + 3 where id = (select c from ids);
  insert into t (test, ok, detail) values ('Refuse C checking in the day B stays until 6 PM', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse C checking in the day B stays until 6 PM', true, sqlerrm);
end $$;

-- ...until it ends by 1 PM.
update bookings set late_checkout_at = stay_moment((select today from ctx) + 3, time '13:00') where id = (select b from ids);
update bookings set check_in = (select today from ctx) + 3 where id = (select c from ids);
insert into t (test, ok, detail)
select 'Allow it once B is out by 1 PM', check_in = (select today from ctx) + 3, 'C now checks in ' || check_in
  from bookings where id = (select c from ids);

-- Un-cancelling X, which now sits inside B's stay, is checked again.
do $$ begin
  update bookings set cancelled_at = null where id = (select x from ids);
  insert into t (test, ok, detail) values ('Refuse un-cancelling X over B''s stay', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse un-cancelling X over B''s stay', true, sqlerrm);
end $$;

reset role;
select n as "#", case when ok then 'PASS' else 'FAIL' end as result, test, detail from t order by n;
rollback;
