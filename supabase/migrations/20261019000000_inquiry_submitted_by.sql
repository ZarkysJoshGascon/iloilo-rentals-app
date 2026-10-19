-- ============================================================
-- Inquiries remember who sent them (2026-10-19)
--
-- The List Property and Interior Design forms now need a Google sign-in.
-- The submit functions save the signed-in account here, and the reply email
-- comes from that account, so nobody can send an inquiry under someone
-- else's address. Inquiries sent before this stay empty.
--
-- Safe to run more than once.
-- ============================================================

begin;

alter table public.property_inquiries
  add column if not exists submitted_by uuid references auth.users (id) on delete set null;

alter table public.interior_design_inquiries
  add column if not exists submitted_by uuid references auth.users (id) on delete set null;

create index if not exists property_inquiries_submitted_by_idx
  on public.property_inquiries (submitted_by);

create index if not exists interior_design_inquiries_submitted_by_idx
  on public.interior_design_inquiries (submitted_by);

commit;
