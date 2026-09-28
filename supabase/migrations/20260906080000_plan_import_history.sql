begin;
create table public.plan_import_events (
 id uuid primary key default gen_random_uuid(),
 plan_id uuid not null, revision integer not null,
 field text not null, document_id uuid not null, document_version integer not null,
 imported_text text not null, saved_text text not null,
 source_content jsonb not null,
 imported_by uuid not null references public.staff(id), recorded_at timestamptz not null default now(),
 foreign key(plan_id,revision) references public.plan_revisions(plan_id,revision)
);
alter table public.plan_import_events enable row level security;
revoke all on public.plan_import_events from public,anon,authenticated;

create function public.save_plan_with_imports(p_plan_id uuid,p_user_id uuid,p_expected_version integer,p_content jsonb,p_imports jsonb)
returns table(content_version integer) language plpgsql security definer set search_path='' as $$
declare actor_id uuid; v integer; item jsonb; d public.ai_documents;
begin
 if not public.can_manage_plan(p_user_id) then raise exception '権限がありません。' using errcode='M7003'; end if;
 if p_imports is null or jsonb_typeof(p_imports)<>'array' then raise exception '取り込み履歴の形式が不正です。' using errcode='M8002'; end if;
 if jsonb_array_length(p_imports)>20 then raise exception '一度に保存できる取り込みは20件までです。' using errcode='M8002'; end if;
 select id into actor_id from public.staff where auth_user_id=auth.uid();
 select s.content_version into v from public.save_plan_content(p_plan_id,p_user_id,p_expected_version,p_content) s;
 for item in select value from jsonb_array_elements(p_imports) loop
  if jsonb_typeof(item)<>'object' or (item->>'field') is null or (item->>'field') not in ('userWish','familyWish','overallPolicy','longTermGoal','shortTermGoal')
   or jsonb_typeof(item->'imported_text') is distinct from 'string' or btrim(item->>'imported_text')='' or length(item->>'imported_text')>30000
   or jsonb_typeof(item->'source_body') is distinct from 'string'
   or coalesce(item->>'document_id','')!~'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   or coalesce(item->>'document_version','')!~'^[1-9][0-9]{0,8}$'
  then raise exception '取り込み履歴の項目が不正です。' using errcode='M8002'; end if;
  select * into d from public.ai_documents where id=(item->>'document_id')::uuid and user_id=p_user_id and created_by=actor_id for share;
  if d.id is null then raise exception '元の文書を参照できません。' using errcode='M8003'; end if;
  if d.version<>(item->>'document_version')::integer or d.content->>'body' is distinct from item->>'source_body' or d.content->>'kind' is distinct from 'サービス等利用計画の下書き'
  then raise exception '元の文書が変更されています。取り込みをやり直してください。' using errcode='M8001'; end if;
  insert into public.plan_import_events(plan_id,revision,field,document_id,document_version,imported_text,saved_text,source_content,imported_by)
   values(p_plan_id,v,item->>'field',d.id,d.version,item->>'imported_text',p_content->>(item->>'field'),d.content,actor_id);
 end loop;
 return query select v;
end;
$$;
revoke all on function public.save_plan_with_imports(uuid,uuid,integer,jsonb,jsonb) from public,anon;
grant execute on function public.save_plan_with_imports(uuid,uuid,integer,jsonb,jsonb) to authenticated;

create or replace function public.get_plan_review(p_plan_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.plans; result jsonb; actor_id uuid;
begin
 select * into p from public.plans where id=p_plan_id;
 if p.id is null or not public.can_manage_plan(p.user_id) then raise exception '権限がありません。' using errcode='M7003'; end if;
 select id into actor_id from public.staff where auth_user_id=auth.uid();
 select to_jsonb(r) || jsonb_build_object(
 'revisions',coalesce((select jsonb_agg(to_jsonb(v) order by v.revision desc) from public.plan_revisions v where v.plan_id=p.id),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.happened_at desc,e.id) from public.plan_review_events e where e.plan_id=p.id),'[]'::jsonb),
 'imports',coalesce((select jsonb_agg((to_jsonb(i)-'source_content') || jsonb_build_object('source_content',case when i.imported_by=actor_id then i.source_content else null end) order by i.revision desc,i.recorded_at,i.id) from public.plan_import_events i where i.plan_id=p.id),'[]'::jsonb)
 ) into result from public.plan_reviews r where r.plan_id=p.id;
 return result;
end;
$$;
notify pgrst,'reload schema';
commit;
