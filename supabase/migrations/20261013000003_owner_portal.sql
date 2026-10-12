-- ============================================================
-- Owner portal
--
-- Owners sign in with Google using the email on their owner record and
-- are linked to it (owners.user_id), like team members. They never read
-- the tables directly (those stay admin-only): the functions below check
-- that a contract belongs to the signed-in owner and return only that.
-- Bookings are limited to the contract's own dates, so an owner never sees
-- another owner's stays on the same unit.
--
-- Safe to run more than once.
-- ============================================================

-- Link owners on login, alongside the team roles.
create or replace function public.link_staff_on_login()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid        uuid := auth.uid();
  v_email      text;
  v_avatar     text;
  v_result     jsonb := '{}'::jsonb;
  v_count      int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'no_session');
  end if;

  select lower(email), avatar_url
    into v_email, v_avatar
  from public.profiles
  where id = v_uid;

  if v_email is null then
    return jsonb_build_object('ok', false, 'reason', 'no_profile');
  end if;

  update public.specialists
     set user_id   = coalesce(user_id, v_uid),
         photo_url = case when photo_url is null or photo_url = '' then v_avatar else photo_url end
   where user_id is null and lower(email) = v_email
      or (user_id = v_uid and (photo_url is null or photo_url = ''));
  get diagnostics v_count = row_count;
  if v_count > 0 then v_result := v_result || jsonb_build_object('specialists', v_count); end if;

  update public.affiliates
     set user_id   = coalesce(user_id, v_uid),
         photo_url = case when photo_url is null or photo_url = '' then v_avatar else photo_url end
   where user_id is null and lower(email) = v_email
      or (user_id = v_uid and (photo_url is null or photo_url = ''));
  get diagnostics v_count = row_count;
  if v_count > 0 then v_result := v_result || jsonb_build_object('affiliates', v_count); end if;

  update public.housekeepers
     set user_id   = coalesce(user_id, v_uid),
         photo_url = case when photo_url is null or photo_url = '' then v_avatar else photo_url end
   where user_id is null and lower(email) = v_email
      or (user_id = v_uid and (photo_url is null or photo_url = ''));
  get diagnostics v_count = row_count;
  if v_count > 0 then v_result := v_result || jsonb_build_object('housekeepers', v_count); end if;

  update public.property_managers
     set user_id   = coalesce(user_id, v_uid),
         photo_url = case when photo_url is null or photo_url = '' then v_avatar else photo_url end
   where user_id is null and lower(email) = v_email
      or (user_id = v_uid and (photo_url is null or photo_url = ''));
  get diagnostics v_count = row_count;
  if v_count > 0 then v_result := v_result || jsonb_build_object('property_managers', v_count); end if;

  -- Owners (new): same email match; fills a missing avatar from Google.
  update public.owners
     set user_id    = coalesce(user_id, v_uid),
         avatar_url = case when avatar_url is null or avatar_url = '' then v_avatar else avatar_url end
   where user_id is null and lower(email) = v_email
      or (user_id = v_uid and (avatar_url is null or avatar_url = ''));
  get diagnostics v_count = row_count;
  if v_count > 0 then v_result := v_result || jsonb_build_object('owners', v_count); end if;

  return jsonb_build_object('ok', true, 'linked', v_result);
end;
$function$;

-- Is the signed-in user an owner?
create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (select 1 from owners where user_id = auth.uid());
$$;

-- Everything for the portal's overview: the owner, their contracts (with the
-- unit and how booked it is so far) and every contract's monthly figures.
create or replace function public.owner_portal_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Not signed in' using errcode = '28000';
  end if;

  return jsonb_build_object(
    'owners', coalesce((
      select jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'email', o.email, 'avatar_url', o.avatar_url))
      from owners o where o.user_id = v_uid
    ), '[]'::jsonb),

    'contracts', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.unit_code, x.effective_date)
      from (
        select
          c.id, c.contract_code, c.unit_id, c.effective_date, c.expiry_date, c.superseded_by,
          u.unit_code, u.building, u.unit_type, u.marketing_title,
          -- Nights booked from the start of the term to today (or its end).
          coalesce((
            select sum(greatest(0,
              least(b.check_out, least(coalesce(c.expiry_date, current_date), current_date) + 1)
              - greatest(b.check_in, c.effective_date)))
            from bookings b
            where b.unit_id = c.unit_id and b.deleted_at is null and b.cancelled_at is null
              and b.check_in >= c.effective_date
              and b.check_in <= least(coalesce(c.expiry_date, current_date), current_date)
          ), 0)::int as nights_booked,
          greatest(0, least(coalesce(c.expiry_date, current_date), current_date) - c.effective_date + 1)::int as days_elapsed,
          (
            select count(*) from bookings b
            where b.unit_id = c.unit_id and b.deleted_at is null and b.cancelled_at is null
              and b.check_in > current_date
              and (c.expiry_date is null or b.check_in <= c.expiry_date)
          )::int as upcoming_bookings,
          (
            select min(b.check_in) from bookings b
            where b.unit_id = c.unit_id and b.deleted_at is null and b.cancelled_at is null
              and b.check_in >= current_date
              and (c.expiry_date is null or b.check_in <= c.expiry_date)
          ) as next_check_in
        from contracts c
        join units u on u.id = c.unit_id
        where c.owner_id in (select id from owners where user_id = v_uid)
          and c.effective_date is not null
      ) x
    ), '[]'::jsonb),

    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
        'contract_id', c.id, 'month', cb.month, 'gross', cb.gross,
        'total_expenses', cb.total_expenses, 'net', cb.net,
        'owner_share', cb.owner_share, 'company_share', cb.company_share, 'pm_share', cb.pm_share
      ) order by c.id, cb.month)
      from contracts c
      cross join lateral contract_monthly_breakdown(c.id) cb
      where c.owner_id in (select id from owners where user_id = v_uid)
    ), '[]'::jsonb)
  );
end;
$$;

-- One contract in full, for its owner only: monthly figures, bookings and
-- cleanings within the contract's dates, bills and other expenses, extensions.
create or replace function public.owner_contract_detail(p_contract_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
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

    'expenses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', e.month, 'electricity', e.electricity, 'internet', e.internet,
        'water', e.water, 'marketing', e.marketing,
        'custom_items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'name', it->>'name',
            'amount', case when (it->>'amount') ~ '^-?[0-9]+(\.[0-9]+)?$' then (it->>'amount')::numeric else 0 end
          ))
          from jsonb_array_elements(coalesce(e.custom_items, '[]'::jsonb)) it
        ), '[]'::jsonb)
      ) order by e.month)
      from contract_monthly_expenses e
      where e.contract_id = c.id
    ), '[]'::jsonb),

    'extensions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'previous_expiry', x.previous_expiry, 'new_expiry', x.new_expiry, 'created_at', x.created_at
      ) order by x.created_at)
      from contract_extensions x
      where x.contract_id = c.id
    ), '[]'::jsonb)
  );
end;
$$;

-- Signed-in users only.
revoke all on function public.is_owner() from public, anon;
revoke all on function public.owner_portal_overview() from public, anon;
revoke all on function public.owner_contract_detail(uuid) from public, anon;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.owner_portal_overview() to authenticated;
grant execute on function public.owner_contract_detail(uuid) to authenticated;
