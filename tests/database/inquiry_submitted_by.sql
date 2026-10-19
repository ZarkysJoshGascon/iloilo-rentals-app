-- ============================================================
-- Test: inquiries remember who sent them (migration 20261019000000_inquiry_submitted_by.sql)
--
-- Run:  supabase db query --linked -f tests/database/inquiry_submitted_by.sql
--
-- Checks both inquiry tables have submitted_by pointing at the account,
-- that deleting the account keeps the inquiry, and that the per-account
-- limit counts work; prints PASS/FAIL and rolls everything back.
-- ============================================================
begin;

create temp table t (n serial, test text, ok boolean, detail text) on commit drop;

insert into t (test, ok, detail)
select 'Both inquiry tables have submitted_by (uuid)',
       count(*) = 2 and bool_and(data_type = 'uuid'),
       string_agg(table_name, ', ')
  from information_schema.columns
 where table_schema = 'public'
   and table_name in ('property_inquiries', 'interior_design_inquiries')
   and column_name = 'submitted_by';

insert into t (test, ok, detail)
select 'submitted_by points at the account and clears when it is deleted',
       count(*) = 2 and bool_and(confdeltype = 'n'),
       string_agg(conrelid::regclass::text, ', ')
  from pg_constraint
 where contype = 'f'
   and confrelid = 'auth.users'::regclass
   and conrelid in ('public.property_inquiries'::regclass, 'public.interior_design_inquiries'::regclass)
   and conkey = array[(select attnum from pg_attribute where attrelid = conrelid and attname = 'submitted_by')];

-- A test account sends one inquiry of each kind, then the account is deleted.
insert into auth.users (id, email, aud, role, raw_app_meta_data, created_at)
values ('00000000-0000-0000-0000-00000000e5e5', 'test-submitter@example.com', 'authenticated', 'authenticated', '{"provider":"google"}', now());

insert into property_inquiries (owner_name, owner_email, inquiry_type, message, images, submitted_by)
values ('TEST owner', 'test-submitter@example.com', 'manage', 'TEST message long enough', '[]', '00000000-0000-0000-0000-00000000e5e5');
insert into interior_design_inquiries (client_name, client_email, message, images, submitted_by)
values ('TEST client', 'test-submitter@example.com', 'TEST message long enough', '[]', '00000000-0000-0000-0000-00000000e5e5');

insert into t (test, ok, detail)
select 'Inquiries save the account that sent them',
       (select count(*) from property_inquiries where submitted_by = '00000000-0000-0000-0000-00000000e5e5') = 1
       and (select count(*) from interior_design_inquiries where submitted_by = '00000000-0000-0000-0000-00000000e5e5') = 1,
       'one of each';

delete from auth.users where id = '00000000-0000-0000-0000-00000000e5e5';

insert into t (test, ok, detail)
select 'Deleting the account keeps its inquiries',
       (select count(*) from property_inquiries where owner_name = 'TEST owner' and submitted_by is null) = 1
       and (select count(*) from interior_design_inquiries where client_name = 'TEST client' and submitted_by is null) = 1,
       'kept, sender cleared';

-- The per-account limit (5 a day) uses the same counter as the per-IP one.
insert into inquiry_rate_limit (ip_hash) select 'TEST-account-full' from generate_series(1, 5);
insert into t (test, ok, detail)
select 'Account limit: 5 of 5 in a day is refused', check_inquiry_rate_limit('TEST-account-full', 5, 1440) = false, 'refused';
insert into t (test, ok, detail)
select 'Account limit: a new account is allowed', check_inquiry_rate_limit('TEST-account-new', 5, 1440) = true, 'allowed';

insert into t (test, ok, detail)
select 'Signed-in visitors still cannot read inquiries',
       not exists (
         select 1 from pg_policies
          where tablename in ('property_inquiries', 'interior_design_inquiries')
            and cmd in ('SELECT', 'ALL')
            and coalesce(qual, '') not like '%admin_users%'
       ),
       'admin only';

select n, case when ok then 'PASS' else 'FAIL' end as result, test, detail from t order by n;

rollback;
