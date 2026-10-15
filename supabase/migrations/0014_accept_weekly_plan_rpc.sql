-- 0014_accept_weekly_plan_rpc.sql
-- Fixes a real correctness gap found in flow verification (04_ApplicationFlow.md
-- §2.9's "previous accepted plan remains untouched on failure" guarantee):
-- weeklyPlanRepo.ts previously did the supersede-old-row UPDATE and the
-- insert-new-row INSERT as two separate round trips. If the UPDATE succeeded
-- but the INSERT then failed (network drop, validation error), the week was
-- left with ZERO accepted plans — worse than "untouched," an outright data
-- loss window. This function wraps both statements in one Postgres function
-- body, which Postgres always runs as a single transaction — either both
-- succeed or neither does.
--
-- security invoker (not definer): runs with the calling user's own role, so
-- the existing RLS policies on weekly_plans (auth.uid() = user_id) still
-- apply in full — this is not a privilege-escalation path, just an atomicity
-- fix.
create or replace function accept_weekly_plan(
  p_user_id uuid,
  p_week_start date,
  p_summary jsonb,
  p_plan jsonb,
  p_generated_by_model text
)
returns weekly_plans
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  v_existing weekly_plans;
  v_next_version int;
  v_result weekly_plans;
begin
  if p_user_id <> auth.uid() then
    raise exception 'user_id must match the authenticated user';
  end if;

  select * into v_existing
  from weekly_plans
  where user_id = p_user_id and week_start = p_week_start and status = 'accepted'
  limit 1;

  v_next_version := coalesce(v_existing.version, 0) + 1;

  if v_existing.id is not null then
    update weekly_plans set status = 'superseded' where id = v_existing.id;
  end if;

  insert into weekly_plans (user_id, week_start, version, status, summary, plan, generated_by_model)
  values (p_user_id, p_week_start, v_next_version, 'accepted', p_summary, p_plan, p_generated_by_model)
  returning * into v_result;

  return v_result;
end;
$$;

grant execute on function accept_weekly_plan(uuid, date, jsonb, jsonb, text) to authenticated;
