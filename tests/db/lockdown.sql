-- Test-only safety overlay. NOT a product migration, NOT for a hosted DB.
revoke all on all tables in schema public from public,anon,authenticated;
revoke all on all sequences in schema public from public,anon,authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;

