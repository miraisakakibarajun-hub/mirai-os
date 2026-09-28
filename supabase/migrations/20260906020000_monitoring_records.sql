-- mirai-os-dev: 利用者ごとのモニタリング実施記録。既存plansは変更しない。
begin;
create table public.monitoring_records (
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
create index monitoring_records_user_date on public.monitoring_records(user_id, performed_on desc, created_at desc);
create trigger monitoring_records_updated_at before update on public.monitoring_records
  for each row execute function public.set_updated_at();
alter table public.monitoring_records enable row level security;
create policy authenticated_read_monitoring on public.monitoring_records for select to authenticated using (created_by in (select id from public.staff where auth_user_id = auth.uid()));
create policy authenticated_insert_monitoring on public.monitoring_records for insert to authenticated with check (created_by in (select id from public.staff where auth_user_id = auth.uid()) and updated_by = created_by);
create policy authenticated_update_monitoring on public.monitoring_records for update to authenticated using (created_by in (select id from public.staff where auth_user_id = auth.uid())) with check (created_by in (select id from public.staff where auth_user_id = auth.uid()) and updated_by = created_by);
revoke all on public.monitoring_records from anon;
grant select, insert, update on public.monitoring_records to authenticated;
revoke delete on public.monitoring_records from authenticated;

create function public.save_monitoring_record(p_id uuid, p_user_id uuid, p_expected_version integer, p_performed_on date, p_content jsonb)
returns setof public.monitoring_records
language plpgsql security invoker set search_path = ''
as $$
declare
  v_staff uuid;
  v_key text;
  v_next date;
  v_row public.monitoring_records;
  v_has_text boolean := false;
begin
  select id into v_staff from public.staff where auth_user_id = auth.uid();
  if v_staff is null then raise exception '職員情報が見つかりません。' using errcode='M1001'; end if;
  if p_id is null or p_user_id is null or p_performed_on is null or p_expected_version is null or p_expected_version < 0
    or p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception '記録の形式が不正です。' using errcode='M3002';
  end if;
  foreach v_key in array array['userSituation','serviceStatus','goalProgress','userFamilyWishes','issues','nextActions','nextDate'] loop
    if jsonb_typeof(p_content -> v_key) is distinct from 'string' then raise exception '記録の項目が不正です。' using errcode='M3002'; end if;
    if v_key <> 'nextDate' and length(btrim(p_content ->> v_key)) > 0 then v_has_text := true; end if;
  end loop;
  if not v_has_text then raise exception '記録内容を入力してください。' using errcode='M3002'; end if;
  if p_content ->> 'nextDate' <> '' then
    if (p_content ->> 'nextDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception '次回予定日が不正です。' using errcode='M3002'; end if;
    begin v_next := (p_content ->> 'nextDate')::date;
    exception when others then raise exception '次回予定日が不正です。' using errcode='M3002'; end;
    if v_next < p_performed_on then raise exception '次回予定日は実施日以降にしてください。' using errcode='M3002'; end if;
  end if;
  if p_expected_version = 0 then
    insert into public.monitoring_records(id,user_id,performed_on,content,created_by,updated_by)
      values(p_id,p_user_id,p_performed_on,p_content,v_staff,v_staff)
      on conflict(id) do nothing returning * into v_row;
  else
    update public.monitoring_records m set performed_on=p_performed_on, content=p_content, version=m.version+1, updated_by=v_staff
      where m.id=p_id and m.user_id=p_user_id and m.version=p_expected_version returning m.* into v_row;
  end if;
  if v_row.id is null then raise exception '記録が変更されたか、更新できません。' using errcode='M3001'; end if;
  return next v_row;
end;
$$;
revoke execute on function public.save_monitoring_record(uuid,uuid,integer,date,jsonb) from public,anon;
grant execute on function public.save_monitoring_record(uuid,uuid,integer,date,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
