-- ============================================================
-- Daily renewal digest cron
-- Runs every day at 00:00 UTC = 08:00 Philippines time
-- ============================================================

-- Enable pg_cron and pg_net (required for HTTP from Postgres)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove the old job if it exists (idempotent)
do $$
begin
  perform cron.unschedule('send-renewal-digest');
exception when others then
  -- job didn't exist, ignore
end $$;

-- Schedule the daily job
select cron.schedule(
  'send-renewal-digest',
  '0 0 * * *',  -- 00:00 UTC every day = 08:00 PHT
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/send-renewal-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $$
);

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove the old job if it exists
do $$
begin
  perform cron.unschedule('send-renewal-digest');
exception when others then
  null;
end $$;

-- Schedule the daily job
select cron.schedule(
  'send-renewal-digest',
  '0 0 * * *',
  $$
  select net.http_post(
    url := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/send-renewal-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'cron_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb
  );
  $$
);