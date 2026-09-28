-- 計画更新期限とactive/archivedの構造を維持して本文を追加する。
-- 適用対象: mirai-os-dev。既存データの削除・旧migrationの再実行は不要。
begin;
alter table public.plans
  add column content jsonb,
  add column content_version integer not null default 0,
  add constraint plans_content_object check (content is null or jsonb_typeof(content) = 'object'),
  add constraint plans_content_version_nonnegative check (content_version >= 0);
comment on column public.plans.content is 'サービス等利用計画本文。NULLは未保存。既存フォームの項目名を保持する。';
comment on column public.plans.content_version is '計画本文の保存回数。競合検出に使用する。';

create function public.save_plan_content(p_plan_id uuid, p_user_id uuid, p_expected_version integer, p_content jsonb)
returns table (content_version integer)
language plpgsql security invoker set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_version integer;
  v_key text;
  v_item jsonb;
  v_date date;
begin
  select s.id into v_staff_id from public.staff s where s.auth_user_id = auth.uid();
  if v_staff_id is null then raise exception '職員情報が見つかりません。' using errcode = 'M1001'; end if;
  if p_expected_version is null or p_expected_version < 0 or p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception '計画本文の形式が不正です。' using errcode = 'M2002';
  end if;
  foreach v_key in array array['planPeriodStart','planPeriodEnd','createdDate','monitoringDate','userWish','familyWish','overallPolicy','longTermGoal','shortTermGoal'] loop
    if jsonb_typeof(p_content -> v_key) is distinct from 'string' then raise exception '計画本文の項目が不正です。' using errcode = 'M2002'; end if;
  end loop;
  foreach v_key in array array['planPeriodStart','planPeriodEnd','createdDate','monitoringDate'] loop
    if p_content ->> v_key <> '' then
      if (p_content ->> v_key) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception '日付の形式が不正です。' using errcode = 'M2002'; end if;
      begin v_date := (p_content ->> v_key)::date;
      exception when others then raise exception '日付が不正です。' using errcode = 'M2002'; end;
    end if;
  end loop;
  if p_content ->> 'planPeriodStart' <> '' and p_content ->> 'planPeriodEnd' <> '' and p_content ->> 'planPeriodStart' > p_content ->> 'planPeriodEnd' then
    raise exception '計画期間の終了日は開始日以降にしてください。' using errcode = 'M2002';
  end if;
  if jsonb_typeof(p_content -> 'services') is distinct from 'array' then raise exception 'サービス内容が不正です。' using errcode = 'M2002'; end if;
  for v_item in select value from jsonb_array_elements(p_content -> 'services') loop
    foreach v_key in array array['id','serviceName','content','frequency'] loop
      if jsonb_typeof(v_item -> v_key) is distinct from 'string' then raise exception 'サービス項目が不正です。' using errcode = 'M2002'; end if;
    end loop;
  end loop;
  update public.plans p set content = p_content, content_version = p.content_version + 1, updated_by = v_staff_id
  where p.id = p_plan_id and p.user_id = p_user_id and p.status = 'active' and p.content_version = p_expected_version
  returning p.content_version into v_version;
  if not found then raise exception '計画が変更されたか、更新できません。再読み込みしてください。' using errcode = 'M2001'; end if;
  return query select v_version;
end;
$$;
revoke execute on function public.save_plan_content(uuid, uuid, integer, jsonb) from public, anon;
grant execute on function public.save_plan_content(uuid, uuid, integer, jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
