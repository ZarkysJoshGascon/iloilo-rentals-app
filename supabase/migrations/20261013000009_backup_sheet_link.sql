-- ============================================================
-- The backup sheet's link lives with the backup runs
--
-- The Dashboard used to build the link from VITE_BACKUP_SHEET_ID, which
-- put the sheet's ID (a full copy of the business data) into the public
-- website code. The backup function now records the link on each run;
-- backup_runs is readable by admins only.
-- ============================================================

alter table public.backup_runs add column if not exists sheet_url text;
