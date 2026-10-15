-- 0016_workout_duration.sql
-- Adds the column Live Workout Mode needs to persist a session's duration
-- (04_ApplicationFlow.md §2.8's "finished" state: "writes to journal: sport
-- ✓, duration, full free-text detail"). journal_entries previously had no
-- slot for this at all — workout_detail (free text) already carries the
-- per-set log as newline-separated "Set N — <transcript>" lines.
alter table journal_entries
  add column if not exists workout_duration_seconds int;
