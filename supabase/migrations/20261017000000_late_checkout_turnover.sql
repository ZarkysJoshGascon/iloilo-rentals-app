-- ============================================================
-- Late check-out before a same-day arrival: until 1:00 PM
--
-- When another guest checks in to the unit on the check-out day (3:00 PM),
-- a late check-out can run until 1:00 PM at the latest, which leaves
-- housekeeping two hours to clean. With nobody arriving that day it can
-- still run as late as the guest likes on the check-out day. The other way
-- round, a booking can't check in on a day when the guest before has a late
-- check-out past 1:00 PM.
--
-- Also:
--   • One update can move the check-out date and set a late check-out on
--     the new last day together (more nights and more hours at once). A
--     date change still drops a late check-out that the same update doesn't
--     set again, and always clears the check-out confirmation.
--   • Whoever sets a late check-out is recorded, however it's saved.
--   • Cancelled bookings no longer hold their dates: they don't block other
--     bookings, extensions or late check-outs (in the trigger and in the
--     no_overlapping_bookings constraint). Un-cancelling one checks it
--     again.
--
-- Replaces the two functions from 20261015000001_checkout_confirmation.sql.
-- Safe to run more than once.
-- ============================================================

create or replace function public.bookings_late_checkout_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.check_out is distinct from old.check_out then
    -- A late check-out on the old last day doesn't carry over, unless this
    -- same update sets one for the new last day.
    if new.late_checkout_at is not distinct from old.late_checkout_at then
      new.late_checkout_at      := null;
      new.late_checkout_by_name := null;
    end if;
    new.checked_out_at      := null;
    new.checked_out_by      := null;
    new.checked_out_by_name := null;
  end if;

  if new.late_checkout_at is null then
    new.late_checkout_by_name := null;
    return new;
  end if;

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

  -- Who set it: the signed-in staff member (none for server jobs).
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      new.late_checkout_by_name := coalesce(public.current_staff_name(), new.late_checkout_by_name);
    elsif new.late_checkout_at is distinct from old.late_checkout_at then
      new.late_checkout_by_name := coalesce(public.current_staff_name(), new.late_checkout_by_name);
    end if;
  end if;

  return new;
end;
$$;

-- No two stays in a unit at once: overlapping dates, a late check-out
-- running past 1:00 PM on a day the next guest arrives, or a check-in on a
-- day the guest before stays past 1:00 PM. Cancelled bookings don't count.
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
     or new.cancelled_at is not null
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
    and b.cancelled_at is null
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

  -- This guest's late check-out runs past 1:00 PM on a day the next guest
  -- checks in.
  if new.late_checkout_at is not null then
    select b.booking_code into v_conflict_code
    from bookings b
    where b.unit_id = new.unit_id
      and b.deleted_at is null
      and b.cancelled_at is null
      and b.id is distinct from new.id
      and b.check_in = new.check_out
      and public.stay_moment(b.check_in, time '13:00') < new.late_checkout_at
    limit 1;

    if v_conflict_code is not null then
      raise exception
        'Booking % checks in at 3:00 PM that day, so the late check-out can be until 1:00 PM at the latest (housekeeping needs two hours to clean).',
        v_conflict_code
        using errcode = 'check_violation';
    end if;
  end if;

  -- The guest before stays past 1:00 PM on the day this one checks in.
  select b.booking_code, b.late_checkout_at into v_conflict_code, v_late
  from bookings b
  where b.unit_id = new.unit_id
    and b.deleted_at is null
    and b.cancelled_at is null
    and b.id is distinct from new.id
    and b.check_out = new.check_in
    and b.late_checkout_at > public.stay_moment(new.check_in, time '13:00')
  limit 1;

  if v_conflict_code is not null then
    raise exception
      'Booking % has a late check-out until % on %. A guest checking in that day needs it to end by 1:00 PM, so shorten it or pick another check-in date.',
      v_conflict_code, to_char(v_late at time zone 'Asia/Manila', 'FMHH12:MI AM'), new.check_in
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

-- Now also when a booking is cancelled or un-cancelled.
drop trigger if exists trg_no_booking_overlap on public.bookings;
create trigger trg_no_booking_overlap
  before insert or update of unit_id, check_in, check_out, deleted_at, cancelled_at, late_checkout_at on public.bookings
  for each row execute function public.enforce_no_booking_overlap();

-- The table's own backstop against overlapping dates (made outside these
-- migrations) skips cancelled bookings too. It only gets less strict, so
-- every existing row still fits.
alter table public.bookings drop constraint if exists no_overlapping_bookings;
alter table public.bookings add constraint no_overlapping_bookings
  exclude using gist (unit_id with =, daterange(check_in, check_out, '[)') with &&)
  where (deleted_at is null and cancelled_at is null);
