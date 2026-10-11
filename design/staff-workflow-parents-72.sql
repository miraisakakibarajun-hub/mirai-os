-- WORKFLOW-PARENTS-72 / REVIEW DRAFT / not deployed.
-- Requires parent-base68 (actors, organizations) and reviewed control_scopes.
-- Create BEFORE history65, evidence66 and initial-admission70. No authorization grant.
BEGIN;
CREATE TABLE staff_core.operation_requests (
 operation_id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 state text NOT NULL CHECK(state IN ('ACCEPTED','RUNNING','SUCCEEDED','FAILED','RECONCILE_REQUIRED')),
 operation_kind text NOT NULL CHECK(length(btrim(operation_kind))>0),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 1 AND 128),
 request_fingerprint text NOT NULL CHECK(request_fingerprint ~ '^[a-f0-9]{64}$'),
 lock_version bigint NOT NULL CHECK(lock_version>0),
 created_at timestamptz NOT NULL,recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),
 boundary_kind text NOT NULL CHECK(boundary_kind IN ('ORG','CONTROL')),
 org_id uuid REFERENCES staff_core.organizations(org_id),control_scope_id uuid REFERENCES staff_core.control_scopes(control_scope_id),
 CHECK((boundary_kind='ORG' AND org_id IS NOT NULL AND control_scope_id IS NULL) OR(boundary_kind='CONTROL' AND control_scope_id IS NOT NULL AND org_id IS NULL)),
 UNIQUE(operation_id,actor_id)
);
CREATE UNIQUE INDEX operation_org_key_72 ON staff_core.operation_requests(actor_id,org_id,operation_kind,idempotency_key) WHERE boundary_kind='ORG';
CREATE UNIQUE INDEX operation_control_key_72 ON staff_core.operation_requests(actor_id,control_scope_id,operation_kind,idempotency_key) WHERE boundary_kind='CONTROL';
CREATE TABLE staff_core.change_requests (
 request_id uuid PRIMARY KEY,current_revision_id uuid NOT NULL,
 request_state text NOT NULL CHECK(request_state IN ('DRAFT','SUBMITTED','DECIDED','CANCELLED')),
 lock_version bigint NOT NULL CHECK(lock_version>0),
 created_at timestamptz NOT NULL,created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 boundary_kind text NOT NULL CHECK(boundary_kind IN ('ORG','CONTROL')),
 org_id uuid REFERENCES staff_core.organizations(org_id),control_scope_id uuid REFERENCES staff_core.control_scopes(control_scope_id),
 CHECK((boundary_kind='ORG' AND org_id IS NOT NULL AND control_scope_id IS NULL) OR(boundary_kind='CONTROL' AND control_scope_id IS NOT NULL AND org_id IS NULL))
);
CREATE TABLE staff_core.request_revisions (
 request_id uuid NOT NULL REFERENCES staff_core.change_requests(request_id),request_revision_id uuid PRIMARY KEY,
 revision_no bigint NOT NULL CHECK(revision_no>0),
 request_kind text NOT NULL CHECK(length(btrim(request_kind))>0),
 control_scope_id uuid NOT NULL REFERENCES staff_core.control_scopes(control_scope_id),
 submitted_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 recorded_at timestamptz NOT NULL,evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),
 UNIQUE(request_id,revision_no),UNIQUE(request_id,request_revision_id)
);
ALTER TABLE staff_core.change_requests ADD FOREIGN KEY(request_id,current_revision_id)
 REFERENCES staff_core.request_revisions(request_id,request_revision_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE staff_core.decision_records (
 decision_id uuid PRIMARY KEY,request_id uuid NOT NULL,request_revision_id uuid NOT NULL,
 decision_result text NOT NULL CHECK(decision_result IN ('APPROVED','REJECTED','DEFERRED')),
 policy_version text NOT NULL CHECK(length(btrim(policy_version))>0),
 decision_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),decided_at timestamptz NOT NULL,
 authority_evidence_ref text NOT NULL CHECK(length(btrim(authority_evidence_ref))>0),
 FOREIGN KEY(request_id,request_revision_id) REFERENCES staff_core.request_revisions(request_id,request_revision_id),
 UNIQUE(request_id,request_revision_id,decision_id),UNIQUE(request_revision_id,decision_id)
);
CREATE TABLE staff_core.impact_checks (
 impact_check_id uuid PRIMARY KEY,request_revision_id uuid NOT NULL REFERENCES staff_core.request_revisions(request_revision_id),
 check_status text NOT NULL CHECK(check_status IN ('CONFIRMED','UNVERIFIED','BLOCKED')),
 checked_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),checked_at timestamptz NOT NULL,
 checker_version text NOT NULL CHECK(length(btrim(checker_version))>0),
 evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),
 UNIQUE(request_revision_id,impact_check_id)
);
CREATE TABLE staff_core.applications (
 application_id uuid PRIMARY KEY,request_revision_id uuid NOT NULL UNIQUE REFERENCES staff_core.request_revisions(request_revision_id),
 decision_id uuid NOT NULL,impact_check_id uuid NOT NULL,
 application_status text NOT NULL CHECK(application_status IN ('READY','RUNNING','SUCCEEDED','FAILED','BLOCKED','CANCELLED','RECONCILE_REQUIRED')),
 active_attempt_id uuid,
 lock_version bigint NOT NULL CHECK(lock_version>0),scheduled_at timestamptz,
 created_at timestamptz NOT NULL,recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),
 FOREIGN KEY(request_revision_id,decision_id) REFERENCES staff_core.decision_records(request_revision_id,decision_id),
 FOREIGN KEY(request_revision_id,impact_check_id) REFERENCES staff_core.impact_checks(request_revision_id,impact_check_id),
 UNIQUE(application_id,request_revision_id,decision_id)
);
CREATE TABLE staff_core.application_attempts (
 attempt_id uuid PRIMARY KEY,application_id uuid NOT NULL REFERENCES staff_core.applications(application_id),
 operation_id uuid NOT NULL,actor_id uuid NOT NULL,
 result text NOT NULL CHECK(result IN ('RUNNING','SUCCEEDED','FAILED','LEASE_LOST','RECONCILE_REQUIRED')),
 started_at timestamptz NOT NULL,confirmed_at timestamptz,lease_until timestamptz NOT NULL,
 lease_token_hash text NOT NULL CHECK(lease_token_hash ~ '^[a-f0-9]{64}$'),
 attempt_no bigint NOT NULL CHECK(attempt_no>0),lock_version bigint NOT NULL CHECK(lock_version>0),
 evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),
 FOREIGN KEY(operation_id,actor_id) REFERENCES staff_core.operation_requests(operation_id,actor_id),
 CHECK(started_at<lease_until),
 CHECK((result='SUCCEEDED' AND confirmed_at IS NOT NULL AND started_at<=confirmed_at AND confirmed_at<lease_until)
 OR(result<>'SUCCEEDED' AND confirmed_at IS NULL)),
 UNIQUE(application_id,attempt_no),UNIQUE(application_id,attempt_id),UNIQUE(application_id,attempt_id,operation_id),UNIQUE(operation_id)
);
ALTER TABLE staff_core.applications ADD FOREIGN KEY(application_id,active_attempt_id)
 REFERENCES staff_core.application_attempts(application_id,attempt_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION staff_core.workflow_append_only_72() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Workflow evidence append only'; END $$;
CREATE TRIGGER request_revision_append_72 BEFORE UPDATE OR DELETE ON staff_core.request_revisions FOR EACH ROW EXECUTE FUNCTION staff_core.workflow_append_only_72();
CREATE TRIGGER decision_append_72 BEFORE UPDATE OR DELETE ON staff_core.decision_records FOR EACH ROW EXECUTE FUNCTION staff_core.workflow_append_only_72();
CREATE TRIGGER impact_append_72 BEFORE UPDATE OR DELETE ON staff_core.impact_checks FOR EACH ROW EXECUTE FUNCTION staff_core.workflow_append_only_72();
CREATE FUNCTION staff_core.guard_workflow_72() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Workflow history deletion denied'; END IF;
 IF NEW.lock_version<>OLD.lock_version+1 THEN RAISE EXCEPTION 'Workflow version conflict'; END IF;
 IF TG_TABLE_NAME='operation_requests' THEN
  IF ROW(NEW.operation_id,NEW.actor_id,NEW.operation_kind,NEW.idempotency_key,NEW.request_fingerprint,NEW.created_at,NEW.boundary_kind,NEW.org_id,NEW.control_scope_id)
  IS DISTINCT FROM ROW(OLD.operation_id,OLD.actor_id,OLD.operation_kind,OLD.idempotency_key,OLD.request_fingerprint,OLD.created_at,OLD.boundary_kind,OLD.org_id,OLD.control_scope_id)
  THEN RAISE EXCEPTION 'Operation identity immutable'; END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT(OLD.state='ACCEPTED' AND NEW.state IN ('RUNNING','FAILED','RECONCILE_REQUIRED')
   OR OLD.state='RUNNING' AND NEW.state IN ('SUCCEEDED','FAILED','RECONCILE_REQUIRED')) THEN RAISE EXCEPTION 'Operation transition denied'; END IF;
  IF OLD.state IN ('SUCCEEDED','FAILED','RECONCILE_REQUIRED') THEN RAISE EXCEPTION 'Terminal operation immutable'; END IF;
 ELSIF TG_TABLE_NAME='change_requests' THEN
  IF ROW(NEW.request_id,NEW.created_at,NEW.created_actor_id,NEW.boundary_kind,NEW.org_id,NEW.control_scope_id) IS DISTINCT FROM ROW(OLD.request_id,OLD.created_at,OLD.created_actor_id,OLD.boundary_kind,OLD.org_id,OLD.control_scope_id)
  THEN RAISE EXCEPTION 'Request identity immutable'; END IF;
  IF NEW.request_state IS DISTINCT FROM OLD.request_state AND NOT(
   OLD.request_state='DRAFT' AND NEW.request_state IN ('SUBMITTED','CANCELLED')
   OR OLD.request_state='SUBMITTED' AND NEW.request_state IN ('DECIDED','CANCELLED')
   OR OLD.request_state='DECIDED' AND NEW.request_state IN ('SUBMITTED','CANCELLED')) THEN RAISE EXCEPTION 'Request transition denied'; END IF;
  IF OLD.request_state='CANCELLED' THEN RAISE EXCEPTION 'Cancelled request immutable'; END IF;
  IF NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id AND NOT EXISTS(
    SELECT 1 FROM staff_core.request_revisions n JOIN staff_core.request_revisions o ON o.request_revision_id=OLD.current_revision_id
    WHERE n.request_revision_id=NEW.current_revision_id AND n.request_id=OLD.request_id AND n.revision_no>o.revision_no)
  THEN RAISE EXCEPTION 'Request revision must advance'; END IF;
 ELSIF TG_TABLE_NAME='applications' THEN
  IF ROW(NEW.application_id,NEW.request_revision_id,NEW.decision_id,NEW.impact_check_id,NEW.created_at)
  IS DISTINCT FROM ROW(OLD.application_id,OLD.request_revision_id,OLD.decision_id,OLD.impact_check_id,OLD.created_at)
  THEN RAISE EXCEPTION 'Application identity immutable'; END IF;
  IF OLD.application_status IN ('SUCCEEDED','CANCELLED') THEN RAISE EXCEPTION 'Terminal application immutable'; END IF;
  IF NEW.application_status IS DISTINCT FROM OLD.application_status AND NOT(
   OLD.application_status IN ('READY','FAILED','BLOCKED') AND NEW.application_status IN ('RUNNING','CANCELLED','BLOCKED')
   OR OLD.application_status='RUNNING' AND NEW.application_status IN ('SUCCEEDED','FAILED','BLOCKED','RECONCILE_REQUIRED')
   OR OLD.application_status='RECONCILE_REQUIRED' AND NEW.application_status IN ('FAILED','BLOCKED'))
  THEN RAISE EXCEPTION 'Application transition denied'; END IF;
 ELSIF TG_TABLE_NAME='application_attempts' THEN
  IF ROW(NEW.attempt_id,NEW.application_id,NEW.operation_id,NEW.actor_id,NEW.started_at,NEW.lease_until,NEW.lease_token_hash,NEW.attempt_no)
  IS DISTINCT FROM ROW(OLD.attempt_id,OLD.application_id,OLD.operation_id,OLD.actor_id,OLD.started_at,OLD.lease_until,OLD.lease_token_hash,OLD.attempt_no)
  THEN RAISE EXCEPTION 'Attempt identity/lease immutable'; END IF;
  IF OLD.result<>'RUNNING' THEN RAISE EXCEPTION 'Terminal attempt immutable'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER operation_guard_72 BEFORE UPDATE OR DELETE ON staff_core.operation_requests FOR EACH ROW EXECUTE FUNCTION staff_core.guard_workflow_72();
CREATE TRIGGER request_guard_72 BEFORE UPDATE OR DELETE ON staff_core.change_requests FOR EACH ROW EXECUTE FUNCTION staff_core.guard_workflow_72();
CREATE TRIGGER application_guard_72 BEFORE UPDATE OR DELETE ON staff_core.applications FOR EACH ROW EXECUTE FUNCTION staff_core.guard_workflow_72();
CREATE TRIGGER attempt_guard_72 BEFORE UPDATE OR DELETE ON staff_core.application_attempts FOR EACH ROW EXECUTE FUNCTION staff_core.guard_workflow_72();
CREATE FUNCTION staff_core.require_application_consistency_72() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a staff_core.applications;
BEGIN
 SELECT * INTO a FROM staff_core.applications WHERE application_id=NEW.application_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Application unavailable'; END IF;
 IF a.application_status IN ('RUNNING','SUCCEEDED') AND a.active_attempt_id IS NULL THEN RAISE EXCEPTION 'Current attempt required'; END IF;
 IF a.application_status='RUNNING' AND NOT EXISTS(SELECT 1 FROM staff_core.application_attempts t JOIN staff_core.operation_requests o USING(operation_id) WHERE t.application_id=a.application_id AND t.attempt_id=a.active_attempt_id AND t.result='RUNNING' AND o.state='RUNNING') THEN RAISE EXCEPTION 'Running application requires current running attempt/operation'; END IF;
 IF a.application_status='SUCCEEDED' AND NOT EXISTS(
 SELECT 1 FROM staff_core.application_attempts t JOIN staff_core.operation_requests o ON o.operation_id=t.operation_id AND o.actor_id=t.actor_id
 JOIN staff_core.decision_records d ON d.decision_id=a.decision_id AND d.request_revision_id=a.request_revision_id
 JOIN staff_core.impact_checks i ON i.impact_check_id=a.impact_check_id AND i.request_revision_id=a.request_revision_id
 WHERE t.application_id=a.application_id AND t.attempt_id=a.active_attempt_id AND t.result='SUCCEEDED' AND o.state='SUCCEEDED'
 AND d.decision_result='APPROVED' AND i.check_status='CONFIRMED'
 AND EXISTS(SELECT 1 FROM staff_core.request_revisions rv JOIN staff_core.change_requests c USING(request_id) WHERE rv.request_revision_id=a.request_revision_id AND c.current_revision_id=rv.request_revision_id AND c.request_state='DECIDED')) THEN RAISE EXCEPTION 'Successful application evidence inconsistent'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER application_consistency_72 AFTER INSERT OR UPDATE ON staff_core.applications DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.require_application_consistency_72();
CREATE CONSTRAINT TRIGGER attempt_consistency_72 AFTER INSERT OR UPDATE ON staff_core.application_attempts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.require_application_consistency_72();
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['operation_requests','change_requests','request_revisions','decision_records','impact_checks','applications','application_attempts'] LOOP
 EXECUTE format('ALTER TABLE staff_core.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE staff_core.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON staff_core.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION staff_core.workflow_append_only_72(),staff_core.guard_workflow_72(),staff_core.require_application_consistency_72() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
