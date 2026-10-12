-- ============================================================
-- Contract extensions and renewals
--
-- Extend: a running contract (active or nearing its end) gets a later
--   expiry date. The contract stays the same row, so Accounting simply
--   covers the extra months. Each extension is recorded here, with an
--   optional signed addendum.
--
-- Renew: a contract that has ended ("For renewal") is followed by a new
--   contract for the next term, starting after the old one ends. The old
--   contract points to it through contracts.superseded_by, and shows as
--   "Renewed". Terms never overlap, so Accounting never counts a month twice.
--
-- Safe to run more than once.
-- ============================================================

-- Renewal link (already present on most databases; kept here for new ones).
alter table contracts
  add column if not exists superseded_by uuid references contracts(id) on delete set null;
create index if not exists contracts_superseded_by_idx on contracts (superseded_by);

-- One row per extension of a contract.
create table if not exists contract_extensions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  previous_expiry date,
  new_expiry date not null,
  note text,
  document_path text,          -- addendum in the contract-pdfs bucket
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists contract_extensions_contract_id_idx
  on contract_extensions (contract_id, created_at desc);

-- Same access as contracts: admins only.
alter table contract_extensions enable row level security;

drop policy if exists "contract_extensions_admin" on contract_extensions;
create policy "contract_extensions_admin" on contract_extensions
  for all using (public.is_admin()) with check (public.is_admin());
