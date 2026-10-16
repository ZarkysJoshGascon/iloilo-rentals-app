-- ============================================================
-- Contract extensions, kept on the contract
--
-- Extending a contract moves its end date and remembers the one it had:
-- contracts.previous_expiry_dates is every end date the contract has had
-- before this one, oldest first. How many times it was extended is the
-- length of that list. No other table.
--
-- extend_contract(p_contract, p_new_expiry) does both in one step, so the
-- old end date can't be lost or added twice; the new date has to be later.
-- Editing the end date by hand (to fix a typo) doesn't count as an extension.
--
-- The owner portal's contract detail returns the list too.
-- Safe to run more than once.
-- ============================================================

begin;

alter table public.contracts
  add column if not exists previous_expiry_dates date[] not null default '{}';

create or replace function public.extend_contract(p_contract uuid, p_new_expiry date)
returns setof public.contracts
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
    update contracts
       set previous_expiry_dates = previous_expiry_dates || expiry_date,
           expiry_date = p_new_expiry
     where id = p_contract
       and expiry_date is not null
       and p_new_expiry > expiry_date
    returning *;

  if not found then
    raise exception 'Pick an end date after the contract''s current one.' using errcode = 'check_violation';
  end if;
end;
$$;

revoke all on function public.extend_contract(uuid, date) from public, anon;
grant execute on function public.extend_contract(uuid, date) to authenticated;

CREATE OR REPLACE FUNCTION public.owner_contract_detail(p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  c     record;
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  select ct.id, ct.contract_code, ct.unit_id, ct.effective_date, ct.expiry_date, ct.superseded_by, ct.previous_expiry_dates,
         u.unit_code, u.building, u.unit_type, u.marketing_title
    into c
  from contracts ct
  join units u on u.id = ct.unit_id
  where ct.id = p_contract_id
    and ct.owner_id in (select id from owners where user_id = v_uid);

  if not found or c.effective_date is null then
    raise exception 'Contract not found' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'contract', jsonb_build_object(
      'id', c.id, 'contract_code', c.contract_code, 'unit_id', c.unit_id,
      'unit_code', c.unit_code, 'building', c.building, 'unit_type', c.unit_type,
      'marketing_title', c.marketing_title,
      'effective_date', c.effective_date, 'expiry_date', c.expiry_date, 'superseded_by', c.superseded_by,
      'previous_expiry_dates', to_jsonb(coalesce(c.previous_expiry_dates, '{}'::date[]))
    ),

    'months', coalesce((
      select jsonb_agg(to_jsonb(cb) order by cb.month) from contract_monthly_breakdown(c.id) cb
    ), '[]'::jsonb),

    -- The same booking details the Accounting page shows (no guest contacts).
    'bookings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', b.id, 'booking_code', b.booking_code, 'guest_name', b.guest_name, 'guests', b.guests,
        'check_in', b.check_in, 'check_out', b.check_out, 'total_amount', b.total_amount,
        'amount_paid', b.amount_paid, 'balance', b.balance, 'payment_status', b.payment_status,
        'booker_name', coalesce(b.booker_name, b.booker_code), 'booker_commission', b.booker_commission,
        'affiliate_name', coalesce(b.affiliate_name, b.affiliate_code), 'affiliate_commission', b.affiliate_commission,
        'cancelled_at', b.cancelled_at, 'cancelled_reason', b.cancelled_reason, 'completed_at', b.completed_at
      ) order by b.check_in)
      from bookings b
      where b.unit_id = c.unit_id and b.deleted_at is null
        and b.check_in >= c.effective_date
        and (c.expiry_date is null or b.check_in <= c.expiry_date)
    ), '[]'::jsonb),

    'cleanings', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cl.id, 'cleaning_code', cl.cleaning_code, 'scheduled_date', cl.scheduled_date,
        'type', cl.type, 'status', cl.status,
        'payment_amount', cl.payment_amount, 'laundry_payment_amount', cl.laundry_payment_amount,
        'booking_code', bk.booking_code, 'guest_name', bk.guest_name
      ) order by cl.scheduled_date)
      from cleanings cl
      left join bookings bk on bk.id = cl.booking_id
      where cl.unit_id = c.unit_id
        and cl.scheduled_date >= c.effective_date
        and (c.expiry_date is null or cl.scheduled_date <= c.expiry_date)
    ), '[]'::jsonb),

    -- Bills and other expenses, each with its receipt (a path in expense-proofs).
    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', e.month,
        'electricity', e.electricity, 'electricity_image', e.electricity_image,
        'internet', e.internet, 'internet_image', e.internet_image,
        'water', e.water, 'water_image', e.water_image,
        'marketing', e.marketing, 'marketing_image', e.marketing_image,
        'custom_items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', it->>'name',
            'amount', case when (it->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$' then (it->>'amount')::numeric else 0 end,
            'image', nullif(it->>'image', '')
          ))
          from jsonb_array_elements(coalesce(e.custom_items, '[]'::jsonb)) it
        ), '[]'::jsonb)
      ) order by e.month)
      from contract_monthly_expenses e
      where e.contract_id = c.id
    ), '[]'::jsonb)
  );
end;
$function$
;

commit;
