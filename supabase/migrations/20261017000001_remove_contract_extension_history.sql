-- ============================================================
-- No contract extension history
--
-- Extending a contract only moves its end date: same contract, nothing else
-- recorded (the audit log still notes who extended it, from and to). The
-- contract_extensions table (from 20261013000000_contract_extensions.sql)
-- never held a row; it goes, and the owner portal's contract detail stops
-- returning an "extensions" list. Renewals (contracts.superseded_by) stay.
--
-- The function below is owner_contract_detail as it was live on 2026-10-17
-- (20261013000004_owner_receipts.sql), minus the extensions list.
-- Safe to run more than once.
-- ============================================================

begin;

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

  select ct.id, ct.contract_code, ct.unit_id, ct.effective_date, ct.expiry_date, ct.superseded_by,
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
      'effective_date', c.effective_date, 'expiry_date', c.expiry_date, 'superseded_by', c.superseded_by
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

drop table if exists public.contract_extensions;

commit;
