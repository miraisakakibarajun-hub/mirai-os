-- mirai-os-dev: 利用者ごとの文書下書き。既存plansは変更しない。
begin;
create table public.ai_documents (
  id uuid primary key,
  user_id uuid not null references public.users(id),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null,
  updated_by uuid references public.staff(id) on delete set null
);
create index ai_documents_user_date on public.ai_documents(user_id, created_at desc);
create trigger ai_documents_updated_at before update on public.ai_documents
  for each row execute function public.set_updated_at();
alter table public.ai_documents enable row level security;
create policy authenticated_read_ai_documents on public.ai_documents for select to authenticated using (created_by in (select id from public.staff where auth_user_id = auth.uid()));
create policy authenticated_insert_ai_documents on public.ai_documents for insert to authenticated with check (created_by in (select id from public.staff where auth_user_id = auth.uid()) and updated_by = created_by);
create policy authenticated_update_ai_documents on public.ai_documents for update to authenticated using (created_by in (select id from public.staff where auth_user_id = auth.uid())) with check (created_by in (select id from public.staff where auth_user_id = auth.uid()) and updated_by = created_by);
revoke all on public.ai_documents from anon;
grant select, insert, update on public.ai_documents to authenticated;
revoke delete on public.ai_documents from authenticated;

create function public.save_ai_document(p_id uuid, p_user_id uuid, p_expected_version integer, p_content jsonb)
returns setof public.ai_documents
language plpgsql security invoker set search_path = ''
as $$
declare
  v_staff uuid;
  v_key text;

  v_row public.ai_documents;
  v_ref jsonb;
  v_allowed boolean;
begin
  select id into v_staff from public.staff where auth_user_id = auth.uid();
  if v_staff is null then raise exception '職員情報が見つかりません。' using errcode='M1001'; end if;
  if p_id is null or p_user_id is null or p_expected_version is null or p_expected_version < 0
    or p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception '記録の形式が不正です。' using errcode='M5002';
  end if;
  foreach v_key in array array['kind','body','status','model'] loop
    if jsonb_typeof(p_content -> v_key) is distinct from 'string' then raise exception '文書の項目が不正です。' using errcode='M5002'; end if;
  end loop;
  if p_content ->> 'kind' not in ('サービス等利用計画の下書き','モニタリングの下書き','支援経過の要約')
    or p_content ->> 'status' not in ('draft','reviewed')
    or length(btrim(p_content ->> 'body')) = 0 or length(p_content ->> 'body') > 30000
    or length(p_content ->> 'model') > 200 then
    raise exception '文書の内容が不正です。' using errcode='M5002';
  end if;
  if jsonb_typeof(p_content -> 'sources') is distinct from 'array' then raise exception '参照情報が不正です。' using errcode='M5002'; end if;
  if jsonb_array_length(p_content -> 'sources') > 20 then raise exception '参照記録が多すぎます。' using errcode='M5002'; end if;
  for v_ref in select value from jsonb_array_elements(p_content -> 'sources') loop
    if jsonb_typeof(v_ref -> 'id') is distinct from 'string'
      or (v_ref ->> 'id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or jsonb_typeof(v_ref -> 'version') is distinct from 'number'
      or (v_ref ->> 'version') !~ '^[0-9]+$' then
      raise exception '参照記録が不正です。' using errcode='M5002';
    end if;
    v_allowed := false;
    if v_ref ->> 'kind' = 'plan' then
      select exists(select 1 from public.plans where id=(v_ref ->> 'id')::uuid and user_id=p_user_id) into v_allowed;
    elsif v_ref ->> 'kind' = 'monitoring' then
      select exists(select 1 from public.monitoring_records where id=(v_ref ->> 'id')::uuid and user_id=p_user_id) into v_allowed;
    elsif v_ref ->> 'kind' = 'support' then
      select exists(select 1 from public.support_records where id=(v_ref ->> 'id')::uuid and user_id=p_user_id) into v_allowed;
    end if;
    if not v_allowed then raise exception '参照できない記録があります。' using errcode='M5003'; end if;
  end loop;
  if p_expected_version = 0 then
    insert into public.ai_documents(id,user_id,content,created_by,updated_by)
      values(p_id,p_user_id,p_content,v_staff,v_staff)
      on conflict(id) do nothing returning * into v_row;
  else
    update public.ai_documents m set content=p_content, version=m.version+1, updated_by=v_staff
      where m.id=p_id and m.user_id=p_user_id and m.version=p_expected_version returning m.* into v_row;
  end if;
  if v_row.id is null then raise exception '記録が変更されたか、更新できません。' using errcode='M5001'; end if;
  return next v_row;
end;
$$;
revoke execute on function public.save_ai_document(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.save_ai_document(uuid,uuid,integer,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
