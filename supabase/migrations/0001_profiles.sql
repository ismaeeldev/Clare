-- 0001_profiles.sql
-- Per docs/05_DataModel.md §2.1. profiles.user_id IS the primary key
-- (1:1 with auth.users), not a separate uuid id — this table has no
-- separate `id` column per the data model reference.

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  onboarding_step int not null default 0,
  onboarding_complete boolean not null default false,
  display_name text,
  identity jsonb,
  business jsonb,
  sport jsonb,
  nutrition jsonb,
  preferences jsonb not null default '{}',
  timezone text not null default 'Europe/Paris',
  quiet_hours jsonb not null default '{"start":"21:00","end":"08:00"}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "select_own" on profiles for select using (auth.uid() = user_id);
create policy "insert_own" on profiles for insert with check (auth.uid() = user_id);
create policy "update_own" on profiles for update using (auth.uid() = user_id);
create policy "delete_own" on profiles for delete using (auth.uid() = user_id);
