-- SUSPENSION-EVIDENCE-66. REVIEW DRAFT. Never applied to staging.
-- Prerequisite approval/attempt/impact tables must satisfy the documented
-- physical contract. This does not implement authorization or bootstrap.
BEGIN;
ALTER TABLE staff_core.request_revisions ADD UNIQUE(request_id,request_revision_id);
ALTER TABLE staff_core.decision_records ADD UNIQUE(request_id,request_revision_id,decision_id);
ALTER TABLE staff_core.applications ADD UNIQUE(application_id,request_revision_id,decision_id);
ALTER TABLE staff_core.application_attempts ADD UNIQUE(application_id,attempt_id,operation_id);
CREATE TABLE staff_core.suspension_request_details (
 request_id uuid NOT NULL, request_revision_id uuid PRIMARY KEY,
 action_kind text NOT NULL CHECK(action_kind IN ('STOP','RELEASE')),
 account_id uuid NOT NULL REFERENCES staff_core.account_links(account_id),
 control_scope_id uuid NOT NULL REFERENCES staff_core.control_scopes(control_scope_id),
 suspension_kind text NOT NULL CHECK(suspension_kind IN ('ACCOUNT_GLOBAL','ORG_ACCESS','OS_ACCESS')),
 org_id uuid REFERENCES staff_core.organizations(org_id), system_code text,
 target_suspension_id uuid, effective_from timestamptz, effective_to timestamptz, release_effective_at timestamptz,
 FOREIGN KEY(request_id,request_revision_id) REFERENCES staff_core.request_revisions(request_id,request_revision_id),
 CHECK((suspension_kind='ACCOUNT_GLOBAL' AND org_id IS NULL AND system_code IS NULL)
 OR(suspension_kind='ORG_ACCESS' AND org_id IS NOT NULL AND system_code IS NULL)
 OR(suspension_kind='OS_ACCESS' AND org_id IS NOT NULL AND system_code IS NOT NULL AND length(btrim(system_code))>0)),
 CHECK((action_kind='STOP' AND target_suspension_id IS NULL AND effective_from IS NOT NULL AND release_effective_at IS NULL
 AND (effective_to IS NULL OR effective_from<effective_to))
 OR(action_kind='RELEASE' AND target_suspension_id IS NOT NULL AND effective_from IS NULL AND effective_to IS NULL AND release_effective_at IS NOT NULL))
);
CREATE TABLE staff_core.access_suspensions (
 suspension_id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES staff_core.account_links(account_id),
 control_scope_id uuid NOT NULL REFERENCES staff_core.control_scopes(control_scope_id),
 suspension_kind text NOT NULL, org_id uuid REFERENCES staff_core.organizations(org_id), system_code text,
 effective_from timestamptz NOT NULL, effective_to timestamptz,
 request_id uuid NOT NULL, request_revision_id uuid NOT NULL UNIQUE, decision_id uuid NOT NULL,
 application_id uuid NOT NULL UNIQUE, attempt_id uuid NOT NULL, operation_id uuid NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason))>0), created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id), recorded_at timestamptz NOT NULL,
 FOREIGN KEY(request_revision_id) REFERENCES staff_core.suspension_request_details(request_revision_id),
 FOREIGN KEY(request_id,request_revision_id,decision_id) REFERENCES staff_core.decision_records(request_id,request_revision_id,decision_id),
 FOREIGN KEY(application_id,request_revision_id,decision_id) REFERENCES staff_core.applications(application_id,request_revision_id,decision_id),
 FOREIGN KEY(application_id,attempt_id,operation_id) REFERENCES staff_core.application_attempts(application_id,attempt_id,operation_id),
 CHECK(effective_to IS NULL OR effective_from<effective_to)
);
ALTER TABLE staff_core.suspension_request_details ADD FOREIGN KEY(target_suspension_id) REFERENCES staff_core.access_suspensions(suspension_id);
CREATE TABLE staff_core.suspension_releases (
 release_id uuid PRIMARY KEY, suspension_id uuid NOT NULL UNIQUE REFERENCES staff_core.access_suspensions(suspension_id),
 release_effective_at timestamptz NOT NULL, request_id uuid NOT NULL, request_revision_id uuid NOT NULL UNIQUE,
 decision_id uuid NOT NULL, application_id uuid NOT NULL UNIQUE, attempt_id uuid NOT NULL, operation_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id), reason text NOT NULL CHECK(length(btrim(reason))>0), recorded_at timestamptz NOT NULL,
 FOREIGN KEY(request_revision_id) REFERENCES staff_core.suspension_request_details(request_revision_id),
 FOREIGN KEY(request_id,request_revision_id,decision_id) REFERENCES staff_core.decision_records(request_id,request_revision_id,decision_id),
 FOREIGN KEY(application_id,request_revision_id,decision_id) REFERENCES staff_core.applications(application_id,request_revision_id,decision_id),
 FOREIGN KEY(application_id,attempt_id,operation_id) REFERENCES staff_core.application_attempts(application_id,attempt_id,operation_id)
);
CREATE FUNCTION staff_core.effect_evidence_valid_66(p_request uuid,p_revision uuid,p_decision uuid,p_application uuid,p_attempt uuid,p_operation uuid,p_actor uuid,p_at timestamptz) RETURNS boolean
LANGUAGE sql SET search_path='' AS $$
 SELECT EXISTS(
 SELECT 1 FROM staff_core.request_revisions r
 JOIN staff_core.change_requests c ON c.request_id=r.request_id AND c.current_revision_id=r.request_revision_id
 JOIN staff_core.decision_records d ON d.request_id=r.request_id AND d.request_revision_id=r.request_revision_id AND d.decision_id=p_decision
 JOIN staff_core.applications a ON a.application_id=p_application AND a.request_revision_id=r.request_revision_id AND a.decision_id=d.decision_id
 JOIN staff_core.impact_checks i ON i.impact_check_id=a.impact_check_id AND i.request_revision_id=r.request_revision_id
 JOIN staff_core.application_attempts t ON t.application_id=a.application_id AND t.attempt_id=p_attempt AND t.attempt_id=a.active_attempt_id AND t.operation_id=p_operation
 JOIN staff_core.operation_requests o ON o.operation_id=t.operation_id AND o.actor_id=t.actor_id
 WHERE r.request_id=p_request AND r.request_revision_id=p_revision
 AND d.decision_result='APPROVED' AND length(btrim(d.policy_version))>0
 AND i.check_status='CONFIRMED' AND a.application_status='SUCCEEDED' AND t.result='SUCCEEDED'
 AND t.actor_id=p_actor AND o.state='SUCCEEDED' AND t.confirmed_at=p_at
 -- Lease eligibility is measured at successful confirmation, NOT at later
 -- readers' wall clock. Old lease must not be accepted by the apply function.
 AND t.started_at<=t.confirmed_at AND t.confirmed_at<t.lease_until
 AND t.lease_token_hash ~ '^[a-f0-9]{64}$'
 )
$$;
CREATE FUNCTION staff_core.validate_effect_66() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE detail staff_core.suspension_request_details; stop staff_core.access_suspensions; actor uuid;
BEGIN
 -- Hold source rows through outer COMMIT; the application writer must follow
 -- the same request -> application -> attempt -> operation -> impact order.
 PERFORM 1 FROM staff_core.change_requests WHERE request_id=NEW.request_id FOR SHARE;
 PERFORM 1 FROM staff_core.applications WHERE application_id=NEW.application_id FOR SHARE;
 PERFORM 1 FROM staff_core.application_attempts WHERE attempt_id=NEW.attempt_id FOR SHARE;
 PERFORM 1 FROM staff_core.operation_requests WHERE operation_id=NEW.operation_id FOR SHARE;
 PERFORM 1 FROM staff_core.impact_checks WHERE impact_check_id=(SELECT impact_check_id FROM staff_core.applications WHERE application_id=NEW.application_id) FOR SHARE;
 SELECT * INTO detail FROM staff_core.suspension_request_details WHERE request_revision_id=NEW.request_revision_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Typed request unavailable'; END IF;
 IF TG_TABLE_NAME='access_suspensions' THEN
  actor:=NEW.created_actor_id;
  IF detail.action_kind IS DISTINCT FROM 'STOP' OR
  ROW(NEW.account_id,NEW.control_scope_id,NEW.suspension_kind,NEW.org_id,NEW.system_code,NEW.effective_from,NEW.effective_to)
  IS DISTINCT FROM ROW(detail.account_id,detail.control_scope_id,detail.suspension_kind,detail.org_id,detail.system_code,detail.effective_from,detail.effective_to)
  THEN RAISE EXCEPTION 'Stop target/version mismatch'; END IF;
 ELSE
  actor:=NEW.actor_id;
  SELECT * INTO stop FROM staff_core.access_suspensions WHERE suspension_id=NEW.suspension_id;
  IF NOT FOUND OR detail.action_kind IS DISTINCT FROM 'RELEASE' OR detail.target_suspension_id IS DISTINCT FROM NEW.suspension_id
  OR detail.release_effective_at IS DISTINCT FROM NEW.release_effective_at
  OR ROW(stop.account_id,stop.control_scope_id,stop.suspension_kind,stop.org_id,stop.system_code)
  IS DISTINCT FROM ROW(detail.account_id,detail.control_scope_id,detail.suspension_kind,detail.org_id,detail.system_code)
  OR NEW.release_effective_at<stop.effective_from THEN RAISE EXCEPTION 'Release target/version mismatch'; END IF;
 END IF;
 IF NOT staff_core.effect_evidence_valid_66(NEW.request_id,NEW.request_revision_id,NEW.decision_id,NEW.application_id,NEW.attempt_id,NEW.operation_id,actor,NEW.recorded_at)
 THEN RAISE EXCEPTION 'Successful current-version evidence required'; END IF;
 RETURN NULL;
END $$;
-- Commit-time check permits effect + final application/attempt/operation status
-- to be persisted atomically. Reader cannot see a half-committed release.
CREATE CONSTRAINT TRIGGER stop_evidence_66 AFTER INSERT ON staff_core.access_suspensions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.validate_effect_66();
CREATE CONSTRAINT TRIGGER release_evidence_66 AFTER INSERT ON staff_core.suspension_releases
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.validate_effect_66();
CREATE FUNCTION staff_core.effect_append_only_66() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Effect evidence append only'; END $$;
CREATE TRIGGER stop_append_66 BEFORE UPDATE OR DELETE ON staff_core.access_suspensions FOR EACH ROW EXECUTE FUNCTION staff_core.effect_append_only_66();
CREATE TRIGGER release_append_66 BEFORE UPDATE OR DELETE ON staff_core.suspension_releases FOR EACH ROW EXECUTE FUNCTION staff_core.effect_append_only_66();
CREATE TRIGGER detail_append_66 BEFORE UPDATE OR DELETE ON staff_core.suspension_request_details FOR EACH ROW EXECUTE FUNCTION staff_core.effect_append_only_66();
-- Protect already-used evidence against later mutation. Workflow request
-- current pointers may advance; immutable old effect evidence remains valid.
CREATE FUNCTION staff_core.guard_effect_source_66() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE used boolean:=false;
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'request_revisions' THEN used:=true;
 WHEN 'decision_records' THEN used:=true;
 WHEN 'applications' THEN
  SELECT EXISTS(SELECT 1 FROM staff_core.access_suspensions WHERE application_id=OLD.application_id)
  OR EXISTS(SELECT 1 FROM staff_core.suspension_releases WHERE application_id=OLD.application_id) INTO used;
 WHEN 'application_attempts' THEN
  SELECT EXISTS(SELECT 1 FROM staff_core.access_suspensions WHERE attempt_id=OLD.attempt_id)
  OR EXISTS(SELECT 1 FROM staff_core.suspension_releases WHERE attempt_id=OLD.attempt_id) INTO used;
 WHEN 'operation_requests' THEN
  SELECT EXISTS(SELECT 1 FROM staff_core.access_suspensions WHERE operation_id=OLD.operation_id)
  OR EXISTS(SELECT 1 FROM staff_core.suspension_releases WHERE operation_id=OLD.operation_id) INTO used;
 WHEN 'impact_checks' THEN
  SELECT EXISTS(SELECT 1 FROM staff_core.applications a WHERE a.impact_check_id=OLD.impact_check_id AND
   (EXISTS(SELECT 1 FROM staff_core.access_suspensions WHERE application_id=a.application_id)
   OR EXISTS(SELECT 1 FROM staff_core.suspension_releases WHERE application_id=a.application_id))) INTO used;
 END CASE;
 -- Permit finalization in the same transaction that inserted an effect;
 -- commit-time effect validation checks its final values. Once successful,
 -- these rows cannot be rewritten even in a later workflow transaction.
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='applications' THEN
   IF OLD.application_status IS DISTINCT FROM 'SUCCEEDED' THEN used:=false; END IF;
  ELSIF TG_TABLE_NAME='application_attempts' THEN
   IF OLD.result IS DISTINCT FROM 'SUCCEEDED' THEN used:=false; END IF;
  ELSIF TG_TABLE_NAME='operation_requests' THEN
   IF OLD.state IS DISTINCT FROM 'SUCCEEDED' THEN used:=false; END IF;
  END IF;
 END IF;
 IF used THEN RAISE EXCEPTION 'Used approval evidence immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER request_evidence_66 BEFORE UPDATE OR DELETE ON staff_core.request_revisions FOR EACH ROW EXECUTE FUNCTION staff_core.guard_effect_source_66();
CREATE TRIGGER decision_evidence_66 BEFORE UPDATE OR DELETE ON staff_core.decision_records FOR EACH ROW EXECUTE FUNCTION staff_core.guard_effect_source_66();
CREATE TRIGGER application_evidence_66 BEFORE UPDATE OR DELETE ON staff_core.applications FOR EACH ROW EXECUTE FUNCTION staff_core.guard_effect_source_66();
CREATE TRIGGER attempt_evidence_66 BEFORE UPDATE OR DELETE ON staff_core.application_attempts FOR EACH ROW EXECUTE FUNCTION staff_core.guard_effect_source_66();
CREATE TRIGGER operation_evidence_66 BEFORE UPDATE OR DELETE ON staff_core.operation_requests FOR EACH ROW EXECUTE FUNCTION staff_core.guard_effect_source_66();
CREATE TRIGGER impact_evidence_66 BEFORE UPDATE OR DELETE ON staff_core.impact_checks FOR EACH ROW EXECUTE FUNCTION staff_core.guard_effect_source_66();
-- Do not inner-join stops to mutable approval state in current projections:
-- a later workflow change must never silently remove an existing stop.
CREATE VIEW staff_core.stop_segments_66 WITH(security_invoker=true) AS
 SELECT suspension_id,account_id,suspension_kind,org_id,system_code,effective_from,effective_to FROM staff_core.access_suspensions;
CREATE VIEW staff_core.release_segments_66 WITH(security_invoker=true) AS
 SELECT suspension_id,release_effective_at FROM staff_core.suspension_releases;
ALTER TABLE staff_core.suspension_request_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.suspension_request_details FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_core.access_suspensions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.access_suspensions FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_core.suspension_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.suspension_releases FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.suspension_request_details,staff_core.access_suspensions,staff_core.suspension_releases,staff_core.stop_segments_66,staff_core.release_segments_66 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION staff_core.effect_evidence_valid_66(uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz),staff_core.validate_effect_66(),staff_core.effect_append_only_66(),staff_core.guard_effect_source_66() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
