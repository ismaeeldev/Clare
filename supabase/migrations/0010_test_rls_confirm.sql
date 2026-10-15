-- 0010_test_rls_confirm.sql
-- One-off, scoped to two specific throwaway test accounts created for the
-- Step 2/3 two-user RLS cross-access test (CLA-FR-003). Manually confirms
-- ONLY these two user ids (never a project-wide auth setting change) so
-- they can sign in via the password grant without needing a real inbox to
-- click a verification link. Both accounts are disposable test fixtures.
update auth.users
set email_confirmed_at = now()
where id in ('28938103-760a-40a5-b406-4e6dfaac2462', 'b39262e3-7b87-4231-b713-3a793f1e07c7')
  and email_confirmed_at is null;
