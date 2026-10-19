-- ============================================================
-- Test: the booking, cleaning and contract rules hold, and the stored
-- figures add up (production readiness, 2026-10-19)
--
-- Run:  supabase db query --linked -f tests/database/business_rules.sql
--
-- As a CRM admin: books a free week on a unit under contract, tries a
-- double booking, cancels, books again, tries to delete a contract and to
-- book outside any contract. Then checks every saved booking's balance and
-- commissions. Everything is rolled back.
-- ============================================================
begin;

create temp table t (n serial, test text, ok boolean, detail text) on commit drop;
grant all on t to authenticated;
grant usage on sequence t_n_seq to authenticated;

-- A unit whose current contract runs at least 120 more days, and a free
-- 3-night stay starting after its last booking.
create temp table ctx on commit drop as
with c as (
  select c.id as contract_id, c.unit_id, c.expiry_date
    from contracts c
   where c.effective_date <= current_date and c.expiry_date >= current_date + 120
     and c.superseded_by is null
   order by c.expiry_date desc
   limit 1
)
select c.contract_id, c.unit_id, c.expiry_date,
       greatest(current_date + 30,
                coalesce((select max(check_out) from bookings b where b.unit_id = c.unit_id and b.deleted_at is null), current_date) + 10) as d1,
       (select user_id from admin_users order by user_id limit 1) as admin_uid,
       null::uuid as booking_a
  from c;
grant all on ctx to authenticated;

insert into t (test, ok, detail)
select 'Found a unit under contract with free dates', count(*) = 1 and bool_and(d1 + 4 < expiry_date),
       coalesce(string_agg('unit ' || unit_id || ', stay from ' || d1, ''), 'none found') from ctx;

select set_config('request.jwt.claims', json_build_object('sub', (select admin_uid::text from ctx), 'role', 'authenticated')::text, true);
set local role authenticated;

-- 1. A booking creates its cleaning.
insert into bookings (unit_id, guest_name, guest_email, check_in, check_out, total_amount, booking_code)
select unit_id, 'Rules Test Guest', 'rules-test@example.com', d1, d1 + 3, 6000, 'BK-RULETEST' from ctx;
update ctx set booking_a = (select id from bookings where booking_code = 'BK-RULETEST');
insert into t (test, ok, detail)
select 'New booking gets a cleaning', count(*) = 1, count(*) || ' cleaning(s), scheduled ' || string_agg(scheduled_date::text, ', ')
  from cleanings where booking_id = (select booking_a from ctx);
insert into t (test, ok, detail)
select 'Balance starts at the total', balance = 6000 and coalesce(amount_paid, 0) = 0, 'balance ' || balance
  from bookings where id = (select booking_a from ctx);

-- 2. Double booking is refused.
do $$ begin
  insert into bookings (unit_id, guest_name, check_in, check_out, total_amount, booking_code)
  select unit_id, 'Overlap Guest', d1 + 1, d1 + 4, 1000, 'BK-RULEOVER' from ctx;
  insert into t (test, ok, detail) values ('Double booking is refused', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Double booking is refused', true, sqlerrm);
end $$;

-- 3. Cancelling frees the dates and cancels its cleaning.
update bookings set cancelled_at = now(), cancelled_reason = 'Rules test' where id = (select booking_a from ctx);
insert into t (test, ok, detail)
select 'Cancelling cancels its cleaning', bool_and(status = 'cancelled'), string_agg(status, ', ')
  from cleanings where booking_id = (select booking_a from ctx);
do $$ begin
  insert into bookings (unit_id, guest_name, check_in, check_out, total_amount, booking_code)
  select unit_id, 'After Cancel Guest', d1 + 1, d1 + 4, 1000, 'BK-RULEAFTR' from ctx;
  insert into t (test, ok, detail) values ('Cancelled dates can be booked again', true, 'booked');
exception when others then
  insert into t (test, ok, detail) values ('Cancelled dates can be booked again', false, sqlerrm);
end $$;

-- 4. No booking outside a contract.
do $$ begin
  insert into bookings (unit_id, guest_name, check_in, check_out, total_amount, booking_code)
  select unit_id, 'No Contract Guest', expiry_date + 400, expiry_date + 402, 1000, 'BK-RULENOCT' from ctx;
  insert into t (test, ok, detail) values ('Booking outside any contract is refused', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Booking outside any contract is refused', true, sqlerrm);
end $$;

-- 5. Contracts can't be deleted.
do $$ begin
  delete from contracts where id = (select contract_id from ctx);
  if found then
    insert into t (test, ok, detail) values ('Contracts can''t be deleted', false, 'was deleted');
  else
    insert into t (test, ok, detail) values ('Contracts can''t be deleted', true, 'nothing deleted');
  end if;
exception when others then
  insert into t (test, ok, detail) values ('Contracts can''t be deleted', true, sqlerrm);
end $$;

reset role;

-- 6. Every saved booking's figures add up.
insert into t (test, ok, detail)
select 'Balance = total − paid on every booking', count(*) = 0,
       coalesce(string_agg(booking_code || ': ' || total_amount || ' − ' || coalesce(amount_paid, 0) || ' ≠ ' || balance, '; '), 'all match')
  from bookings
 where deleted_at is null and booking_code not like 'BK-RULE%'
   and abs(coalesce(balance, 0) - (coalesce(total_amount, 0) - coalesce(amount_paid, 0))) > 0.009;
insert into t (test, ok, detail)
select 'Booker commission = total × rate', count(*) = 0,
       coalesce(string_agg(booking_code || ': ' || booker_commission || ' vs ' || round(total_amount * booker_rate / 100, 2), '; '), 'all match')
  from bookings
 where deleted_at is null and booker_code is not null and booker_rate is not null
   and abs(coalesce(booker_commission, 0) - round(total_amount * booker_rate / 100, 2)) > 0.009;
insert into t (test, ok, detail)
select 'Affiliate commission = total × rate', count(*) = 0,
       coalesce(string_agg(booking_code || ': ' || affiliate_commission || ' vs ' || round(total_amount * affiliate_rate / 100, 2), '; '), 'all match')
  from bookings
 where deleted_at is null and affiliate_code is not null and affiliate_rate is not null
   and abs(coalesce(affiliate_commission, 0) - round(total_amount * affiliate_rate / 100, 2)) > 0.009;
insert into t (test, ok, detail)
select 'Amount paid = sum of payments', count(*) = 0,
       coalesce(string_agg(booking_code || ': paid ' || coalesce(amount_paid, 0) || ', payments ' || s, '; '), 'all match')
  from (select booking_code, amount_paid,
               coalesce((select sum((x ->> 'amount')::numeric) from jsonb_array_elements(case when jsonb_typeof(transactions) = 'array' then transactions else '[]'::jsonb end) x), 0) as s
          from bookings where deleted_at is null) b
 where abs(coalesce(amount_paid, 0) - s) > 0.009;
insert into t (test, ok, detail)
select 'Every booking and cleaning has a code', count(*) = 0, count(*) || ' missing'
  from (select id from bookings where booking_code is null
        union all select id from cleanings where cleaning_code is null) x;

select n as "#", case when ok then 'PASS' else 'FAIL' end as result, test, detail from t order by n;
rollback;
