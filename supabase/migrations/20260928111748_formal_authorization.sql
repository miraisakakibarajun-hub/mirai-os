-- Phase 3-B: isolated environments only. No inferred migration of legacy memberships.
begin;
create schema mirai_private;
revoke all on schema mirai_private from public,anon,authenticated;
create role mirai_executor nologin noinherit nobypassrls;
grant mirai_executor to postgres;
grant usage on schema public,auth,mirai_private to mirai_executor;
grant execute on function auth.uid() to mirai_executor;

create table public.organizations(id uuid primary key default gen_random_uuid(),name text not null);
alter table public.organizations enable row level security;
alter table public.facilities add column organization_id uuid references public.organizations(id);
alter table public.staff add column organization_id uuid references public.organizations(id), add column is_active boolean not null default false;
alter table public.users add column facility_id uuid references public.facilities(id);
alter table public.staff_facility_roles add column starts_at timestamptz not null default now(), add column ends_at timestamptz,
 add constraint membership_period check(ends_at is null or ends_at>=starts_at);
alter table public.plan_assignments add column starts_on date not null default current_date, add column ends_on date,
 add constraint assignment_period check(ends_on is null or ends_on>=starts_on);
insert into public.roles(code,name) values ('business_admin','管理者'),('specialist','相談支援専門員'),('worker','一般職員'),('system_admin','システム管理者');
create index on public.users(facility_id);
create index on public.staff_facility_roles(staff_id,facility_id,ends_at);
create index on public.plan_assignments(staff_id,user_id,ends_on);
do $$ declare t text; begin
 foreach t in array array['support_records','assessment_records','monitoring_records','meeting_records'] loop
 execute format('alter table public.%I add column record_state text not null default ''draft'' check(record_state in (''draft'',''submitted'',''finalized''))',t);
 end loop;
end $$;

create table mirai_private.audit_events(
 id uuid primary key default gen_random_uuid(), happened_at timestamptz not null default clock_timestamp(),
 actor_auth_id uuid, actor_staff_id uuid, operation text not null, target_id uuid,
 outcome text not null check(outcome in ('success','denied')), code text not null
);
alter table mirai_private.audit_events enable row level security;
-- No body, names, tokens, email or raw request payload in audit events.
create table mirai_private.technical_settings(id boolean primary key default true check(id), diagnostic_enabled boolean not null default false);
insert into mirai_private.technical_settings default values;
alter table mirai_private.technical_settings enable row level security;

-- Metadata-only lookups: no business text, fixed search_path, caller comes from Auth.
create function mirai_private.actor() returns uuid language sql stable security definer set search_path='' as $$
 select id from public.staff where auth_user_id=auth.uid() and is_active and organization_id is not null
$$;
create function mirai_private.facility_role(f uuid,codes text[]) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff s join public.staff_facility_roles m on m.staff_id=s.id
 join public.roles r on r.id=m.role_id join public.facilities x on x.id=m.facility_id
 where s.id=mirai_private.actor() and x.id=f and x.organization_id=s.organization_id
 and m.starts_at<=statement_timestamp() and (m.ends_at is null or m.ends_at>statement_timestamp()) and r.code=any(codes))
$$;
create function mirai_private.allowed(u uuid,op text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select case
 when op='admin' then mirai_private.facility_role(x.facility_id,array['business_admin'])
 when op='read' then mirai_private.facility_role(x.facility_id,array['business_admin']) or
   (mirai_private.facility_role(x.facility_id,array['specialist','worker']) and a.staff_id is not null)
 when op='professional_read' then mirai_private.facility_role(x.facility_id,array['business_admin']) or
   (mirai_private.facility_role(x.facility_id,array['specialist']) and a.staff_id is not null)
 when op='edit' then mirai_private.facility_role(x.facility_id,array['specialist']) and a.staff_id is not null
 else false end from public.users x left join public.plan_assignments a on a.user_id=x.id and a.staff_id=mirai_private.actor()
 and a.starts_on<=(statement_timestamp() at time zone 'Asia/Tokyo')::date
 and (a.ends_on is null or a.ends_on>(statement_timestamp() at time zone 'Asia/Tokyo')::date) where x.id=u),false)
$$;
create function mirai_private.technical() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff_facility_roles m where m.staff_id=mirai_private.actor()
 and mirai_private.facility_role(m.facility_id,array['system_admin']))
$$;

-- Remove EVERY legacy client/RPC path; retain the definitions and data for preservation.
revoke all on all tables in schema public from public,anon,authenticated;
revoke all on all sequences in schema public from public,anon,authenticated;
revoke execute on all functions in schema public from public,anon,authenticated;
alter default privileges in schema public revoke all on tables from anon,authenticated;
alter default privileges in schema public revoke execute on functions from public,anon,authenticated;
do $$ declare p record; begin
 for p in select tablename,policyname from pg_policies where schemaname='public' loop
 execute format('drop policy %I on public.%I',p.policyname,p.tablename);
 end loop;
end $$;

-- The executor is not a table owner and cannot bypass RLS.
grant select,insert,update on public.users,public.plans,public.support_records,public.assessment_records,
 public.monitoring_records,public.meeting_records,public.plan_reviews,public.plan_assignments to mirai_executor;
grant select on public.plan_revisions,public.facilities,public.staff to mirai_executor;
grant update(name) on public.facilities to mirai_executor;
grant select,insert on mirai_private.audit_events to mirai_executor;
grant select,update on mirai_private.technical_settings to mirai_executor;
grant insert on public.plan_review_events to mirai_executor;

create policy scope_staff on public.staff for select to mirai_executor using(id=mirai_private.actor());
create policy scope_facilities on public.facilities for select to mirai_executor using(mirai_private.facility_role(id,array['business_admin','specialist','worker','system_admin']));
create policy edit_facilities on public.facilities for update to mirai_executor using(mirai_private.facility_role(id,array['business_admin'])) with check(mirai_private.facility_role(id,array['business_admin']));
create policy read_users on public.users for select to mirai_executor using(mirai_private.allowed(id,'read'));
create policy create_users on public.users for insert to mirai_executor with check(mirai_private.facility_role(facility_id,array['business_admin','specialist']) and created_by=mirai_private.actor());
create policy update_users on public.users for update to mirai_executor using(mirai_private.allowed(id,'admin') or mirai_private.allowed(id,'edit')) with check(mirai_private.allowed(id,'admin') or mirai_private.allowed(id,'edit'));
create policy read_assignments on public.plan_assignments for select to mirai_executor using(mirai_private.allowed(user_id,'admin') or staff_id=mirai_private.actor());
create policy add_assignments on public.plan_assignments for insert to mirai_executor with check(mirai_private.allowed(user_id,'admin') or (staff_id=mirai_private.actor() and exists(select 1 from public.users u where u.id=user_id and u.created_by=mirai_private.actor())));
create policy end_assignments on public.plan_assignments for update to mirai_executor using(mirai_private.allowed(user_id,'admin')) with check(mirai_private.allowed(user_id,'admin'));
create policy read_plans on public.plans for select to mirai_executor using(mirai_private.allowed(user_id,'professional_read'));
create policy create_plans on public.plans for insert to mirai_executor with check(mirai_private.allowed(user_id,'edit') and created_by=mirai_private.actor());
create policy edit_plans on public.plans for update to mirai_executor using(mirai_private.allowed(user_id,'edit') or mirai_private.allowed(user_id,'admin')) with check(mirai_private.allowed(user_id,'edit') or mirai_private.allowed(user_id,'admin'));
create policy read_reviews on public.plan_reviews for select to mirai_executor using(exists(select 1 from public.plans p where p.id=plan_id));
create policy edit_reviews on public.plan_reviews for update to mirai_executor using(exists(select 1 from public.plans p where p.id=plan_id)) with check(exists(select 1 from public.plans p where p.id=plan_id));
create policy read_revisions on public.plan_revisions for select to mirai_executor using(exists(select 1 from public.plans p where p.id=plan_id));
create policy add_review_events on public.plan_review_events for insert to mirai_executor with check(actor=mirai_private.actor() and exists(select 1 from public.plans p where p.id=plan_id));
do $$ declare t text; begin
 foreach t in array array['support_records','assessment_records','monitoring_records','meeting_records'] loop
 execute format('create policy read_scoped on public.%I for select to mirai_executor using(mirai_private.allowed(user_id,''professional_read'') %s)',t,
 case when t='support_records' then 'or (mirai_private.allowed(user_id,''read'') and created_by=mirai_private.actor())' else '' end);
 execute format('create policy insert_scoped on public.%I for insert to mirai_executor with check(mirai_private.allowed(user_id,%L) and created_by=mirai_private.actor() and updated_by=mirai_private.actor())',t,case when t='support_records' then 'read' else 'edit' end);
 execute format('create policy update_scoped on public.%I for update to mirai_executor using(mirai_private.allowed(user_id,%L) and %s) with check(mirai_private.allowed(user_id,%L) and updated_by=mirai_private.actor())',t,
 case when t='support_records' then 'read' else 'edit' end,case when t='support_records' then 'created_by=mirai_private.actor()' else 'true' end,case when t='support_records' then 'read' else 'edit' end);
 end loop;
end $$;
create policy audit_append on mirai_private.audit_events for insert to mirai_executor with check(actor_auth_id is not distinct from auth.uid());
create policy audit_self on mirai_private.audit_events for select to mirai_executor using(actor_auth_id=auth.uid());
create policy technical_read on mirai_private.technical_settings for select to mirai_executor using(mirai_private.technical());
create policy technical_update on mirai_private.technical_settings for update to mirai_executor using(mirai_private.technical()) with check(mirai_private.technical());

-- Validates target staff without granting access to the staff directory.
create function mirai_private.assignable(u uuid,s uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.users x join public.facilities f on f.id=x.facility_id
 join public.staff t on t.id=s and t.is_active and t.organization_id=f.organization_id
 join public.staff_facility_roles m on m.staff_id=t.id and m.facility_id=f.id
 join public.roles r on r.id=m.role_id and r.code in ('specialist','worker')
 where x.id=u and mirai_private.allowed(u,'admin') and m.starts_at<=statement_timestamp() and (m.ends_at is null or m.ends_at>statement_timestamp()))
$$;

create function mirai_private.command(op text,target uuid,payload jsonb,expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=mirai_private.actor(); result jsonb; code text:='OK'; ok boolean:=false;
 t text; datecol text; rec record; p public.plans; review public.plan_reviews; uid uuid; rid uuid;
begin
 -- Return an error envelope so denied calls are committed to audit, not rolled back with an exception.
 begin
  if a is null or payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>64000
   or payload ?| array['actor_id','created_by','updated_by','organization_id','role','auth_user_id'] then
   raise exception using errcode='42501',message='denied'; end if;
  if op='user.read' then
   if not mirai_private.allowed(target,'read') then raise exception using errcode='42501'; end if;
   if mirai_private.allowed(target,'professional_read') then
    select to_jsonb(u) into result from public.users u where id=target;
   else select jsonb_build_object('id',id,'name',name,'status',status) into result from public.users where id=target; end if;
  elsif op='user.create' then
   if not mirai_private.facility_role(target,array['business_admin','specialist']) then raise exception using errcode='42501'; end if;
   if length(btrim(coalesce(payload->>'name','')))=0 or length(payload->>'name')>100 then raise exception using errcode='22023'; end if;
   uid:=gen_random_uuid();
   -- No RETURNING: a new specialist assignment is established before SELECT becomes available.
   insert into public.users(id,facility_id,name,kana,birth_date,created_by,updated_by) values(uid,target,payload->>'name',payload->>'kana',(payload->>'birth_date')::date,a,a);
   -- A narrow helper below permits only self-assignment to a just-created user.
   perform mirai_private.initial_assignment(uid);
   result:=jsonb_build_object('id',uid);
  elsif op='user.update' then
   if not (mirai_private.allowed(target,'edit') or mirai_private.allowed(target,'admin')) then raise exception using errcode='42501'; end if;
   if payload ?| array['facility_id','staff_id','user_id'] then raise exception using errcode='42501'; end if;
   update public.users set name=coalesce(payload->>'name',name),kana=coalesce(payload->>'kana',kana),updated_by=a where id=target;
   result:=jsonb_build_object('id',target);
  elsif op in ('assignment.set','assignment.end') then
   if not mirai_private.allowed(target,'admin') or not mirai_private.assignable(target,(payload->>'staff_id')::uuid) then raise exception using errcode='42501'; end if;
   if op='assignment.set' then
    insert into public.plan_assignments(user_id,staff_id,starts_on,ends_on) values(target,(payload->>'staff_id')::uuid,(payload->>'starts_on')::date,(payload->>'ends_on')::date)
    on conflict(user_id,staff_id) do update set starts_on=excluded.starts_on,ends_on=excluded.ends_on;
   else update public.plan_assignments set ends_on=(statement_timestamp() at time zone 'Asia/Tokyo')::date where user_id=target and staff_id=(payload->>'staff_id')::uuid; end if;
   result:=jsonb_build_object('id',target);
  elsif op in ('record.read','record.save') then
   t:=case payload->>'kind' when 'support' then 'support_records' when 'assessment' then 'assessment_records' when 'monitoring' then 'monitoring_records' when 'meeting' then 'meeting_records' end;
   if t is null then raise exception using errcode='42501'; end if;
   if op='record.read' then
    execute format('select to_jsonb(r) from public.%I r where id=$1',t) into result using target;
    if result is null then raise exception using errcode='42501'; end if;
   else
    uid:=(payload->>'user_id')::uuid;
    if not mirai_private.allowed(uid,case when t='support_records' then 'read' else 'edit' end) then raise exception using errcode='42501'; end if;
    if expected is null or expected<0 or jsonb_typeof(payload->'content') is distinct from 'object' then raise exception using errcode='22023'; end if;
    datecol:=case t when 'support_records' then 'occurred_at' when 'meeting_records' then 'held_on' else 'performed_on' end;
    if expected=0 then
     execute format('insert into public.%I(id,user_id,%I,content,created_by,updated_by) values($1,$2,$3::%s,$4,$5,$5) returning to_jsonb(%I)',t,datecol,case when t='support_records' then 'timestamptz' else 'date' end,t)
      into result using target,uid,payload->>'date',payload->'content',a;
    else
     execute format('update public.%I set %I=$3::%s,content=$4,updated_by=$5,version=version+1 where id=$1 and user_id=$2 and version=$6 and record_state=''draft'' returning to_jsonb(%I)',t,datecol,case when t='support_records' then 'timestamptz' else 'date' end,t)
      into result using target,uid,payload->>'date',payload->'content',a,expected;
     if result is null then raise exception using errcode='42501'; end if;
    end if;
   end if;
  elsif op in ('plan.read','plan.create','plan.save','plan.submit','plan.approve','plan.reject','plan.revise') then
   if op='plan.create' then
    uid:=(payload->>'user_id')::uuid;
    if not mirai_private.allowed(uid,'edit') then raise exception using errcode='42501'; end if;
    insert into public.plans(id,user_id,renewal_date,created_by,updated_by) values(target,uid,(payload->>'renewal_date')::date,a,a);
   end if;
   select * into p from public.plans where id=target for update;
   if p.id is null then raise exception using errcode='42501'; end if;
   select * into review from public.plan_reviews where plan_id=p.id for update;
   if op not in ('plan.read','plan.create') and (expected is distinct from p.content_version or p.status<>'active') then raise exception using errcode='40001'; end if;
   if op='plan.save' then
    if not mirai_private.allowed(p.user_id,'edit') or review.state not in ('draft','rejected') then raise exception using errcode='42501'; end if;
    if jsonb_typeof(payload->'content') is distinct from 'object' then raise exception using errcode='22023'; end if;
    update public.plans set content=payload->'content',content_version=content_version+1,updated_by=a where id=p.id;
   elsif op='plan.submit' then
    if not mirai_private.allowed(p.user_id,'edit') or review.state not in ('draft','rejected') or p.content is null then raise exception using errcode='42501'; end if;
    update public.plan_reviews set state='submitted',submitted_revision=p.content_version,epoch=epoch+1 where plan_id=p.id;
   elsif op in ('plan.approve','plan.reject') then
    if not mirai_private.allowed(p.user_id,'admin') or review.state<>'submitted' or review.submitted_revision is distinct from p.content_version
      or p.created_by is null or p.created_by=a or p.updated_by=a then raise exception using errcode='42501'; end if;
    if op='plan.reject' and length(btrim(coalesce(payload->>'reason','')))=0 then raise exception using errcode='22023'; end if;
    update public.plan_reviews set state=case op when 'plan.approve' then 'approved' else 'rejected' end,
     approved_revision=case op when 'plan.approve' then p.content_version else approved_revision end,epoch=epoch+1 where plan_id=p.id;
   elsif op='plan.revise' then
    if not mirai_private.allowed(p.user_id,'edit') or review.state<>'approved' then raise exception using errcode='42501'; end if;
    update public.plans set content_version=content_version+1,updated_by=a where id=p.id;
   end if;
   if op not in ('plan.read','plan.create','plan.save') then
    insert into public.plan_review_events(plan_id,revision,action,actor) values(p.id,p.content_version,op,a);
   end if;
   select to_jsonb(q)||jsonb_build_object('review',(select to_jsonb(r) from public.plan_reviews r where plan_id=q.id)) into result from public.plans q where id=p.id;
  elsif op='facility.rename' then
   if not mirai_private.facility_role(target,array['business_admin']) or length(btrim(coalesce(payload->>'name','')))=0 then raise exception using errcode='42501'; end if;
   update public.facilities set name=payload->>'name' where id=target; result:=jsonb_build_object('id',target);
  elsif op='audit.mine' then
   select coalesce(jsonb_agg(to_jsonb(e)),'[]'::jsonb) into result from (select * from mirai_private.audit_events order by happened_at desc limit 100) e;
  elsif op in ('technical.read','technical.configure') then
   if not mirai_private.technical() then raise exception using errcode='42501'; end if;
   if op='technical.configure' then update mirai_private.technical_settings set diagnostic_enabled=(payload->>'diagnostic_enabled')::boolean; end if;
   select jsonb_build_object('diagnostic_enabled',diagnostic_enabled,'ai_enabled',false,'temporary_access_enabled',false) into result from mirai_private.technical_settings;
  else raise exception using errcode='42501'; end if;
  ok:=true;
 exception when others then code:=sqlstate; result:=null;
 end;
 insert into mirai_private.audit_events(actor_auth_id,actor_staff_id,operation,target_id,outcome,code)
 values(auth.uid(),a,case when op=any(array['user.read','user.create','user.update','assignment.set','assignment.end','record.read','record.save','plan.read','plan.create','plan.save','plan.submit','plan.approve','plan.reject','plan.revise','facility.rename','audit.mine','technical.read','technical.configure']) then op else 'unknown' end,target,case when ok then 'success' else 'denied' end,code);
 return jsonb_build_object('ok',ok,'code',code,'data',result);
end $$;

-- Narrow onboarding helper: only the authenticated creator, same current facility membership.
create function mirai_private.initial_assignment(u uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.users x where x.id=u and x.created_by=mirai_private.actor()
 and mirai_private.facility_role(x.facility_id,array['business_admin','specialist'])) then raise exception using errcode='42501'; end if;
 insert into public.plan_assignments(user_id,staff_id) values(u,mirai_private.actor()) on conflict do nothing;
end $$;
alter function mirai_private.command(text,uuid,jsonb,integer) owner to mirai_executor;
revoke execute on all functions in schema mirai_private from public,anon,authenticated;
grant execute on all functions in schema mirai_private to mirai_executor;
grant usage on schema mirai_private to authenticated;
grant execute on function mirai_private.command(text,uuid,jsonb,integer) to authenticated;
create function public.mirai_command(p_operation text,p_target uuid default null,p_payload jsonb default '{}'::jsonb,p_version integer default null)
returns jsonb language sql security invoker set search_path='' as $$
 select mirai_private.command(p_operation,p_target,p_payload,p_version)
$$;
revoke all on function public.mirai_command(text,uuid,jsonb,integer) from public,anon;
grant execute on function public.mirai_command(text,uuid,jsonb,integer) to authenticated;
revoke all on all tables in schema mirai_private from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
