-- ============================================================
-- Contract close-out
--
-- Every night at 01:00 Manila the contract-closeout Edge Function:
--   1. Emails the statement of each contract that has ended. If its figures
--      differ from the Accounting page, or the owner has no email address,
--      it isn't sent: it's logged as 'held' for an admin to check and send.
--   2. Keeps every statement emailed (by the job or the CRM button) as an
--      Excel file in the private contract-statements bucket, and in the
--      Google Drive "Contracts" folder once that's set up.
--   3. 30 days after the statement went out, keeps a final copy and deletes
--      the term's bookings and cleanings (and the cleanings' photos), unless
--      something is unfinished: an unpaid booking balance, a cleaning not yet
--      approved, or housekeeping or laundry pay not yet paid. Then it waits
--      and says why (contracts.closeout_note). Receipts and monthly expenses
--      stay. After that, Download Excel gives the final copy.
--
-- Only contracts ending on or after 2026-10-19 take part (the function's
-- CLOSEOUT_FROM); contracts that ended before are left as they were.
--
-- Safe to run more than once.
-- ============================================================

-- 1. Statement log: statements held back, and the kept file ---
alter table contract_statements drop constraint if exists contract_statements_status_check;
alter table contract_statements add constraint contract_statements_status_check
  check (status in ('queued', 'sent', 'failed', 'held'));
alter table contract_statements add column if not exists automatic boolean not null default false;
alter table contract_statements add column if not exists file_path text;   -- in contract-statements
alter table contract_statements add column if not exists drive_url text;

-- 2. Contracts: when the records were cleared, the final copy, and why not yet
alter table contracts add column if not exists records_cleared_at timestamptz;
alter table contracts add column if not exists records_cleared jsonb;          -- {bookings, cleanings, photos}
alter table contracts add column if not exists records_archive_path text;     -- in contract-statements
alter table contracts add column if not exists records_archive_drive_url text;
alter table contracts add column if not exists closeout_note text;

-- 3. Kept statements: private, read and written only by the Edge Functions --
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contract-statements', 'contract-statements', false, 52428800,
        array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- 4. What a close-out covers ------------------------------------
-- The term's bookings by check-in, as the statement counts them (cancelled
-- and removed ones too), and its cleanings by date plus any cleaning of
-- those bookings; and what is still unfinished.
create or replace function public.closeout_scope(p_contract_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  c            record;
  v_bookings   uuid[];
  v_cleanings  uuid[];
begin
  select id, unit_id, effective_date, expiry_date into c from contracts where id = p_contract_id;
  if not found or c.effective_date is null or c.expiry_date is null then
    raise exception 'Contract not found, or it has no end date';
  end if;

  select coalesce(array_agg(id), '{}') into v_bookings
  from bookings
  where unit_id = c.unit_id and check_in between c.effective_date and c.expiry_date;

  select coalesce(array_agg(id), '{}') into v_cleanings
  from cleanings
  where (unit_id = c.unit_id and scheduled_date between c.effective_date and c.expiry_date)
     or booking_id = any (v_bookings);

  return jsonb_build_object(
    'bookings', to_jsonb(v_bookings),
    'cleanings', to_jsonb(v_cleanings),
    'unpaid_bookings', (select count(*) from bookings
      where id = any (v_bookings) and deleted_at is null and cancelled_at is null and coalesce(balance, 0) > 0),
    'open_cleanings', (select count(*) from cleanings
      where id = any (v_cleanings) and status in ('scheduled', 'ready', 'submitted')),
    'unpaid_cleanings', (select count(*) from cleanings
      where id = any (v_cleanings) and status = 'completed'
        and ((coalesce(payment_amount, 0) > 0 and paid_at is null)
          or (coalesce(laundry_payment_amount, 0) > 0 and laundry_paid_at is null)))
  );
end;
$$;

-- 5. The deletion itself, in one transaction -------------------
-- Logged once (a CLOSEOUT entry), not row by row, so it doesn't fill the
-- activity feed. Refuses if anything is unfinished or it already ran.
create or replace function public.closeout_delete_records(p_contract_id uuid, p_archive_path text, p_archive_drive_url text, p_photos integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_scope     jsonb;
  v_bookings  uuid[];
  v_cleanings uuid[];
  n_bookings  integer;
  n_cleanings integer;
  v_code      text;
begin
  if p_archive_path is null or p_archive_path = '' then
    raise exception 'Keep a final copy of the statement first';
  end if;
  if (select records_cleared_at from contracts where id = p_contract_id) is not null then
    raise exception 'This contract''s records were already cleared';
  end if;

  v_scope := public.closeout_scope(p_contract_id);
  if (v_scope ->> 'unpaid_bookings')::int + (v_scope ->> 'open_cleanings')::int + (v_scope ->> 'unpaid_cleanings')::int > 0 then
    raise exception 'Something is unfinished: %', v_scope - 'bookings' - 'cleanings';
  end if;
  select coalesce(array_agg(x::uuid), '{}') into v_bookings from jsonb_array_elements_text(v_scope -> 'bookings') x;
  select coalesce(array_agg(x::uuid), '{}') into v_cleanings from jsonb_array_elements_text(v_scope -> 'cleanings') x;

  perform set_config('app.closeout', 'on', true);
  delete from cleanings where id = any (v_cleanings);
  get diagnostics n_cleanings = row_count;
  delete from bookings where id = any (v_bookings);
  get diagnostics n_bookings = row_count;

  update contracts
  set records_cleared_at = now(),
      records_cleared = jsonb_build_object('bookings', n_bookings, 'cleanings', n_cleanings, 'photos', coalesce(p_photos, 0)),
      records_archive_path = p_archive_path,
      records_archive_drive_url = p_archive_drive_url,
      closeout_note = null
  where id = p_contract_id
  returning contract_code into v_code;

  insert into audit_logs (user_id, action, table_name, record_id, details)
  values (null, 'CLOSEOUT', 'contracts', p_contract_id, jsonb_build_object(
    'label', v_code, 'bookings', n_bookings, 'cleanings', n_cleanings, 'photos', coalesce(p_photos, 0)));

  return jsonb_build_object('bookings', n_bookings, 'cleanings', n_cleanings);
end;
$$;

-- Why a contract's records are still waiting (not logged as an edit).
create or replace function public.closeout_set_note(p_contract_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform set_config('app.closeout', 'on', true);
  update contracts set closeout_note = p_note
  where id = p_contract_id and closeout_note is distinct from p_note;
end;
$$;

revoke all on function public.closeout_scope(uuid) from public, anon, authenticated;
revoke all on function public.closeout_delete_records(uuid, text, text, integer) from public, anon, authenticated;
revoke all on function public.closeout_set_note(uuid, text) from public, anon, authenticated;
grant execute on function public.closeout_scope(uuid) to service_role;
grant execute on function public.closeout_delete_records(uuid, text, text, integer) to service_role;
grant execute on function public.closeout_set_note(uuid, text) to service_role;

-- 6. Rows cleared at close-out aren't logged one by one ----------
CREATE OR REPLACE FUNCTION public.log_row_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_old      jsonb;
  v_new      jsonb;
  v_row      jsonb;
  v_changes  jsonb := '{}'::jsonb;
  v_key      text;
  v_skip     text[] := array['id', 'created_at', 'updated_at', 'user_id', 'commission_count', 'total_bookings'] || tg_argv;
  v_unit     text;
  v_contract text;
  v_details  jsonb;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  -- Rows cleared at a contract's close-out are logged once, as CLOSEOUT.
  if current_setting('app.closeout', true) = 'on' then
    return null;
  end if;

  begin
    if tg_op <> 'INSERT' then v_old := to_jsonb(old); end if;
    if tg_op <> 'DELETE' then v_new := to_jsonb(new); end if;
    v_row := coalesce(v_new, v_old);

    if tg_op = 'UPDATE' then
      for v_key in select jsonb_object_keys(v_new) loop
        continue when v_key = any (v_skip);
        continue when (v_old -> v_key) is not distinct from (v_new -> v_key);
        if jsonb_typeof(v_old -> v_key) in ('object', 'array') or jsonb_typeof(v_new -> v_key) in ('object', 'array') then
          -- Lists (payments, photos, item counts): note the change, not the value.
          v_changes := v_changes || jsonb_build_object(v_key, '{}'::jsonb);
        else
          v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object(
            'from', public.activity_value(v_key, v_old -> v_key),
            'to',   public.activity_value(v_key, v_new -> v_key)));
        end if;
      end loop;
      if v_changes = '{}'::jsonb then
        return null;
      end if;
    end if;

    if v_row ->> 'unit_id' is not null then
      select unit_code into v_unit from units where id = (v_row ->> 'unit_id')::uuid;
    end if;
    if v_row ->> 'contract_id' is not null then
      select contract_code into v_contract from contracts where id = (v_row ->> 'contract_id')::uuid;
    end if;

    v_details := jsonb_strip_nulls(jsonb_build_object(
      'label', coalesce(v_row ->> 'booking_code', v_row ->> 'cleaning_code', v_row ->> 'contract_code',
                        v_row ->> 'pm_contract_code', v_row ->> 'unit_code', v_row ->> 'name',
                        v_row ->> 'client_name', v_row ->> 'owner_name'),
      'guest',    v_row ->> 'guest_name',
      'unit',     v_unit,
      'contract', v_contract,
      'month',    left(v_row ->> 'month', 7),
      'type',     v_row ->> 'type',
      'status',   v_row ->> 'status'
    )) || jsonb_build_object('changes', v_changes);

    insert into audit_logs (user_id, action, table_name, record_id, details)
    values (auth.uid(), tg_op, tg_table_name, (v_row ->> 'id')::uuid, v_details);
  exception when others then
    -- The log must never stop the change itself.
    raise warning 'log_row_change on %: %', tg_table_name, sqlerrm;
  end;
  return null;
end;
$function$;

-- 7. The owner portal knows when a contract's records were cleared
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

  select ct.id, ct.contract_code, ct.unit_id, ct.effective_date, ct.expiry_date, ct.superseded_by, ct.previous_expiry_dates, ct.records_cleared_at,
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
      'previous_expiry_dates', to_jsonb(coalesce(c.previous_expiry_dates, '{}'::date[])),
      'records_cleared_at', c.records_cleared_at
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
$function$;

-- 8. Every night at 01:00 Manila (17:00 UTC) --------------------
-- Same key as the hourly backup (vault secret backup_cron_key).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'contract-closeout-nightly') then
    perform cron.unschedule('contract-closeout-nightly');
  end if;
  if exists (select 1 from vault.secrets where name = 'backup_cron_key') then
    perform cron.schedule(
      'contract-closeout-nightly',
      '0 17 * * *',
      $cmd$
      select net.http_post(
        url := 'https://mlksustamjaxfpolazgw.supabase.co/functions/v1/contract-closeout',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'backup_cron_key')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 300000
      );
      $cmd$
    );
  end if;
end $$;
