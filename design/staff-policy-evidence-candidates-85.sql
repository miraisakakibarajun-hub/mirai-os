-- POLICY-EVIDENCE-CANDIDATES-85: fresh, unapplied candidate schema only.
-- Requires reviewed65/68/72/75. No real policy/authority/bootstrap is adopted.
-- Evidence candidates are ALWAYS unverified, never permission certificates.
BEGIN;
CREATE TABLE staff_core.policy_domains_85 (
 policy_id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),
 system_code text NOT NULL CHECK(length(btrim(system_code))>0 AND system_code=btrim(system_code) AND system_code<>'*'),
 resource_kind text NOT NULL CHECK(length(btrim(resource_kind))>0 AND resource_kind=btrim(resource_kind) AND resource_kind<>'*'),
 action_code text NOT NULL CHECK(length(btrim(action_code))>0 AND action_code=btrim(action_code) AND action_code<>'*'),
 current_revision_id uuid, lock_version bigint NOT NULL DEFAULT 1 CHECK(lock_version>0),
 created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),created_at timestamptz NOT NULL,
 UNIQUE(org_id,system_code,resource_kind,action_code),UNIQUE(policy_id,org_id)
);
CREATE TABLE staff_core.policy_revisions_85 (
 revision_id uuid PRIMARY KEY,policy_id uuid NOT NULL,org_id uuid NOT NULL,
 revision_no bigint NOT NULL CHECK(revision_no>0),previous_revision_id uuid,
 record_state text NOT NULL CHECK(record_state IN ('DRAFT','RECORDED','RETIRED')),
 valid_from timestamptz NOT NULL,valid_to timestamptz,CHECK(valid_to IS NULL OR valid_from<valid_to),
 source_ref text NOT NULL CHECK(length(btrim(source_ref))>0),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,
 sealed boolean NOT NULL DEFAULT false,
 UNIQUE(policy_id,revision_id),UNIQUE(policy_id,revision_no),UNIQUE(policy_id,revision_id,org_id),
 FOREIGN KEY(policy_id,org_id) REFERENCES staff_core.policy_domains_85(policy_id,org_id),
 FOREIGN KEY(policy_id,previous_revision_id) REFERENCES staff_core.policy_revisions_85(policy_id,revision_id),
 CHECK(previous_revision_id IS DISTINCT FROM revision_id)
);
ALTER TABLE staff_core.policy_domains_85 ADD FOREIGN KEY(policy_id,current_revision_id)
 REFERENCES staff_core.policy_revisions_85(policy_id,revision_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE staff_core.policy_conditions_85 (
 revision_id uuid NOT NULL REFERENCES staff_core.policy_revisions_85(revision_id),
 condition_code text NOT NULL CHECK(condition_code IN
 ('AUTHORITY_ROOT','APPROVER_RULE','SELF_OPERATION_RULE','PROXY_RULE','DEPENDENCY_RULE','SCOPE_RULE','REVIEW_RULE')),
 condition_state text NOT NULL CHECK(condition_state IN ('UNDECIDED','RECORDED')),
 undecided_reason text,rule_source_ref text,
 PRIMARY KEY(revision_id,condition_code),
 CHECK((condition_state='UNDECIDED' AND length(btrim(undecided_reason))>0 AND rule_source_ref IS NULL AND undecided_reason IS NOT NULL)
 OR(condition_state='RECORDED' AND length(btrim(rule_source_ref))>0 AND undecided_reason IS NULL AND rule_source_ref IS NOT NULL))
);
CREATE FUNCTION staff_core.policy_condition_guard_85() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Policy condition immutable';END IF;
 PERFORM 1 FROM staff_core.policy_revisions_85 WHERE revision_id=NEW.revision_id AND NOT sealed FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unsealed policy required';END IF;RETURN NEW;
END $$;
CREATE TRIGGER policy_condition_guard_85 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.policy_conditions_85 FOR EACH ROW EXECUTE FUNCTION staff_core.policy_condition_guard_85();
CREATE FUNCTION staff_core.policy_revision_guard_85() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Policy revision deletion denied';END IF;
 IF TG_OP='INSERT' THEN IF NEW.sealed THEN RAISE EXCEPTION 'Policy starts unsealed';END IF;RETURN NEW;END IF;
 IF OLD.sealed OR NOT NEW.sealed OR (to_jsonb(NEW)-'sealed') IS DISTINCT FROM (to_jsonb(OLD)-'sealed') THEN RAISE EXCEPTION 'Only policy sealing permitted';END IF;
 IF NEW.previous_revision_id IS NULL THEN
  IF NEW.revision_no<>1 THEN RAISE EXCEPTION 'Initial policy revision must be one';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM staff_core.policy_revisions_85 WHERE policy_id=NEW.policy_id AND revision_id=NEW.previous_revision_id AND sealed AND revision_no=NEW.revision_no-1) THEN RAISE EXCEPTION 'Sealed immediate predecessor required';END IF;
 END IF;
 IF (SELECT count(*) FROM staff_core.policy_conditions_85 WHERE revision_id=NEW.revision_id)<>7 THEN RAISE EXCEPTION 'All seven policy conditions required';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER policy_revision_guard_85 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.policy_revisions_85 FOR EACH ROW EXECUTE FUNCTION staff_core.policy_revision_guard_85();
CREATE FUNCTION staff_core.policy_identity_guard_85() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Policy domain deletion denied';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.current_revision_id IS NOT NULL OR NEW.lock_version<>1 THEN RAISE EXCEPTION 'Policy starts unadopted';END IF;RETURN NEW;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['current_revision_id','lock_version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['current_revision_id','lock_version'])
 OR NEW.lock_version<>OLD.lock_version+1 OR NEW.current_revision_id IS NULL OR NEW.current_revision_id IS NOT DISTINCT FROM OLD.current_revision_id
 THEN RAISE EXCEPTION 'Policy identity/version denied';END IF;
 IF NOT EXISTS(SELECT 1 FROM staff_core.policy_revisions_85 WHERE policy_id=NEW.policy_id AND revision_id=NEW.current_revision_id AND sealed AND previous_revision_id IS NOT DISTINCT FROM OLD.current_revision_id)
 THEN RAISE EXCEPTION 'Sealed policy successor required';END IF;RETURN NEW;
END $$;
CREATE TRIGGER policy_identity_guard_85 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.policy_domains_85 FOR EACH ROW EXECUTE FUNCTION staff_core.policy_identity_guard_85();
-- Read-only candidate status. Even all RECORDED conditions never grant access.
CREATE FUNCTION staff_core.policy_candidate_status_at_85(p_policy uuid,p_at timestamptz) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH current_candidate AS MATERIALIZED(
 SELECT r.* FROM staff_core.policy_domains_85 p JOIN staff_core.policy_revisions_85 r
 ON r.policy_id=p.policy_id AND r.revision_id=p.current_revision_id
 WHERE p.policy_id=p_policy AND r.sealed AND r.record_state='RECORDED'
 AND r.valid_from<=p_at AND (r.valid_to IS NULL OR p_at<r.valid_to)
 ),conditions AS MATERIALIZED(
 SELECT c.* FROM staff_core.policy_conditions_85 c JOIN current_candidate r ON r.revision_id=c.revision_id
 )
 SELECT jsonb_build_object('policy_id',p_policy,'revision_id',(SELECT revision_id FROM current_candidate),
 'evaluated_at',p_at,'condition_count',(SELECT count(*) FROM conditions),
 'undecided_conditions',coalesce((SELECT jsonb_agg(jsonb_build_object('code',condition_code,'reason',undecided_reason) ORDER BY condition_code) FROM conditions WHERE condition_state='UNDECIDED'),'[]'::jsonb),
 'status',CASE WHEN NOT EXISTS(SELECT 1 FROM current_candidate) THEN 'POLICY_NOT_CURRENT'
 WHEN (SELECT count(*) FROM conditions)<>7 OR EXISTS(SELECT 1 FROM conditions WHERE condition_state='UNDECIDED') THEN 'POLICY_UNDECIDED'
 ELSE 'EVIDENCE_UNVERIFIED' END,'authorization_verified',false)
$$;
CREATE FUNCTION staff_core.policy_candidate_status_85(p_policy uuid) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$
 SELECT staff_core.policy_candidate_status_at_85(p_policy,clock_timestamp())
$$;
CREATE TABLE staff_core.authorization_evidence_candidates_85 (
 evidence_id uuid PRIMARY KEY,phase text NOT NULL CHECK(phase IN ('DECISION','APPLY')),
 org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),person_id uuid NOT NULL,
 account_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 request_revision_id uuid NOT NULL,decision_id uuid NOT NULL,
 policy_id uuid NOT NULL,policy_revision_id uuid NOT NULL,
 evaluated_at timestamptz NOT NULL,reason_code text NOT NULL CHECK(reason_code IN ('POLICY_UNDECIDED','CONTEXT_UNVERIFIED','CURRENT_STATE_UNVERIFIED')),
 evidence_state text NOT NULL DEFAULT 'EVIDENCE_UNVERIFIED' CHECK(evidence_state='EVIDENCE_UNVERIFIED'),
 authorization_verified boolean NOT NULL DEFAULT false CHECK(authorization_verified=false),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,
 sealed boolean NOT NULL DEFAULT false,
 FOREIGN KEY(account_id,person_id) REFERENCES staff_core.account_links(account_id,person_id),
 FOREIGN KEY(request_revision_id,decision_id) REFERENCES staff_core.decision_records(request_revision_id,decision_id),
 FOREIGN KEY(policy_id,policy_revision_id,org_id) REFERENCES staff_core.policy_revisions_85(policy_id,revision_id,org_id),
 UNIQUE(evidence_id,phase),UNIQUE(evidence_id,request_revision_id,decision_id,org_id,person_id,account_id)
);
CREATE TABLE staff_core.authorization_apply_contexts_85 (
 evidence_id uuid PRIMARY KEY,phase text NOT NULL DEFAULT 'APPLY' CHECK(phase='APPLY'),
 request_revision_id uuid NOT NULL,decision_id uuid NOT NULL,org_id uuid NOT NULL,person_id uuid NOT NULL,account_id uuid NOT NULL,
 decision_evidence_id uuid NOT NULL,application_id uuid NOT NULL,attempt_id uuid NOT NULL,operation_id uuid NOT NULL,
 FOREIGN KEY(evidence_id,phase) REFERENCES staff_core.authorization_evidence_candidates_85(evidence_id,phase),
 FOREIGN KEY(evidence_id,request_revision_id,decision_id,org_id,person_id,account_id) REFERENCES staff_core.authorization_evidence_candidates_85(evidence_id,request_revision_id,decision_id,org_id,person_id,account_id),
 FOREIGN KEY(decision_evidence_id,request_revision_id,decision_id,org_id,person_id,account_id) REFERENCES staff_core.authorization_evidence_candidates_85(evidence_id,request_revision_id,decision_id,org_id,person_id,account_id),
 FOREIGN KEY(application_id,request_revision_id,decision_id) REFERENCES staff_core.applications(application_id,request_revision_id,decision_id),
 FOREIGN KEY(application_id,attempt_id,operation_id) REFERENCES staff_core.application_attempts(application_id,attempt_id,operation_id),
 CHECK(evidence_id<>decision_evidence_id)
);
CREATE FUNCTION staff_core.evidence_apply_child_guard_85() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Apply context immutable';END IF;
 PERFORM 1 FROM staff_core.authorization_evidence_candidates_85 WHERE evidence_id=NEW.evidence_id AND phase='APPLY' AND NOT sealed FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unsealed apply evidence required';END IF;
 PERFORM 1 FROM staff_core.authorization_evidence_candidates_85 WHERE evidence_id=NEW.decision_evidence_id AND phase='DECISION' AND sealed;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sealed decision evidence required';END IF;RETURN NEW;
END $$;
CREATE TRIGGER evidence_apply_child_guard_85 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.authorization_apply_contexts_85 FOR EACH ROW EXECUTE FUNCTION staff_core.evidence_apply_child_guard_85();
CREATE FUNCTION staff_core.evidence_candidate_guard_85() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Evidence candidate deletion denied';END IF;
 IF TG_OP='INSERT' THEN IF NEW.sealed THEN RAISE EXCEPTION 'Evidence starts unsealed';END IF;RETURN NEW;END IF;
 IF OLD.sealed OR NOT NEW.sealed OR (to_jsonb(NEW)-'sealed') IS DISTINCT FROM (to_jsonb(OLD)-'sealed') THEN RAISE EXCEPTION 'Only evidence sealing permitted';END IF;
 IF NOT EXISTS(SELECT 1 FROM staff_core.policy_revisions_85 WHERE revision_id=NEW.policy_revision_id AND sealed) THEN RAISE EXCEPTION 'Sealed policy reference required';END IF;
 IF NEW.phase='DECISION' THEN
  IF NOT EXISTS(SELECT 1 FROM staff_core.decision_records WHERE decision_id=NEW.decision_id AND decision_actor_id=NEW.actor_id) THEN RAISE EXCEPTION 'Decision actor context mismatch';END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM staff_core.authorization_apply_contexts_85 c JOIN staff_core.application_attempts a
  ON a.application_id=c.application_id AND a.attempt_id=c.attempt_id AND a.operation_id=c.operation_id
  JOIN staff_core.operation_requests o ON o.operation_id=a.operation_id
  WHERE c.evidence_id=NEW.evidence_id AND a.actor_id=NEW.actor_id AND o.actor_id=NEW.actor_id) THEN RAISE EXCEPTION 'Apply actor/context mismatch';END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER evidence_candidate_guard_85 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.authorization_evidence_candidates_85 FOR EACH ROW EXECUTE FUNCTION staff_core.evidence_candidate_guard_85();
CREATE INDEX policy_revision_org_85 ON staff_core.policy_revisions_85(org_id,policy_id);
CREATE INDEX policy_domain_actor_85 ON staff_core.policy_domains_85(created_actor_id);
CREATE INDEX policy_revision_actor_85 ON staff_core.policy_revisions_85(recorded_actor_id);
CREATE INDEX evidence_decision_85 ON staff_core.authorization_evidence_candidates_85(request_revision_id,decision_id);
CREATE INDEX evidence_policy_85 ON staff_core.authorization_evidence_candidates_85(policy_id,policy_revision_id,org_id);
CREATE INDEX evidence_account_85 ON staff_core.authorization_evidence_candidates_85(account_id,person_id);
CREATE INDEX evidence_actor_85 ON staff_core.authorization_evidence_candidates_85(actor_id);
CREATE INDEX evidence_recorded_actor_85 ON staff_core.authorization_evidence_candidates_85(recorded_actor_id);
CREATE INDEX evidence_org_85 ON staff_core.authorization_evidence_candidates_85(org_id);
CREATE INDEX apply_decision_evidence_85 ON staff_core.authorization_apply_contexts_85(decision_evidence_id);
CREATE INDEX apply_application_85 ON staff_core.authorization_apply_contexts_85(application_id,attempt_id,operation_id);
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['policy_domains_85','policy_revisions_85','policy_conditions_85','authorization_evidence_candidates_85','authorization_apply_contexts_85'] LOOP
 EXECUTE format('ALTER TABLE staff_core.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE staff_core.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON staff_core.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION staff_core.policy_condition_guard_85(),staff_core.policy_revision_guard_85(),staff_core.policy_identity_guard_85(),
 staff_core.policy_candidate_status_at_85(uuid,timestamptz),staff_core.policy_candidate_status_85(uuid),
 staff_core.evidence_apply_child_guard_85(),staff_core.evidence_candidate_guard_85() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
