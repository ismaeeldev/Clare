-- 0011_shopping_list_checked.sql
-- Step 5.3, docs/01_ScopeDocument.md §4.10 / docs/04_ApplicationFlow.md
-- §2.10: "Shopping list: computed, grouped by aisle, checkboxes (persist
-- checked state)". The shopping list itself is computed client-side from
-- meal_plans.ingredients for a given week (not stored — it's a pure
-- derivation, and storing a duplicate of it would risk drifting out of
-- sync with the meal plan it's computed from). Only the per-item checked
-- state needs to persist, keyed by a stable item identity (week + the
-- normalized ingredient name) so it survives a re-render/reload without
-- needing its own table full of denormalized shopping-list rows.
create table if not exists shopping_list_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  item_key text not null, -- normalized ingredient name, stable across regenerations of the same week's plan
  checked boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, week_start, item_key)
);

alter table shopping_list_checks enable row level security;

create policy "select_own" on shopping_list_checks for select using (auth.uid() = user_id);
create policy "insert_own" on shopping_list_checks for insert with check (auth.uid() = user_id);
create policy "update_own" on shopping_list_checks for update using (auth.uid() = user_id);
create policy "delete_own" on shopping_list_checks for delete using (auth.uid() = user_id);
