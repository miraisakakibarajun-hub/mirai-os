-- AI-2026-037: review candidate; not applied to the connected database.
-- Run as table owner. Existing records, RLS, functions and service_role grants are retained.
begin;
revoke all privileges on table public.monitoring_records, public.support_records,
  public.ai_documents, public.assessment_records from public, anon, authenticated;
grant select, insert, update on table public.monitoring_records, public.support_records,
  public.ai_documents, public.assessment_records to authenticated;

-- Abort the transaction if inherited privileges defeat the intended restriction.
do $$
declare
  t text;
  r text;
  p text;
  privileges text[] := array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'];
begin
  if current_setting('server_version_num')::integer >= 170000 then
    privileges := array_append(privileges, 'MAINTAIN');
  end if;
  foreach t in array array['monitoring_records','support_records','ai_documents','assessment_records'] loop
    foreach r in array array['anon','authenticated'] loop
      foreach p in array privileges loop
        if has_table_privilege(r, 'public.' || t, p)
           is distinct from (r = 'authenticated' and p in ('SELECT','INSERT','UPDATE')) then
          raise exception 'Unexpected effective privilege: role=%, table=%, privilege=%', r, t, p;
        end if;
      end loop;
    end loop;
  end loop;
end $$;
commit;
