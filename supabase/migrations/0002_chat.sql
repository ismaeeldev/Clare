-- 0002_chat.sql
-- Per docs/05_DataModel.md §2.2.

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_created_idx on messages (conversation_id, created_at);

alter table conversations enable row level security;
alter table messages enable row level security;

create policy "select_own" on conversations for select using (auth.uid() = user_id);
create policy "insert_own" on conversations for insert with check (auth.uid() = user_id);
create policy "update_own" on conversations for update using (auth.uid() = user_id);
create policy "delete_own" on conversations for delete using (auth.uid() = user_id);

create policy "select_own" on messages for select using (auth.uid() = user_id);
create policy "insert_own" on messages for insert with check (auth.uid() = user_id);
create policy "update_own" on messages for update using (auth.uid() = user_id);
create policy "delete_own" on messages for delete using (auth.uid() = user_id);
