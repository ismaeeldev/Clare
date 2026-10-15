-- 0013_integrations.sql
-- Step 9: Integration connections table (Google Calendar, Strava)
-- Docs reference: docs/05_DataModel.md §2.15

create table if not exists integration_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null check (provider in ('google_calendar','strava')),
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  last_synced_at timestamptz,
  status text not null check (status in ('connected','disconnected','error')) default 'connected',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, provider)
);

alter table integration_connections enable row level security;

create policy "select_own" on integration_connections for select using (auth.uid() = user_id);
create policy "insert_own" on integration_connections for insert with check (auth.uid() = user_id);
create policy "update_own" on integration_connections for update using (auth.uid() = user_id);
create policy "delete_own" on integration_connections for delete using (auth.uid() = user_id);
