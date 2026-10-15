-- ============================================================
-- Inquiry activity: notes, stage history and follow-up dates
--
-- On both inquiry boards (List Property, Interior Design) each inquiry
-- gets a timeline: every move to another stage, with an optional note on
-- how it went ("Messaged on Messenger", "Met the owner at Coffee Break"),
-- and notes added any time. Each inquiry can also have a follow-up date;
-- the board shows it and flags the ones that are due.
--
-- One table for both boards: exactly one of property_inquiry_id and
-- interior_inquiry_id is set, and an inquiry's activity goes when the
-- inquiry is deleted. author_id and author_name are filled in by the
-- database from whoever is signed in, so a note can't claim someone else
-- wrote it. CRM admins only; rows are added and deleted, never edited.
--
-- Safe to run more than once.
-- ============================================================

alter table public.property_inquiries        add column if not exists follow_up_on date;
alter table public.interior_design_inquiries add column if not exists follow_up_on date;

create table if not exists public.inquiry_activities (
  id                  uuid primary key default gen_random_uuid(),
  property_inquiry_id uuid references public.property_inquiries (id) on delete cascade,
  interior_inquiry_id uuid references public.interior_design_inquiries (id) on delete cascade,
  kind                text not null default 'note' check (kind in ('note', 'stage')),
  stage               text,  -- 'stage': the stage it moved to; 'note': the stage it was in
  from_stage          text,  -- 'stage': the stage it left
  tag                 text check (char_length(tag) <= 40),     -- how they were reached (messenger, call, …) or, for Lost, why
  body                text check (char_length(body) <= 2000),
  author_id           uuid references auth.users (id) on delete set null,
  author_name         text,
  created_at          timestamptz not null default now(),
  constraint inquiry_activities_one_inquiry check (num_nonnulls(property_inquiry_id, interior_inquiry_id) = 1)
);

create index if not exists inquiry_activities_property_idx
  on public.inquiry_activities (property_inquiry_id, created_at desc) where property_inquiry_id is not null;
create index if not exists inquiry_activities_interior_idx
  on public.inquiry_activities (interior_inquiry_id, created_at desc) where interior_inquiry_id is not null;

-- Who wrote it and when come from the session, never from the client.
create or replace function public.inquiry_activities_set_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.author_id  := auth.uid();
  new.created_at := now();
  select coalesce(
           nullif(u.raw_user_meta_data ->> 'full_name', ''),
           nullif(u.raw_user_meta_data ->> 'name', ''),
           split_part(u.email, '@', 1)
         )
    into new.author_name
    from auth.users u
   where u.id = new.author_id;
  return new;
end;
$$;

drop trigger if exists inquiry_activities_author on public.inquiry_activities;
create trigger inquiry_activities_author
  before insert on public.inquiry_activities
  for each row execute function public.inquiry_activities_set_author();

alter table public.inquiry_activities enable row level security;
revoke all on public.inquiry_activities from anon, authenticated;
grant select, insert, delete on public.inquiry_activities to authenticated;

drop policy if exists inquiry_activities_admin_read on public.inquiry_activities;
create policy inquiry_activities_admin_read on public.inquiry_activities
  for select to authenticated using (public.is_admin());

drop policy if exists inquiry_activities_admin_insert on public.inquiry_activities;
create policy inquiry_activities_admin_insert on public.inquiry_activities
  for insert to authenticated with check (public.is_admin());

drop policy if exists inquiry_activities_admin_delete on public.inquiry_activities;
create policy inquiry_activities_admin_delete on public.inquiry_activities
  for delete to authenticated using (public.is_admin());

-- Other admins' boards update live.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'inquiry_activities'
  ) then
    alter publication supabase_realtime add table public.inquiry_activities;
  end if;
end;
$$;
