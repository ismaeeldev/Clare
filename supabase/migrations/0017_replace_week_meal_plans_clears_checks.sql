-- 0017_replace_week_meal_plans_clears_checks.sql
-- Nutrition module QA pass: regenerating a week's meal plan (meal-plan-
-- generate -> replace_week_meal_plans RPC) replaced meal_plans rows but
-- never touched shopping_list_checks for that same week. item_key is the
-- normalized ingredient NAME (stable across regenerations, by design --
-- see 0011's own comment), so any ingredient that recurs in the
-- regenerated plan (e.g. "tomate" again next week) silently came back
-- pre-checked on the next load, even though nothing was bought yet
-- against the new list. The client only cleared its own in-memory
-- `checks` state after a successful regenerate (NutritionScreen.tsx) --
-- a reload or the next fetchShoppingChecks call re-pulled the stale rows
-- from the DB and resurrected the old checked state.
--
-- Fix: delete this week's shopping_list_checks in the same atomic
-- transaction as the meal_plans replace, so a regenerated plan always
-- starts with a clean, unchecked shopping list server-side too.
create or replace function replace_week_meal_plans(
  p_user_id uuid,
  p_week_start date,
  p_rows jsonb
)
returns setof meal_plans
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
begin
  if p_user_id <> auth.uid() then
    raise exception 'user_id must match the authenticated user';
  end if;

  delete from meal_plans where user_id = p_user_id and week_start = p_week_start;
  delete from shopping_list_checks where user_id = p_user_id and week_start = p_week_start;

  return query
  insert into meal_plans (
    user_id, week_start, day, meal_slot, title, ingredients,
    calories, protein_g, carbs_g, fat_g, calculation_source, calculation_version, generation_status
  )
  select
    p_user_id,
    p_week_start,
    (r->>'day')::date,
    r->>'meal_slot',
    r->>'title',
    r->'ingredients',
    (r->>'calories')::numeric,
    (r->>'protein_g')::numeric,
    (r->>'carbs_g')::numeric,
    (r->>'fat_g')::numeric,
    r->>'calculation_source',
    r->>'calculation_version',
    coalesce(r->>'generation_status', 'ok')
  from jsonb_array_elements(p_rows) as r
  returning *;
end;
$$;

grant execute on function replace_week_meal_plans(uuid, date, jsonb) to authenticated;
