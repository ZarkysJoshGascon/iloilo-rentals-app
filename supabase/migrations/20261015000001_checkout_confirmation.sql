-- ============================================================
-- Check-out confirmation and late check-out
--
-- Confirmation: someone in the CRM confirms the guest has actually left
-- ("Guest checked out"). That moment starts the cleaning: the cleaning turns
-- Ready, and Housekeeping counts how long the unit has waited since then.
-- Until it's confirmed on the check-out day, the cleaning waits.
--
-- Late check-out: a guest can stay past 11:00 AM on the check-out day, for
-- as long as they like, unless another guest checks in to the unit that
-- day: then no later than that guest's 3:00 PM check-in. The other way
-- round, a new booking can't check in while a late check-out is still on.
-- The booker updates the booking's total for the extra hours themselves.
--
-- Stay times are Manila time: check-out 11:00, check-in 15:00 (as in the
-- app's STAY_TIMES). Changing a booking's check-out date clears both its
-- late check-out and its confirmation.
--
-- CRM admins only (bookings are admin-only already). Safe to run more than once.
-- ============================================================

alter table public.bookings
  add column if not exists checked_out_at        timestamptz,
  add column if not exists checked_out_by        uuid references auth.users (id) on delete set null,
  add column if not exists checked_out_by_name   text,
  add column if not exists late_checkout_at      timestamptz,
  add column if not exists late_checkout_by_name text;

-- A stay day at a stay time, in Manila.
create or replace function public.stay_moment(p_day date, p_time time)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (p_day + p_time) at time zone 'Asia/Manila';
$$;

-- The signed-in person's name, for "confirmed by" and "set by".
create or replace function public.current_staff_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
           nullif(u.raw_user_meta_data ->> 'full_name', ''),
           nullif(u.raw_user_meta_data ->> 'name', ''),
           split_part(u.email, '@', 1)
         )
    from auth.users u
   where u.id = auth.uid();
$$;
revoke all on function public.current_staff_name() from public, anon;
grant execute on function public.current_staff_name() to authenticated;

-- Keeps a late check-out on its own check-out day, after 11:00, and drops it
-- (and the confirmation) when the check-out date moves.
create or replace function public.bookings_late_checkout_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.check_out is distinct from old.check_out then
    new.late_checkout_at      := null;
    new.late_checkout_by_name := null;
    new.checked_out_at        := null;
    new.checked_out_by        := null;
    new.checked_out_by_name   := null;
  end if;

  if new.late_checkout_at is not null then
    if new.check_out is null then
      raise exception 'Set the check-out date before a late check-out.' using errcode = 'check_violation';
    end if;
    if (new.late_checkout_at at time zone 'Asia/Manila')::date <> new.check_out then
      raise exception 'A late check-out has to be on the check-out day (%). To stay another night, extend the stay instead.', new.check_out
        using errcode = 'check_violation';
    end if;
    if new.late_checkout_at <= public.stay_moment(new.check_out, time '11:00') then
      raise exception 'A late check-out has to be after the usual 11:00 AM.' using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

-- Fires before trg_no_booking_overlap (triggers run in name order), so the
-- overlap check sees a late check-out that a date change has just cleared.
drop trigger if exists bookings_late_checkout_guard on public.bookings;
create trigger bookings_late_checkout_guard
  before insert or update of check_out, late_checkout_at, checked_out_at on public.bookings
  for each row execute function public.bookings_late_checkout_guard();

-- No two stays in a unit at once: overlapping dates as before, and now also
-- a late check-out running into the next guest's check-in on the same day.
create or replace function public.enforce_no_booking_overlap()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
declare
  v_conflict_code text;
  v_conflict_in   date;
  v_conflict_out  date;
  v_late          timestamptz;
begin
  if new.deleted_at is not null
     or new.unit_id is null
     or new.check_in is null
     or new.check_out is null then
    return new;
  end if;

  select b.booking_code, b.check_in, b.check_out
  into v_conflict_code, v_conflict_in, v_conflict_out
  from bookings b
  where b.unit_id = new.unit_id
    and b.deleted_at is null
    and b.id is distinct from new.id
    and b.check_in  < new.check_out
    and b.check_out > new.check_in
  order by b.check_in
  limit 1;

  if v_conflict_code is not null then
    raise exception
      'This unit is already booked from % to % (booking %). Pick different dates.',
      v_conflict_in, v_conflict_out, v_conflict_code
      using errcode = 'check_violation';
  end if;

  -- This guest's late check-out runs into the next guest's 3:00 PM check-in.
  if new.late_checkout_at is not null then
    select b.booking_code into v_conflict_code
    from bookings b
    where b.unit_id = new.unit_id
      and b.deleted_at is null
      and b.id is distinct from new.id
      and b.check_in = new.check_out
      and public.stay_moment(b.check_in, time '15:00') < new.late_checkout_at
    limit 1;

    if v_conflict_code is not null then
      raise exception
        'Booking % checks in at 3:00 PM that day, so the late check-out can be until 3:00 PM at the latest.',
        v_conflict_code
        using errcode = 'check_violation';
    end if;
  end if;

  -- The guest before is still there on a late check-out when this one checks in.
  select b.booking_code, b.late_checkout_at into v_conflict_code, v_late
  from bookings b
  where b.unit_id = new.unit_id
    and b.deleted_at is null
    and b.id is distinct from new.id
    and b.check_out = new.check_in
    and b.late_checkout_at > public.stay_moment(new.check_in, time '15:00')
  limit 1;

  if v_conflict_code is not null then
    raise exception
      'Booking % has a late check-out until % on %. Shorten it or pick another check-in date.',
      v_conflict_code, to_char(v_late at time zone 'Asia/Manila', 'FMHH12:MI AM'), new.check_in
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_no_booking_overlap on public.bookings;
create trigger trg_no_booking_overlap
  before insert or update of unit_id, check_in, check_out, deleted_at, late_checkout_at on public.bookings
  for each row execute function public.enforce_no_booking_overlap();

-- "Guest checked out" (or, with p_confirmed false, undo it). The time and
-- who did it come from the server.
create or replace function public.confirm_checkout(p_booking uuid, p_confirmed boolean default true)
returns setof public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check_in date;
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  select check_in into v_check_in from bookings where id = p_booking and deleted_at is null;
  if not found then
    raise exception 'Booking not found' using errcode = 'P0002';
  end if;
  if p_confirmed and (now() at time zone 'Asia/Manila')::date < v_check_in then
    raise exception 'This stay hasn''t started yet.' using errcode = 'check_violation';
  end if;

  return query
    update bookings
       set checked_out_at      = case when p_confirmed then now() end,
           checked_out_by      = case when p_confirmed then auth.uid() end,
           checked_out_by_name = case when p_confirmed then public.current_staff_name() end
     where id = p_booking
    returning *;
end;
$$;

-- Late check-out until p_until on the check-out day, or back to 11:00 AM
-- with null. The triggers above enforce the limits.
create or replace function public.set_late_checkout(p_booking uuid, p_until timestamptz)
returns setof public.bookings
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
    update bookings
       set late_checkout_at      = p_until,
           late_checkout_by_name = case when p_until is null then null else public.current_staff_name() end
     where id = p_booking
       and deleted_at is null
    returning *;
end;
$$;

revoke all on function public.confirm_checkout(uuid, boolean) from public, anon;
revoke all on function public.set_late_checkout(uuid, timestamptz) from public, anon;
grant execute on function public.confirm_checkout(uuid, boolean) to authenticated;
grant execute on function public.set_late_checkout(uuid, timestamptz) to authenticated;
