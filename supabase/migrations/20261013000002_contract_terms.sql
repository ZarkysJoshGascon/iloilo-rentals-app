-- ============================================================
-- Several contracts per unit over time (renewals)
--
-- Renewing a contract adds the next term as a new contract on the same
-- unit, so the old one-contract-per-unit rule is replaced by a rule that
-- a unit's terms never overlap. The guard that stops a contract's dates
-- from orphaning bookings and paid cleanings now only looks at activity
-- this contract covered and no other term covers.
--
-- Safe to run more than once.
-- ============================================================

create extension if not exists btree_gist with schema extensions;

alter table contracts drop constraint if exists contracts_unit_id_unique;

-- A unit's terms may not overlap (contracts without a start date are ignored).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contracts_no_overlap') then
    alter table contracts
      add constraint contracts_no_overlap
      exclude using gist (
        unit_id with =,
        daterange(effective_date, coalesce(expiry_date, 'infinity'::date), '[]') with &&
      )
      where (effective_date is not null);
  end if;
end
$$;

create or replace function public.enforce_contract_keeps_activity_covered()
returns trigger
language plpgsql
as $function$
declare
  v_bad_cleanings int;
  v_bad_bookings  int;
begin
  if new.effective_date is not distinct from old.effective_date
     and new.expiry_date is not distinct from old.expiry_date then
    return new;
  end if;

  -- Paid cleanings this contract covered that neither its new dates nor
  -- another term on the unit would cover.
  select count(*) into v_bad_cleanings
  from cleanings cln
  where cln.unit_id = new.unit_id
    and (coalesce(cln.payment_amount, 0) > 0 or coalesce(cln.laundry_payment_amount, 0) > 0)
    and cln.scheduled_date is not null
    and (old.effective_date is null or cln.scheduled_date >= old.effective_date)
    and (old.expiry_date is null or cln.scheduled_date <= old.expiry_date)
    and not (
      cln.scheduled_date >= new.effective_date
      and (new.expiry_date is null or cln.scheduled_date <= new.expiry_date)
    )
    and not exists (
      select 1 from contracts c2
      where c2.unit_id = new.unit_id
        and c2.id <> new.id
        and cln.scheduled_date >= c2.effective_date
        and (c2.expiry_date is null or cln.scheduled_date <= c2.expiry_date)
    );

  -- Same for bookings.
  select count(*) into v_bad_bookings
  from bookings bk
  where bk.unit_id = new.unit_id
    and bk.deleted_at is null
    and bk.check_in is not null
    and (old.effective_date is null or bk.check_in >= old.effective_date)
    and (old.expiry_date is null or bk.check_in <= old.expiry_date)
    and not (
      bk.check_in >= new.effective_date
      and (new.expiry_date is null or bk.check_in <= new.expiry_date)
    )
    and not exists (
      select 1 from contracts c2
      where c2.unit_id = new.unit_id
        and c2.id <> new.id
        and bk.check_in >= c2.effective_date
        and (c2.expiry_date is null or bk.check_in <= c2.expiry_date)
    );

  if v_bad_cleanings > 0 or v_bad_bookings > 0 then
    raise exception
      'Contract change would orphan activity. cleanings=%, bookings=% would fall outside the new range. Fix those rows first.',
      v_bad_cleanings, v_bad_bookings
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;
