-- 0004_journal_finance.sql
-- Per docs/05_DataModel.md §2.5-2.6. finance_entries.source_proposal_id FK
-- to action_proposals(id) is added later in 0006_agents_notifications.sql,
-- same deferred-FK reasoning as 0003_planning.sql.

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  text_content text,
  energy int check (energy between 1 and 5),
  mood int check (mood between 1 and 5),
  revenue numeric(10, 2),
  expenses numeric(10, 2),
  meals_note text,
  project_touched text,
  workout_status text check (workout_status in ('done', 'light', 'none')),
  workout_detail text,
  ai_feedback text,
  ai_feedback_status text not null default 'pending' check (ai_feedback_status in ('pending', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, entry_date)
);

create table if not exists finance_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null,
  amount numeric(10, 2) not null,
  type text not null check (type in ('revenue', 'expense')),
  category text,
  note text,
  source text not null default 'manual' check (source in ('manual', 'ai_confirmed')),
  source_proposal_id uuid,
  created_at timestamptz not null default now()
);

alter table journal_entries enable row level security;
alter table finance_entries enable row level security;

create policy "select_own" on journal_entries for select using (auth.uid() = user_id);
create policy "insert_own" on journal_entries for insert with check (auth.uid() = user_id);
create policy "update_own" on journal_entries for update using (auth.uid() = user_id);
create policy "delete_own" on journal_entries for delete using (auth.uid() = user_id);

create policy "select_own" on finance_entries for select using (auth.uid() = user_id);
create policy "insert_own" on finance_entries for insert with check (auth.uid() = user_id);
create policy "update_own" on finance_entries for update using (auth.uid() = user_id);
create policy "delete_own" on finance_entries for delete using (auth.uid() = user_id);
