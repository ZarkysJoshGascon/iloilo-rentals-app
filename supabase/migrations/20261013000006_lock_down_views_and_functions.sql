-- ============================================================
-- Lock down views and functions that were open to the public
--
-- The website ships the public (anon) key, so anything granted to anon can
-- be called by anyone on the internet. Found open on 12 Oct 2026:
--
--   Views running with their owner's rights (they skipped row-level
--   security) and readable by anyone: every booking, contract and today's
--   activity. v_bookings_with_status could even be UPDATED by anyone,
--   which changed the booking underneath.
--
--   Functions running with full rights (security definer), callable by
--   anyone, that return the business's figures: the Dashboard's revenue
--   and expenses, and the team's completed-booking counts.
--
-- Views now follow row-level security (security_invoker): admins still see
-- everything, other accounts see nothing, anonymous visitors are refused,
-- and nobody can write through them. The Dashboard and team functions now
-- run with the caller's rights, so admins get the same figures and nobody
-- else gets any. Functions only the server uses (rate limits, email checks)
-- are for the server key only.
--
-- Safe to run more than once.
-- ============================================================

-- Views ------------------------------------------------------
do $$
declare v text;
begin
  foreach v in array array['v_bookings_with_status', 'v_expiring', 'v_out_of_range_activity', 'v_today', 'v_pipeline'] loop
    if to_regclass('public.' || v) is null then continue; end if;
    execute format('alter view public.%I set (security_invoker = on)', v);
    execute format('revoke all on public.%I from public, anon, authenticated', v);
    execute format('grant select on public.%I to authenticated, service_role', v);
  end loop;
end $$;

-- Business figures: the caller's rights, signed-in accounts only -----
alter function public.dashboard_analytics(integer) security invoker;
alter function public.dashboard_analytics_year(integer) security invoker;
alter function public.team_completed_counts() security invoker;
alter function public.affiliate_completed_count(text) security invoker;
alter function public.specialist_completed_count(text) security invoker;

revoke all on function public.dashboard_analytics(integer) from public, anon;
revoke all on function public.dashboard_analytics_year(integer) from public, anon;
revoke all on function public.team_completed_counts() from public, anon;
revoke all on function public.affiliate_completed_count(text) from public, anon;
revoke all on function public.specialist_completed_count(text) from public, anon;
grant execute on function public.dashboard_analytics(integer) to authenticated, service_role;
grant execute on function public.dashboard_analytics_year(integer) to authenticated, service_role;
grant execute on function public.team_completed_counts() to authenticated, service_role;
grant execute on function public.affiliate_completed_count(text) to authenticated, service_role;
grant execute on function public.specialist_completed_count(text) to authenticated, service_role;

-- Server-only helpers (called by edge functions with the service key) --
revoke all on function public.recent_email_exists(text, integer) from public, anon, authenticated;
revoke all on function public.is_email_opted_out(text) from public, anon, authenticated;
revoke all on function public.check_inquiry_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke all on function public.cleanup_inquiry_rate_limit() from public, anon, authenticated;
grant execute on function public.recent_email_exists(text, integer) to service_role;
grant execute on function public.is_email_opted_out(text) to service_role;
grant execute on function public.check_inquiry_rate_limit(text, integer, integer) to service_role;
grant execute on function public.cleanup_inquiry_rate_limit() to service_role;

-- The CRM's audit log: signed-in accounts only, not anonymous visitors --
revoke all on function public.log_audit(text, text, uuid, jsonb) from public, anon;
grant execute on function public.log_audit(text, text, uuid, jsonb) to authenticated, service_role;
