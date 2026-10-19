-- ============================================================
-- Faster dashboard and access rules as data grows
--
-- 1. dashboard_analytics_year (the dashboard's yearly chart) filtered with
--    date_trunc(...) on the column, which can't use the date indexes, and
--    worked out occupancy by joining every booking to each of the 12 months.
--    It now filters by plain date ranges (indexes on bookings.check_in,
--    cleanings.scheduled_date) and narrows to the year's bookings once.
--    Same results; measured at 100k bookings it took ~12 s per call before.
--
-- 2. Access rules that call is_admin(), auth.uid() or current_housekeeper_id()
--    ran the call for every row a query touched. Wrapped as (select …) the
--    database runs it once per query (Supabase's own advice; the "Auth RLS
--    initialization plan" warnings). Who can see or change what is unchanged
--    (tests/database/role_access.sql and storage_access.sql check it).
--
-- Safe to run more than once.
-- ============================================================

create or replace function public.dashboard_analytics_year(p_year integer)
returns table(month_key text, month_start date, revenue numeric, expenses numeric, net numeric,
              bookings_count integer, nights_booked integer, nights_available integer, occupancy_pct numeric)
language sql
stable
set search_path to 'public'
as $function$
  with bounds as (
    select make_date(p_year, 1, 1) as y0, make_date(p_year + 1, 1, 1) as y1
  ),
  months as (
    select (make_date(p_year, 1, 1) + (n || ' months')::interval)::date as month_start
    from generate_series(0, 11) as n
  ),
  month_bounds as (
    select m.month_start, (m.month_start + interval '1 month')::date as month_end_excl
    from months m
  ),
  rev as (
    select
      to_char(date_trunc('month', b.check_in), 'YYYY-MM') as mk,
      coalesce(sum(b.total_amount), 0)::numeric as revenue,
      coalesce(sum(coalesce(b.booker_commission,0) + coalesce(b.affiliate_commission,0)), 0)::numeric as commissions,
      count(*)::int as cnt
    from bookings b, bounds
    where b.deleted_at is null
      and b.check_in >= bounds.y0 and b.check_in < bounds.y1
    group by 1
  ),
  clean as (
    select
      to_char(date_trunc('month', c.scheduled_date), 'YYYY-MM') as mk,
      coalesce(sum(coalesce(c.payment_amount,0) + coalesce(c.laundry_payment_amount,0)), 0)::numeric as cleaning_cost
    from cleanings c, bounds
    where c.scheduled_date >= bounds.y0 and c.scheduled_date < bounds.y1
    group by 1
  ),
  manual as (
    select
      to_char(date_trunc('month', e.month), 'YYYY-MM') as mk,
      coalesce(sum(
        coalesce(e.electricity,0) + coalesce(e.internet,0) +
        coalesce(e.water,0) + coalesce(e.marketing,0)
      ), 0)::numeric as manual_total,
      coalesce(sum(
        case when jsonb_typeof(e.custom_items) = 'array' then (
          select coalesce(sum((item->>'amount')::numeric), 0)
          from jsonb_array_elements(e.custom_items) as item
        ) else 0 end
      ), 0)::numeric as custom_total
    from contract_monthly_expenses e, bounds
    where e.month >= bounds.y0 and e.month < bounds.y1
    group by 1
  ),
  -- The bookings that touch this year, found once, then spread over the months.
  year_bookings as (
    select b.check_in, b.check_out
    from bookings b, bounds
    where b.deleted_at is null
      and b.check_in is not null
      and b.check_out is not null
      and b.check_in < bounds.y1
      and b.check_out > bounds.y0
  ),
  nights as (
    select
      to_char(mb.month_start, 'YYYY-MM') as mk,
      coalesce(sum(
        greatest(0, least(yb.check_out, mb.month_end_excl) - greatest(yb.check_in, mb.month_start))
      ), 0)::int as nights_booked
    from month_bounds mb
    left join year_bookings yb
      on yb.check_in < mb.month_end_excl
     and yb.check_out > mb.month_start
    group by 1
  ),
  avail as (
    select
      to_char(mb.month_start, 'YYYY-MM') as mk,
      coalesce(sum(
        greatest(0, least(
          coalesce(c.expiry_date, mb.month_end_excl),
          mb.month_end_excl
        ) - greatest(
          c.effective_date,
          mb.month_start
        ))
      ), 0)::int as nights_available
    from month_bounds mb
    left join contracts c
      on c.effective_date is not null
     and c.effective_date < mb.month_end_excl
     and coalesce(c.expiry_date, mb.month_end_excl) > mb.month_start
    group by 1
  )
  select
    to_char(mb.month_start, 'YYYY-MM') as month_key,
    mb.month_start,
    coalesce(rev.revenue, 0) as revenue,
    coalesce(rev.commissions, 0) + coalesce(clean.cleaning_cost, 0)
      + coalesce(manual.manual_total, 0) + coalesce(manual.custom_total, 0) as expenses,
    coalesce(rev.revenue, 0) - (
      coalesce(rev.commissions, 0) + coalesce(clean.cleaning_cost, 0)
      + coalesce(manual.manual_total, 0) + coalesce(manual.custom_total, 0)
    ) as net,
    coalesce(rev.cnt, 0) as bookings_count,
    coalesce(nights.nights_booked, 0) as nights_booked,
    coalesce(avail.nights_available, 0) as nights_available,
    case
      when coalesce(avail.nights_available, 0) > 0
        then round((coalesce(nights.nights_booked, 0)::numeric / avail.nights_available) * 100, 1)
      else 0
    end as occupancy_pct
  from month_bounds mb
  left join rev    on rev.mk    = to_char(mb.month_start, 'YYYY-MM')
  left join clean  on clean.mk  = to_char(mb.month_start, 'YYYY-MM')
  left join manual on manual.mk = to_char(mb.month_start, 'YYYY-MM')
  left join nights on nights.mk = to_char(mb.month_start, 'YYYY-MM')
  left join avail  on avail.mk  = to_char(mb.month_start, 'YYYY-MM')
  order by mb.month_start asc;
$function$;

-- Access rules: run the "who is this" checks once per query, not per row.
do $$
declare
  p record;
  q text;
  c text;
  wrap constant text[][] := array[
    array['\mis_admin\(\)',              '(SELECT is_admin())'],
    array['\mis_housekeeper\(\)',        '(SELECT is_housekeeper())'],
    array['\mcurrent_housekeeper_id\(\)', '(SELECT current_housekeeper_id())'],
    array['\mauth\.uid\(\)',             '(SELECT auth.uid())']
  ];
  i int;
begin
  for p in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    q := p.qual;
    c := p.with_check;
    for i in 1 .. array_length(wrap, 1) loop
      -- Skip calls already wrapped ("SELECT is_admin()" as written back by Postgres).
      q := regexp_replace(q, '(?<!SELECT )' || wrap[i][1], wrap[i][2], 'g');
      c := regexp_replace(c, '(?<!SELECT )' || wrap[i][1], wrap[i][2], 'g');
    end loop;
    if q is distinct from p.qual then
      execute format('alter policy %I on public.%I using (%s)', p.policyname, p.tablename, q);
    end if;
    if c is distinct from p.with_check then
      execute format('alter policy %I on public.%I with check (%s)', p.policyname, p.tablename, c);
    end if;
  end loop;
end $$;
