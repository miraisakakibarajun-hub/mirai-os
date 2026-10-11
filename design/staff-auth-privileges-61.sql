-- AUTH-CHECK-61: closed role shells, REVIEW ONLY, NOT applied.
-- Prerequisite: reviewed private schema, identity/stop parent DDL, functions,
-- environment constraints, role memberships and integration verification.
-- No LOGIN credentials, membership, application privileges or RLS bypass.
BEGIN;
CREATE ROLE mirai_staff_auth_runtime NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE mirai_staff_auth_worker NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE mirai_staff_auth_function_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
REVOKE ALL ON SCHEMA staff_auth_private FROM mirai_staff_auth_runtime, mirai_staff_auth_worker;
REVOKE ALL ON ALL TABLES IN SCHEMA staff_auth_private FROM mirai_staff_auth_runtime, mirai_staff_auth_worker;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA staff_auth_private FROM PUBLIC, anon, authenticated, service_role, mirai_staff_auth_runtime, mirai_staff_auth_worker;
-- Future owned functions must explicitly revoke inherited PUBLIC execution.
ALTER DEFAULT PRIVILEGES FOR ROLE mirai_staff_auth_function_owner IN SCHEMA staff_auth_private REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
-- No blanket GRANT, SET ROLE membership or SECURITY DEFINER is supplied here.
COMMIT;
