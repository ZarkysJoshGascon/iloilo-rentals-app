-- ============================================================
-- Test: check-out confirmation and late check-out
-- (migration 20261015000001_checkout_confirmation.sql)
--
-- Run:  supabase db query --linked -f supabase/tests/checkout_confirmation.sql
--
-- Makes three throwaway bookings in a unit that's free around today, runs
-- every rule as a CRM admin and as someone who isn't, prints PASS/FAIL for
-- each, and rolls everything back: nothing is kept, nothing is broadcast.
--
--   Guest A  stayed 2 nights, checks out today
--   Guest B  checks in today (same day A leaves), stays 2 nights
--   Guest C  arrives the day after B leaves
-- ============================================================
begin;

create temp table t (n serial, test text, ok boolean, detail text) on commit drop;
grant all on t to authenticated;
grant usage on sequence t_n_seq to authenticated;

-- A unit with a contract and no bookings from 3 days ago to 6 days ahead.
create temp table ctx on commit drop as
select u.id as unit, u.unit_code, (now() at time zone 'Asia/Manila')::date as today
  from units u
 where exists (
         select 1 from contracts c
          where c.unit_id = u.id
            and c.effective_date <= (now() at time zone 'Asia/Manila')::date - 3
            and (c.expiry_date is null or c.expiry_date >= (now() at time zone 'Asia/Manila')::date + 10))
   and not exists (
         select 1 from bookings b
          where b.unit_id = u.id and b.deleted_at is null
            and b.check_in <= (now() at time zone 'Asia/Manila')::date + 6
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
insert into bookings (guest_name, unit_id, check_in, check_out, total_amount)
select 'TEST Guest C', unit, today + 3, today + 5, 3000 from ctx;

create temp table ids on commit drop as
select (select id from bookings where guest_name = 'TEST Guest A' and unit_id = (select unit from ctx)) as a,
       (select id from bookings where guest_name = 'TEST Guest B' and unit_id = (select unit from ctx)) as b,
       (select id from bookings where guest_name = 'TEST Guest C' and unit_id = (select unit from ctx)) as c;
grant all on ids to authenticated;

insert into t (test, ok, detail)
select 'Setup: unit and its cleaning', count(*) = 1,
       'unit ' || (select unit_code from ctx) || ', cleaning ' || coalesce(string_agg(cleaning_code || ' on ' || scheduled_date, ', '), 'none')
  from cleanings where booking_id = (select a from ids);

-- ── As a CRM admin ───────────────────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_id::text from admin_users order by user_id limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;

-- Confirming a check-out stamps when and who.
insert into t (test, ok, detail)
select 'Confirm A checked out', checked_out_at is not null and checked_out_by_name is not null,
       'by ' || checked_out_by_name || ' at ' || to_char(checked_out_at at time zone 'Asia/Manila', 'FMHH12:MI AM')
  from confirm_checkout((select a from ids));

insert into t (test, ok, detail)
select 'Undo it', checked_out_at is null and checked_out_by_name is null, 'cleared'
  from confirm_checkout((select a from ids), false);

do $$ begin
  perform confirm_checkout((select c from ids));
  insert into t (test, ok, detail) values ('Refuse confirming a stay that hasn''t started (C)', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse confirming a stay that hasn''t started (C)', true, sqlerrm);
end $$;

-- Late check-out with the next guest arriving the same day: until 1 PM at most (20261017000000).
insert into t (test, ok, detail)
select 'A late until 1 PM (B arrives 3 PM)', late_checkout_at is not null,
       to_char(late_checkout_at at time zone 'Asia/Manila', 'FMHH12:MI AM') || ' by ' || late_checkout_by_name
  from set_late_checkout((select a from ids), stay_moment((select today from ctx), time '13:00'));

do $$ begin
  perform set_late_checkout((select a from ids), stay_moment((select today from ctx), time '16:00'));
  insert into t (test, ok, detail) values ('Refuse A late until 4 PM', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse A late until 4 PM', true, sqlerrm);
end $$;

do $$ begin
  perform set_late_checkout((select a from ids), stay_moment((select today from ctx), time '10:00'));
  insert into t (test, ok, detail) values ('Refuse a "late" check-out before 11 AM', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse a "late" check-out before 11 AM', true, sqlerrm);
end $$;

do $$ begin
  perform set_late_checkout((select a from ids), stay_moment((select today from ctx) + 1, time '09:00'));
  insert into t (test, ok, detail) values ('Refuse a late check-out on another day', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse a late check-out on another day', true, sqlerrm);
end $$;

-- Nobody arriving the day B leaves: any time that day.
insert into t (test, ok, detail)
select 'B late until 8 PM (nobody arrives that day)', late_checkout_at is not null,
       to_char(late_checkout_at at time zone 'Asia/Manila', 'FMHH12:MI AM')
  from set_late_checkout((select b from ids), stay_moment((select today from ctx) + 2, time '20:00'));

-- ...but then nobody can be booked in for that day's 3 PM.
do $$ begin
  update bookings set check_in = (select today from ctx) + 2 where id = (select c from ids);
  insert into t (test, ok, detail) values ('Refuse moving C''s check-in into B''s late check-out', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse moving C''s check-in into B''s late check-out', true, sqlerrm);
end $$;

select set_late_checkout((select b from ids), stay_moment((select today from ctx) + 2, time '13:00'));
update bookings set check_in = (select today from ctx) + 2 where id = (select c from ids);
insert into t (test, ok, detail)
select 'Allow it once B''s late check-out ends at 1 PM', check_in = (select today from ctx) + 2, 'C now checks in ' || check_in
  from bookings where id = (select c from ids);

-- Changing the check-out date drops the late check-out and the confirmation.
select confirm_checkout((select a from ids));
update bookings set check_out = (select today from ctx) - 1 where id = (select a from ids);
insert into t (test, ok, detail)
select 'Changing A''s check-out date clears both', late_checkout_at is null and checked_out_at is null, 'check-out now ' || check_out
  from bookings where id = (select a from ids);

-- ── As someone signed in who isn't a CRM admin ───────────────
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);

do $$ begin
  perform confirm_checkout((select b from ids));
  insert into t (test, ok, detail) values ('Non-admin can''t confirm a check-out', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Non-admin can''t confirm a check-out', true, sqlerrm);
end $$;

do $$ begin
  perform set_late_checkout((select b from ids), null);
  insert into t (test, ok, detail) values ('Non-admin can''t set a late check-out', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Non-admin can''t set a late check-out', true, sqlerrm);
end $$;

reset role;
select n as "#", case when ok then 'PASS' else 'FAIL' end as result, test, detail from t order by n;
rollback;
