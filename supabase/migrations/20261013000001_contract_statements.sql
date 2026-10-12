-- ============================================================
-- Owner statements
--
-- When a contract ends, an admin can email the owner an Excel summary of
-- the term (send-contract-statement Edge Function). Each send is recorded
-- here so the CRM can show whether, when and to whom it went.
--
-- Safe to run more than once.
-- ============================================================

create table if not exists contract_statements (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references contracts(id) on delete cascade,
  sent_to text not null,
  status text not null default 'queued'
    check (status in ('queued', 'sent', 'failed')),
  totals jsonb,                -- gross, expenses, net, owner/company share at send time
  resend_id text,
  error_message text,
  sent_by uuid,
  sent_by_email text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists contract_statements_contract_id_idx
  on contract_statements (contract_id, created_at desc);

-- Admins can read the history; rows are written by the Edge Function.
alter table contract_statements enable row level security;

drop policy if exists "contract_statements_admin" on contract_statements;
create policy "contract_statements_admin" on contract_statements
  for all using (public.is_admin()) with check (public.is_admin());
