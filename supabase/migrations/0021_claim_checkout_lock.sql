-- 0021_claim_checkout_lock.sql
-- Fixes a real double-subscription race in stripe-checkout: the function
-- only checked checkEntitlement (reads subscriptions.status) before
-- creating a Stripe Checkout Session, but subscriptions is never written
-- until stripe-webhook confirms payment later. Two near-simultaneous
-- checkout requests (a double-tap on "S'abonner", or two tabs) both read
-- entitled:false and both successfully create a session — if both get
-- paid, Stripe bills twice but subscriptions' unique user_id constraint
-- means the second webhook silently overwrites the first row, leaving no
-- record of the double charge anywhere in the DB.
--
-- This RPC makes the guard atomic: it claims a short-lived "incomplete"
-- placeholder row via a single INSERT ... ON CONFLICT DO UPDATE ... WHERE,
-- which Postgres serializes per-row — the second concurrent caller's
-- UPDATE blocks until the first commits, then evaluates the WHERE clause
-- against the now-committed 'incomplete' row and finds no match, so only
-- one caller ever gets claimed:true. 'incomplete' is already in
-- ENTITLED_STATUSES's exclusion set (_shared/entitlement.ts), so writing
-- this placeholder cannot accidentally grant access. The 10-minute window
-- lets a genuinely abandoned checkout (closed tab, never paid) be retried
-- later rather than permanently locking the user out.
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
    where subscriptions.status not in ('active', 'trialing', 'past_due')
       or subscriptions.updated_at < now() - interval '10 minutes'
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

revoke all on function claim_checkout_lock(uuid) from public;
grant execute on function claim_checkout_lock(uuid) to service_role;
