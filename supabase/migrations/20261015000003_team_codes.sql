-- ============================================================
-- Team codes: always made by the database, never typed, never changed
--
-- Booking specialists (BS-), affiliates (AF-), housekeepers (HK-) and
-- property managers (PM-) each get a random code like BS-7KQ2MX from
-- generate_staff_code(): six characters from 32 that can't be misread
-- (no 0/O or 1/I). Each table already has a unique constraint on code.
-- From now on:
--   • any code sent with a new team member is ignored and a fresh one is
--     made, drawing again until it's not taken, so the unique constraint
--     never trips;
--   • a code can't be changed afterwards: bookings record the booker's and
--     affiliate's codes, and commissions and payouts follow them.
-- Existing codes, including hand-typed ones like ALJOHN, stay as they are.
--
-- Safe to run more than once.
-- ============================================================

create or replace function public.staff_code_assign()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_prefix text := tg_argv[0];
  v_code   text;
  v_taken  boolean;
begin
  if tg_op = 'UPDATE' then
    if new.code is distinct from old.code then
      raise exception 'Team codes can''t be changed (%): bookings and payouts refer to them.', old.code
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  loop
    v_code := public.generate_staff_code(v_prefix);
    execute format('select exists (select 1 from %I.%I where code = $1)', tg_table_schema, tg_table_name)
      into v_taken using v_code;
    exit when not v_taken;
  end loop;
  new.code := v_code;
  return new;
end;
$$;

drop trigger if exists specialists_code on public.specialists;
create trigger specialists_code
  before insert or update of code on public.specialists
  for each row execute function public.staff_code_assign('BS');

drop trigger if exists affiliates_code on public.affiliates;
create trigger affiliates_code
  before insert or update of code on public.affiliates
  for each row execute function public.staff_code_assign('AF');

drop trigger if exists housekeepers_code on public.housekeepers;
create trigger housekeepers_code
  before insert or update of code on public.housekeepers
  for each row execute function public.staff_code_assign('HK');

drop trigger if exists property_managers_code on public.property_managers;
create trigger property_managers_code
  before insert or update of code on public.property_managers
  for each row execute function public.staff_code_assign('PM');
