-- ============================================================
-- Test: what visitors can and can't write
-- (migrations 20261017000003_public_input_limits.sql and
--  20261017000004_close_public_writes.sql)
--
-- Run:  supabase db query --linked -f supabase/tests/public_input_limits.sql
--
-- Tries each write as a website visitor and as the server, prints
-- PASS/FAIL, and rolls everything back.
-- ============================================================
begin;

create temp table t (n serial, test text, ok boolean, detail text) on commit drop;
grant all on t to anon, authenticated;
grant usage on sequence t_n_seq to anon, authenticated;

-- ── As a website visitor ──────────────────────────────────────
set local role anon;

do $$ begin
  insert into contact_messages (name, email, message) values ('TEST visitor', 'visitor@example.com', 'TEST hello');
  insert into t (test, ok, detail) values ('Visitor can''t write a contact message directly', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Visitor can''t write a contact message directly', true, sqlerrm);
end $$;

do $$ begin
  insert into email_opt_outs (email) values ('someone-else@example.com');
  insert into t (test, ok, detail) values ('Visitor can''t opt anyone out directly', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Visitor can''t opt anyone out directly', true, sqlerrm);
end $$;

do $$ begin
  insert into storage.objects (bucket_id, name) values ('property-inquiry-images', '2026-10/testtesttest.jpg');
  insert into t (test, ok, detail) values ('Visitor can''t upload to the property inquiry photos', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Visitor can''t upload to the property inquiry photos', true, sqlerrm);
end $$;

do $$ begin
  insert into storage.objects (bucket_id, name) values ('interior-design-images', '2026-10/testtesttest.jpg');
  insert into t (test, ok, detail) values ('Visitor can''t upload to the interior design photos', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Visitor can''t upload to the interior design photos', true, sqlerrm);
end $$;

reset role;

-- ── As the server (what the functions do) ────────────────────
insert into contact_messages (name, email, message) values ('TEST visitor', 'visitor@example.com', 'TEST hello');
insert into t (test, ok, detail) values ('The server can save a good message', true, 'saved');

do $$ begin
  insert into contact_messages (name, email, message) values ('TEST', 'not-an-email', 'hi');
  insert into t (test, ok, detail) values ('Refuse a bad email', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse a bad email', true, sqlerrm);
end $$;

do $$ begin
  insert into contact_messages (name, email, message) values (repeat('x', 121), 'a@example.com', 'hi');
  insert into t (test, ok, detail) values ('Refuse a 121-character name', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse a 121-character name', true, sqlerrm);
end $$;

do $$ begin
  insert into contact_messages (name, email, message) values ('TEST', 'a@example.com', repeat('x', 5001));
  insert into t (test, ok, detail) values ('Refuse a 5001-character message', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse a 5001-character message', true, sqlerrm);
end $$;

do $$ begin
  insert into contact_messages (name, email, message) values ('   ', 'a@example.com', 'hi');
  insert into t (test, ok, detail) values ('Refuse a blank name', false, 'was allowed');
exception when others then
  insert into t (test, ok, detail) values ('Refuse a blank name', true, sqlerrm);
end $$;

insert into t (test, ok, detail)
select 'Cleaning photos: images only, 10 MB',
       file_size_limit = 10485760 and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'],
       file_size_limit || ' bytes, ' || array_to_string(allowed_mime_types, ', ')
  from storage.buckets where id = 'cleaning-photos';

insert into t (test, ok, detail)
select 'Site photos: 15 MB', file_size_limit = 15728640, file_size_limit || ' bytes'
  from storage.buckets where id = 'hero-images';

insert into t (test, ok, detail)
select 'Old test messages kept', count(*) >= 4, count(*) || ' messages' from contact_messages;

select n as "#", case when ok then 'PASS' else 'FAIL' end as result, test, detail from t order by n;
rollback;
