-- 0024_grant_signup_trial.sql
-- Client report: the advertised 7-day free trial (no card, no Stripe) was
-- never actually granted — nothing in signup wrote a subscriptions row at
-- all, so every new user started at "no row" = not entitled
-- (checkEntitlement treats a missing row the same as a canceled one).
--
-- Grants it server-side via an AFTER INSERT trigger on auth.users — the
-- standard Supabase pattern for "do something the moment a user signs up"
-- that can't be done from the client (RLS has no insert policy for
-- subscriptions at all; only service-role/this trigger can write it,
-- matching the "edge function confirms, client never self-grants"
-- discipline already applied elsewhere — e.g. integration_connections,
-- subscriptions' own stripe-webhook-only write policy). 'trialing' is
-- already in ENTITLED_STATUSES (_shared/entitlement.ts) and already in
-- the subscriptions.status CHECK constraint (0007_billing.sql) — no
-- schema change needed there, just actually granting it.
--
-- Expiry is enforced by 0025's entitlement.ts change (current_period_end
-- check), not by this trigger — this only sets the row and its 7-day
-- boundary; if the user later subscribes via Stripe, stripe-webhook's own
-- upsert onConflict(user_id) overwrites this row with the real
-- active/current_period_end naturally, no special-casing needed.
create or replace function grant_signup_trial()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.subscriptions (user_id, status, current_period_end)
  values (new.id, 'trialing', now() + interval '7 days')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_trial on auth.users;
create trigger on_auth_user_created_trial
  after insert on auth.users
  for each row execute function grant_signup_trial();
