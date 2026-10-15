-- 0012_scheduled_agents_cron.sql
-- Step 6.2, docs/03_MasterPrompts.md §6.2 / docs/01_ScopeDocument.md
-- CLA-FR-019: exactly three scheduled behaviors, no more — weekly
-- preparation prompt, upcoming accepted-item reminder, and recent
-- low-energy planning suggestion. All three are dispatched by ONE cron
-- job (hourly) that calls the scheduled-agents Edge Function, which does
-- its own per-user timezone/quiet_hours-aware filtering and idempotency
-- check (via agent_runs.idempotency_key) — this keeps the cron
-- configuration itself simple (one job, one schedule) while the actual
-- "should X user get Y job right now" decision, which needs real user
-- data, happens in application code, not SQL.
--
-- pg_cron/pg_net are already enabled on every Supabase project by default
-- (they ship in the "extensions" schema) — this migration just registers
-- the scheduled job and grants the minimum needed for it to call out via
-- HTTP.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- The cron job needs the project's own function URL + a bearer token to
-- authenticate its call into scheduled-agents (a cron-triggered call has
-- no per-request user JWT to rely on, unlike every other Edge Function
-- call in this project). Originally this used the Supabase service-role
-- key directly (CLARE_SERVICE_ROLE_KEY) — but this project has both a
-- legacy JWT-format service_role key and a newer `sb_secret_...`-format
-- key, `Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")` inside the Edge
-- Function runtime resolves to the NEW format, and that key's full value
-- is never retrievable via the Supabase CLI (always shown redacted) — so
-- there was no reliable way to configure the cron caller to send a
-- matching value. Found live in this session's own adversarial review
-- (even the real service-role JWT was rejected by the function's own
-- auth check until this was diagnosed and fixed).
--
-- Fixed by using a dedicated shared secret (CLARE_CRON_SECRET) instead,
-- generated once and set identically in two places, neither committed to
-- this file: (1) as an Edge Function secret via `supabase secrets set
-- CLARE_CRON_SECRET=...`, and (2) in Supabase Vault via a one-off
-- `supabase db query` command (same pattern used for
-- CLARE_FUNCTIONS_BASE_URL below). scheduled-agents/index.ts checks the
-- caller's Authorization header against Deno.env.get("CLARE_CRON_SECRET").
-- If this project is ever reset, regenerate a secret and re-set it in
-- both places before the cron job can authenticate successfully again.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'CLARE_FUNCTIONS_BASE_URL') then
    perform vault.create_secret('https://itzacgldybpcxgnhscal.supabase.co/functions/v1', 'CLARE_FUNCTIONS_BASE_URL', 'Base URL for Clare Edge Functions');
  end if;
end $$;

-- Runs hourly. scheduled-agents itself decides, per user, whether "now" is
-- the right time for each of the 3 job types (Sunday + user's own
-- quiet_hours for weekly_prep, upcoming-item proximity for
-- upcoming_reminder, recent journal signal for low_energy_suggestion) —
-- hourly is frequent enough to hit each user's own preferred window
-- without over-triggering, and idempotency_key prevents a duplicate
-- agent_runs row even if this job fires more than once in the same
-- window for the same user for any reason.
select
  cron.schedule(
    'clare-scheduled-agents-hourly',
    '0 * * * *',
    $$
    select
      net.http_post(
        url := (select decrypted_secret from vault.decrypted_secrets where name = 'CLARE_FUNCTIONS_BASE_URL') || '/scheduled-agents',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'CLARE_CRON_SECRET')
        ),
        body := '{}'::jsonb
      ) as request_id;
    $$
  );
