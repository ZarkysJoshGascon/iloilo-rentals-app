-- ============================================================
-- Remove the daily renewal digest email.
-- Expiring contracts are shown as a warning on the CRM Dashboard
-- (src/hooks/useContractAlerts.js), so the send-renewal-digest
-- function and both jobs that called it are retired.
-- Safe to run more than once.
-- ============================================================

do $$
declare
  job_name text;
begin
  foreach job_name in array array['send-renewal-digest', 'send-renewal-digest-daily'] loop
    if exists (select 1 from cron.job where jobname = job_name) then
      perform cron.unschedule(job_name);
    end if;
  end loop;
end
$$;
