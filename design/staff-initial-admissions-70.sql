-- INITIAL-ADMISSION-70 / REVIEW DRAFT / never applied.
-- Requires 65,68,66. Approval authority and fenced apply remain prerequisites.
BEGIN;
CREATE TABLE staff_core.initial_auth_request_details (
 request_id uuid NOT NULL, request_revision_id uuid PRIMARY KEY,
 account_id uuid NOT NULL, person_id uuid NOT NULL,
 issuer text NOT NULL CHECK(length(btrim(issuer))>0),
 org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),
 credential_state text NOT NULL CHECK(credential_state='INITIAL_CHANGE_REQUIRED'),
 auth_epoch bigint NOT NULL CHECK(auth_epoch BETWEEN 1 AND 9007199254740991),
 valid_from timestamptz NOT NULL, valid_to timestamptz NOT NULL CHECK(valid_from<valid_to),
 FOREIGN KEY(request_id,request_revision_id) REFERENCES staff_core.request_revisions(request_id,request_revision_id),
 FOREIGN KEY(account_id,person_id) REFERENCES staff_core.account_links(account_id,person_id)
);
CREATE TABLE staff_core.initial_auth_admissions (
 admission_id uuid PRIMARY KEY,
 request_id uuid NOT NULL, request_revision_id uuid NOT NULL UNIQUE,
 decision_id uuid NOT NULL, application_id uuid NOT NULL UNIQUE,
 attempt_id uuid NOT NULL, operation_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 recorded_at timestamptz NOT NULL,
 FOREIGN KEY(request_revision_id) REFERENCES staff_core.initial_auth_request_details(request_revision_id),
 FOREIGN KEY(request_id,request_revision_id,decision_id) REFERENCES staff_core.decision_records(request_id,request_revision_id,decision_id),
 FOREIGN KEY(application_id,request_revision_id,decision_id) REFERENCES staff_core.applications(application_id,request_revision_id,decision_id),
 FOREIGN KEY(application_id,attempt_id,operation_id) REFERENCES staff_core.application_attempts(application_id,attempt_id,operation_id)
);
CREATE FUNCTION staff_core.guard_typed_auth_request_70() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 -- One request revision cannot mean both suspension and initial admission.
 PERFORM 1 FROM staff_core.request_revisions WHERE request_revision_id=NEW.request_revision_id FOR UPDATE;
 IF TG_TABLE_NAME='initial_auth_request_details' THEN
  IF EXISTS(SELECT 1 FROM staff_core.suspension_request_details WHERE request_revision_id=NEW.request_revision_id)
  THEN RAISE EXCEPTION 'Typed request family conflict'; END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM staff_core.initial_auth_request_details WHERE request_revision_id=NEW.request_revision_id)
  THEN RAISE EXCEPTION 'Typed request family conflict'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER typed_initial_70 BEFORE INSERT ON staff_core.initial_auth_request_details
 FOR EACH ROW EXECUTE FUNCTION staff_core.guard_typed_auth_request_70();
CREATE TRIGGER typed_suspension_70 BEFORE INSERT ON staff_core.suspension_request_details
 FOR EACH ROW EXECUTE FUNCTION staff_core.guard_typed_auth_request_70();
CREATE TRIGGER initial_detail_append_70 BEFORE UPDATE OR DELETE ON staff_core.initial_auth_request_details
 FOR EACH ROW EXECUTE FUNCTION staff_core.effect_append_only_66();
CREATE TRIGGER initial_admission_append_70 BEFORE UPDATE OR DELETE ON staff_core.initial_auth_admissions
 FOR EACH ROW EXECUTE FUNCTION staff_core.effect_append_only_66();
CREATE FUNCTION staff_core.validate_initial_admission_70() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE detail staff_core.initial_auth_request_details; a staff_core.account_links; c staff_core.account_auth_controls;
BEGIN
 PERFORM 1 FROM staff_core.change_requests WHERE request_id=NEW.request_id FOR SHARE;
 PERFORM 1 FROM staff_core.applications WHERE application_id=NEW.application_id FOR SHARE;
 PERFORM 1 FROM staff_core.application_attempts WHERE attempt_id=NEW.attempt_id FOR SHARE;
 PERFORM 1 FROM staff_core.operation_requests WHERE operation_id=NEW.operation_id FOR SHARE;
 PERFORM 1 FROM staff_core.impact_checks WHERE impact_check_id=(SELECT impact_check_id FROM staff_core.applications WHERE application_id=NEW.application_id) FOR SHARE;
 SELECT * INTO detail FROM staff_core.initial_auth_request_details WHERE request_revision_id=NEW.request_revision_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Typed initial request unavailable'; END IF;
 SELECT * INTO a FROM staff_core.account_links WHERE account_id=detail.account_id FOR SHARE;
 IF NOT FOUND OR ROW(a.person_id,a.issuer) IS DISTINCT FROM ROW(detail.person_id,detail.issuer)
 THEN RAISE EXCEPTION 'Initial identity mismatch'; END IF;
 SELECT * INTO c FROM staff_core.account_auth_controls WHERE account_id=detail.account_id FOR SHARE;
 IF NOT FOUND OR ROW(c.auth_epoch,c.credential_state,c.provisioning_state)
 IS DISTINCT FROM ROW(detail.auth_epoch,detail.credential_state,'LINKED'::text)
 OR detail.valid_to<=NEW.recorded_at THEN RAISE EXCEPTION 'Initial control/expiry mismatch'; END IF;
 IF NOT staff_core.effect_evidence_valid_66(NEW.request_id,NEW.request_revision_id,NEW.decision_id,NEW.application_id,NEW.attempt_id,NEW.operation_id,NEW.actor_id,NEW.recorded_at)
 THEN RAISE EXCEPTION 'Successful current-version initial evidence required'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER initial_evidence_70 AFTER INSERT ON staff_core.initial_auth_admissions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.validate_initial_admission_70();
CREATE FUNCTION staff_core.guard_initial_source_70() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE used boolean:=false;
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'applications' THEN SELECT EXISTS(SELECT 1 FROM staff_core.initial_auth_admissions WHERE application_id=OLD.application_id) INTO used;
 WHEN 'application_attempts' THEN SELECT EXISTS(SELECT 1 FROM staff_core.initial_auth_admissions WHERE attempt_id=OLD.attempt_id) INTO used;
 WHEN 'operation_requests' THEN SELECT EXISTS(SELECT 1 FROM staff_core.initial_auth_admissions WHERE operation_id=OLD.operation_id) INTO used;
 WHEN 'impact_checks' THEN SELECT EXISTS(SELECT 1 FROM staff_core.initial_auth_admissions g JOIN staff_core.applications a USING(application_id) WHERE a.impact_check_id=OLD.impact_check_id) INTO used;
 END CASE;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME='applications' THEN IF OLD.application_status IS DISTINCT FROM 'SUCCEEDED' THEN used:=false; END IF;
  ELSIF TG_TABLE_NAME='application_attempts' THEN IF OLD.result IS DISTINCT FROM 'SUCCEEDED' THEN used:=false; END IF;
  ELSIF TG_TABLE_NAME='operation_requests' THEN IF OLD.state IS DISTINCT FROM 'SUCCEEDED' THEN used:=false; END IF;
  END IF;
 END IF;
 IF used THEN RAISE EXCEPTION 'Used initial evidence immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER initial_application_source_70 BEFORE UPDATE OR DELETE ON staff_core.applications FOR EACH ROW EXECUTE FUNCTION staff_core.guard_initial_source_70();
CREATE TRIGGER initial_attempt_source_70 BEFORE UPDATE OR DELETE ON staff_core.application_attempts FOR EACH ROW EXECUTE FUNCTION staff_core.guard_initial_source_70();
CREATE TRIGGER initial_operation_source_70 BEFORE UPDATE OR DELETE ON staff_core.operation_requests FOR EACH ROW EXECUTE FUNCTION staff_core.guard_initial_source_70();
CREATE TRIGGER initial_impact_source_70 BEFORE UPDATE OR DELETE ON staff_core.impact_checks FOR EACH ROW EXECUTE FUNCTION staff_core.guard_initial_source_70();
ALTER TABLE staff_core.initial_auth_request_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.initial_auth_request_details FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_core.initial_auth_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.initial_auth_admissions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.initial_auth_request_details,staff_core.initial_auth_admissions FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION staff_core.guard_typed_auth_request_70(),staff_core.validate_initial_admission_70(),staff_core.guard_initial_source_70() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
