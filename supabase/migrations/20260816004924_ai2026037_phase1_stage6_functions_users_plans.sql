-- =====================================================================
-- AI-2026-037 Phase 1 工程6 ステージ3: users＋plans トランザクション関数
-- 対象: Supabase開発用プロジェクト「mirai-os-dev」
-- 作成日: 2026-08-16
-- 作成者: Claude（クラフト）
-- 承認: 榊原純（相棒レビュー2回・承認済み）
-- 状態: 正式版（実行）
--
-- 【本SQLの内容】
-- ・利用者の新規登録／更新を、users と plans の2テーブルに対して
--   「両方成功／両方失敗」の単位で行うためのDatabase Functionを
--   2つ新規作成する（create_user_with_plan / update_user_with_plan）。
-- ・PL/pgSQL関数は、内部で例外(exception)が発生すると関数全体の
--   変更が自動的にロールバックされるPostgreSQLの性質を利用し、
--   明示的なCOMMIT/ROLLBACK制御なしでトランザクション性を担保する。
--
-- 【本SQLの性質】
-- ・既存9テーブル・plansテーブルへの構造変更（ALTER TABLE等）は
--   一切含まない。関数2つの新規作成のみ。
-- ・DROP TABLE / TRUNCATE は一切含まない。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. 新規登録用関数: create_user_with_plan
-- ---------------------------------------------------------------------
create or replace function create_user_with_plan(
  p_name         text,
  p_kana         text,
  p_birth_date   date,
  p_status       text,
  p_renewal_date date
)
returns table (user_id uuid, plan_id uuid)
language plpgsql
as $$
declare
  v_staff_id uuid;
  v_user_id  uuid;
  v_plan_id  uuid;
begin
  select s.id into v_staff_id
  from staff s
  where s.auth_user_id = auth.uid();

  if v_staff_id is null then
    raise exception 'ログイン中のユーザーに対応する職員情報が見つかりません（staff未登録、auth.uid()=%）', auth.uid()
      using errcode = 'P0001';
  end if;

  insert into users (name, kana, birth_date, status, created_by, updated_by)
  values (p_name, p_kana, p_birth_date, p_status, v_staff_id, v_staff_id)
  returning id into v_user_id;

  insert into plans (user_id, renewal_date, status, created_by, updated_by)
  values (v_user_id, p_renewal_date, 'active', v_staff_id, v_staff_id)
  returning id into v_plan_id;

  return query select v_user_id, v_plan_id;
end;
$$;

comment on function create_user_with_plan is
  '利用者の新規登録。users・plans(status=active)への挿入を1トランザクションで行う。片方が失敗した場合、関数全体がロールバックされる。created_by/updated_byにはauth.uid()経由で取得したstaff.idを設定する。';

revoke execute on function create_user_with_plan(text, text, date, text, date) from public;
revoke execute on function create_user_with_plan(text, text, date, text, date) from anon;
grant  execute on function create_user_with_plan(text, text, date, text, date) to authenticated;


-- ---------------------------------------------------------------------
-- 2. 更新用関数: update_user_with_plan
-- ---------------------------------------------------------------------
create or replace function update_user_with_plan(
  p_user_id      uuid,
  p_name         text,
  p_kana         text,
  p_birth_date   date,
  p_status       text,
  p_renewal_date date
)
returns table (user_id uuid, plan_id uuid)
language plpgsql
as $$
declare
  v_staff_id uuid;
  v_plan_id  uuid;
begin
  select s.id into v_staff_id
  from staff s
  where s.auth_user_id = auth.uid();

  if v_staff_id is null then
    raise exception 'ログイン中のユーザーに対応する職員情報が見つかりません（staff未登録、auth.uid()=%）', auth.uid()
      using errcode = 'P0001';
  end if;

  update users
     set name       = p_name,
         kana       = p_kana,
         birth_date = p_birth_date,
         status     = p_status,
         updated_by = v_staff_id
   where id = p_user_id;

  if not found then
    raise exception '指定された利用者が見つかりません（user_id=%）', p_user_id
      using errcode = 'P0002';
  end if;

  select p.id into v_plan_id
  from plans p
  where p.user_id = p_user_id
    and p.status = 'active';

  if v_plan_id is null then
    raise exception 'この利用者に対応する有効な計画（active）が見つかりません（user_id=%）。データ不整合の可能性があります。', p_user_id
      using errcode = 'P0003';
  end if;

  update plans
     set renewal_date = p_renewal_date,
         updated_by   = v_staff_id
   where id = v_plan_id;

  return query select p_user_id, v_plan_id;
end;
$$;

comment on function update_user_with_plan is
  '利用者情報の更新。users・plansの「現在のactive計画」1件を1トランザクションで更新する。片方が失敗した場合、関数全体がロールバックされる。update対象のactive計画が存在しない場合はエラー(P0003)とする。updated_byにはauth.uid()経由で取得したstaff.idを設定する。';

revoke execute on function update_user_with_plan(uuid, text, text, date, text, date) from public;
revoke execute on function update_user_with_plan(uuid, text, text, date, text, date) from anon;
grant  execute on function update_user_with_plan(uuid, text, text, date, text, date) to authenticated;
