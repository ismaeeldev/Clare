-- 0003_planning.sql
-- Per docs/05_DataModel.md §2.3-2.4. tasks/calendar_items' source_proposal_id
-- FK to action_proposals(id) is added later in 0006_agents_notifications.sql
-- (via ALTER TABLE) since action_proposals doesn't exist yet at this point
-- in migration order — the data model groups these logically by domain,
-- not by dependency order, so the FK constraint is deferred rather than
-- reordering the whole migration set.

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  status text not null default 'open' check (status in ('open', 'done', 'dropped')),
  priority text check (priority in ('big', 'medium', 'small')),
  due_date date,
  source text not null default 'manual' check (source in ('manual', 'ai_confirmed', 'weekly_plan')),
  source_proposal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists calendar_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  status text not null default 'confirmed' check (status in ('confirmed', 'tentative', 'cancelled')),
  source text not null default 'manual' check (source in ('manual', 'ai_confirmed', 'google_calendar')),
  source_proposal_id uuid,
  external_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists weekly_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  version int not null default 1,
  status text not null default 'generating' check (status in ('generating', 'accepted', 'failed', 'superseded')),
  summary jsonb,
  plan jsonb,
  generated_by_model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week_start, version)
);

-- Only one accepted plan per (user_id, week_start) — never overwrite an
-- accepted plan, always insert a new version row (per §2.4).
create unique index if not exists weekly_plans_one_accepted_per_week
  on weekly_plans (user_id, week_start)
  where status = 'accepted';

alter table tasks enable row level security;
alter table calendar_items enable row level security;
alter table weekly_plans enable row level security;

create policy "select_own" on tasks for select using (auth.uid() = user_id);
create policy "insert_own" on tasks for insert with check (auth.uid() = user_id);
create policy "update_own" on tasks for update using (auth.uid() = user_id);
create policy "delete_own" on tasks for delete using (auth.uid() = user_id);

create policy "select_own" on calendar_items for select using (auth.uid() = user_id);
create policy "insert_own" on calendar_items for insert with check (auth.uid() = user_id);
create policy "update_own" on calendar_items for update using (auth.uid() = user_id);
create policy "delete_own" on calendar_items for delete using (auth.uid() = user_id);

create policy "select_own" on weekly_plans for select using (auth.uid() = user_id);
create policy "insert_own" on weekly_plans for insert with check (auth.uid() = user_id);
create policy "update_own" on weekly_plans for update using (auth.uid() = user_id);
create policy "delete_own" on weekly_plans for delete using (auth.uid() = user_id);
