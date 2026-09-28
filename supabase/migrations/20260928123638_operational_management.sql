-- Phase 3-D: disposable environments only. Preserve all earlier migrations.
begin;
alter function public.set_updated_at() set search_path='';
alter table public.users add column renewal_due_on date;
alter table public.users add column basic_version integer not null default 1;
alter table mirai_private.audit_events add column facility_id uuid;
alter table mirai_private.audit_events add column user_id uuid;
alter table mirai_private.audit_events add column subject_staff_id uuid;
create index audit_scope_time on mirai_private.audit_events(facility_id,happened_at desc);
create index audit_user_time on mirai_private.audit_events(user_id,happened_at desc);

-- Narrow owner helpers: never expose unrestricted staff rows or accept actor identity.
create function mirai_private.staff_in_scope(s uuid,f uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.staff t join public.facilities x on x.organization_id=t.organization_id
 where t.id=s and x.id=f and exists(select 1 from public.staff_facility_roles m where m.staff_id=s and m.facility_id=f))
$$;
create function mirai_private.directory(u uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'canAssign',mirai_private.assignable(u,s.id)) order by s.name,s.id),'[]'::jsonb)
 from public.staff s join public.users x on x.id=u
 where mirai_private.allowed(u,'professional_read') and s.is_active and s.organization_id=(select organization_id from public.facilities where id=x.facility_id)
 and exists(select 1 from public.staff_facility_roles m join public.roles r on r.id=m.role_id
 where m.staff_id=s.id and m.facility_id=x.facility_id and m.starts_at<=statement_timestamp() and (m.ends_at is null or m.ends_at>statement_timestamp())
 and r.code in ('business_admin','specialist','worker'))
$$;
-- Owner execution is confined to staff administration. Every branch checks current DB membership.
create function mirai_private.staff_management(op text,f uuid,p jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s uuid; result jsonb; role_id_value uuid; start_value timestamptz; end_value timestamptz;
begin
 if not mirai_private.facility_role(f,array['business_admin']) then raise exception using errcode='42501'; end if;
 if op='staff.list' then
  select coalesce(jsonb_agg(item order by id),'[]'::jsonb) into result from (
   select t.id,jsonb_build_object('id',t.id,'name',t.name,'active',t.is_active,
    'roles',(select coalesce(jsonb_agg(jsonb_build_object('code',r.code,'starts_at',m.starts_at,'ends_at',m.ends_at) order by r.code),'[]'::jsonb)
      from public.staff_facility_roles m join public.roles r on r.id=m.role_id where m.staff_id=t.id and m.facility_id=f)) item
   from public.staff t where mirai_private.staff_in_scope(t.id,f)
   order by t.id limit 100 offset coalesce((p->>'offset')::integer,0)) q;
  return result;
 end if;
 s:=(p->>'staff_id')::uuid;
 if s is null or s=mirai_private.actor() or not mirai_private.staff_in_scope(s,f) then raise exception using errcode='42501'; end if;
 -- Serialize global state/membership operations for this employee.
 perform 1 from public.staff where id=s for update;
 if op='staff.active' then
  if jsonb_typeof(p->'active') is distinct from 'boolean' then raise exception using errcode='22023'; end if;
  -- Global suspension must not affect an unmanaged office, including future memberships.
  if exists(select 1 from public.staff_facility_roles m where m.staff_id=s and (m.ends_at is null or m.ends_at>statement_timestamp())
    and not mirai_private.facility_role(m.facility_id,array['business_admin'])) then raise exception using errcode='42501'; end if;
  update public.staff set is_active=(p->>'active')::boolean where id=s;
 elsif op='staff.role' then
  if p->>'role_code' not in ('business_admin','specialist','worker','system_admin') or p->>'role_code' is null then raise exception using errcode='42501'; end if;
  select id into role_id_value from public.roles where code=p->>'role_code';
  start_value:=(p->>'starts_at')::timestamptz;end_value:=nullif(p->>'ends_at','')::timestamptz;
  if start_value is null or (end_value is not null and end_value<start_value) then raise exception using errcode='22023'; end if;
  insert into public.staff_facility_roles(staff_id,facility_id,role_id,starts_at,ends_at) values(s,f,role_id_value,start_value,end_value)
  on conflict(staff_id,facility_id,role_id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at;
 elsif op='staff.end' then
  update public.staff_facility_roles set ends_at=greatest(starts_at,statement_timestamp()) where staff_id=s and facility_id=f;
 else raise exception using errcode='42501'; end if;
 return jsonb_build_object('id',s);
end $$;

-- Populate historical scope at the time of the operation; old events remain conservatively own-only.
create function mirai_private.audit_scope() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.user_id is null then
  if new.operation like 'user.%' or new.operation like 'assignment.%' or new.operation in ('record.list','plan.list','staff.directory') then
   new.user_id:=(select id from public.users where id=new.target_id);
  elsif new.operation like 'plan.%' then new.user_id:=(select user_id from public.plans where id=new.target_id);
  elsif new.operation like 'record.%' then
   select user_id into new.user_id from (select id,user_id from public.support_records union all select id,user_id from public.assessment_records
    union all select id,user_id from public.monitoring_records union all select id,user_id from public.meeting_records) q where id=new.target_id limit 1;
  end if;
 end if;
 if new.facility_id is null and new.user_id is not null then select facility_id into new.facility_id from public.users where id=new.user_id; end if;
 return new;
end $$;
create trigger audit_scope before insert on mirai_private.audit_events for each row execute function mirai_private.audit_scope();
create function mirai_private.audit_list(technical boolean,offset_value integer) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; a uuid:=mirai_private.actor();
begin
 if a is null or offset_value<0 then raise exception using errcode='42501'; end if;
 if technical then
  if not mirai_private.technical() then raise exception using errcode='42501'; end if;
  -- No actor, user, staff, target identifiers, names, or business text in technical view.
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
   select happened_at,operation,outcome,code from mirai_private.audit_events e
   where e.facility_id is not null and mirai_private.facility_role(e.facility_id,array['system_admin'])
   order by happened_at desc,id limit 100 offset offset_value) q;
 else
  select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
   select id,happened_at,actor_staff_id,operation,target_id,outcome,code,facility_id,user_id,subject_staff_id from mirai_private.audit_events e
   where e.actor_staff_id=a or mirai_private.facility_role(e.facility_id,array['business_admin'])
    or (e.outcome='success' and e.user_id is not null and mirai_private.allowed(e.user_id,'edit'))
   order by happened_at desc,id limit 100 offset offset_value) q;
 end if;
 return result;
end $$;

revoke all on function mirai_private.staff_in_scope(uuid,uuid),mirai_private.directory(uuid),mirai_private.staff_management(text,uuid,jsonb),mirai_private.audit_scope(),mirai_private.audit_list(boolean,integer) from public,anon,authenticated;
grant execute on function mirai_private.staff_in_scope(uuid,uuid),mirai_private.directory(uuid),mirai_private.staff_management(text,uuid,jsonb),mirai_private.audit_list(boolean,integer) to mirai_executor;

alter function mirai_private.command(text,uuid,jsonb,integer) rename to command_phase3c;
revoke execute on function mirai_private.command_phase3c(text,uuid,jsonb,integer) from authenticated;
create function mirai_private.command(op text,target uuid,payload jsonb,expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=mirai_private.actor(); result jsonb; ok boolean:=false; code text:='OK';
 rec record; f uuid; old_content jsonb; member text; directory_value jsonb; allowed_keys text[]; today date:=(statement_timestamp() at time zone 'Asia/Tokyo')::date;
begin
 if op not in ('session.context','staff.list','staff.active','staff.role','staff.end','staff.directory','assignment.list','assignment.handover',
  'user.update','dashboard.list','audit.list','audit.technical','record.save') then
  return mirai_private.command_phase3c(op,target,payload,expected);
 end if;
 begin
  if a is null or payload is null or jsonb_typeof(payload)<>'object' or octet_length(payload::text)>64000 then raise exception using errcode='42501'; end if;
  allowed_keys:=case op
   when 'staff.list' then array['offset'] when 'staff.active' then array['staff_id','active']
   when 'staff.role' then array['staff_id','role_code','starts_at','ends_at'] when 'staff.end' then array['staff_id']
   when 'assignment.handover' then array['from_staff_id','to_staff_id']
   when 'user.update' then array['name','kana','birth_date','status','renewal_due_on']
   when 'dashboard.list' then array['offset'] when 'audit.list' then array['offset'] when 'audit.technical' then array['offset']
   when 'record.save' then array['kind','user_id','date','content'] else array[]::text[] end;
  if exists(select 1 from jsonb_object_keys(payload) k where not(k=any(allowed_keys))) then raise exception using errcode='42501'; end if;
  if coalesce((payload->>'offset')::integer,0)<0 then raise exception using errcode='22023'; end if;
  if op='session.context' then
   select jsonb_build_object('staffId',a,'technical',mirai_private.technical(),'facilities',coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,
    'canRegister',mirai_private.facility_role(id,array['business_admin','specialist']),'canManage',mirai_private.facility_role(id,array['business_admin'])) order by id),'[]'::jsonb)) into result from public.facilities;
  elsif op in ('staff.list','staff.active','staff.role','staff.end') then
   f:=target;result:=mirai_private.staff_management(op,target,payload);
  elsif op='staff.directory' then
   if not mirai_private.allowed(target,'professional_read') then raise exception using errcode='42501'; end if;
   result:=mirai_private.directory(target);
  elsif op='assignment.list' then
   if not mirai_private.allowed(target,'admin') then raise exception using errcode='42501'; end if;
   select coalesce(jsonb_agg(jsonb_build_object('staff_id',staff_id,'starts_on',starts_on,'ends_on',ends_on) order by staff_id),'[]'::jsonb)
    into result from public.plan_assignments where user_id=target;
  elsif op='assignment.handover' then
   if not mirai_private.allowed(target,'admin') or not mirai_private.assignable(target,(payload->>'to_staff_id')::uuid)
    or payload->>'from_staff_id'=payload->>'to_staff_id' then raise exception using errcode='42501'; end if;
   perform 1 from public.users where id=target for update;
   update public.plan_assignments set ends_on=greatest(starts_on,today) where user_id=target and staff_id=(payload->>'from_staff_id')::uuid;
   if not found then raise exception using errcode='42501'; end if;
   insert into public.plan_assignments(user_id,staff_id,starts_on,ends_on) values(target,(payload->>'to_staff_id')::uuid,today,null)
    on conflict(user_id,staff_id) do update set starts_on=excluded.starts_on,ends_on=null;
   result:=jsonb_build_object('id',target);
  elsif op='user.update' then
   if not (mirai_private.allowed(target,'admin') or mirai_private.allowed(target,'edit')) then raise exception using errcode='42501'; end if;
   select * into rec from public.users where id=target for update;
   -- Legacy name-only callers remain supported; full basic-information updates require a revision.
   if expected is null and (payload ?| array['birth_date','status','renewal_due_on']) then raise exception using errcode='22023'; end if;
   if expected is not null and expected<>rec.basic_version then raise exception using errcode='40001'; end if;
   if length(trim(payload->>'name')) not between 1 and 100 or payload->>'name' is null then raise exception using errcode='22023'; end if;
   if payload ? 'birth_date' and ((payload->>'birth_date')::date>today or nullif(payload->>'birth_date','') is null) then raise exception using errcode='22023'; end if;
   update public.users set name=trim(payload->>'name'),kana=coalesce(payload->>'kana',kana),
    birth_date=case when payload ? 'birth_date' then (payload->>'birth_date')::date else birth_date end,
    status=coalesce(payload->>'status',status),renewal_due_on=case when payload ? 'renewal_due_on' then nullif(payload->>'renewal_due_on','')::date else renewal_due_on end,
    basic_version=basic_version+1,updated_by=a where id=target;
   result:=jsonb_build_object('id',target);
  elsif op='record.save' then
   if payload->>'kind'='meeting' then
    if not mirai_private.allowed((payload->>'user_id')::uuid,'edit') then raise exception using errcode='42501'; end if;
    directory_value:=mirai_private.directory((payload->>'user_id')::uuid);
    select content into old_content from public.meeting_records where id=target and user_id=(payload->>'user_id')::uuid;
    if jsonb_typeof(payload#>'{content,participantIds}') is distinct from 'array' then raise exception using errcode='22023'; end if;
    for member in select jsonb_array_elements_text(payload#>'{content,participantIds}') loop
     if not exists(select 1 from jsonb_array_elements(directory_value) d where d->>'id'=member)
      and not coalesce(old_content->'participantIds' ? member,false) then raise exception using errcode='42501'; end if;
    end loop;
    if coalesce(payload#>>'{content,responsibleId}','')<>'' and not (payload#>'{content,participantIds}' ? (payload#>>'{content,responsibleId}')) then raise exception using errcode='42501'; end if;
   end if;
   return mirai_private.command_phase3c(op,target,payload,expected);
  elsif op='dashboard.list' then
   -- All base tables here remain subject to executor RLS; worker receives only ID/name/status.
   select coalesce(jsonb_agg(item order by id),'[]'::jsonb) into result from (
    select u.id,case when mirai_private.allowed(u.id,'professional_read') then jsonb_build_object('id',u.id,'name',u.name,'status',u.status,
     'renewal_due_on',u.renewal_due_on,
     'plan',(select jsonb_build_object('id',p.id,'renewal_date',p.renewal_date,'state',r.state) from public.plans p join public.plan_reviews r on r.plan_id=p.id where p.user_id=u.id and p.status='active'),
     'monitoring',(select m.content->>'nextDate' from public.monitoring_records m where m.user_id=u.id order by m.performed_on desc,m.created_at desc,m.id limit 1),
     'meetings',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'held_on',m.held_on,'deadline',m.content->>'deadline','state',m.content->>'actionStatus') order by m.held_on)
       from public.meeting_records m where m.user_id=u.id and coalesce(m.content->>'actionStatus','unconfirmed')<>'done'),'[]'::jsonb))
    else jsonb_build_object('id',u.id,'name',u.name,'status',u.status) end item
    from public.users u order by u.id limit 100 offset coalesce((payload->>'offset')::integer,0)) q;
  elsif op in ('audit.list','audit.technical') then result:=mirai_private.audit_list(op='audit.technical',coalesce((payload->>'offset')::integer,0));
  end if;
  ok:=true;
 exception when others then code:=sqlstate;result:=null;
 end;
 insert into mirai_private.audit_events(actor_auth_id,actor_staff_id,operation,target_id,outcome,code,facility_id,subject_staff_id)
 values(mirai_private.auth_identity(),a,op,target,case when ok then 'success' else 'denied' end,code,f,
  case when op in ('staff.active','staff.role','staff.end') and ok then (payload->>'staff_id')::uuid else null end);
 return jsonb_build_object('ok',ok,'code',code,'data',result);
end $$;
grant create on schema mirai_private to mirai_executor;
alter function mirai_private.command(text,uuid,jsonb,integer) owner to mirai_executor;
revoke create on schema mirai_private from mirai_executor;
revoke all on function mirai_private.command(text,uuid,jsonb,integer) from public,anon;
grant execute on function mirai_private.command(text,uuid,jsonb,integer) to authenticated;
create or replace function public.mirai_command(p_operation text,p_target uuid default null,p_payload jsonb default '{}'::jsonb,p_version integer default null)
returns jsonb language sql security invoker set search_path='' as $$ select mirai_private.command(p_operation,p_target,p_payload,p_version) $$;
notify pgrst,'reload schema';
commit;
