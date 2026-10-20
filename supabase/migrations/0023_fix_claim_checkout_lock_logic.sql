-- 0023_fix_claim_checkout_lock_logic.sql
-- Fixes a real logic bug in 0021's claim_checkout_lock, caught by testing
-- it live before relying on it: the WHERE clause was
--   status not in ('active','trialing','past_due') or updated_at < ...
-- 'incomplete' (the status THIS function itself writes) is not in that
-- exclusion list, so the first condition was always true for any row this
-- function had just claimed — the OR short-circuited true regardless of
-- timing, meaning a second concurrent call could ALSO claim the lock.
-- Verified live: two sequential calls for the same user both returned
-- claimed:true, which completely defeats the race fix migration 0021 was
-- meant to add.
--
-- Corrected logic explicitly enumerates the only two cases a claim should
-- succeed on an existing row: it was already canceled (free to
-- resubscribe immediately), or it's a stale 'incomplete' claim older than
-- 10 minutes (an abandoned checkout, safe to retry). Every other existing
-- status (active/trialing/past_due, or a fresh 'incomplete' claim) blocks.
create or replace function claim_checkout_lock(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean := false;
begin
  insert into subscriptions (user_id, status, updated_at)
  values (p_user_id, 'incomplete', now())
  on conflict (user_id) do update
    set status = 'incomplete', updated_at = now()
    where subscriptions.status = 'canceled'
       or (subscriptions.status = 'incomplete' and subscriptions.updated_at < now() - interval '10 minutes')
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;
