begin;
-- No seed secret: isolated tests provision a random key. Shared environments
-- remain fail-closed until a separately approved secret provisioning procedure.
create table mirai_private.form_signer(singleton boolean primary key default true check(singleton),secret text not null check(length(secret)>=64));
revoke all on mirai_private.form_signer from public,anon,authenticated,service_role,mirai_executor;
alter table mirai_private.form_signer enable row level security;
do $outer$
declare ns text;
begin
 select n.nspname into ns from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';
 execute format($ddl$create function mirai_private.verify_form_signature(message text,signature text) returns boolean
 language sql security definer set search_path='' as $body$
 select coalesce((select encode(%I.hmac(convert_to(message,'UTF8'),convert_to(secret,'UTF8'),'sha256'),'hex')=signature from mirai_private.form_signer where singleton),false)
 $body$$ddl$,ns);
end $outer$;
revoke all on function mirai_private.verify_form_signature(text,text) from public,anon,authenticated;
grant execute on function mirai_private.verify_form_signature(text,text) to mirai_executor;

create table mirai_private.form_outputs(
 id uuid primary key, plan_id uuid not null, revision integer not null,user_id uuid not null references public.users(id),
 kind text not null check(kind in ('plan','proposal','monitoring','weekly')),
 template_version text not null, actor_staff_id uuid not null references public.staff(id),
 output_at timestamptz not null default clock_timestamp(),file_hash text not null,source_hash text not null,
 file_bytes bytea not null check(octet_length(file_bytes) between 1 and 2097152),
 foreign key(plan_id,revision) references mirai_private.approved_exports(plan_id,revision)
);
revoke all on mirai_private.form_outputs from public,anon,authenticated,service_role;
grant select,insert on mirai_private.form_outputs to mirai_executor;
alter table mirai_private.form_outputs enable row level security;
create policy scoped_form_outputs on mirai_private.form_outputs to mirai_executor
 using(mirai_private.allowed(user_id,'professional_read'))
 with check(mirai_private.allowed(user_id,'professional_read') and actor_staff_id=mirai_private.actor());

alter function mirai_private.command(text,uuid,jsonb,integer) rename to command_phase3e;
revoke all on function mirai_private.command_phase3e(text,uuid,jsonb,integer) from public,anon,authenticated;
create function mirai_private.command(op text,target uuid,payload jsonb,expected integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare a uuid; result jsonb; ok boolean:=false; code text:='00000'; s mirai_private.approved_exports; f mirai_private.form_outputs;
 b bytea; h text; message text; oid uuid;
begin
 if op not in ('form.register','form.list','form.read') then return mirai_private.command_phase3e(op,target,payload,expected); end if;
 begin
  a:=mirai_private.actor();
  if a is null or payload is null or jsonb_typeof(payload)<>'object' then raise exception using errcode='42501';end if;
  if op='form.register' then
   if payload-array['revision','kind','template','bytes','signature','id']<>'{}'::jsonb then raise exception using errcode='22023';end if;
   select * into s from mirai_private.approved_exports where plan_id=target and revision=(payload->>'revision')::integer;
   if s.plan_id is null then raise exception using errcode='42501';end if;
   if length(payload->>'bytes')>2800000 or payload->>'template'<>'nagoya-20120402-f1' then raise exception using errcode='22023';end if;
   oid:=(payload->>'id')::uuid;b:=decode(payload->>'bytes','base64');h:=encode(sha256(b),'hex');
   message:=concat_ws('|',mirai_private.auth_identity()::text,target::text,s.revision::text,payload->>'kind',payload->>'template',oid::text,h);
   if not mirai_private.verify_form_signature(message,payload->>'signature') then raise exception using errcode='42501';end if;
   insert into mirai_private.form_outputs(id,plan_id,revision,user_id,kind,template_version,actor_staff_id,file_hash,source_hash,file_bytes)
    values(oid,target,s.revision,s.user_id,payload->>'kind',payload->>'template',a,h,encode(sha256(convert_to(s.snapshot::text,'UTF8')),'hex'),b);
   select to_jsonb(x)-'file_bytes' into result from mirai_private.form_outputs x where id=oid;
  elsif op='form.list' then
   if payload<>'{}'::jsonb then raise exception using errcode='22023';end if;
   if not exists(select 1 from public.plans p where p.id=target and mirai_private.allowed(p.user_id,'professional_read')) then raise exception using errcode='42501';end if;
   select coalesce(jsonb_agg(to_jsonb(x)-'file_bytes' order by x.output_at desc),'[]') into result from mirai_private.form_outputs x where x.plan_id=target;
  else
   if payload<>'{}'::jsonb then raise exception using errcode='22023';end if;
   select * into f from mirai_private.form_outputs where id=target;
   if f.id is null then raise exception using errcode='42501';end if;
   result:=(to_jsonb(f)-'file_bytes')||jsonb_build_object('bytes',encode(f.file_bytes,'base64'));
  end if;
  ok:=true;
 exception when others then code:=sqlstate;result:=null;
 end;
 insert into mirai_private.audit_events(actor_auth_id,actor_staff_id,operation,target_id,outcome,code,user_id)
 values(mirai_private.auth_identity(),a,op,target,case when ok then 'success' else 'denied' end,code,
 case when ok then case when op='form.read' then f.user_id else (select user_id from public.plans where id=target) end else null end);
 return jsonb_build_object('ok',ok,'code',code,'data',result);
end $$;
grant create on schema mirai_private to mirai_executor;
alter function mirai_private.command(text,uuid,jsonb,integer) owner to mirai_executor;
revoke create on schema mirai_private from mirai_executor;
revoke all on function mirai_private.command(text,uuid,jsonb,integer) from public,anon;
grant execute on function mirai_private.command(text,uuid,jsonb,integer) to authenticated;
create or replace function public.mirai_command(p_operation text,p_target uuid default null,p_payload jsonb default '{}'::jsonb,p_version integer default null)
returns jsonb language sql security invoker set search_path='' as $$select mirai_private.command(p_operation,p_target,p_payload,p_version)$$;
notify pgrst,'reload schema';
commit;
