-- WORKFLOW-EVIDENCE-72 / post-66/70 structural checks, not authorization.
BEGIN;
CREATE FUNCTION staff_core.validate_workflow_effect_72() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r staff_core.request_revisions;c staff_core.change_requests;o staff_core.operation_requests;
BEGIN
 SELECT * INTO c FROM staff_core.change_requests WHERE request_id=NEW.request_id FOR SHARE;
 IF NOT FOUND OR c.request_state='CANCELLED' OR c.current_revision_id IS DISTINCT FROM NEW.request_revision_id
 THEN RAISE EXCEPTION 'Cancelled/stale workflow cannot create effect'; END IF;
 SELECT * INTO o FROM staff_core.operation_requests WHERE operation_id=NEW.operation_id FOR SHARE;
 IF NOT FOUND OR ROW(o.boundary_kind,o.org_id,o.control_scope_id) IS DISTINCT FROM ROW(c.boundary_kind,c.org_id,c.control_scope_id) THEN RAISE EXCEPTION 'Operation/request boundary mismatch'; END IF;
 SELECT * INTO r FROM staff_core.request_revisions WHERE request_revision_id=NEW.request_revision_id;
 IF c.boundary_kind='CONTROL' AND r.control_scope_id IS DISTINCT FROM c.control_scope_id THEN RAISE EXCEPTION 'Revision/control boundary mismatch'; END IF;
 IF TG_TABLE_NAME='initial_auth_admissions' THEN
  IF c.boundary_kind='ORG' AND NOT EXISTS(SELECT 1 FROM staff_core.initial_auth_request_details d WHERE d.request_revision_id=r.request_revision_id AND d.org_id=c.org_id) THEN RAISE EXCEPTION 'Initial org boundary mismatch'; END IF;
  IF r.request_kind IS DISTINCT FROM 'INITIAL_AUTH_ADMISSION' THEN RAISE EXCEPTION 'Initial request kind mismatch'; END IF;
 ELSE
  IF c.boundary_kind='ORG' AND NOT EXISTS(SELECT 1 FROM staff_core.suspension_request_details d WHERE d.request_revision_id=r.request_revision_id AND d.org_id=c.org_id AND d.suspension_kind<>'ACCOUNT_GLOBAL') THEN RAISE EXCEPTION 'Suspension org boundary mismatch'; END IF;
  IF r.request_kind IS DISTINCT FROM 'SUSPENSION' OR NOT EXISTS(
   SELECT 1 FROM staff_core.suspension_request_details d WHERE d.request_revision_id=r.request_revision_id AND d.control_scope_id=r.control_scope_id)
  THEN RAISE EXCEPTION 'Suspension request kind/scope mismatch'; END IF;
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER initial_workflow_72 AFTER INSERT ON staff_core.initial_auth_admissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.validate_workflow_effect_72();
CREATE CONSTRAINT TRIGGER stop_workflow_72 AFTER INSERT ON staff_core.access_suspensions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.validate_workflow_effect_72();
CREATE CONSTRAINT TRIGGER release_workflow_72 AFTER INSERT ON staff_core.suspension_releases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.validate_workflow_effect_72();
REVOKE ALL ON FUNCTION staff_core.validate_workflow_effect_72() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
