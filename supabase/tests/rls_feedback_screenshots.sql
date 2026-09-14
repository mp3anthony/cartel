-- RLS/grant tests for the `feedback-screenshots` Storage bucket added by
-- #70 (migration 20260914000000_feedback_screenshots_bucket.sql).
--
-- HOW TO RUN: paste this whole file into the Supabase MCP server's `execute_sql`
-- tool against project chacavfoewyiwrfgvxtj, or into the dashboard SQL editor as a
-- fallback. Success is silence: every assertion raises only when it fails, so a run
-- that returns without a `FAIL:` exception is a pass. The whole file is wrapped in
-- `begin ... rollback`, so it leaves nothing behind whether it passes or fails.
--
-- These assertions exercise the `storage.objects` RLS policies directly via SQL
-- (insert/select as the relevant role) rather than the Storage HTTP API — the
-- policies are what actually gate every access path (dashboard, JS client,
-- public URL fetch all resolve to the same `storage.objects` row checks), so
-- this is a faithful proof of the access rule itself. `pg_advisory_lock` is not
-- needed; the `insert into storage.objects` used to seed a "real" uploaded
-- object below does not exercise Storage's own upload pipeline (checksums,
-- object size, actual bytes) — only the RLS policy on the row.
--
-- Fixtures are inserted as the owning role, which bypasses RLS. Only the
-- assertions run as `authenticated`/`anon`. `request.jwt.claims` must be set
-- *before* the role switch: after it, the session no longer has the privilege
-- to set the GUC on some configurations, and auth.uid() reads that GUC.

begin;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-000000000921', true),  -- A: owns an uploaded object
  ('00000000-0000-4000-8000-000000000922', true);   -- B: stranger to A

-- ---------------------------------------------------------------------------
-- Assertion 0 — an authenticated user's own upload (own-uid-prefixed path)
-- succeeds.
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000921","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  insert into storage.objects (bucket_id, name, owner)
  values ('feedback-screenshots',
          '00000000-0000-4000-8000-000000000921/test-screenshot.jpg',
          '00000000-0000-4000-8000-000000000921');

  if not exists (
    select 1 from storage.objects
    where bucket_id = 'feedback-screenshots'
      and name = '00000000-0000-4000-8000-000000000921/test-screenshot.jpg'
  ) then
    raise exception 'FAIL: A could not upload to A''s own uid-prefixed path (positive control)';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 1 — a cross-user write is rejected: B cannot upload into A's
-- folder (A's uid prefix, B's own auth.uid()).
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000922","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('feedback-screenshots',
            '00000000-0000-4000-8000-000000000921/hijacked.jpg',
            '00000000-0000-4000-8000-000000000922');
  exception
    when insufficient_privilege then
      null; -- expected: RLS denies the insert outright
  end;
end $$;

reset role;

do $$
begin
  if exists (
    select 1 from storage.objects
    where bucket_id = 'feedback-screenshots'
      and name = '00000000-0000-4000-8000-000000000921/hijacked.jpg'
  ) then
    raise exception 'FAIL: B uploaded into A''s uid-prefixed folder — cross-user write not rejected';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 2 — an unauthenticated write is rejected outright (no INSERT
-- policy at all is granted to `anon`).
-- ---------------------------------------------------------------------------

set local role anon;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner)
    values ('feedback-screenshots',
            '00000000-0000-4000-8000-000000000921/anon-upload.jpg',
            null);
  exception
    when insufficient_privilege then
      null; -- expected
  end;
end $$;

reset role;

do $$
begin
  if exists (
    select 1 from storage.objects
    where bucket_id = 'feedback-screenshots'
      and name = '00000000-0000-4000-8000-000000000921/anon-upload.jpg'
  ) then
    raise exception 'FAIL: an unauthenticated (anon) write to feedback-screenshots succeeded';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Assertion 3 — public/anonymous read of an already-uploaded object succeeds
-- (the SELECT policy, independent of the bucket's own `public = true` flag
-- which governs the separate unauthenticated HTTP download route — this
-- proves the RLS policy itself grants read, not just the bucket flag).
-- ---------------------------------------------------------------------------

set local role anon;

do $$
begin
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'feedback-screenshots'
      and name = '00000000-0000-4000-8000-000000000921/test-screenshot.jpg'
  ) then
    raise exception 'FAIL: anon could not read an uploaded feedback-screenshots object — public-read policy broken';
  end if;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Assertion 4 — the bucket itself is genuinely public (governs the
-- unauthenticated HTTP download route the Edge Function's markdown image and
-- GitHub's own image-fetching bots rely on).
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from storage.buckets where id = 'feedback-screenshots' and public = true) then
    raise exception 'FAIL: feedback-screenshots bucket is not marked public';
  end if;
end $$;

rollback;
