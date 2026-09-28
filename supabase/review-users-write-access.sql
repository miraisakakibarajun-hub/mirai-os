-- REVIEW ONLY: not applied and not a registered migration.
-- Before release, generate a migration with the Supabase CLI and test in an isolated DB.
begin;
revoke insert, update, delete, truncate, references, trigger
  on public.users from public, anon, authenticated;
drop policy if exists authenticated_write_users on public.users;
drop policy if exists authenticated_update_users on public.users;
-- Existing SELECT access and SECURITY DEFINER RPCs are preserved.
-- Verify column-level grants and inherited privileges before deployment.
commit;
