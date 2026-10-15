-- 0020_fix_calendar_items_upsert_conflict.sql
-- Fixes a real bug found via live testing: google-calendar-sync's
-- `.upsert(..., { onConflict: "user_id,external_id" })` failed on every
-- single call with Postgres error 42P10 ("there is no unique or exclusion
-- constraint matching the ON CONFLICT specification"). The sync correctly
-- fetched events from Google (confirmed via a live test event) but every
-- import then silently failed at the upsert step, so 0 events ever landed
-- in calendar_items despite the UI reporting "sync complete."
--
-- Root cause: migration 0019 created calendar_items_user_external_id_idx
-- as a PARTIAL unique index (`where external_id is not null`). Postgres's
-- ON CONFLICT target resolution requires the conflict target to match a
-- unique index's definition EXACTLY, including its WHERE predicate — and
-- that predicate can't be supplied through Supabase's upsert() API, which
-- only accepts a column list for onConflict. A partial index can never be
-- used as an implicit ON CONFLICT (columns) target.
--
-- Fix: replace it with a plain (non-partial) unique index. This is safe
-- for the same reason the partial index's own comment gave for being
-- unnecessary: standard SQL unique-index semantics already treat NULL as
-- distinct from every other NULL, so manual/ai_confirmed rows (which never
-- set external_id, i.e. external_id IS NULL) were never going to collide
-- with each other under a plain unique index either — the WHERE clause
-- was solving a problem that didn't exist, while breaking the one thing
-- the index was actually added for.
drop index if exists calendar_items_user_external_id_idx;

create unique index if not exists calendar_items_user_external_id_idx
  on calendar_items (user_id, external_id);
