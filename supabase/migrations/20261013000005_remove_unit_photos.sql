-- ============================================================
-- Units no longer have photos
--
-- Unit photos were dropped to save storage. This removes what was left of
-- them: the units.photo_url column, the photo in the Registry's v_pipeline
-- view, and the unit-photos bucket with its upload rules (which let any
-- signed-in account change the files). The bucket's files are removed
-- through the Storage API first (supabase storage rm), so none are orphaned.
--
-- v_pipeline is rebuilt with security_invoker, so it follows the tables'
-- row-level security (admins see every unit, nobody else sees any), and is
-- no longer readable by anonymous visitors. Before, it ran with its owner's
-- rights and showed every unit and owner's contact details to anyone.
-- ============================================================

-- The bucket's rules: reading, and uploading / changing / deleting
drop policy if exists "Allow public reads from unit-photos" on storage.objects;
drop policy if exists "Public can read unit photos" on storage.objects;
drop policy if exists "Allow authenticated uploads to unit-photos" on storage.objects;
drop policy if exists "Authenticated users can upload unit photos" on storage.objects;
drop policy if exists "Allow authenticated updates to unit-photos" on storage.objects;
drop policy if exists "Authenticated users can update unit photos" on storage.objects;
drop policy if exists "Authenticated users can delete unit photos" on storage.objects;

-- The Registry view, without the photo
drop view if exists public.v_pipeline;

alter table public.units drop column if exists photo_url;

create view public.v_pipeline with (security_invoker = on) as
select u.id,
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
       c.contract_pdf_url,
       c.expiry_date - current_date as days_until_expiry,
       case
         when c.id is null then 'lead'::text
         when c.expiry_date is null then 'active'::text
         when c.expiry_date < current_date then 'expired'::text
         when c.expiry_date <= (current_date + '90 days'::interval) then 'renewing'::text
         else 'active'::text
       end as pipeline_status,
       (select max(i.created_at) from public.unit_interactions i where i.unit_id = u.id) as last_interaction_at,
       (select min(i.next_follow_up_date) from public.unit_interactions i
         where i.unit_id = u.id and i.next_follow_up_date >= current_date) as next_follow_up_date
from public.units u
left join public.owners o on o.id = u.owner_id
left join public.contracts c on c.id = u.current_contract_id;

revoke all on public.v_pipeline from public, anon;
grant select on public.v_pipeline to authenticated, service_role;

-- The bucket itself (empty by now). Storage refuses plain SQL deletes unless asked.
do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'unit-photos') then
    raise exception 'unit-photos still has files: remove them with "supabase storage rm" first';
  end if;
  perform set_config('storage.allow_delete_query', 'true', true);
  delete from storage.buckets where id = 'unit-photos';
end $$;
