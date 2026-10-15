-- 0019_google_calendar_sync.sql
-- Supports the Google Calendar OAuth connect/sync feature.

-- Prevents a re-sync from creating duplicate calendar_items rows for the
-- same Google event — external_id is only meaningful (and only ever set)
-- for source='google_calendar' rows, so the uniqueness constraint is
-- scoped to those via a partial index rather than a table-wide unique
-- constraint (manual/ai_confirmed rows never set external_id and must
-- never be blocked by this).
create unique index if not exists calendar_items_user_external_id_idx
  on calendar_items (user_id, external_id)
  where external_id is not null;

-- integration_connections previously had full insert_own/update_own
-- client policies (05_DataModel.md §2.15's own spec note: tokens are
-- "stored server-side only, never exposed to client" — but the RLS as
-- originally written let a client UPDATE the row to status='connected'
-- directly, with zero OAuth ever having happened, since RLS only checks
-- auth.uid() = user_id, not how the row got there). Status transitions
-- must only happen via the google-oauth-callback and the disconnect edge
-- functions (both using the service role, which bypasses RLS entirely) —
-- never a direct client write. select_own is kept: the client still needs
-- to read status/last_synced_at to render the Settings UI.
drop policy if exists "insert_own" on integration_connections;
drop policy if exists "update_own" on integration_connections;
drop policy if exists "delete_own" on integration_connections;
