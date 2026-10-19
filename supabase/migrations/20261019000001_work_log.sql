-- Work done today: every add, edit and delete on the CRM's main tables is
-- written to audit_logs by a trigger, so the dashboard can list the day's work
-- (who changed which field, from what to what) without each page having to
-- remember to log it. Dropdowns, forms, housekeeper submissions and website
-- inquiries all land here.
--
-- Rows get the SQL verb as their action ('INSERT', 'UPDATE', 'DELETE'), which
-- keeps them apart from the named entries the pages write through log_audit().
-- Changes made by another trigger (a booking moving its cleaning, a counter
-- being refreshed) are left out: the change that caused them is already listed.
-- Safe to run more than once.

create index if not exists audit_logs_created_at_idx on public.audit_logs (created_at desc);

-- A changed value as the log shows it: ids become the code or name people know,
-- long text is shortened. Lists and documents never reach here (see below).
create or replace function public.activity_value(p_key text, p_val jsonb)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  v_text text;
  v_id   uuid;
begin
  if p_val is null or jsonb_typeof(p_val) = 'null' then
    return 'null'::jsonb;
  end if;
  v_text := p_val #>> '{}';

  if p_key in ('unit_id', 'housekeeper_id', 'owner_id', 'booking_id', 'contract_id') then
    begin
      v_id := v_text::uuid;
    exception when others then
      return p_val;
    end;
    return coalesce(to_jsonb(case p_key
      when 'unit_id'        then (select unit_code     from units        where id = v_id)
      when 'housekeeper_id' then (select name          from housekeepers where id = v_id)
      when 'owner_id'       then (select name          from owners       where id = v_id)
      when 'booking_id'     then (select booking_code  from bookings     where id = v_id)
      when 'contract_id'    then (select contract_code from contracts    where id = v_id)
    end), 'null'::jsonb);
  end if;

  if jsonb_typeof(p_val) = 'string' and length(v_text) > 120 then
    return to_jsonb(left(v_text, 117) || '...');
  end if;
  return p_val;
end;
$$;

revoke all on function public.activity_value(text, jsonb) from public, anon, authenticated;

-- Trigger arguments name extra columns to leave out (e.g. computed totals).
create or replace function public.log_row_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
$$;

revoke all on function public.log_row_change() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'cleanings', 'contracts', 'units', 'owners',
    'specialists', 'affiliates', 'housekeepers', 'property_managers', 'pm_contracts',
    'property_inquiries', 'interior_design_inquiries', 'inquiry_activities', 'contact_messages',
    'contract_monthly_expenses', 'unit_interactions'
  ] loop
    execute format('drop trigger if exists log_row_change on public.%I', t);
    execute format('create trigger log_row_change after insert or update or delete on public.%I
                    for each row execute function public.log_row_change()', t);
  end loop;
end $$;

-- A booking's balance follows from its total and payments, which are logged.
drop trigger if exists log_row_change on public.bookings;
create trigger log_row_change after insert or update or delete on public.bookings
  for each row execute function public.log_row_change('balance');
