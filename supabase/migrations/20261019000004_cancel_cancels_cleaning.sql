-- ============================================================
-- A cancelled booking cancels its cleaning
--
-- trg_booking_cancels_cleaning only ran when a booking was deleted. A
-- booking marked cancelled (cancelled_at) kept its cleaning scheduled, so a
-- housekeeper could be sent to clean after a stay that never happened.
-- Found by supabase/tests/business_rules.sql. Completed cleanings are left
-- alone, as before. Safe to run more than once.
-- ============================================================

create or replace function public.auto_cancel_cleaning_from_booking()
returns trigger
language plpgsql
set search_path to 'public', 'extensions'
as $function$
begin
  if new.deleted_at is null and new.cancelled_at is null then
    return new;
  end if;

  update cleanings cln
  set status = 'cancelled'
  where cln.booking_id = new.id
    and cln.status <> 'completed';

  return new;
end;
$function$;

drop trigger if exists trg_booking_cancels_cleaning on public.bookings;
create trigger trg_booking_cancels_cleaning
  after update of deleted_at, cancelled_at on public.bookings
  for each row execute function public.auto_cancel_cleaning_from_booking();
