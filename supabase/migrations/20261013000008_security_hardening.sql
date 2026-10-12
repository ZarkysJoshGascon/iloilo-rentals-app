-- ============================================================
-- Security hardening (12 Oct 2026 review)
--
-- 1. Public form uploads (property inquiry, interior design): images only
--    (JPEG/PNG/WebP), 5 MB each, and nobody can list a bucket's files any
--    more. Files still load by their link, because the buckets are public;
--    the removed read rules only allowed listing (and downloading) every
--    file people had sent. The same goes for team photos and email images.
--    Admins can still list all four.
-- 2. The audit log only takes entries from admins (it was open to any
--    signed-in account).
-- 3. Scheduled jobs: the three that only failed are removed (the iCal sync
--    called a function that no longer exists, and two called database
--    functions that are gone). The hourly backup no longer keeps the
--    service key in its command: the key is moved into the Vault (inside
--    the database, never printed) and read from there at run time.
-- 4. Every function in public gets a fixed search_path (database linter).
--
-- Safe to run more than once.
-- ============================================================

-- 1. Storage -------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'],
       file_size_limit = 5242880
 where id in ('property-inquiry-images', 'interior-design-images');

update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'],
       file_size_limit = 10485760
 where id in ('team-photos', 'email-assets');

drop policy if exists "inquiry_images_public_insert" on storage.objects;
create policy "inquiry_images_public_insert" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'property-inquiry-images'
    and storage.extension(name) = any (array['jpg', 'jpeg', 'png', 'webp'])
  );

drop policy if exists "inquiry_images_public_read" on storage.objects;
drop policy if exists "interior_images_public_read" on storage.objects;
drop policy if exists "team_photos_public_read" on storage.objects;
drop policy if exists "email_assets_public_read" on storage.objects;

drop policy if exists "public_form_images_admin_read" on storage.objects;
create policy "public_form_images_admin_read" on storage.objects
  for select to authenticated
  using (
    bucket_id in ('property-inquiry-images', 'interior-design-images', 'team-photos', 'email-assets')
    and public.is_admin()
  );

-- 2. Audit log: admins only (others are ignored, so no page breaks) --
create or replace function public.log_audit(p_action text, p_table_name text, p_record_id uuid, p_details jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return;
  end if;
  insert into audit_logs (user_id, action, table_name, record_id, details)
  values (auth.uid(), p_action, p_table_name, p_record_id, p_details);
end;
$$;

revoke all on function public.log_audit(text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_audit(text, text, uuid, jsonb) to authenticated, service_role;

-- 3. Scheduled jobs ------------------------------------------
do $$
declare j text;
begin
  foreach j in array array['ical-sync-every-15-min', 'ical-cleanup-daily', 'update-housekeeping-status'] loop
    if exists (select 1 from cron.job where jobname = j) then
      perform cron.unschedule(j);
    end if;
  end loop;
end $$;

-- Move the backup job's key into the Vault (only if it is still inline).
do $$
declare k text;
begin
  select substring(command from 'Bearer (eyJ[A-Za-z0-9_.-]+)') into k
    from cron.job where jobname = 'backup-to-sheets-hourly';
  if k is not null and not exists (select 1 from vault.secrets where name = 'backup_cron_key') then
    perform vault.create_secret(k, 'backup_cron_key', 'Key the hourly backup job sends to the backup-to-sheets function');
  end if;
end $$;

do $$
begin
  if exists (select 1 from vault.secrets where name = 'backup_cron_key') then
    perform cron.schedule(
      'backup-to-sheets-hourly',
      '5 * * * *',
      $cmd$
      select net.http_post(
        url := 'https://mlksustamjaxfpolazgw.supabase.co/functions/v1/backup-to-sheets',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'backup_cron_key')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      );
      $cmd$
    );
  end if;
end $$;

-- 4. Fixed search_path for the remaining functions ------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, extensions', f.sig);
  end loop;
end $$;
