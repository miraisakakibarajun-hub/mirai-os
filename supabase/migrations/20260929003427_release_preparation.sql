begin;
-- Private, immutable approval snapshot. No backfill from mutable present-day user data.
create table mirai_private.approved_exports (
 plan_id uuid not null references public.plans(id), revision integer not null,
 user_id uuid not null references public.users(id), approved_at timestamptz not null,
 snapshot jsonb not null, primary key(plan_id,revision)
);
revoke all on mirai_private.approved_exports from public,anon,authenticated,service_role;
grant select on mirai_private.approved_exports to mirai_executor;
alter table mirai_private.approved_exports enable row level security;
create policy scoped_exports on mirai_private.approved_exports for select to mirai_executor
 using(mirai_private.allowed(user_id,'professional_read'));
create function mirai_private.capture_approved_export() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.state='approved' and (old.state is distinct from new.state or old.approved_revision is distinct from new.approved_revision) then
  insert into mirai_private.approved_exports(plan_id,revision,user_id,approved_at,snapshot)
  select p.id,new.approved_revision,p.user_id,transaction_timestamp(),jsonb_build_object(
   'schemaVersion',1,'planId',p.id,'revision',new.approved_revision,'status','approved',
   'user',jsonb_build_object('id',u.id,'name',u.name,'kana',u.kana,'birth_date',u.birth_date),
   'facility',jsonb_build_object('id',f.id,'name',f.name),
   'content',p.content,'createdAt',p.created_at,'approvedAt',transaction_timestamp(),
   'approverId',mirai_private.actor(),'templateVersion','mirai-review-v1')
  from public.plans p join public.users u on u.id=p.user_id join public.facilities f on f.id=u.facility_id
  where p.id=new.plan_id;
 end if;
 return new;
end $$;
revoke all on function mirai_private.capture_approved_export() from public,anon,authenticated;
create trigger capture_approved_export after update on public.plan_reviews
 for each row execute function mirai_private.capture_approved_export();

alter function mirai_private.command(text,uuid,jsonb,integer) rename to command_phase3d;
revoke all on function mirai_private.command_phase3d(text,uuid,jsonb,integer) from public,anon,authenticated;
create function mirai_private.command(op text,target uuid,payload jsonb,expected integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; ok boolean:=false; code text:='00000'; a uuid;
begin
 if op<>'plan.export' then return mirai_private.command_phase3d(op,target,payload,expected); end if;
 begin
  a:=mirai_private.actor();
  if a is null or payload - 'revision'<>'{}'::jsonb then raise exception using errcode='42501'; end if;
  select snapshot into result from mirai_private.approved_exports where plan_id=target and revision=(payload->>'revision')::integer;
  if result is null then raise exception using errcode='42501'; end if;
  result:=result||jsonb_build_object('outputAt',clock_timestamp());ok:=true;
 exception when others then code:=sqlstate;result:=null;
 end;
 insert into mirai_private.audit_events(actor_auth_id,actor_staff_id,operation,target_id,outcome,code)
 values(mirai_private.auth_identity(),a,'plan.export',target,case when ok then 'success' else 'denied' end,code);
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
