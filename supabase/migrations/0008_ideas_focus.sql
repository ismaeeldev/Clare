-- 0008_ideas_focus.sql
-- Per docs/05_DataModel.md §2.12-2.13.

create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  category text check (category in ('pro', 'perso')),
  linked_project text,
  source text not null default 'manual' check (source in ('manual', 'brain_dump')),
  created_at timestamptz not null default now()
);

create table if not exists focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  linked_task_id uuid references tasks(id),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,
  created_at timestamptz not null default now()
);

alter table ideas enable row level security;
alter table focus_sessions enable row level security;

create policy "select_own" on ideas for select using (auth.uid() = user_id);
create policy "insert_own" on ideas for insert with check (auth.uid() = user_id);
create policy "update_own" on ideas for update using (auth.uid() = user_id);
create policy "delete_own" on ideas for delete using (auth.uid() = user_id);

create policy "select_own" on focus_sessions for select using (auth.uid() = user_id);
create policy "insert_own" on focus_sessions for insert with check (auth.uid() = user_id);
create policy "update_own" on focus_sessions for update using (auth.uid() = user_id);
create policy "delete_own" on focus_sessions for delete using (auth.uid() = user_id);
