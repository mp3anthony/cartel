-- #70 — screenshot attachment for in-app feedback reports (mobile/src/screens/
-- FeedbackScreen.tsx, built on #69's report-feedback Edge Function).
--
-- This is the first Supabase Storage bucket in this project — every prior
-- table in this schema lives in `public.*` under ordinary RLS. Storage is a
-- separate subsystem: objects live in `storage.objects`, gated by RLS
-- policies exactly like any other table, and a bucket's own `public` flag
-- additionally controls whether `GET /storage/v1/object/public/<bucket>/...`
-- serves bytes with no auth/RLS check at all. The issue's "public-read,
-- authenticated-write" requirement is met by both mechanisms together, not
-- either alone: `public = true` is what makes the plain public URL the
-- client passes to the Edge Function (and the Edge Function embeds in the
-- GitHub issue body) actually resolve for anyone, including GitHub's own
-- image-fetching bots which never send an Authorization header; the INSERT
-- policy below is what stops an unauthenticated or cross-user write via the
-- authenticated REST/JS upload path (the public flag has no bearing on
-- writes, only reads).
--
-- Object paths are `<uploader's auth.uid()>/<filename>` — enforced by the
-- INSERT policy checking `storage.foldername(name)`'s first segment against
-- `auth.uid()`, the standard Supabase Storage per-user-folder pattern. This
-- gives "an authenticated user's own upload succeeds; a cross-user write is
-- rejected" a real mechanism to check (per #70's own acceptance criteria)
-- without needing a new column or table — `storage.objects` already carries
-- `owner`/`owner_id`, but those are set from the uploader's JWT by the
-- storage API itself and aren't guaranteed by RLS the way a `with check` on
-- the object's own `name` is.
--
-- No UPDATE/DELETE policy — matches this project's default stance for
-- write-once data (e.g. `location_items` has no creator column and no edit
-- path at all; `locations.name`/`lat`/`lng` stay unwritable after creation).
-- A screenshot is attached once, at submit time; nothing in the client ever
-- needs to replace or remove an already-uploaded object under its own name
-- (a user who wants to swap the picked image before submitting just picks a
-- new file, which gets its own fresh filename — see feedbackScreenshots.ts).

insert into storage.buckets (id, name, public)
values ('feedback-screenshots', 'feedback-screenshots', true)
on conflict (id) do nothing;

create policy "feedback_screenshots_public_read"
on storage.objects
for select
to public
using (bucket_id = 'feedback-screenshots');

create policy "feedback_screenshots_owner_write"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'feedback-screenshots'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
