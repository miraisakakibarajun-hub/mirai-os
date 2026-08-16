-- =====================================================================
-- AI-2026-037 Phase 1 工程6 ステージ1: plansテーブル新規作成
-- 対象: Supabase開発用プロジェクト「mirai-os-dev」
-- 作成日: 2026-08-16
-- 作成者: Claude（クラフト）
-- 承認: 榊原純（相棒レビュー済み）
-- 状態: 正式版（未実行・ステージ2Bで実行予定）
--
-- 【本SQLの内容】
-- ・利用者(users)に紐づく「計画更新期限」情報を管理する最小構成の
--   plansテーブルを新規作成する。
-- ・1利用者につき「現在有効な計画（status='active'）」は常に1件のみ
--   となるよう、部分ユニークインデックスでDB側から制約する。
-- ・過去の計画は status='archived' として複数件残せる設計とし、
--   将来の「複数計画・計画履歴」管理を妨げない。
--
-- 【本SQLの性質】
-- ・既存テーブル（users含む9テーブル）への変更は一切含まない。
-- ・DROP TABLE / TRUNCATE は一切含まない。
-- ・新規テーブル1つの追加のみ。
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. plans テーブル本体
-- ---------------------------------------------------------------------
create table if not exists plans (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id),
  renewal_date date not null,
  status       text not null default 'active'
    check (status in ('active', 'archived')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  created_by   uuid references staff(id) on delete set null,
  updated_by   uuid references staff(id) on delete set null
);

comment on table plans is
  '利用者ごとの計画（計画更新期限）を管理する。1利用者につき現在有効な計画（active）は常に1件のみ。過去の計画はarchivedとして複数件保持できる。';

comment on column plans.status is
  'active=現在有効な計画／archived=過去の計画（履歴）。1利用者につきactiveは1件のみに制約される（下記ユニークインデックス参照）。';

-- ---------------------------------------------------------------------
-- 2. 「1利用者につきactiveは1件のみ」を保証する部分ユニークインデックス
-- ---------------------------------------------------------------------
create unique index if not exists ux_plans_user_active
  on plans (user_id)
  where status = 'active';

comment on index ux_plans_user_active is
  '1利用者(user_id)につき、status=activeの計画は同時に1件までしか存在できないことをDB側で保証する。';

-- ---------------------------------------------------------------------
-- 3. updated_at 自動更新トリガー（usersテーブルと同じ仕組みを踏襲）
-- ---------------------------------------------------------------------
drop trigger if exists trg_plans_set_updated_at on plans;
create trigger trg_plans_set_updated_at
  before update on plans
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 4. RLS（Row Level Security）有効化とポリシー
--    工程5の他テーブルと同じ方針：認証済みユーザーは読み書き可、削除不可
-- ---------------------------------------------------------------------
alter table plans enable row level security;

create policy "authenticated_read_plans"
  on plans for select
  to authenticated
  using (true);

create policy "authenticated_write_plans"
  on plans for insert
  to authenticated
  with check (true);

create policy "authenticated_update_plans"
  on plans for update
  to authenticated
  using (true)
  with check (true);
