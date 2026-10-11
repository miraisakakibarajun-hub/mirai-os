-- ISOLATED TEST FIXTURE ONLY. Not a production parent/master migration.
-- Deliberately omits history/approval dependencies. All IDs/data are synthetic.
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
CREATE ROLE test_runtime LOGIN; CREATE ROLE test_worker LOGIN; CREATE ROLE test_wrong LOGIN;
CREATE ROLE test_function_owner NOLOGIN NOSUPERUSER NOBYPASSRLS;
CREATE SCHEMA staff_core; CREATE SCHEMA auth;
CREATE TABLE staff_core.organizations(org_id uuid PRIMARY KEY);
CREATE TABLE staff_core.persons(person_id uuid PRIMARY KEY);
CREATE TABLE staff_core.account_links(account_id uuid PRIMARY KEY);
CREATE TABLE staff_core.actor_registry(actor_id uuid PRIMARY KEY,actor_type text,actor_state text);
CREATE TABLE auth.users(id uuid PRIMARY KEY,deleted_at timestamptz,banned_until timestamptz,is_anonymous boolean);
CREATE TABLE auth.sessions(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id),not_after timestamptz);
-- Source projection shape: reviewed production adapters must populate these
-- from existing master/current revisions and successful approval evidence.
CREATE TABLE staff_core.test_current_accounts(account_id uuid,person_id uuid,subject uuid,issuer text,org_id uuid,login_name text,provider_login_identifier text,account_state text,person_status text,organization_state text,valid_from timestamptz,valid_to timestamptz,org_valid_from timestamptz,org_valid_to timestamptz,provisioning_state text,credential_state text,auth_epoch bigint,authz_version bigint,business_binding_valid boolean);
CREATE TABLE staff_core.test_stops(suspension_id uuid PRIMARY KEY,account_id uuid,suspension_kind text,org_id uuid,system_code text,effective_from timestamptz,effective_to timestamptz);
CREATE TABLE staff_core.test_releases(suspension_id uuid UNIQUE REFERENCES staff_core.test_stops(suspension_id),release_effective_at timestamptz);
