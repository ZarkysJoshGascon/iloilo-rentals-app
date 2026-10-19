-- ============================================================
-- Remove the 8am Messenger team updates
-- (added by 20261014000001_messenger_daily_updates.sql)
--
-- The feature is off for now: its scheduled job and its table go, and the
-- messenger-team and messenger-webhook functions are deleted from the
-- project. To bring it back, restore the code from commit 145e28e and run
-- that migration again; people link their Messenger again from the CRM.
-- Safe to run more than once.
-- ============================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'messenger-daily-update') then
    perform cron.unschedule('messenger-daily-update');
  end if;
end $$;

drop table if exists public.messenger_contacts;
