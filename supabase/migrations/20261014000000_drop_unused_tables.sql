-- ============================================================
-- Remove tables nothing uses, and fix the Contact form
--
-- These five tables were empty, and no page, edge function, database
-- function, view, trigger or policy read or wrote them:
--   rates                 building, unit_type, pax_count, price_php, sort_order
--   extras                category, label, charge_php, cost_php, notes, sort_order
--   association_accounts  building, bank, account_name, account_number,
--                         billing_email, due_date_rule, sort_order
--   user_roles            user_id, role (staff access lives in admin_users,
--                         housekeepers, property_managers, owners)
--   accounting_orphan_log found_at, kind, row_id, unit_id, code, date_field, detail
-- A plain drop (no cascade), so it stops if anything still depends on one.
--
-- The Contact page saves to contact_messages, whose trigger copied each
-- message into a leads table that no longer exists, so every message failed
-- with "relation leads does not exist". The trigger and its function go.
-- Safe to run more than once.
-- ============================================================

begin;

drop table if exists public.rates;
drop table if exists public.extras;
drop table if exists public.association_accounts;
drop table if exists public.user_roles;
drop table if exists public.accounting_orphan_log;

drop trigger if exists on_contact_message_created on public.contact_messages;
drop function if exists public.handle_new_contact_message();

commit;
