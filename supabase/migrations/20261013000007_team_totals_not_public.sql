-- ============================================================
-- Team money totals: not for anonymous visitors
--
-- team_totals_bulk and pm_earnings_bulk only refuse a caller when
-- "auth.uid() is not null and not an admin", so the SQL editor (no user)
-- can test them. An anonymous visitor with the website's public key has no
-- user either, so they got through and could read the team's commission,
-- housekeeper payout and PM earnings totals. Only signed-in accounts (who
-- then meet the admin check) and the server may call them now.
--
-- Safe to run more than once.
-- ============================================================

revoke all on function public.team_totals_bulk() from public, anon;
revoke all on function public.pm_earnings_bulk(uuid[]) from public, anon;
grant execute on function public.team_totals_bulk() to authenticated, service_role;
grant execute on function public.pm_earnings_bulk(uuid[]) to authenticated, service_role;
