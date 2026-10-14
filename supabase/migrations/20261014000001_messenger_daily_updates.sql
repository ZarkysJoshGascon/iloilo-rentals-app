-- ============================================================
-- Daily 8am team updates on Messenger
--
-- Each booking specialist, housekeeper and CRM admin can connect their
-- Messenger to the Iloilo Rentals Facebook Page with a personal link
-- (CRM → Team → Daily updates). Every morning at 8am Manila time the
-- messenger-team function sends each connected person their list:
--   specialists   check-ins and check-outs of guests they booked
--   housekeepers  cleanings assigned to them
--   admins        everything, plus unassigned cleanings
--
-- Facebook only lets a Page message someone within 24 hours of their last
-- message to it, so last_message_at is kept by the messenger-webhook
-- function and each update ends with a "Got it" button that renews it.
--
-- One row per person and role. Only the two edge functions read or write
-- it (service role); the CRM goes through messenger-team.
-- Safe to run more than once.
-- ============================================================

create table if not exists public.messenger_contacts (
  id               uuid primary key default gen_random_uuid(),
  role             text not null check (role in ('admin', 'specialist', 'housekeeper')),
  staff_id         uuid not null,  -- admin_users.user_id, specialists.id or housekeepers.id
  psid             text,           -- their Page-scoped Messenger ID, once connected
  link_code        text unique,    -- in their personal m.me link until they use it
  link_created_at  timestamptz,
  connected_at     timestamptz,
  last_message_at  timestamptz,    -- starts Facebook's 24-hour window
  last_ack_at      timestamptz,    -- last "Got it"
  last_sent_at     timestamptz,
  last_send_error  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (role, staff_id)
);

create index if not exists messenger_contacts_psid_idx on public.messenger_contacts (psid);

alter table public.messenger_contacts enable row level security;
revoke all on public.messenger_contacts from anon, authenticated;

-- 8am in Manila is midnight UTC. Same service-role key as the backup job.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'messenger-daily-update') then
    perform cron.unschedule('messenger-daily-update');
  end if;
  if exists (select 1 from vault.secrets where name = 'backup_cron_key') then
    perform cron.schedule(
      'messenger-daily-update',
      '0 0 * * *',
      $cmd$
      select net.http_post(
        url := 'https://mlksustamjaxfpolazgw.supabase.co/functions/v1/messenger-team',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'backup_cron_key')
        ),
        body := '{"mode":"send"}'::jsonb,
        timeout_milliseconds := 60000
      );
      $cmd$
    );
  end if;
end $$;
