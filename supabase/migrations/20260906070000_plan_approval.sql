begin;
-- Role assignments and identity mapping are administratively managed.
revoke insert,update,delete,truncate,references,trigger on public.roles,public.staff_org_roles,public.staff_facility_roles,public.staff from public,authenticated,anon;
revoke insert,update,delete,truncate,references,trigger on public.plans from public,authenticated,anon;
insert into public.roles(code,name) values ('plan_admin','計画管理者'),('plan_specialist','計画担当相談支援専門員') on conflict(code) do nothing;
create table public.plan_assignments(user_id uuid references public.users(id),staff_id uuid references public.staff(id),primary key(user_id,staff_id));
alter table public.plan_assignments enable row level security;
revoke all on public.plan_assignments from public,anon,authenticated;

create function public.can_manage_plan(p_user_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff s join public.staff_org_roles sr on sr.staff_id=s.id join public.roles r on r.id=sr.role_id
 where s.auth_user_id=auth.uid() and (r.code='plan_admin' or (r.code='plan_specialist' and exists(select 1 from public.plan_assignments a where a.user_id=p_user_id and a.staff_id=s.id))))
$$;
revoke all on function public.can_manage_plan(uuid) from public,anon;
grant execute on function public.can_manage_plan(uuid) to authenticated;

create table public.plan_revisions(
 plan_id uuid not null references public.plans(id), revision integer not null, content jsonb not null,
 saved_by uuid references public.staff(id), saved_at timestamptz not null default now(), origin text not null,
 primary key(plan_id,revision)
);
create table public.plan_reviews(
 plan_id uuid primary key references public.plans(id), state text not null default 'draft' check(state in ('draft','submitted','rejected','approved')),
 epoch integer not null default 0, submitted_revision integer, approved_revision integer,
 foreign key(plan_id,submitted_revision) references public.plan_revisions(plan_id,revision),
 foreign key(plan_id,approved_revision) references public.plan_revisions(plan_id,revision)
);
create table public.plan_review_events(
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.plans(id), revision integer not null,
 action text not null, actor uuid references public.staff(id), happened_at timestamptz not null default now(), reason text not null default ''
);
alter table public.plan_revisions enable row level security;
alter table public.plan_reviews enable row level security;
alter table public.plan_review_events enable row level security;
revoke all on public.plan_revisions,public.plan_reviews,public.plan_review_events from public,anon,authenticated;
insert into public.plan_revisions(plan_id,revision,content,saved_by,origin) select id,content_version,content,updated_by,'migration' from public.plans where content is not null;
insert into public.plan_reviews(plan_id) select id from public.plans;

create function public.capture_plan_revision() returns trigger language plpgsql security definer set search_path='' as $$
declare actor_id uuid;
begin
 select id into actor_id from public.staff where auth_user_id=auth.uid();
 if TG_OP='INSERT' then insert into public.plan_reviews(plan_id) values(new.id); end if;
 if new.content is not null and (TG_OP='INSERT' or new.content_version is distinct from old.content_version) then
  insert into public.plan_revisions(plan_id,revision,content,saved_by,origin) values(new.id,new.content_version,new.content,actor_id,'save');
  insert into public.plan_review_events(plan_id,revision,action,actor) values(new.id,new.content_version,'save',actor_id);
  update public.plan_reviews set state='draft',epoch=epoch+1 where plan_id=new.id;
 end if;
 return new;
end;
$$;
revoke all on function public.capture_plan_revision() from public,anon,authenticated;
create trigger capture_plan_revision after insert or update on public.plans for each row execute function public.capture_plan_revision();

create function public.get_plan_review(p_plan_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.plans; result jsonb;
begin
 select * into p from public.plans where id=p_plan_id;
 if p.id is null or not public.can_manage_plan(p.user_id) then raise exception '権限がありません。' using errcode='M7003'; end if;
 select to_jsonb(r) || jsonb_build_object('revisions',coalesce((select jsonb_agg(to_jsonb(v) order by v.revision desc) from public.plan_revisions v where v.plan_id=p.id),'[]'::jsonb),'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.happened_at desc,e.id) from public.plan_review_events e where e.plan_id=p.id),'[]'::jsonb)) into result from public.plan_reviews r where r.plan_id=p.id;
 return result;
end;
$$;

create function public.act_plan_review(p_plan_id uuid,p_revision integer,p_epoch integer,p_action text,p_reason text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.plans; r public.plan_reviews; actor_id uuid;
begin
 select * into p from public.plans where id=p_plan_id for update;
 if p.id is null or not public.can_manage_plan(p.user_id) then raise exception '権限がありません。' using errcode='M7003'; end if;
 select * into r from public.plan_reviews where plan_id=p.id for update;
 if p.status<>'active' or p_revision is distinct from p.content_version or p_epoch is distinct from r.epoch then raise exception '計画が変更されています。再取得してください。' using errcode='M7001'; end if;
 select id into actor_id from public.staff where auth_user_id=auth.uid();
 if p_action='submit' and r.state in ('draft','rejected') then
  if p.content is null or btrim(coalesce(p.content->>'userWish',''))='' or btrim(coalesce(p.content->>'overallPolicy',''))='' or btrim(coalesce(p.content->>'longTermGoal',''))='' or btrim(coalesce(p.content->>'shortTermGoal',''))='' then raise exception '本人希望・援助方針・長期目標・短期目標を入力してください。' using errcode='M7002'; end if;
  update public.plan_reviews set state='submitted',submitted_revision=p.content_version,epoch=epoch+1 where plan_id=p.id;
 elsif p_action in ('approve','reject') and r.state='submitted' and r.submitted_revision=p.content_version then
  if p_action='reject' and (p_reason is null or btrim(p_reason)='' or length(p_reason)>500) then raise exception '差戻し理由を500文字以内で入力してください。' using errcode='M7002'; end if;
  update public.plan_reviews set state=case when p_action='approve' then 'approved' else 'rejected' end,approved_revision=case when p_action='approve' then p.content_version else approved_revision end,epoch=epoch+1 where plan_id=p.id;
 elsif p_action='revise' and r.state='approved' then
  update public.plan_reviews set state='draft',submitted_revision=null,epoch=epoch+1 where plan_id=p.id;
  update public.plans set content_version=content_version+1,updated_by=actor_id where id=p.id;
 else raise exception '現在の状態では操作できません。' using errcode='M7002';
 end if;
 insert into public.plan_review_events(plan_id,revision,action,actor,reason) values(p.id,p.content_version,p_action,actor_id,case when p_action='reject' then p_reason else '' end);
 return public.get_plan_review(p.id);
end;
$$;
revoke all on function public.get_plan_review(uuid),public.act_plan_review(uuid,integer,integer,text,text) from public,anon;
grant execute on function public.get_plan_review(uuid),public.act_plan_review(uuid,integer,integer,text,text) to authenticated;

create or replace function public.create_user_with_plan(
  p_name         text,
  p_kana         text,
  p_birth_date   date,
  p_status       text,
  p_renewal_date date
)
returns table (user_id uuid, plan_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_user_id  uuid;
  v_plan_id  uuid;
begin
  if not public.can_manage_plan(null) then raise exception '権限がありません。' using errcode='M7003'; end if;
  select s.id into v_staff_id
  from public.staff s
  where s.auth_user_id = auth.uid();

  if v_staff_id is null then
    raise exception 'ログイン中のユーザーに対応する職員情報が見つかりません（staff未登録、auth.uid()=%）', auth.uid()
      using errcode = 'M1001';  -- 変更前: P0001
  end if;

  insert into public.users (name, kana, birth_date, status, created_by, updated_by)
  values (p_name, p_kana, p_birth_date, p_status, v_staff_id, v_staff_id)
  returning id into v_user_id;

  insert into public.plans (user_id, renewal_date, status, created_by, updated_by)
  values (v_user_id, p_renewal_date, 'active', v_staff_id, v_staff_id)
  returning id into v_plan_id;

  return query select v_user_id, v_plan_id;
end;
$$;

create or replace function public.update_user_with_plan(
  p_user_id      uuid,
  p_name         text,
  p_kana         text,
  p_birth_date   date,
  p_status       text,
  p_renewal_date date
)
returns table (user_id uuid, plan_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_plan_id  uuid;
begin
  if not public.can_manage_plan(p_user_id) then raise exception '権限がありません。' using errcode='M7003'; end if;
  select s.id into v_staff_id
  from public.staff s
  where s.auth_user_id = auth.uid();

  if v_staff_id is null then
    raise exception 'ログイン中のユーザーに対応する職員情報が見つかりません（staff未登録、auth.uid()=%）', auth.uid()
      using errcode = 'M1001';  -- 変更前: P0001
  end if;

  update public.users
     set name       = p_name,
         kana       = p_kana,
         birth_date = p_birth_date,
         status     = p_status,
         updated_by = v_staff_id
   where id = p_user_id;

  if not found then
    raise exception '指定された利用者が見つかりません（user_id=%）', p_user_id
      using errcode = 'M1002';  -- 変更前: P0002
  end if;

  select p.id into v_plan_id
  from public.plans p
  where p.user_id = p_user_id
    and p.status = 'active';

  if v_plan_id is null then
    raise exception 'この利用者に対応する有効な計画（active）が見つかりません（user_id=%）。データ不整合の可能性があります。', p_user_id
      using errcode = 'M1003';  -- 変更前: P0003
  end if;

  update public.plans
     set renewal_date = p_renewal_date,
         updated_by   = v_staff_id
   where id = v_plan_id;

  return query select p_user_id, v_plan_id;
end;
$$;

create or replace function public.save_plan_content(p_plan_id uuid, p_user_id uuid, p_expected_version integer, p_content jsonb)
returns table (content_version integer)
language plpgsql security definer set search_path = ''
as $$
declare
  v_staff_id uuid;
  v_version integer;
  v_key text;
  v_item jsonb;
  v_date date;
begin
  if not public.can_manage_plan(p_user_id) then raise exception '権限がありません。' using errcode='M7003'; end if;
  perform 1 from public.plans where id=p_plan_id and user_id=p_user_id for update;
  if not found then raise exception '計画が見つかりません。' using errcode='M2001'; end if;
  if not exists(select 1 from public.plan_reviews where plan_id=p_plan_id and state in ('draft','rejected')) then raise exception '提出・承認済みの計画は編集できません。' using errcode='M7002'; end if;
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
notify pgrst, 'reload schema';
commit;
