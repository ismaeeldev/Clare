-- 0005_nutrition.sql
-- Per docs/05_DataModel.md §2.7-2.8. nutrition_foods is shared reference
-- data, not user-owned: read-only for authenticated users, no client
-- insert/update/delete policy (populated only by an admin import script).

create table if not exists meal_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  day date not null,
  meal_slot text check (meal_slot in ('breakfast', 'lunch', 'dinner')),
  title text,
  ingredients jsonb,
  calories numeric,
  protein_g numeric,
  carbs_g numeric,
  fat_g numeric,
  calculation_source text,
  calculation_version text,
  generation_status text not null default 'ok' check (generation_status in ('ok', 'partial_unknown_items', 'failed')),
  created_at timestamptz not null default now()
);

create table if not exists nutrition_foods (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('ciqual', 'off')),
  source_id text not null,
  name text not null,
  kcal_per_100g numeric,
  protein_per_100g numeric,
  carbs_per_100g numeric,
  fat_per_100g numeric,
  dataset_version text not null,
  quality_flag text,
  created_at timestamptz not null default now(),
  unique (source, source_id, dataset_version)
);

alter table meal_plans enable row level security;
alter table nutrition_foods enable row level security;

create policy "select_own" on meal_plans for select using (auth.uid() = user_id);
create policy "insert_own" on meal_plans for insert with check (auth.uid() = user_id);
create policy "update_own" on meal_plans for update using (auth.uid() = user_id);
create policy "delete_own" on meal_plans for delete using (auth.uid() = user_id);

-- Shared reference data: readable by any authenticated user, no client
-- write policy at all (import script uses the service role key, which
-- bypasses RLS by design).
create policy "select_authenticated" on nutrition_foods for select to authenticated using (true);
