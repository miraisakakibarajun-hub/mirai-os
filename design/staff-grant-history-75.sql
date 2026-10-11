-- GRANT-HISTORY-75: UNAPPLIED structural proposal, NOT authorization.
-- Requires 65/68/72 and reviewed business scope/assignment/contract/role parents.
-- Missing parents must NOT be replaced with the isolated test fixtures in production.
BEGIN;
CREATE TABLE staff_core.access_grants (
 grant_id uuid PRIMARY KEY,account_id uuid NOT NULL,person_id uuid NOT NULL,org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),
 current_set_id uuid NOT NULL,lock_version bigint NOT NULL CHECK(lock_version>0),
 created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),created_at timestamptz NOT NULL,
 FOREIGN KEY(account_id,person_id) REFERENCES staff_core.account_links(account_id,person_id),
 UNIQUE(grant_id,person_id,org_id)
);
CREATE TABLE staff_core.access_grant_revisions_75 (
 revision_id uuid PRIMARY KEY,grant_id uuid NOT NULL,person_id uuid NOT NULL,org_id uuid NOT NULL,
 revision_no bigint NOT NULL CHECK(revision_no>0),supersedes_revision_id uuid,
 scope_id uuid NOT NULL,scope_revision_id uuid NOT NULL,
 system_code text NOT NULL CHECK(length(btrim(system_code))>0),resource_kind text NOT NULL CHECK(length(btrim(resource_kind))>0),
 action_code text NOT NULL CHECK(length(btrim(action_code))>0),resource_external_id text CHECK(resource_external_id IS NULL OR length(btrim(resource_external_id))>0),
 grant_state text NOT NULL CHECK(grant_state IN ('PENDING','ACTIVE','REVOKED','ENDED')),
 valid_from timestamptz NOT NULL,valid_to timestamptz,CHECK(valid_to IS NULL OR valid_from<valid_to),
 request_revision_id uuid,decision_id uuid,application_id uuid,
 granted_actor_id uuid REFERENCES staff_core.actor_registry(actor_id),authz_version bigint CHECK(authz_version>0),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason))>0),sealed boolean NOT NULL,
 FOREIGN KEY(grant_id,person_id,org_id) REFERENCES staff_core.access_grants(grant_id,person_id,org_id),
 FOREIGN KEY(scope_id,org_id) REFERENCES staff_core.scope_definitions(scope_id,org_id),
 FOREIGN KEY(scope_id,scope_revision_id,org_id) REFERENCES staff_core.scope_definition_revisions(scope_id,revision_id,org_id),
 FOREIGN KEY(application_id,request_revision_id,decision_id) REFERENCES staff_core.applications(application_id,request_revision_id,decision_id),
 FOREIGN KEY(request_revision_id,decision_id) REFERENCES staff_core.decision_records(request_revision_id,decision_id),
 CHECK((request_revision_id IS NULL AND decision_id IS NULL AND application_id IS NULL) OR
       (request_revision_id IS NOT NULL AND decision_id IS NOT NULL AND application_id IS NOT NULL)),
 CHECK(grant_state<>'ACTIVE' OR (application_id IS NOT NULL AND granted_actor_id IS NOT NULL AND authz_version IS NOT NULL)),
 UNIQUE(grant_id,revision_id),UNIQUE(grant_id,revision_no),UNIQUE(grant_id,revision_id,person_id,org_id),
 FOREIGN KEY(grant_id,supersedes_revision_id) REFERENCES staff_core.access_grant_revisions_75(grant_id,revision_id),
 CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
CREATE TABLE staff_core.grant_dependencies_75 (
 dependency_id uuid PRIMARY KEY,grant_id uuid NOT NULL,revision_id uuid NOT NULL,person_id uuid NOT NULL,org_id uuid NOT NULL,
 dependency_kind text NOT NULL CHECK(dependency_kind IN ('PERSON_ORG','ASSIGNMENT','CONTRACT','ROLE_ASSIGNMENT')),
 person_org_relation_id uuid,assignment_id uuid,contract_id uuid,role_assignment_id uuid,
 FOREIGN KEY(grant_id,revision_id,person_id,org_id) REFERENCES staff_core.access_grant_revisions_75(grant_id,revision_id,person_id,org_id),
 FOREIGN KEY(person_org_relation_id,person_id,org_id) REFERENCES staff_core.person_organizations(relation_id,person_id,org_id),
 FOREIGN KEY(assignment_id,person_id,org_id) REFERENCES staff_core.assignments(assignment_id,person_id,org_id),
 FOREIGN KEY(contract_id,person_id,org_id) REFERENCES staff_core.contracts(contract_id,person_id,org_id),
 FOREIGN KEY(role_assignment_id,person_id,org_id) REFERENCES staff_core.role_assignments(role_assignment_id,person_id,org_id),
 CHECK(num_nonnulls(person_org_relation_id,assignment_id,contract_id,role_assignment_id)=1),
 CHECK((dependency_kind='PERSON_ORG')=(person_org_relation_id IS NOT NULL)),
 CHECK((dependency_kind='ASSIGNMENT')=(assignment_id IS NOT NULL)),
 CHECK((dependency_kind='CONTRACT')=(contract_id IS NOT NULL)),
 CHECK((dependency_kind='ROLE_ASSIGNMENT')=(role_assignment_id IS NOT NULL))
);
CREATE UNIQUE INDEX grant_dep_relation_75 ON staff_core.grant_dependencies_75(revision_id,person_org_relation_id) WHERE person_org_relation_id IS NOT NULL;
CREATE UNIQUE INDEX grant_dep_assignment_75 ON staff_core.grant_dependencies_75(revision_id,assignment_id) WHERE assignment_id IS NOT NULL;
CREATE UNIQUE INDEX grant_dep_contract_75 ON staff_core.grant_dependencies_75(revision_id,contract_id) WHERE contract_id IS NOT NULL;
CREATE UNIQUE INDEX grant_dep_role_75 ON staff_core.grant_dependencies_75(revision_id,role_assignment_id) WHERE role_assignment_id IS NOT NULL;
CREATE TABLE staff_core.grant_revision_sets_75 (
 set_id uuid PRIMARY KEY,grant_id uuid NOT NULL REFERENCES staff_core.access_grants(grant_id),set_no bigint NOT NULL CHECK(set_no>0),previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,sealed boolean NOT NULL,
 UNIQUE(grant_id,set_id),UNIQUE(grant_id,set_no),
 FOREIGN KEY(grant_id,previous_set_id) REFERENCES staff_core.grant_revision_sets_75(grant_id,set_id),CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.grant_revision_set_members_75 (
 set_id uuid NOT NULL,grant_id uuid NOT NULL,segment_no bigint NOT NULL CHECK(segment_no>0),revision_id uuid NOT NULL,
 valid_from timestamptz NOT NULL,valid_to timestamptz,interpretation_state text NOT NULL CHECK(interpretation_state IN ('CONFIRMED','UNVERIFIED','CANCELLED')),
 PRIMARY KEY(set_id,segment_no),CHECK(valid_to IS NULL OR valid_from<valid_to),
 FOREIGN KEY(grant_id,set_id) REFERENCES staff_core.grant_revision_sets_75(grant_id,set_id),
 FOREIGN KEY(grant_id,revision_id) REFERENCES staff_core.access_grant_revisions_75(grant_id,revision_id)
);
ALTER TABLE staff_core.access_grants ADD FOREIGN KEY(grant_id,current_set_id) REFERENCES staff_core.grant_revision_sets_75(grant_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION staff_core.grant_child_guard_75() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Grant snapshot child immutable';END IF;
 IF TG_TABLE_NAME='grant_dependencies_75' THEN
  PERFORM 1 FROM staff_core.access_grant_revisions_75 WHERE revision_id=NEW.revision_id AND sealed=false FOR UPDATE;
 ELSE
  PERFORM 1 FROM staff_core.grant_revision_sets_75 WHERE set_id=NEW.set_id AND sealed=false FOR UPDATE;
 END IF;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unsealed grant parent required';END IF;RETURN NEW;
END $$;
CREATE TRIGGER grant_dep_guard_75 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.grant_dependencies_75 FOR EACH ROW EXECUTE FUNCTION staff_core.grant_child_guard_75();
CREATE TRIGGER grant_member_guard_75 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.grant_revision_set_members_75 FOR EACH ROW EXECUTE FUNCTION staff_core.grant_child_guard_75();
CREATE FUNCTION staff_core.grant_seal_guard_75() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE prev uuid;no bigint;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Grant history deletion denied';END IF;
 IF TG_OP='INSERT' THEN IF NEW.sealed THEN RAISE EXCEPTION 'Grant must start unsealed';END IF;RETURN NEW;END IF;
 IF OLD.sealed OR NOT NEW.sealed OR (to_jsonb(NEW)-'sealed') IS DISTINCT FROM (to_jsonb(OLD)-'sealed') THEN RAISE EXCEPTION 'Only grant sealing permitted';END IF;
 IF TG_TABLE_NAME='access_grant_revisions_75' THEN
  prev:=NEW.supersedes_revision_id;no:=NEW.revision_no;
  IF prev IS NOT NULL AND NOT EXISTS(SELECT 1 FROM staff_core.access_grant_revisions_75 WHERE grant_id=NEW.grant_id AND revision_id=prev AND sealed AND revision_no<no) THEN RAISE EXCEPTION 'Sealed grant predecessor required';END IF;
  IF NOT EXISTS(SELECT 1 FROM staff_core.grant_dependencies_75 WHERE revision_id=NEW.revision_id AND dependency_kind='PERSON_ORG') THEN RAISE EXCEPTION 'Person org dependency required';END IF;
 ELSE
  prev:=NEW.previous_set_id;no:=NEW.set_no;
  IF prev IS NOT NULL AND NOT EXISTS(SELECT 1 FROM staff_core.grant_revision_sets_75 WHERE grant_id=NEW.grant_id AND set_id=prev AND sealed AND set_no<no) THEN RAISE EXCEPTION 'Sealed grant set predecessor required';END IF;
  IF NOT EXISTS(SELECT 1 FROM staff_core.grant_revision_set_members_75 WHERE set_id=NEW.set_id) THEN RAISE EXCEPTION 'Grant set must have segments';END IF;
  IF EXISTS(SELECT 1 FROM staff_core.grant_revision_set_members_75 m JOIN staff_core.access_grant_revisions_75 r ON r.revision_id=m.revision_id WHERE m.set_id=NEW.set_id AND (NOT r.sealed OR m.valid_from<r.valid_from OR (r.valid_to IS NOT NULL AND (m.valid_to IS NULL OR m.valid_to>r.valid_to)))) THEN RAISE EXCEPTION 'Grant segment outside sealed revision';END IF;
  IF EXISTS(SELECT 1 FROM staff_core.grant_revision_set_members_75 a JOIN staff_core.grant_revision_set_members_75 b ON a.set_id=b.set_id AND a.segment_no<b.segment_no WHERE a.set_id=NEW.set_id AND a.interpretation_state<>'CANCELLED' AND b.interpretation_state<>'CANCELLED' AND tstzrange(a.valid_from,a.valid_to,'[)') && tstzrange(b.valid_from,b.valid_to,'[)')) THEN RAISE EXCEPTION 'Grant segments overlap';END IF;
 END IF;
 IF prev IS NULL AND no<>1 THEN RAISE EXCEPTION 'Initial grant version must be one';END IF;RETURN NEW;
END $$;
CREATE TRIGGER grant_revision_guard_75 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.access_grant_revisions_75 FOR EACH ROW EXECUTE FUNCTION staff_core.grant_seal_guard_75();
CREATE TRIGGER grant_set_guard_75 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.grant_revision_sets_75 FOR EACH ROW EXECUTE FUNCTION staff_core.grant_seal_guard_75();
CREATE FUNCTION staff_core.grant_identity_guard_75() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Grant identity deletion denied';END IF;
 IF (to_jsonb(NEW)-ARRAY['current_set_id','lock_version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['current_set_id','lock_version']) OR NEW.lock_version<>OLD.lock_version+1 THEN RAISE EXCEPTION 'Grant identity version denied';END IF;
 IF NEW.current_set_id IS DISTINCT FROM OLD.current_set_id AND NOT EXISTS(SELECT 1 FROM staff_core.grant_revision_sets_75 WHERE grant_id=NEW.grant_id AND set_id=NEW.current_set_id AND sealed AND previous_set_id=OLD.current_set_id) THEN RAISE EXCEPTION 'Grant current set successor required';END IF;RETURN NEW;
END $$;
CREATE TRIGGER grant_identity_guard_75 BEFORE UPDATE OR DELETE ON staff_core.access_grants FOR EACH ROW EXECUTE FUNCTION staff_core.grant_identity_guard_75();
CREATE FUNCTION staff_core.grant_history_required_75() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM staff_core.access_grants g JOIN staff_core.grant_revision_sets_75 s ON s.grant_id=g.grant_id AND s.set_id=g.current_set_id WHERE g.grant_id=NEW.grant_id AND s.sealed) THEN RAISE EXCEPTION 'Sealed grant current set required';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER grant_history_required_75 AFTER INSERT OR UPDATE ON staff_core.access_grants DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.grant_history_required_75();
-- Structural read model only. NEVER substitute this for a permission engine.
CREATE VIEW staff_core.grant_structure_candidates_75 WITH(security_invoker=true) AS
 WITH tick AS MATERIALIZED(SELECT clock_timestamp() t)
 SELECT g.grant_id,g.account_id,g.person_id,g.org_id,s.set_id,m.revision_id,m.interpretation_state,r.grant_state,
 r.scope_id,r.scope_revision_id,r.system_code,r.resource_kind,r.action_code,r.resource_external_id,
 false AS authorization_verified
 FROM staff_core.access_grants g JOIN staff_core.grant_revision_sets_75 s ON s.grant_id=g.grant_id AND s.set_id=g.current_set_id AND s.sealed
 JOIN staff_core.grant_revision_set_members_75 m ON m.set_id=s.set_id JOIN staff_core.access_grant_revisions_75 r ON r.revision_id=m.revision_id AND r.sealed CROSS JOIN tick
 WHERE m.interpretation_state='CONFIRMED' AND m.valid_from<=tick.t AND (m.valid_to IS NULL OR tick.t<m.valid_to)
 AND r.valid_from<=tick.t AND (r.valid_to IS NULL OR tick.t<r.valid_to);
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['access_grants','access_grant_revisions_75','grant_dependencies_75','grant_revision_sets_75','grant_revision_set_members_75'] LOOP
 EXECUTE format('ALTER TABLE staff_core.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE staff_core.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('REVOKE ALL ON staff_core.%I FROM PUBLIC,anon,authenticated,service_role',n);END LOOP;END $$;
REVOKE ALL ON staff_core.grant_structure_candidates_75 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION staff_core.grant_child_guard_75(),staff_core.grant_seal_guard_75(),staff_core.grant_identity_guard_75(),staff_core.grant_history_required_75() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
