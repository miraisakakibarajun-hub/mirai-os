begin;
revoke insert, update, delete, truncate, references, trigger
  on public.users from public, anon, authenticated;
drop policy if exists authenticated_write_users on public.users;
drop policy if exists authenticated_update_users on public.users;
commit;
