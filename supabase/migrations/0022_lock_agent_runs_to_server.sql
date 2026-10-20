-- 0022_lock_agent_runs_to_server.sql
-- agent_runs is written exclusively by scheduled-agents via the
-- service-role client (which bypasses RLS entirely) and read only by
-- admin-metrics, also service-role. No client code anywhere reads or
-- writes this table directly. The insert_own/update_own/delete_own
-- policies from 0006_agents_notifications.sql therefore serve no
-- legitimate purpose — they only let a client INSERT/UPDATE its own
-- agent_runs row with a fabricated status/result_summary/idempotency_key,
-- which could confuse scheduled-agents' own idempotency check if that
-- client-forged data were ever trusted downstream. Same defense-in-depth
-- tightening already applied to subscriptions (0007) and
-- integration_connections (0019): "edge function confirms, client never
-- self-writes."
drop policy if exists "insert_own" on agent_runs;
drop policy if exists "update_own" on agent_runs;
drop policy if exists "delete_own" on agent_runs;
-- select_own is kept — harmless, and nothing currently reads it from the
-- client, but removing read access isn't this fix's concern.
