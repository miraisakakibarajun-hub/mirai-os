-- 88 design candidate only. Not deployed and NOT an authorization function.
-- Every writer must call this BEFORE ANY row/advisory lock or state read used
-- for a write. Existing writers/triggers have NOT been retrofitted in88.
-- Proposal: conservative global transaction gate for this small initial tenant.
BEGIN;
CREATE FUNCTION staff_core.acquire_write_fence_88() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION USING ERRCODE='25000',MESSAGE='88 requires read committed';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(20261017,88);
END $$;
CREATE FUNCTION staff_core.acquire_body_read_fence_88() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION USING ERRCODE='25000',MESSAGE='88 requires read committed';
 END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock_shared(20261017,88);
END $$;
REVOKE ALL ON FUNCTION staff_core.acquire_write_fence_88(),staff_core.acquire_body_read_fence_88()
FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
