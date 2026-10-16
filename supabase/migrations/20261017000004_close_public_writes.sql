-- ============================================================
-- Visitors no longer write straight to the database or the photo buckets
--
-- Apply only after the website that uses the functions is live:
--   • Contact form → submit-contact-message (checks, rate limit, then saves)
--   • List Property / Interior Design photos → inquiry-upload-url hands out a
--     one-time upload link per photo (server-picked name, rate limited)
-- With those in place, these rules only let people skip the checks:
--   • anyone_can_insert_contact: anyone could add any number of messages
--   • inquiry_images_public_insert / interior_images_public_insert: anyone
--     could upload any number of photos to the two public buckets
-- Reading stays as it was (the photos stay public; admins read messages).
--
-- Safe to run more than once.
-- ============================================================

begin;

drop policy if exists anyone_can_insert_contact on public.contact_messages;
drop policy if exists inquiry_images_public_insert on storage.objects;
drop policy if exists interior_images_public_insert on storage.objects;

commit;
