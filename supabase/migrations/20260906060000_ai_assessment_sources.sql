-- アセスメントをAI文書の参照先に追加。既存の権限・保存仕様を維持。
begin;
create or replace function public.save_ai_document(p_id uuid, p_user_id uuid, p_expected_version integer, p_content jsonb)
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
    elsif v_ref ->> 'kind' = 'assessment' then
      select exists(select 1 from public.assessment_records where id=(v_ref ->> 'id')::uuid and user_id=p_user_id) into v_allowed;
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
