-- 0015_replace_week_meal_plans_rpc.sql
-- Same atomicity gap as 0014, found in the same flow-verification pass:
-- meal-plan-generate/index.ts did DELETE (old week's rows) then INSERT (new
-- rows) as two separate client calls. If the INSERT failed right after the
-- DELETE succeeded, the week's meal plan was silently wiped with nothing to
-- replace it. This function wraps both in one transaction.
--
-- security invoker: RLS policies on meal_plans (auth.uid() = user_id) still
-- apply — this is an atomicity fix, not a privilege change.
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
    -- generation_status is NOT NULL with a column default of 'ok' — but an
    -- explicit NULL in an INSERT always overrides a column default, so a
    -- future caller that omits this key would fail the whole batch insert
    -- instead of gracefully falling back to 'ok'. coalesce here restores
    -- that fallback behavior explicitly.
    coalesce(r->>'generation_status', 'ok')
  from jsonb_array_elements(p_rows) as r
  returning *;
end;
$$;

grant execute on function replace_week_meal_plans(uuid, date, jsonb) to authenticated;
