-- mirai-os-dev: 利用者ごとのアセスメント実施記録。既存plansは変更しない。
begin;
create table public.assessment_records (
  id uuid primary key,
  user_id uuid not null references public.users(id),
  performed_on date not null,
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null,
  updated_by uuid references public.staff(id) on delete set null
);
create index assessment_records_user_date on public.assessment_records(user_id, performed_on desc, created_at desc);
create trigger assessment_records_updated_at before update on public.assessment_records
  for each row execute function public.set_updated_at();
alter table public.assessment_records enable row level security;
create policy authenticated_read_assessment on public.assessment_records for select to authenticated using (created_by in (select id from public.staff where auth_user_id = auth.uid()));
create policy authenticated_insert_assessment on public.assessment_records for insert to authenticated with check (created_by in (select id from public.staff where auth_user_id = auth.uid()) and updated_by = created_by);
create policy authenticated_update_assessment on public.assessment_records for update to authenticated using (created_by in (select id from public.staff where auth_user_id = auth.uid())) with check (created_by in (select id from public.staff where auth_user_id = auth.uid()) and updated_by = created_by);
revoke all on public.assessment_records from anon;
grant select, insert, update on public.assessment_records to authenticated;
revoke delete on public.assessment_records from authenticated;

create function public.save_assessment_record(p_id uuid, p_user_id uuid, p_expected_version integer, p_performed_on date, p_content jsonb)
returns setof public.assessment_records
language plpgsql security invoker set search_path = ''
as $$
declare
  v_staff uuid;
  v_key text;
  v_row public.assessment_records;
  v_has_text boolean := false;
begin
  select id into v_staff from public.staff where auth_user_id = auth.uid();
  if v_staff is null then raise exception '職員情報が見つかりません。' using errcode='M1001'; end if;
  if p_id is null or p_user_id is null or p_performed_on is null or p_expected_version is null or p_expected_version < 0
    or p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception '記録の形式が不正です。' using errcode='M6002';
  end if;
  foreach v_key in array array['userWish','familyWish','issues','health','employment','money','participation','dailyLife','dailyNotes','communicationNotes','eating','bathing','dressing','walking','cleaning','laundry','medication','understanding','decision','expression'] loop
    if jsonb_typeof(p_content -> v_key) is distinct from 'string' then raise exception '記録の項目が不正です。' using errcode='M6002'; end if;
    if length(btrim(p_content ->> v_key)) > 0 then v_has_text := true; end if;
    if length(p_content ->> v_key) > (case when v_key in ('employment','money','participation') then 1000 else 2000 end) then raise exception '文字数が上限を超えています。' using errcode='M6002'; end if;
    if v_key in ('eating','bathing','dressing','walking','cleaning','laundry','medication') and p_content ->> v_key not in ('','未確認','自立','見守り','一部介助','全介助','該当なし') then raise exception '日常動作の選択値が不正です。' using errcode='M6002'; end if;
    if v_key in ('understanding','decision','expression') and p_content ->> v_key not in ('','未確認','支援なしで可能','支援があれば可能','支援があっても難しい','該当なし') then raise exception '意思疎通の選択値が不正です。' using errcode='M6002'; end if;
  end loop;
  if not v_has_text then raise exception '記録内容を入力してください。' using errcode='M6002'; end if;
  if not exists(select 1 from public.users where id=p_user_id) then raise exception '利用者を確認できません。' using errcode='M6003'; end if;
  if p_expected_version = 0 then
    insert into public.assessment_records(id,user_id,performed_on,content,created_by,updated_by)
      values(p_id,p_user_id,p_performed_on,p_content,v_staff,v_staff)
      on conflict(id) do nothing returning * into v_row;
  else
    update public.assessment_records m set performed_on=p_performed_on, content=p_content, version=m.version+1, updated_by=v_staff
      where m.id=p_id and m.user_id=p_user_id and m.version=p_expected_version returning m.* into v_row;
  end if;
  if v_row.id is null then raise exception '記録が変更されたか、更新できません。' using errcode='M6001'; end if;
  return next v_row;
end;
$$;
revoke execute on function public.save_assessment_record(uuid,uuid,integer,date,jsonb) from public,anon;
grant execute on function public.save_assessment_record(uuid,uuid,integer,date,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
