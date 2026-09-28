-- Entirely fictional; never import real people or production exports.
insert into auth.users(id) values
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444'),
 ('55555555-5555-4555-8555-555555555555'),
 ('66666666-6666-4666-8666-666666666666');
insert into public.staff(id,auth_user_id,name)
 select id,id,'架空試験職員-' || right(id::text,1) from auth.users;
insert into public.users(id,name,kana,birth_date,status)
 values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','架空試験利用者A','カクウシケン','2000-01-01','準備中');
insert into public.plans(id,user_id,renewal_date,status,content)
 values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','2027-01-01','active',
 '{"userWish":"架空の活動を試したい","familyWish":"本人の選択を尊重","overallPolicy":"架空の相談支援","longTermGoal":"好きな活動を選ぶ","shortTermGoal":"活動候補を話す","services":[]}'::jsonb);
-- Legacy role: characterize the baseline only, never a production permission.
insert into public.staff_org_roles(staff_id,role_id)
 select '11111111-1111-4111-8111-111111111111',id from public.roles where code='plan_specialist';
insert into public.plan_assignments(user_id,staff_id)
 values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111');

