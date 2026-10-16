-- ============================================================
-- Limits on what the public side can write
--
-- • Contact messages: a name (1–120 characters), a valid email (up to 254)
--   and a message (1–5000). The Contact form now goes through the
--   submit-contact-message function, which checks the same and limits how
--   often one visitor can write. The email rule is NOT VALID: it holds for
--   every new message, and the old test rows (whose emails don't pass) stay.
-- • Opt-outs: only the unsubscribe function (which checks the email's
--   token, with the service role) adds to email_opt_outs. The rule that let
--   anyone add any address directly goes.
-- • Storage: cleaning photos only as JPEG, PNG or WebP up to 10 MB (the app
--   already shrinks them to well under 1 MB). Site photos (hero-images) up
--   to 15 MB; no type rule there, since it also holds tour.json files and
--   the dashboard's folder markers, and only admins can upload to it.
--
-- Safe to run more than once.
-- ============================================================

begin;

alter table public.contact_messages drop constraint if exists contact_messages_name_len;
alter table public.contact_messages
  add constraint contact_messages_name_len check (char_length(btrim(name)) between 1 and 120);

alter table public.contact_messages drop constraint if exists contact_messages_message_len;
alter table public.contact_messages
  add constraint contact_messages_message_len check (char_length(btrim(message)) between 1 and 5000);

alter table public.contact_messages drop constraint if exists contact_messages_email_valid;
alter table public.contact_messages
  add constraint contact_messages_email_valid
  check (char_length(email) <= 254 and email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  not valid;

drop policy if exists email_opt_outs_insert_anyone on public.email_opt_outs;

update storage.buckets
   set file_size_limit = 10485760,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'cleaning-photos';

update storage.buckets
   set file_size_limit = 15728640
 where id = 'hero-images';

commit;
