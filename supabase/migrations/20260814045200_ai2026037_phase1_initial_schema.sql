-- =====================================================================
-- AI-2026-037 Phase 1 工程5: 開発用DBテーブル作成（初回マイグレーション）
-- 対象: Supabase開発用プロジェクト「mirai-os-dev」
-- 作成日: 2026-08-14
-- 作成者: Claude（クラフト）
-- 承認: 榊原純（相棒レビュー済み）
--
-- 【本SQLの内容】
-- 9テーブル（service_types, facilities, facility_service_types,
-- roles, staff, staff_org_roles, staff_facility_roles, users,
-- user_service_assignments）の新規作成、各テーブルのRLS有効化と
-- 暫定ポリシー（authenticatedユーザーのみ読み書き可、削除は不可）、
-- users.updated_at自動更新トリガーを含む。
--
-- 【本SQLの性質】
-- 既存テーブル・既存データを削除する DROP TABLE / TRUNCATE は
-- 一切含まない。
--
-- 例外として、users.updated_at自動更新の仕組み（トリガー）を
-- 安全に再実行可能にするため「drop trigger if exists」を使用する。
-- これはテーブルの中身（利用者データ等）を一切削除しない、
-- 「同名の仕組みがあれば作り直す」ための制御文である。
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. service_types
-- ---------------------------------------------------------------------
create table if not exists service_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null
);

comment on table service_types is 'サービス種別の定義（相談支援／GH／B型など）';

alter table service_types enable row level security;

create policy "authenticated_read_service_types"
  on service_types for select
  to authenticated
  using (true);

create policy "authenticated_write_service_types"
  on service_types for insert
  to authenticated
  with check (true);

create policy "authenticated_update_service_types"
  on service_types for update
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- 2. facilities
-- ---------------------------------------------------------------------
create table if not exists facilities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

comment on table facilities is '拠点（みらい本部／コスモス／ダリア／B型事業所等）';

alter table facilities enable row level security;

create policy "authenticated_read_facilities"
  on facilities for select
  to authenticated
  using (true);

create policy "authenticated_write_facilities"
  on facilities for insert
  to authenticated
  with check (true);

create policy "authenticated_update_facilities"
  on facilities for update
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- 3. facility_service_types
-- ---------------------------------------------------------------------
create table if not exists facility_service_types (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references facilities(id),
  service_type_id uuid not null references service_types(id),
  created_at timestamptz not null default now(),
  unique (facility_id, service_type_id)
);

comment on table facility_service_types is '拠点が提供するサービス種別（1拠点が複数サービスを持てる多対多構造）';

alter table facility_service_types enable row level security;

create policy "authenticated_read_facility_service_types"
  on facility_service_types for select
  to authenticated
  using (true);

create policy "authenticated_write_facility_service_types"
  on facility_service_types for insert
  to authenticated
  with check (true);

create policy "authenticated_update_facility_service_types"
  on facility_service_types for update
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- 4. roles
-- ---------------------------------------------------------------------
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null
);

comment on table roles is 'ロール定義（法人全体・拠点単位で共通使用）';

alter table roles enable row level security;

create policy "authenticated_read_roles"
  on roles for select
  to authenticated
  using (true);

create policy "authenticated_write_roles"
  on roles for insert
  to authenticated
  with check (true);

create policy "authenticated_update_roles"
  on roles for update
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- 5. staff
-- ---------------------------------------------------------------------
create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null,
  employee_number text,
  created_at timestamptz not null default now()
);

comment on table staff is '職員マスター（Supabase認証アカウントと1対1で連携）。認証アカウント削除時は連動して削除される';

alter table staff enable row level security;

create policy "authenticated_read_staff"
  on staff for select
  to authenticated
  using (true);

create policy "authenticated_write_staff"
  on staff for insert
  to authenticated
  with check (true);

create policy "authenticated_update_staff"
  on staff for update
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- 6. staff_org_roles
-- ---------------------------------------------------------------------
create table if not exists staff_org_roles (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  role_id uuid not null references roles(id),
  created_at timestamptz not null default now(),
  unique (staff_id, role_id)
);

comment on table staff_org_roles is '職員の法人全体ロール（拠点に紐づかない権限）。職員削除時は連動して削除される';

alter table staff_org_roles enable row level security;

create policy "authenticated_read_staff_org_roles"
  on staff_org_roles for select
  to authenticated
  using (true);

create policy "authenticated_write_staff_org_roles"
  on staff_org_roles for insert
  to authenticated
  with check (true);

create policy "authenticated_update_staff_org_roles"
  on staff_org_roles for update
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- 7. staff_facility_roles
-- ---------------------------------------------------------------------
create table if not exists staff_facility_roles (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  facility_id uuid not null references facilities(id),
  role_id uuid not null references roles(id),
  created_at timestamptz not null default now(),
  unique (staff_id, facility_id, role_id)
);

comment on table staff_facility_roles is '職員の拠点単位ロール（法人全体権限とは別に管理）。職員削除時は連動して削除される';

alter table staff_facility_roles enable row level security;

create policy "authenticated_read_staff_facility_roles"
  on staff_facility_roles for select
  to authenticated
  using (true);

create policy "authenticated_write_staff_facility_roles"
  on staff_facility_roles for insert
  to authenticated
  with check (true);

create policy "authenticated_update_staff_facility_roles"
  on staff_facility_roles for update
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------
-- 8. users
-- ---------------------------------------------------------------------
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kana text not null,
  birth_date date not null,
  status text not null default '準備中'
    check (status in ('準備中', '利用中', '保留', '終了')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references staff(id) on delete set null,
  updated_by uuid references staff(id) on delete set null
);

comment on table users is '法人共通の利用者マスター';
comment on column users.status is
  '法人としての利用者管理プロセスの状態。準備中=登録済み未支援開始／利用中=いずれかのサービスで支援進行中／保留=一時的に対応保留／終了=法人としての関わり終了';
comment on column users.created_by is
  '登録した職員。職員が削除された場合はNULLになる（利用者データ自体は保持される）';
comment on column users.updated_by is
  '最終更新した職員。職員が削除された場合はNULLになる（利用者データ自体は保持される）';

alter table users enable row level security;

create policy "authenticated_read_users"
  on users for select
  to authenticated
  using (true);

create policy "authenticated_write_users"
  on users for insert
  to authenticated
  with check (true);

create policy "authenticated_update_users"
  on users for update
  to authenticated
  using (true) with check (true);

-- users.updated_at をUPDATE時に自動更新する仕組み。
-- 「同名のトリガーが既にあれば、作り直すために一度削除する」という
-- 制御用の処理であり、users テーブルの中身（利用者データ）は
-- 一切削除しない。
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_set_updated_at on users;
create trigger trg_users_set_updated_at
  before update on users
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------
-- 9. user_service_assignments
-- ---------------------------------------------------------------------
create table if not exists user_service_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  facility_service_type_id uuid not null references facility_service_types(id),
  start_date date not null,
  end_date date,
  status text not null default 'active'
    check (status in ('active', 'ended')),
  created_at timestamptz not null default now()
);

comment on table user_service_assignments is '利用者が、どの拠点のどのサービスを利用しているかの記録';
comment on column user_service_assignments.status is
  'active=このサービスを現在利用中／ended=このサービスの利用が終了した';

alter table user_service_assignments enable row level security;

create policy "authenticated_read_user_service_assignments"
  on user_service_assignments for select
  to authenticated
  using (true);

create policy "authenticated_write_user_service_assignments"
  on user_service_assignments for insert
  to authenticated
  with check (true);

create policy "authenticated_update_user_service_assignments"
  on user_service_assignments for update
  to authenticated
  using (true) with check (true);