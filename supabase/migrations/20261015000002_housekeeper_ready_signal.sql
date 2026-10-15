-- ============================================================
-- Housekeepers see when a unit is ready to clean
--
-- When someone in the CRM confirms a guest has checked out, that unit's
-- cleaning turns Ready and the housekeeper's page (/housekeeping) shows it
-- straight away. Housekeepers can only read their own cleanings (not
-- bookings or units), so:
--   • each cleaning carries its guest's check-out, copied from the booking:
--     guest_left_at (the confirmed check-out) and checkout_due_at (11:00 AM
--     on the check-out day, or the late check-out). It's copied whenever the
--     cleaning is saved and whenever the booking's check-out changes, and
--     that update is what reaches the housekeeper's page live.
--   • housekeeper_cleaning_details() gives a housekeeper, for their own
--     cleanings only, the unit and building, the booking code and dates,
--     and when the next guest checks in. No guest names or contact details.
-- A cleaning's status follows the CRM's rule: Ready once the check-out is
-- confirmed or the check-out day is over (until now: from the check-out day).
--
-- Safe to run more than once.
-- ============================================================

alter table public.cleanings
  add column if not exists guest_left_at   timestamptz,
  add column if not exists checkout_due_at timestamptz;

-- Ready once someone confirms the guest left, or their check-out day is over.
create or replace function public.compute_cleaning_status(
  p_status text, p_type text, p_booking_id uuid, p_check_out date, p_guest_left_at timestamptz)
returns text
language plpgsql
stable
set search_path = public, extensions
as $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
begin
  if p_status in ('submitted', 'completed', 'cancelled') then
    return p_status;
  end if;
  if p_booking_id is null or p_check_out is null then
    return 'ready';  -- a cleaning with no stay before it (e.g. a standalone deep clean)
  end if;
  if p_guest_left_at is not null or p_check_out < v_today then
    return 'ready';
  end if;
  return 'scheduled';
end;
$$;

-- Copies the booking's check-out onto the cleaning, then sets its status.
create or replace function public.cleanings_auto_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_check_out date;
  v_left      timestamptz;
  v_late      timestamptz;
begin
  if new.booking_id is not null then
    select check_out, checked_out_at, late_checkout_at
      into v_check_out, v_left, v_late
      from public.bookings
     where id = new.booking_id;
  end if;

  new.guest_left_at   := v_left;
  new.checkout_due_at := case
    when v_check_out is null then null
    else coalesce(v_late, public.stay_moment(v_check_out, time '11:00'))
  end;

  if new.status in ('submitted', 'completed', 'cancelled') then
    return new;  -- set by hand or by the review; never changed here
  end if;

  new.status := public.compute_cleaning_status(new.status, new.type, new.booking_id, v_check_out, v_left);
  return new;
end;
$$;

-- The old four-argument version had no other callers.
drop function if exists public.compute_cleaning_status(text, text, uuid, date);

-- A check-out confirmed (or undone), a late check-out, or a new check-out
-- date: re-save the booking's cleanings so they pick it up. Housekeepers
-- get that as a live update.
create or replace function public.bookings_touch_cleanings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.cleanings
     set updated_at = now()
   where booking_id = new.id
     and (guest_left_at is distinct from new.checked_out_at
          or checkout_due_at is distinct from coalesce(new.late_checkout_at, public.stay_moment(new.check_out, time '11:00')));
  return null;
end;
$$;

drop trigger if exists bookings_touch_cleanings on public.bookings;
create trigger bookings_touch_cleanings
  after update of check_out, checked_out_at, late_checkout_at on public.bookings
  for each row execute function public.bookings_touch_cleanings();

-- For the housekeeper's page: what they need to know about each of their
-- own cleanings, and nothing about the guest themselves.
create or replace function public.housekeeper_cleaning_details()
returns table (
  cleaning_id      uuid,
  unit_code        text,
  building         text,
  booking_code     text,
  check_in         date,
  check_out        date,
  next_check_in_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id,
         u.unit_code,
         u.building,
         b.booking_code,
         b.check_in,
         b.check_out,
         (select public.stay_moment(n.check_in, time '15:00')
            from public.bookings n
           where n.unit_id = c.unit_id
             and n.deleted_at is null
             and n.id is distinct from c.booking_id
             and n.check_in >= coalesce(b.check_out, c.scheduled_date)
           order by n.check_in
           limit 1)
    from public.cleanings c
    left join public.units u on u.id = c.unit_id
    left join public.bookings b on b.id = c.booking_id
   where c.housekeeper_id = public.current_housekeeper_id();
$$;

revoke all on function public.housekeeper_cleaning_details() from public, anon;
grant execute on function public.housekeeper_cleaning_details() to authenticated;

-- Fill in the cleanings that are still to do.
update public.cleanings
   set updated_at = updated_at
 where status in ('scheduled', 'ready');
