-- ============================================================
-- Test: the money adds up the same everywhere
-- (production readiness, 2026-10-19)
--
-- Run:  supabase db query --linked -f tests/database/money_reconciliation.sql
--
-- For every contract and month, recomputes the statement the way the
-- Accounting page does (computeMonthlyStatement in src/lib/domain/accounting.ts)
-- and compares it with contract_monthly_breakdown(), which the owner portal
-- and statement emails use. Then checks the dashboard's yearly revenue
-- against the bookings themselves. Reads only.
-- ============================================================
begin;

create temp table t (n serial, test text, ok boolean, detail text) on commit drop;

-- What the owner portal shows, per contract and month.
create temp table db on commit drop as
select c.id as contract_id, c.contract_code, c.unit_id, c.effective_date, c.expiry_date, b.*
  from contracts c
  cross join lateral contract_monthly_breakdown(c.id) b;

-- The Accounting page's formula: the unit's (non-deleted) bookings by
-- check-in month inside the contract, its cleanings by scheduled date, and
-- the contract's own expenses for that month.
create temp table js on commit drop as
select d.contract_id, d.month,
  coalesce(bk.gross, 0) as gross, coalesce(bk.booking_comm, 0) as booking_comm, coalesce(bk.affiliate_comm, 0) as affiliate_comm,
  coalesce(cl.housekeeping, 0) as housekeeping, coalesce(cl.laundry, 0) as laundry,
  coalesce(e.electricity, 0) as electricity, coalesce(e.internet, 0) as internet,
  coalesce(e.water, 0) as water, coalesce(e.marketing, 0) as marketing,
  coalesce((select sum(coalesce((x ->> 'amount')::numeric, 0))
              from jsonb_array_elements(case when jsonb_typeof(e.custom_items) = 'array' then e.custom_items else '[]'::jsonb end) x
             where jsonb_typeof(x) = 'object' and coalesce(x ->> 'name', '') <> ''), 0) as custom_total
  from db d
  left join lateral (
    select sum(b.total_amount) as gross, sum(coalesce(b.booker_commission, 0)) as booking_comm, sum(coalesce(b.affiliate_commission, 0)) as affiliate_comm
      from bookings b
     where b.unit_id = d.unit_id and b.deleted_at is null
       and date_trunc('month', b.check_in)::date = d.month
       and b.check_in >= d.effective_date and (d.expiry_date is null or b.check_in <= d.expiry_date)
  ) bk on true
  left join lateral (
    select sum(coalesce(c.payment_amount, 0)) as housekeeping, sum(coalesce(c.laundry_payment_amount, 0)) as laundry
      from cleanings c
     where c.unit_id = d.unit_id
       and date_trunc('month', c.scheduled_date)::date = d.month
       and c.scheduled_date >= d.effective_date and (d.expiry_date is null or c.scheduled_date <= d.expiry_date)
  ) cl on true
  left join contract_monthly_expenses e on e.contract_id = d.contract_id and date_trunc('month', e.month)::date = d.month;

-- Field by field. 1 centavo of rounding is allowed.
insert into t (test, ok, detail)
select 'Contract-months compared', count(*) > 0, count(*) || ' contract-months across ' || count(distinct contract_id) || ' contracts' from db;

insert into t (test, ok, detail)
select 'Gross revenue matches', count(*) = 0, coalesce(string_agg(db.contract_code || ' ' || to_char(db.month, 'Mon YYYY') || ': portal ' || db.gross || ' vs accounting ' || js.gross, '; '), 'all match')
  from db join js using (contract_id, month) where abs(db.gross - js.gross) > 0.01;
insert into t (test, ok, detail)
select 'Commissions match', count(*) = 0, coalesce(string_agg(db.contract_code || ' ' || to_char(db.month, 'Mon YYYY'), '; '), 'all match')
  from db join js using (contract_id, month)
 where abs(db.booking_comm - js.booking_comm) > 0.01 or abs(db.affiliate_comm - js.affiliate_comm) > 0.01;
insert into t (test, ok, detail)
select 'Housekeeping and laundry match', count(*) = 0, coalesce(string_agg(db.contract_code || ' ' || to_char(db.month, 'Mon YYYY') || ': portal ' || db.housekeeping || '+' || db.laundry || ' vs accounting ' || js.housekeeping || '+' || js.laundry, '; '), 'all match')
  from db join js using (contract_id, month)
 where abs(db.housekeeping - js.housekeeping) > 0.01 or abs(db.laundry - js.laundry) > 0.01;
insert into t (test, ok, detail)
select 'Bills and other expenses match', count(*) = 0, coalesce(string_agg(db.contract_code || ' ' || to_char(db.month, 'Mon YYYY'), '; '), 'all match')
  from db join js using (contract_id, month)
 where abs(db.electricity - js.electricity) > 0.01 or abs(db.internet - js.internet) > 0.01
    or abs(db.water - js.water) > 0.01 or abs(db.marketing - js.marketing) > 0.01
    or abs(db.custom_total - js.custom_total) > 0.01;
insert into t (test, ok, detail)
select 'Net profit = revenue − all expenses', count(*) = 0, coalesce(string_agg(contract_code || ' ' || to_char(month, 'Mon YYYY') || ': net ' || net, '; '), 'all consistent')
  from db
 where abs(net - (gross - (booking_comm + affiliate_comm + housekeeping + laundry + electricity + internet + water + marketing + custom_total))) > 0.01
    or abs(total_expenses - (booking_comm + affiliate_comm + housekeeping + laundry + electricity + internet + water + marketing + custom_total)) > 0.01;
insert into t (test, ok, detail)
select 'Owner 75% / company 25% split', count(*) = 0, coalesce(string_agg(contract_code || ' ' || to_char(month, 'Mon YYYY') || ': owner ' || owner_share || ', company ' || company_share || ', net ' || net, '; '), 'all consistent')
  from db
 where coalesce(pm_share, 0) = 0
   and (abs(owner_share - round(net * 0.75, 2)) > 0.01 or abs(company_share - round(net * 0.25, 2)) > 0.01);
insert into t (test, ok, detail)
select 'Months with a property manager split fully', count(*) = 0, coalesce(string_agg(contract_code || ' ' || to_char(month, 'Mon YYYY'), '; '), 'none or all consistent')
  from db
 where coalesce(pm_share, 0) <> 0 and abs((owner_share + company_share + pm_share) - net) > 0.02;

-- The dashboard's yearly chart against the bookings themselves.
insert into t (test, ok, detail)
select 'Dashboard revenue by month matches bookings', count(*) = 0,
       coalesce(string_agg(to_char(a.month_start, 'Mon YYYY') || ': chart ' || a.revenue || ' vs bookings ' || coalesce(s.rev, 0), '; '), 'all months match')
  from (select * from dashboard_analytics_year(extract(year from current_date)::int)
        union all select * from dashboard_analytics_year(extract(year from current_date)::int - 1)) a
  left join (select date_trunc('month', check_in)::date m, sum(total_amount) rev
               from bookings where deleted_at is null group by 1) s on s.m = a.month_start::date
 where abs(coalesce(a.revenue, 0) - coalesce(s.rev, 0)) > 0.01;

select n as "#", case when ok then 'PASS' else 'FAIL' end as result, test, detail from t order by n;
rollback;
