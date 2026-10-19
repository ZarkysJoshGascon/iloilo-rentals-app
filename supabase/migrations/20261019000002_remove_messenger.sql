-- ============================================================
-- Remove Messenger from the system
--
-- Drops what the old 8am Messenger team updates left in the database (their
-- scheduled job and their table), and takes Messenger off the ways a unit
-- interaction can be logged: the ones logged that way become notes, keeping
-- their text. The feature's code is in git at commit 145e28e.
-- Safe to run more than once.
-- ============================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'messenger-daily-update') then
    perform cron.unschedule('messenger-daily-update');
  end if;
end $$;

drop table if exists public.messenger_contacts;

update public.unit_interactions set type = 'note' where type = 'messenger';

alter table public.unit_interactions drop constraint if exists unit_interactions_type_check;
alter table public.unit_interactions add constraint unit_interactions_type_check
  check (type in ('call', 'email', 'whatsapp', 'sms', 'in_person', 'note'));
