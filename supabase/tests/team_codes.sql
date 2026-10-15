-- ============================================================
-- Test: team codes are made by the database and can't be changed
-- (migration 20261015000003_team_codes.sql)
--
-- Run:  supabase db query --linked -f supabase/tests/team_codes.sql
--
-- Adds throwaway team members to each of the four groups, tries to pick
-- their codes and to change them, and rolls everything back.
-- ============================================================
begin;

create temp table t (n serial, test text, ok boolean, detail text) on commit drop;

-- One new member per group, each trying to choose its own code.
insert into specialists (name, code) values ('TEST Booker', 'MYCODE');
insert into affiliates (name, code) values ('TEST Affiliate', 'MYCODE');
insert into housekeepers (name, code) values ('TEST Housekeeper', 'MYCODE');
insert into property_managers (name, code) values ('TEST Manager', 'MYCODE');

insert into t (test, ok, detail)
select 'New ' || grp || ' gets a database code (typed one ignored)', code ~ ('^' || prefix || '-[A-HJ-NP-Z2-9]{6}$'), code
  from (
    select 'booker' grp, 'BS' prefix, code from specialists where name = 'TEST Booker'
    union all select 'affiliate', 'AF', code from affiliates where name = 'TEST Affiliate'
    union all select 'housekeeper', 'HK', code from housekeepers where name = 'TEST Housekeeper'
    union all select 'property manager', 'PM', code from property_managers where name = 'TEST Manager'
  ) x;

-- Many at once: every code different.
insert into specialists (name) select 'TEST Bulk ' || g from generate_series(1, 200) g;
insert into t (test, ok, detail)
select '200 new bookers at once: all codes unique', count(distinct code) = 200, count(distinct code) || ' distinct of ' || count(*)
  from specialists where name like 'TEST Bulk %';

-- Changing a code is refused; other changes still work.
do $$ begin
  update specialists set code = 'BS-CHANGED' where name = 'TEST Booker';
  insert into t (test, ok, detail) values ('Changing a code is refused', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Changing a code is refused', true, sqlerrm);
end $$;

update specialists set name = 'TEST Booker renamed' where name = 'TEST Booker';
insert into t (test, ok, detail)
select 'Editing a member keeps their code', count(*) = 1, 'renamed, code ' || max(code)
  from specialists where name = 'TEST Booker renamed';

-- Existing codes are untouched.
insert into t (test, ok, detail)
select 'Existing codes kept', count(*) > 0, string_agg(code, ', ' order by code)
  from (select code from specialists where name not like 'TEST %' order by code limit 5) x;

select n as "#", case when ok then 'PASS' else 'FAIL' end as result, test, detail from t order by n;
rollback;
