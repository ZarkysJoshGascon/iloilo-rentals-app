-- ============================================================
-- Test: security hardening (migration 20261017000005_security_hardening.sql)
--
-- Run:  supabase db query --linked -f tests/database/security_hardening.sql
--
-- Checks the rate limit counts, the confirmed-email rule on account linking,
-- the cleaning photo rules and which functions visitors can call; prints
-- PASS/FAIL and rolls everything back.
-- ============================================================
begin;

create temp table t (n serial, test text, ok boolean, detail text) on commit drop;

-- Rate limit: five recent submissions from one address use up a limit of five.
insert into inquiry_rate_limit (ip_hash) select 'TEST-hash-' || g from generate_series(1, 1) g;
insert into inquiry_rate_limit (ip_hash) select 'TEST-hash-full' from generate_series(1, 5);
insert into t (test, ok, detail)
select 'Rate limit: a fresh address is allowed', check_inquiry_rate_limit('TEST-hash-new', 5, 60) = true, 'allowed';
insert into t (test, ok, detail)
select 'Rate limit: one with 1 of 5 used is allowed', check_inquiry_rate_limit('TEST-hash-1', 5, 60) = true, 'allowed';
insert into t (test, ok, detail)
select 'Rate limit: one with 5 of 5 used is refused', check_inquiry_rate_limit('TEST-hash-full', 5, 60) = false, 'refused';

-- Linking needs a confirmed email.
insert into t (test, ok, detail)
select 'link_staff_on_login checks the email is confirmed',
       pg_get_functiondef('public.link_staff_on_login'::regproc) like '%email_confirmed_at is not null%email_not_confirmed%'
       or pg_get_functiondef('public.link_staff_on_login'::regproc) like '%email_not_confirmed%',
       'email_not_confirmed';
insert into t (test, ok, detail)
select 'link_housekeeper_on_login checks the email is confirmed',
       pg_get_functiondef('public.link_housekeeper_on_login'::regproc) like '%email_confirmed_at is not null%', 'ok';

-- Cleaning photos: only while the cleaning is open.
insert into t (test, ok, detail)
select 'Housekeeper photo rules stop at approval or cancellation',
       count(*) = 2 and bool_and(coalesce(with_check, qual) like '%completed%cancelled%'),
       string_agg(policyname || ' (' || cmd || ')', ', ')
  from pg_policies
 where schemaname = 'storage' and policyname in ('cleaning_photos_housekeeper_insert', 'cleaning_photos_housekeeper_delete');

-- Who can call what.
insert into t (test, ok, detail)
select 'Visitors can''t call staff-only functions',
       not bool_or(has_function_privilege('anon', p.oid, 'execute')),
       string_agg(p.proname, ', ') filter (where has_function_privilege('anon', p.oid, 'execute'))
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('admin_approve_and_pay_cleaning', 'housekeeper_submit_cleaning', 'housekeeper_update_cleaning',
                     'update_laundry_payment', 'link_housekeeper_on_login', 'link_staff_on_login', 'search_profiles',
                     'pm_earnings_bulk', 'team_totals_bulk', 'accounting_analytics_by_year', 'accounting_invariants_check',
                     'contract_monthly_breakdown', 'contracts_lifetime_bulk', 'update_single_condo_status');
insert into t (test, ok, detail)
select 'Signed-in users still can (each checks its caller)',
       bool_and(has_function_privilege('authenticated', p.oid, 'execute')), count(*) || ' functions'
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('admin_approve_and_pay_cleaning', 'housekeeper_submit_cleaning', 'link_staff_on_login', 'contract_monthly_breakdown');
insert into t (test, ok, detail)
select 'Access-rule helpers stay callable', has_function_privilege('anon', 'public.is_admin()', 'execute')
       and has_function_privilege('anon', 'public.current_housekeeper_id()', 'execute'), 'is_admin, current_housekeeper_id';

select n as "#", case when ok then 'PASS' else 'FAIL' end as result, test, detail from t order by n;
rollback;
