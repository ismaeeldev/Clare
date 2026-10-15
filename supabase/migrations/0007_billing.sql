-- 0007_billing.sql
-- Per docs/05_DataModel.md §2.11. subscriptions/webhook_events are
-- server-writes-only: Edge Functions using the service role key bypass RLS
-- entirely, so no insert/update/delete policy exists for anon/authenticated
-- roles on either table. subscriptions gets a select_own policy only.

create table if not exists subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  status text check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  current_period_end timestamptz,
  plan_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null unique,
  type text,
  processed_at timestamptz,
  payload_summary jsonb
);

alter table subscriptions enable row level security;
alter table webhook_events enable row level security;

create policy "select_own" on subscriptions for select using (auth.uid() = user_id);
-- No insert/update/delete policy for subscriptions: written only by
-- Stripe-webhook Edge Functions via the service role key.

-- No select/insert/update/delete policy for webhook_events at all: it is
-- purely a server-side idempotency log, never read or written by clients.
