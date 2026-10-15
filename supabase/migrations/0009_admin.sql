-- 0009_admin.sql
-- Per docs/05_DataModel.md §2.14. admin_users is a server-side allow-list,
-- not user-owned. Deliberately NO select/insert/update/delete policy for
-- anon/authenticated roles — only ever read by an Edge Function using the
-- service-role key (which bypasses RLS) to check auth.uid() before allowing
-- /admin access. Rows are inserted manually via the Supabase dashboard SQL
-- editor by the operator, never through the app — no self-service
-- "become admin" path exists or should ever exist.

create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin')),
  added_by text,
  created_at timestamptz not null default now()
);

alter table admin_users enable row level security;

-- No policies created: RLS enabled with zero policies means every
-- anon/authenticated request is denied by default, which is exactly the
-- intended "server-side only" access model for this table.
