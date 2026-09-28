-- mirai-os-dev: 担当者会議の手動下書き保存。既存の記録・権限は変更しない。
begin;
create table public.meeting_records (
  id uuid primary key,
  user_id uuid not null references public.users(id),
  held_on date not null check (isfinite(held_on)),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.staff(id) on delete set null,
  updated_by uuid references public.staff(id) on delete set null
);
create index meeting_records_user_date on public.meeting_records(user_id,held_on desc,created_at desc);
create trigger meeting_records_updated_at before update on public.meeting_records for each row execute function public.set_updated_at();
alter table public.meeting_records enable row level security;
create policy meeting_read_own on public.meeting_records for select to authenticated using (created_by in (select id from public.staff where auth_user_id=auth.uid()));
create policy meeting_insert_own on public.meeting_records for insert to authenticated with check (created_by in (select id from public.staff where auth_user_id=auth.uid()) and updated_by=created_by);
create policy meeting_update_own on public.meeting_records for update to authenticated using (created_by in (select id from public.staff where auth_user_id=auth.uid())) with check (created_by in (select id from public.staff where auth_user_id=auth.uid()) and updated_by=created_by);
revoke all on public.meeting_records from public,anon,authenticated;
grant select,insert,update on public.meeting_records to authenticated;

create function public.save_meeting_record(p_id uuid,p_user_id uuid,p_expected_version integer,p_held_on date,p_content jsonb)
returns setof public.meeting_records language plpgsql security invoker set search_path='' as $$
declare
  v_staff uuid; v_key text; v_participant text; v_date date; v_row public.meeting_records;
begin
  select id into v_staff from public.staff where auth_user_id=auth.uid();
  if v_staff is null then raise exception '職員情報が見つかりません。' using errcode='M1001'; end if;
  if p_id is null or p_user_id is null or p_expected_version is null or p_expected_version<0 or p_held_on is null or not isfinite(p_held_on)
    or p_content is null or jsonb_typeof(p_content)<>'object' then raise exception '会議記録の形式が不正です。' using errcode='M9102'; end if;
  foreach v_key in array array['agenda','userFamilyWishes','discussion','decisions','role','responsibleId','deadline'] loop
    if jsonb_typeof(p_content->v_key) is distinct from 'string' or length(p_content->>v_key)>1000 then raise exception '会議記録の項目が不正です。' using errcode='M9102'; end if;
  end loop;
  if length(btrim(p_content->>'agenda'))=0 or length(btrim(p_content->>'decisions'))=0 then raise exception '議題と決定事項を入力してください。' using errcode='M9102'; end if;
  if jsonb_typeof(p_content->'participantIds') is distinct from 'array' then raise exception '参加者の形式が不正です。' using errcode='M9102'; end if;
  if jsonb_array_length(p_content->'participantIds') not between 1 and 100 then raise exception '参加者を選択してください。' using errcode='M9102'; end if;
  if exists(select 1 from jsonb_array_elements(p_content->'participantIds') v where jsonb_typeof(v)<>'string')
    or (select count(distinct v) from jsonb_array_elements_text(p_content->'participantIds') v) <> jsonb_array_length(p_content->'participantIds') then raise exception '参加者が不正です。' using errcode='M9102'; end if;
  for v_participant in select jsonb_array_elements_text(p_content->'participantIds') loop
    if v_participant !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception '参加者IDが不正です。' using errcode='M9102'; end if;
    if not exists(select 1 from public.staff where id=v_participant::uuid) then raise exception '参加者を確認できません。' using errcode='M9102'; end if;
  end loop;
  if p_content->>'responsibleId'<>'' and not (p_content->'participantIds' ? (p_content->>'responsibleId')) then raise exception '担当者は参加者から選択してください。' using errcode='M9102'; end if;
  if p_content->>'deadline'<>'' then
    if p_content->>'deadline' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception '期限が不正です。' using errcode='M9102'; end if;
    begin v_date := (p_content->>'deadline')::date;
    exception when others then raise exception '期限が不正です。' using errcode='M9102'; end;
    if v_date<p_held_on then raise exception '期限は開催日以降にしてください。' using errcode='M9102'; end if;
  end if;
  if p_expected_version=0 then
    insert into public.meeting_records(id,user_id,held_on,content,created_by,updated_by) values(p_id,p_user_id,p_held_on,p_content,v_staff,v_staff)
      on conflict(id) do nothing returning * into v_row;
  else
    update public.meeting_records set held_on=p_held_on,content=p_content,version=version+1,updated_by=v_staff
      where id=p_id and user_id=p_user_id and version=p_expected_version returning * into v_row;
  end if;
  if v_row.id is null then raise exception '記録が変更されたか、更新できません。' using errcode='M9101'; end if;
  return next v_row;
end;
$$;
revoke execute on function public.save_meeting_record(uuid,uuid,integer,date,jsonb) from public,anon;
grant execute on function public.save_meeting_record(uuid,uuid,integer,date,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
