-- AI-2026-037: allow a plan specialist to register a new user without broad table writes.
-- The creator is immediately assigned to the new user so existing specialist RLS can read it.
create or replace function public.create_user_with_plan(
  p_name text, p_kana text, p_birth_date date, p_status text, p_renewal_date date
) returns table(user_id uuid, plan_id uuid)
language plpgsql security definer set search_path=''
as $function$
declare v_staff_id uuid; v_user_id uuid; v_plan_id uuid; v_is_admin boolean:=false; v_is_specialist boolean:=false;
begin
 select s.id,coalesce(bool_or(r.code='plan_admin'),false),coalesce(bool_or(r.code='plan_specialist'),false)
 into v_staff_id,v_is_admin,v_is_specialist
 from public.staff s left join public.staff_org_roles sr on sr.staff_id=s.id left join public.roles r on r.id=sr.role_id
 where s.auth_user_id=auth.uid() group by s.id;
 if v_staff_id is null then raise exception 'ログイン中のユーザーに対応する職員情報が見つかりません（staff未登録、auth.uid()=%）',auth.uid() using errcode='M1001'; end if;
 if not (v_is_admin or v_is_specialist) then raise exception '権限がありません。' using errcode='M7003'; end if;
 insert into public.users(name,kana,birth_date,status,created_by,updated_by) values(p_name,p_kana,p_birth_date,p_status,v_staff_id,v_staff_id) returning id into v_user_id;
 insert into public.plans(user_id,renewal_date,status,created_by,updated_by) values(v_user_id,p_renewal_date,'active',v_staff_id,v_staff_id) returning id into v_plan_id;
 if v_is_specialist then
   insert into public.plan_assignments as pa(user_id,staff_id) values(v_user_id,v_staff_id)
   on conflict on constraint plan_assignments_pkey do nothing;
 end if;
 return query select v_user_id,v_plan_id;
end;$function$;
revoke all on function public.create_user_with_plan(text,text,date,text,date) from public,anon;
grant execute on function public.create_user_with_plan(text,text,date,text,date) to authenticated;
