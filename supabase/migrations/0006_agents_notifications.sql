-- 0006_agents_notifications.sql
-- Per docs/05_DataModel.md §2.9-2.10. Also backfills the source_proposal_id
-- foreign keys on tasks/calendar_items (0003) and finance_entries (0004)
-- now that action_proposals exists — those tables were created earlier in
-- dependency order per the master prompt's file grouping, so the FK
-- constraint is added here via ALTER TABLE rather than reordering files.

create table if not exists agent_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type text check (job_type in ('weekly_prep', 'upcoming_reminder', 'low_energy_suggestion', 'meal_agent', 'revenue_agent', 'sport_agent')),
  trigger text check (trigger in ('user', 'scheduled')),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  result_summary jsonb,
  idempotency_key text unique,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists action_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references conversations(id),
  agent_run_id uuid references agent_runs(id),
  action_type text not null,
  proposed_fields jsonb not null,
  confidence numeric,
  explanation text,
  status text not null default 'proposed' check (status in ('proposed', 'confirmed', 'dismissed', 'expired')),
  prompt_version text,
  model_id text,
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table tasks
  add constraint tasks_source_proposal_id_fkey
  foreign key (source_proposal_id) references action_proposals(id);

alter table calendar_items
  add constraint calendar_items_source_proposal_id_fkey
  foreign key (source_proposal_id) references action_proposals(id);

alter table finance_entries
  add constraint finance_entries_source_proposal_id_fkey
  foreign key (source_proposal_id) references action_proposals(id);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text,
  title text,
  body text,
  deep_link text,
  read boolean not null default false,
  source_agent_run_id uuid references agent_runs(id),
  created_at timestamptz not null default now()
);

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table agent_runs enable row level security;
alter table action_proposals enable row level security;
alter table notifications enable row level security;
alter table push_subscriptions enable row level security;

create policy "select_own" on agent_runs for select using (auth.uid() = user_id);
create policy "insert_own" on agent_runs for insert with check (auth.uid() = user_id);
create policy "update_own" on agent_runs for update using (auth.uid() = user_id);
create policy "delete_own" on agent_runs for delete using (auth.uid() = user_id);

create policy "select_own" on action_proposals for select using (auth.uid() = user_id);
create policy "insert_own" on action_proposals for insert with check (auth.uid() = user_id);
create policy "update_own" on action_proposals for update using (auth.uid() = user_id);
create policy "delete_own" on action_proposals for delete using (auth.uid() = user_id);

create policy "select_own" on notifications for select using (auth.uid() = user_id);
create policy "insert_own" on notifications for insert with check (auth.uid() = user_id);
create policy "update_own" on notifications for update using (auth.uid() = user_id);
create policy "delete_own" on notifications for delete using (auth.uid() = user_id);

create policy "select_own" on push_subscriptions for select using (auth.uid() = user_id);
create policy "insert_own" on push_subscriptions for insert with check (auth.uid() = user_id);
create policy "update_own" on push_subscriptions for update using (auth.uid() = user_id);
create policy "delete_own" on push_subscriptions for delete using (auth.uid() = user_id);
