-- Phase 3-C. Apply only to an empty disposable environment, never mirai-os-dev.
begin;
grant select on public.plan_review_events to mirai_executor;
create policy read_review_events on public.plan_review_events for select to mirai_executor
 using(exists(select 1 from public.plans p where p.id=plan_id));

-- Retain the tested 3-B implementation, but remove its direct entry point.
alter function mirai_private.command(text,uuid,jsonb,integer) rename to command_phase3b;
revoke execute on function mirai_private.command_phase3b(text,uuid,jsonb,integer) from authenticated;
create function mirai_private.command(op text,target uuid,payload jsonb,expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid:=mirai_private.actor(); result jsonb; ok boolean:=false; code text:='OK';
 t text; rec record; readable boolean; editable boolean; admin boolean;
begin
 if op not in ('session.context','user.list','user.workspace','record.list','plan.list','plan.history','plan.submit','plan.approve','plan.reject','plan.revise','record.save') then
  return mirai_private.command_phase3b(op,target,payload,expected);
 end if;
 begin
  if a is null or payload is null or jsonb_typeof(payload)<>'object'
   or exists(select 1 from jsonb_object_keys(payload) k where k not in ('kind','offset','epoch','reason','user_id','date','content'))
   then raise exception using errcode='42501'; end if;
  if op in ('plan.submit','plan.approve','plan.reject','plan.revise') then
   select p.id,r.epoch into rec from public.plans p join public.plan_reviews r on r.plan_id=p.id where p.id=target for update of p,r;
   if rec.id is null then raise exception using errcode='42501'; end if;
   if payload->>'epoch' is null then raise exception using errcode='22023'; end if;
   if (payload->>'epoch')::integer<>rec.epoch then raise exception using errcode='40001'; end if;
   return mirai_private.command_phase3b(op,target,payload-'epoch',expected);
  elsif op='record.save' then
   t:=case payload->>'kind' when 'support' then 'support_records' when 'assessment' then 'assessment_records' when 'monitoring' then 'monitoring_records' when 'meeting' then 'meeting_records' end;
   if t is null then raise exception using errcode='42501'; end if;
   if expected>0 then
    execute format('select version,created_by,user_id,record_state from public.%I where id=$1 for update',t) into rec using target;
    if rec.version is null or rec.user_id is distinct from (payload->>'user_id')::uuid
     or not mirai_private.allowed(rec.user_id,case when t='support_records' then 'read' else 'edit' end)
     or (t='support_records' and rec.created_by is distinct from a) or rec.record_state<>'draft' then raise exception using errcode='42501'; end if;
    if rec.version<>expected then raise exception using errcode='40001'; end if;
   end if;
   return mirai_private.command_phase3b(op,target,payload,expected);
  elsif op='session.context' then
   select jsonb_build_object('staffId',a,'facilities',coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,
    'canRegister',mirai_private.facility_role(f.id,array['business_admin','specialist'])) order by f.id),'[]'::jsonb),
    'technical',mirai_private.technical()) into result from public.facilities f;
  elsif op='user.list' then
   if coalesce((payload->>'offset')::integer,0)<0 then raise exception using errcode='22023'; end if;
   select coalesce(jsonb_agg(item order by id),'[]'::jsonb) into result from (
    select u.id,case when mirai_private.allowed(u.id,'professional_read') then
      jsonb_build_object('id',u.id,'name',u.name,'status',u.status,'kana',u.kana,'birth_date',u.birth_date)
     else jsonb_build_object('id',u.id,'name',u.name,'status',u.status) end item
    from public.users u order by u.id limit 100 offset coalesce((payload->>'offset')::integer,0)
   ) q;
  elsif op='user.workspace' then
   if not mirai_private.allowed(target,'read') then raise exception using errcode='42501'; end if;
   readable:=mirai_private.allowed(target,'professional_read');
   editable:=mirai_private.allowed(target,'edit'); admin:=mirai_private.allowed(target,'admin');
   result:=jsonb_build_object('user',(mirai_private.command_phase3b('user.read',target,'{}',null))->'data',
    'permissions',jsonb_build_object('professionalRead',readable,'professionalEdit',editable,'manage',admin,
      'supportCreate',true,'userEdit',editable or admin),'staffId',a);
  elsif op='record.list' then
   t:=case payload->>'kind' when 'support' then 'support_records' when 'assessment' then 'assessment_records'
    when 'monitoring' then 'monitoring_records' when 'meeting' then 'meeting_records' end;
   if t is null or not mirai_private.allowed(target,case when t='support_records' then 'read' else 'professional_read' end)
    then raise exception using errcode='42501'; end if;
   if coalesce((payload->>'offset')::integer,0)<0 then raise exception using errcode='22023'; end if;
   -- RLS additionally restricts workers to their own support records.
   execute format('select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc,q.id),''[]''::jsonb) from
    (select * from public.%I where user_id=$1 order by created_at desc,id limit 100 offset $2) q',t)
    into result using target,coalesce((payload->>'offset')::integer,0);
  elsif op='plan.list' then
   if not mirai_private.allowed(target,'professional_read') then raise exception using errcode='42501'; end if;
   select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('review',to_jsonb(r)) order by p.created_at desc),'[]'::jsonb)
    into result from public.plans p join public.plan_reviews r on r.plan_id=p.id where p.user_id=target and p.status='active';
  elsif op='plan.history' then
   if not exists(select 1 from public.plans where id=target) then raise exception using errcode='42501'; end if;
   result:=jsonb_build_object('revisions',coalesce((select jsonb_agg(to_jsonb(v) order by revision desc) from public.plan_revisions v where plan_id=target),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(to_jsonb(e) order by happened_at desc,id) from public.plan_review_events e where plan_id=target),'[]'::jsonb));
  end if;
  ok:=true;
 exception when others then code:=sqlstate; result:=null;
 end;
 insert into mirai_private.audit_events(actor_auth_id,actor_staff_id,operation,target_id,outcome,code)
 values(mirai_private.auth_identity(),a,op,target,case when ok then 'success' else 'denied' end,code);
 return jsonb_build_object('ok',ok,'code',code,'data',result);
end $$;
grant create on schema mirai_private to mirai_executor;
alter function mirai_private.command(text,uuid,jsonb,integer) owner to mirai_executor;
revoke create on schema mirai_private from mirai_executor;
revoke all on function mirai_private.command(text,uuid,jsonb,integer) from public,anon;
grant execute on function mirai_private.command(text,uuid,jsonb,integer) to authenticated;
-- SQL function body must be rebound after rename.
create or replace function public.mirai_command(p_operation text,p_target uuid default null,p_payload jsonb default '{}'::jsonb,p_version integer default null)
returns jsonb language sql security invoker set search_path='' as $$
 select mirai_private.command(p_operation,p_target,p_payload,p_version)
$$;
notify pgrst,'reload schema';
commit;
