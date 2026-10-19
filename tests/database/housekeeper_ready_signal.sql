-- ============================================================
-- Test: the housekeeper sees when a unit is ready to clean
-- (migration 20261015000002_housekeeper_ready_signal.sql)
--
-- Run:  supabase db query --linked -f tests/database/housekeeper_ready_signal.sql
--
-- Makes a throwaway stay that checks out today (and a next guest arriving
-- the same day) in a unit that's free around today, gives its cleaning to
-- a housekeeper with a login, and checks what happens on the cleaning and
-- what each housekeeper can see as the check-out is confirmed, undone and
-- given a late check-out. Everything is rolled back.
-- ============================================================
begin;

create temp table t (n serial, test text, ok boolean, detail text) on commit drop;
grant all on t to authenticated;
grant usage on sequence t_n_seq to authenticated;

create temp table ctx on commit drop as
select u.id as unit, u.unit_code, (now() at time zone 'Asia/Manila')::date as today,
       (select h.id from housekeepers h where h.user_id is not null order by h.code desc limit 1) as hk,
       (select h.user_id from housekeepers h where h.user_id is not null order by h.code desc limit 1) as hk_user,
       (select h.code from housekeepers h where h.user_id is not null order by h.code desc limit 1) as hk_code,
       (select h.user_id from housekeepers h where h.user_id is not null order by h.code asc limit 1) as other_hk_user,
       (select h.code from housekeepers h where h.user_id is not null order by h.code asc limit 1) as other_hk_code
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
  if not exists (select 1 from ctx) then raise exception 'No unit is free around today to test with.'; end if;
  if (select hk from ctx) is null then raise exception 'No housekeeper has a login to test with.'; end if;
end $$;

insert into bookings (guest_name, unit_id, check_in, check_out, total_amount)
select 'TEST Guest A', unit, today - 2, today, 3000 from ctx;
insert into bookings (guest_name, unit_id, check_in, check_out, total_amount)
select 'TEST Guest B', unit, today, today + 2, 3000 from ctx;

create temp table ids on commit drop as
select b.id as a, c.id as cleaning, b.booking_code
  from bookings b join cleanings c on c.booking_id = b.id
 where b.guest_name = 'TEST Guest A' and b.unit_id = (select unit from ctx);
grant all on ids to authenticated;

update cleanings set housekeeper_id = (select hk from ctx) where id = (select cleaning from ids);

insert into t (test, ok, detail)
select 'Before check-out: cleaning waits', status = 'scheduled' and guest_left_at is null
       and checkout_due_at = stay_moment((select today from ctx), time '11:00'),
       cleaning_code || ' in ' || (select unit_code from ctx) || ' for ' || (select hk_code from ctx)
         || ', status ' || status || ', due ' || to_char(checkout_due_at at time zone 'Asia/Manila', 'FMHH12:MI AM')
  from cleanings where id = (select cleaning from ids);

-- ── The admin confirms the check-out ─────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_id::text from admin_users order by user_id limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select confirm_checkout((select a from ids));
reset role;

insert into t (test, ok, detail)
select 'Confirmed: cleaning turns Ready with the time', c.status = 'ready' and c.guest_left_at = b.checked_out_at,
       'status ' || c.status || ', guest left ' || to_char(c.guest_left_at at time zone 'Asia/Manila', 'FMHH12:MI AM')
  from cleanings c join bookings b on b.id = c.booking_id where c.id = (select cleaning from ids);

-- ── What the housekeeper sees ────────────────────────────────
select set_config('request.jwt.claims', json_build_object('sub', (select hk_user::text from ctx), 'role', 'authenticated')::text, true);
set local role authenticated;

insert into t (test, ok, detail)
select 'Housekeeper sees it Ready on their cleaning', status = 'ready' and guest_left_at is not null, 'via their own cleanings'
  from cleanings where id = (select cleaning from ids);

insert into t (test, ok, detail)
select 'Housekeeper gets unit, booking and next arrival',
       d.unit_code = (select unit_code from ctx) and d.booking_code = (select booking_code from ids)
       and d.next_check_in_at = stay_moment((select today from ctx), time '15:00'),
       d.unit_code || coalesce(' · ' || d.building, '') || ', ' || d.booking_code || ', next guest '
         || to_char(d.next_check_in_at at time zone 'Asia/Manila', 'FMHH12:MI AM')
  from housekeeper_cleaning_details() d where d.cleaning_id = (select cleaning from ids);

reset role;
select set_config('request.jwt.claims', json_build_object('sub', (select other_hk_user::text from ctx), 'role', 'authenticated')::text, true);
set local role authenticated;
insert into t (test, ok, detail)
select 'Another housekeeper doesn''t get it', count(*) = 0, (select other_hk_code from ctx) || ' sees ' || count(*) || ' row(s) for it'
  from housekeeper_cleaning_details() d where d.cleaning_id = (select cleaning from ids);
reset role;

select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-000000000001', 'role', 'authenticated')::text, true);
set local role authenticated;
insert into t (test, ok, detail)
select 'Someone who isn''t staff gets nothing', count(*) = 0, count(*) || ' row(s)'
  from housekeeper_cleaning_details();
reset role;

-- ── Undo, then a late check-out ──────────────────────────────
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_id::text from admin_users order by user_id limit 1), 'role', 'authenticated')::text, true);
set local role authenticated;
select confirm_checkout((select a from ids), false);
reset role;
insert into t (test, ok, detail)
select 'Undo: back to waiting', status = 'scheduled' and guest_left_at is null, 'status ' || status
  from cleanings where id = (select cleaning from ids);

set local role authenticated;
select set_late_checkout((select a from ids), stay_moment((select today from ctx), time '13:00'));
reset role;
insert into t (test, ok, detail)
select 'Late check-out: the cleaning''s due time moves', checkout_due_at = stay_moment((select today from ctx), time '13:00'),
       'due ' || to_char(checkout_due_at at time zone 'Asia/Manila', 'FMHH12:MI AM')
  from cleanings where id = (select cleaning from ids);

select n as "#", case when ok then 'PASS' else 'FAIL' end as result, test, detail from t order by n;
rollback;
