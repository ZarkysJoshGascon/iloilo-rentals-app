-- ============================================================
-- Registry Migration — PRODUCTION VERSION
-- Safe to run once. Idempotent where possible.
-- ============================================================

-- ============================================================
-- OWNERS
-- ============================================================
create table if not exists owners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists owners_email_lower_idx
  on owners (lower(email))
  where email is not null;

create index if not exists owners_name_lower_idx on owners (lower(name));

-- ============================================================
-- UNITS
-- ============================================================
create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  building text not null,
  unit_code text not null unique,
  unit_type text,
  marketing_title text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'INACTIVE', 'IN_PROGRESS', 'FOR_RENEWAL')),
  gc_status text,
  owner_id uuid references owners(id) on delete set null,
  ota_listings jsonb not null default '{}'::jsonb,
  inventory_list text,
  signed_date date,
  current_contract_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists units_building_idx on units (building);
create index if not exists units_status_idx on units (status);
create index if not exists units_owner_id_idx on units (owner_id);
create index if not exists units_current_contract_id_idx on units (current_contract_id);
create index if not exists units_unit_code_lower_idx on units (lower(unit_code));

-- ============================================================
-- CONTRACTS
-- ============================================================
create table if not exists contracts (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  owner_id uuid references owners(id) on delete set null,
  effective_date date,
  expiry_date date,
  classification text,
  contract_terms_months int,
  contract_pdf_url text,
  commission_status text
    check (commission_status is null or commission_status in ('PENDING', 'RELEASED')),
  voucher_url text,
  notes text,
  superseded_by uuid references contracts(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists contracts_unit_id_idx on contracts (unit_id);
create index if not exists contracts_expiry_date_idx on contracts (expiry_date);
create index if not exists contracts_superseded_by_idx on contracts (superseded_by);
create index if not exists contracts_owner_id_idx on contracts (owner_id);

-- Wire FK on units.current_contract_id (only if not already there)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'units_current_contract_id_fkey'
  ) then
    alter table units
      add constraint units_current_contract_id_fkey
      foreign key (current_contract_id) references contracts(id)
      on delete set null;
  end if;
end $$;

-- ============================================================
-- UNIT INTERACTIONS
-- ============================================================
create table if not exists unit_interactions (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  owner_id uuid references owners(id) on delete set null,
  type text not null
    check (type in ('call', 'email', 'messenger', 'whatsapp', 'sms', 'in_person', 'note')),
  content text,
  outcome text
    check (outcome is null or outcome in ('positive', 'neutral', 'negative', 'no_answer')),
  next_follow_up_date date,
  created_at timestamptz not null default now()
);

create index if not exists unit_interactions_unit_id_idx on unit_interactions (unit_id);
create index if not exists unit_interactions_next_follow_up_date_idx
  on unit_interactions (next_follow_up_date)
  where next_follow_up_date is not null;

-- ============================================================
-- REFERENCE TABLES
-- ============================================================
create table if not exists association_accounts (
  id uuid primary key default gen_random_uuid(),
  building text not null,
  bank text,
  account_name text,
  account_number text,
  billing_email text,
  due_date_rule text,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

create table if not exists rates (
  id uuid primary key default gen_random_uuid(),
  building text not null,
  unit_type text not null,
  pax_count int not null,
  price_php numeric(10,2) not null,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

create index if not exists rates_building_unit_type_idx on rates (building, unit_type);

create table if not exists extras (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  label text not null,
  charge_php numeric(10,2),
  cost_php numeric(10,2),
  notes text,
  sort_order int default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- updated_at TRIGGERS (safe to re-run)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists owners_updated_at on owners;
create trigger owners_updated_at
  before update on owners
  for each row execute function public.set_updated_at();

drop trigger if exists units_updated_at on units;
create trigger units_updated_at
  before update on units
  for each row execute function public.set_updated_at();

-- ============================================================
-- VIEWS
-- ============================================================
create or replace view v_pipeline as
select
  u.id,
  u.building,
  u.unit_code,
  u.unit_type,
  u.marketing_title,
  u.status,
  u.gc_status,
  u.ota_listings,
  u.inventory_list,
  u.signed_date,
  u.owner_id,
  o.name  as owner_name,
  o.email as owner_email,
  o.phone as owner_phone,
  u.current_contract_id,
  c.effective_date,
  c.expiry_date,
  c.classification,
  c.contract_pdf_url,
  (c.expiry_date - current_date) as days_until_expiry,
  case
    when c.id is null then 'lead'
    when c.expiry_date is null then 'active'
    when c.expiry_date < current_date then 'expired'
    when c.expiry_date <= current_date + interval '90 days' then 'renewing'
    else 'active'
  end as pipeline_status,
  (
    select max(i.created_at)
    from unit_interactions i
    where i.unit_id = u.id
  ) as last_interaction_at,
  (
    select min(i.next_follow_up_date)
    from unit_interactions i
    where i.unit_id = u.id
      and i.next_follow_up_date >= current_date
  ) as next_follow_up_date
from units u
left join owners o on o.id = u.owner_id
left join contracts c on c.id = u.current_contract_id;

create or replace view v_expiring as
select
  c.id              as contract_id,
  c.unit_id,
  u.unit_code,
  u.building,
  u.unit_type,
  c.effective_date,
  c.expiry_date,
  c.classification,
  c.contract_pdf_url,
  o.id              as owner_id,
  o.name            as owner_name,
  o.email           as owner_email,
  o.phone           as owner_phone,
  (c.expiry_date - current_date) as days_until_expiry
from contracts c
join units u on u.id = c.unit_id
left join owners o on o.id = c.owner_id
where c.superseded_by is null
  and c.expiry_date is not null
  and c.expiry_date <= current_date + interval '90 days'
order by c.expiry_date asc;

create or replace view v_today as
select distinct on (u.id)
  u.id              as unit_id,
  u.building,
  u.unit_code,
  u.unit_type,
  o.name            as owner_name,
  o.email           as owner_email,
  o.phone           as owner_phone,
  i.id              as interaction_id,
  i.type            as last_interaction_type,
  i.content         as last_interaction_content,
  i.outcome         as last_interaction_outcome,
  i.next_follow_up_date,
  (i.next_follow_up_date - current_date) as days_overdue
from unit_interactions i
join units u on u.id = i.unit_id
left join owners o on o.id = u.owner_id
where i.next_follow_up_date is not null
  and i.next_follow_up_date <= current_date
order by u.id, i.next_follow_up_date asc;

-- ============================================================
-- RLS — ADMIN ONLY
-- Only users in admin_users can read or write these tables.
-- Falls back to open access if admin_users is empty (bootstrap).
-- ============================================================

alter table owners enable row level security;
alter table units enable row level security;
alter table contracts enable row level security;
alter table unit_interactions enable row level security;
alter table association_accounts enable row level security;
alter table rates enable row level security;
alter table extras enable row level security;

-- Helper: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from admin_users
    where user_id = auth.uid()
  );
$$;

-- Drop existing policies if any (idempotent re-runs)
drop policy if exists "owners_admin" on owners;
drop policy if exists "units_admin" on units;
drop policy if exists "contracts_admin" on contracts;
drop policy if exists "unit_interactions_admin" on unit_interactions;
drop policy if exists "association_accounts_admin" on association_accounts;
drop policy if exists "rates_admin" on rates;
drop policy if exists "extras_admin" on extras;

create policy "owners_admin" on owners
  for all using (public.is_admin()) with check (public.is_admin());

create policy "units_admin" on units
  for all using (public.is_admin()) with check (public.is_admin());

create policy "contracts_admin" on contracts
  for all using (public.is_admin()) with check (public.is_admin());

create policy "unit_interactions_admin" on unit_interactions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "association_accounts_admin" on association_accounts
  for all using (public.is_admin()) with check (public.is_admin());

create policy "rates_admin" on rates
  for all using (public.is_admin()) with check (public.is_admin());

create policy "extras_admin" on extras
  for all using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- DONE
-- ============================================================