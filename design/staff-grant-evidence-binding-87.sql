-- 87: NEW ISOLATED CANDIDATE SCHEMA ONLY. NOT a production migration.
-- Requires actual candidate65/68/72/75/76/77/78/80/81/82/83/85.
-- Structural evidence binding and negative diagnostics, NEVER PERMIT.
BEGIN;
CREATE TABLE staff_core.grant_evidence_bindings_87 (
 binding_id uuid PRIMARY KEY,
 evidence_id uuid NOT NULL UNIQUE,
 request_revision_id uuid NOT NULL, decision_id uuid NOT NULL,
 org_id uuid NOT NULL, person_id uuid NOT NULL, account_id uuid NOT NULL,
 grant_id uuid NOT NULL, grant_set_id uuid NOT NULL, grant_revision_id uuid NOT NULL,
 scope_id uuid NOT NULL, scope_revision_id uuid NOT NULL,
 grant_lock_version bigint NOT NULL CHECK(grant_lock_version>0),
 valid_from timestamptz NOT NULL, valid_to timestamptz,
 CHECK(valid_to IS NULL OR valid_from<valid_to),
 binding_kind text NOT NULL DEFAULT 'GRANT' CHECK(binding_kind='GRANT'),
 authorization_verified boolean NOT NULL DEFAULT false CHECK(NOT authorization_verified),
 sealed boolean NOT NULL DEFAULT false,
 lock_version bigint NOT NULL DEFAULT 1 CHECK(lock_version>0),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),
 recorded_at timestamptz NOT NULL,
 FOREIGN KEY(evidence_id,request_revision_id,decision_id,org_id,person_id,account_id)
 REFERENCES staff_core.authorization_evidence_candidates_85(evidence_id,request_revision_id,decision_id,org_id,person_id,account_id),
 FOREIGN KEY(grant_id,person_id,org_id) REFERENCES staff_core.access_grants(grant_id,person_id,org_id),
 FOREIGN KEY(grant_id,grant_set_id) REFERENCES staff_core.grant_revision_sets_75(grant_id,set_id),
 FOREIGN KEY(grant_id,grant_revision_id,person_id,org_id) REFERENCES staff_core.access_grant_revisions_75(grant_id,revision_id,person_id,org_id),
 FOREIGN KEY(scope_id,scope_revision_id,org_id) REFERENCES staff_core.scope_definition_revisions(scope_id,revision_id,org_id)
);
-- One typed slot only; target/set/revision FK pairs prevent cross-target mixes.
CREATE TABLE staff_core.grant_dependency_snapshots_87 (
 binding_id uuid NOT NULL REFERENCES staff_core.grant_evidence_bindings_87(binding_id),
 dependency_id uuid NOT NULL REFERENCES staff_core.grant_dependencies_75(dependency_id),
 dependency_kind text NOT NULL CHECK(dependency_kind IN ('PERSON_ORG','ASSIGNMENT','CONTRACT','ROLE_ASSIGNMENT')),
 relation_id uuid, relation_set_id uuid, relation_revision_id uuid,
 assignment_id uuid, assignment_set_id uuid, assignment_revision_id uuid,
 contract_id uuid, contract_set_id uuid, contract_revision_id uuid,
 role_assignment_id uuid, role_set_id uuid, role_revision_id uuid,
 PRIMARY KEY(binding_id,dependency_id),
 CHECK(num_nonnulls(relation_id,assignment_id,contract_id,role_assignment_id)=1),
 CHECK((dependency_kind='PERSON_ORG')=(relation_id IS NOT NULL)),
 CHECK((dependency_kind='ASSIGNMENT')=(assignment_id IS NOT NULL)),
 CHECK((dependency_kind='CONTRACT')=(contract_id IS NOT NULL)),
 CHECK((dependency_kind='ROLE_ASSIGNMENT')=(role_assignment_id IS NOT NULL)),
 CHECK((relation_id IS NULL)=(relation_set_id IS NULL) AND (relation_id IS NULL)=(relation_revision_id IS NULL)),
 CHECK((assignment_id IS NULL)=(assignment_set_id IS NULL) AND (assignment_id IS NULL)=(assignment_revision_id IS NULL)),
 CHECK((contract_id IS NULL)=(contract_set_id IS NULL) AND (contract_id IS NULL)=(contract_revision_id IS NULL)),
 CHECK((role_assignment_id IS NULL)=(role_set_id IS NULL) AND (role_assignment_id IS NULL)=(role_revision_id IS NULL)),
 FOREIGN KEY(relation_id,relation_set_id) REFERENCES staff_core.relation_revision_sets(relation_id,set_id),
 FOREIGN KEY(relation_id,relation_revision_id) REFERENCES staff_core.person_organization_revisions(relation_id,revision_id),
 FOREIGN KEY(assignment_id,assignment_set_id) REFERENCES staff_core.assignment_revision_sets_80(assignment_id,set_id),
 FOREIGN KEY(assignment_id,assignment_revision_id) REFERENCES staff_core.assignment_revisions_80(assignment_id,revision_id),
 FOREIGN KEY(contract_id,contract_set_id) REFERENCES staff_core.contract_revision_sets_81(contract_id,set_id),
 FOREIGN KEY(contract_id,contract_revision_id) REFERENCES staff_core.contract_revisions_81(contract_id,revision_id),
 FOREIGN KEY(role_assignment_id,role_set_id) REFERENCES staff_core.role_assignment_revision_sets_82(role_assignment_id,set_id),
 FOREIGN KEY(role_assignment_id,role_revision_id) REFERENCES staff_core.role_assignment_revisions_82(role_assignment_id,revision_id)
);
CREATE TABLE staff_core.grant_binding_events_87 (
 event_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 binding_id uuid NOT NULL REFERENCES staff_core.grant_evidence_bindings_87(binding_id),
 event_kind text NOT NULL CHECK(event_kind IN ('SEALED','INVALIDATED')),
 actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),
 reason_code text NOT NULL CHECK(reason_code IN ('STRUCTURE_RECORDED','REVIEW_REQUIRED','CANDIDATE_CANCELLED')),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(binding_id,event_kind)
);
CREATE FUNCTION staff_core.binding_event_guard_87() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION '87 event immutable'; END IF;
 PERFORM 1 FROM staff_core.grant_evidence_bindings_87 WHERE binding_id=NEW.binding_id AND sealed FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '87 event requires sealed binding'; END IF;
 IF (NEW.event_kind='SEALED')<>(NEW.reason_code='STRUCTURE_RECORDED') THEN RAISE EXCEPTION '87 event reason mismatch';END IF;
 -- SEALED is emitted only by binding trigger. No public writer can call either.
 IF NEW.event_kind='SEALED' AND pg_trigger_depth()<2 THEN RAISE EXCEPTION '87 seal audit is internal';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER binding_event_guard_87 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.grant_binding_events_87 FOR EACH ROW EXECUTE FUNCTION staff_core.binding_event_guard_87();

CREATE FUNCTION staff_core.binding_child_guard_87() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE b staff_core.grant_evidence_bindings_87; d staff_core.grant_dependencies_75;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION '87 dependency snapshot immutable';END IF;
 SELECT * INTO b FROM staff_core.grant_evidence_bindings_87 WHERE binding_id=NEW.binding_id AND NOT sealed FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION '87 unsealed binding required';END IF;
 SELECT * INTO d FROM staff_core.grant_dependencies_75 WHERE dependency_id=NEW.dependency_id;
 IF NOT FOUND OR d.grant_id<>b.grant_id OR d.revision_id<>b.grant_revision_id
 OR d.person_id<>b.person_id OR d.org_id<>b.org_id OR d.dependency_kind<>NEW.dependency_kind
 OR ROW(d.person_org_relation_id,d.assignment_id,d.contract_id,d.role_assignment_id)
 IS DISTINCT FROM ROW(NEW.relation_id,NEW.assignment_id,NEW.contract_id,NEW.role_assignment_id)
 THEN RAISE EXCEPTION '87 declared dependency mismatch';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER binding_child_guard_87 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.grant_dependency_snapshots_87 FOR EACH ROW EXECUTE FUNCTION staff_core.binding_child_guard_87();

-- At a recorded evaluation time, ensure each typed set/member really contains
-- the selected revision. This does NOT assert reference readiness or authority.
CREATE FUNCTION staff_core.binding_snapshots_match_87(p_binding uuid,p_at timestamptz,p_current boolean)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_at IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM staff_core.grant_dependency_snapshots_87 d WHERE d.binding_id=p_binding AND NOT CASE d.dependency_kind
 WHEN 'PERSON_ORG' THEN EXISTS(SELECT 1 FROM staff_core.person_organizations t JOIN staff_core.relation_revision_sets s ON s.relation_id=t.relation_id
 JOIN staff_core.relation_revision_set_members m ON m.set_id=s.set_id AND m.relation_id=t.relation_id
 WHERE t.relation_id=d.relation_id AND s.set_id=d.relation_set_id AND s.sealed AND m.revision_id=d.relation_revision_id
 AND (NOT p_current OR t.current_set_id=s.set_id) AND m.interpretation_state='CONFIRMED'
 AND daterange(m.valid_from,m.valid_to,'[)') @> (p_at AT TIME ZONE 'Asia/Tokyo')::date)
 WHEN 'ASSIGNMENT' THEN EXISTS(SELECT 1 FROM staff_core.assignments t JOIN staff_core.assignment_revision_sets_80 s ON s.assignment_id=t.assignment_id
 JOIN staff_core.assignment_revision_set_members_80 m ON m.set_id=s.set_id AND m.assignment_id=t.assignment_id
 WHERE t.assignment_id=d.assignment_id AND s.set_id=d.assignment_set_id AND s.sealed AND m.revision_id=d.assignment_revision_id
 AND (NOT p_current OR t.current_set_id=s.set_id) AND m.interpretation_state='CONFIRMED'
 AND daterange(m.valid_from,m.valid_to,'[)') @> (p_at AT TIME ZONE 'Asia/Tokyo')::date)
 WHEN 'CONTRACT' THEN EXISTS(SELECT 1 FROM staff_core.contracts t JOIN staff_core.contract_revision_sets_81 s ON s.contract_id=t.contract_id
 JOIN staff_core.contract_revision_set_members_81 m ON m.set_id=s.set_id AND m.contract_id=t.contract_id
 WHERE t.contract_id=d.contract_id AND s.set_id=d.contract_set_id AND s.sealed AND m.revision_id=d.contract_revision_id
 AND (NOT p_current OR t.current_set_id=s.set_id) AND m.interpretation_state='CONFIRMED'
 AND daterange(m.valid_from,m.valid_to,'[)') @> (p_at AT TIME ZONE 'Asia/Tokyo')::date)
 WHEN 'ROLE_ASSIGNMENT' THEN EXISTS(SELECT 1 FROM staff_core.role_assignments t JOIN staff_core.role_assignment_revision_sets_82 s ON s.role_assignment_id=t.role_assignment_id
 JOIN staff_core.role_assignment_revision_set_members_82 m ON m.set_id=s.set_id AND m.role_assignment_id=t.role_assignment_id
 WHERE t.role_assignment_id=d.role_assignment_id AND s.set_id=d.role_set_id AND s.sealed AND m.revision_id=d.role_revision_id
 AND (NOT p_current OR t.current_set_id=s.set_id) AND m.interpretation_state='CONFIRMED'
 AND daterange(m.valid_from,m.valid_to,'[)') @> (p_at AT TIME ZONE 'Asia/Tokyo')::date)
 ELSE false END)
$$;
CREATE FUNCTION staff_core.binding_header_guard_87() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE e staff_core.authorization_evidence_candidates_85;
 g staff_core.access_grants; r staff_core.access_grant_revisions_75;
 p staff_core.policy_domains_85;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION '87 binding deletion denied';END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.sealed OR NEW.lock_version<>1 THEN RAISE EXCEPTION '87 starts unsealed version one';END IF;
  RETURN NEW;
 END IF;
 IF OLD.sealed OR NOT NEW.sealed OR NEW.lock_version<>OLD.lock_version+1
 OR (to_jsonb(NEW)-ARRAY['sealed','lock_version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['sealed','lock_version'])
 THEN RAISE EXCEPTION '87 seal/version conflict';END IF;
 SELECT * INTO e FROM staff_core.authorization_evidence_candidates_85 WHERE evidence_id=NEW.evidence_id AND sealed;
 IF NOT FOUND THEN RAISE EXCEPTION '87 sealed evidence required';END IF;
 SELECT * INTO g FROM staff_core.access_grants WHERE grant_id=NEW.grant_id;
 SELECT * INTO r FROM staff_core.access_grant_revisions_75 WHERE revision_id=NEW.grant_revision_id AND sealed;
 IF NOT FOUND OR g.account_id<>NEW.account_id OR g.current_set_id<>NEW.grant_set_id OR g.lock_version<>NEW.grant_lock_version
 OR r.scope_id<>NEW.scope_id OR r.scope_revision_id<>NEW.scope_revision_id
 OR ROW(r.request_revision_id,r.decision_id) IS DISTINCT FROM ROW(e.request_revision_id,e.decision_id)
 OR NEW.valid_from<r.valid_from OR (r.valid_to IS NOT NULL AND (NEW.valid_to IS NULL OR NEW.valid_to>r.valid_to))
 THEN RAISE EXCEPTION '87 grant account/scope/version/period mismatch';END IF;
 IF e.phase='APPLY' AND NOT EXISTS(SELECT 1 FROM staff_core.authorization_apply_contexts_85 c
 WHERE c.evidence_id=e.evidence_id AND c.application_id=r.application_id)
 THEN RAISE EXCEPTION '87 apply application mismatch';END IF;
 SELECT * INTO p FROM staff_core.policy_domains_85 WHERE policy_id=e.policy_id;
 IF ROW(p.org_id,p.system_code,p.resource_kind,p.action_code) IS DISTINCT FROM ROW(r.org_id,r.system_code,r.resource_kind,r.action_code)
 THEN RAISE EXCEPTION '87 policy operation mismatch';END IF;
 IF NOT EXISTS(SELECT 1 FROM staff_core.grant_revision_sets_75 s JOIN staff_core.grant_revision_set_members_75 m ON m.set_id=s.set_id
 WHERE s.set_id=NEW.grant_set_id AND s.grant_id=NEW.grant_id AND s.sealed AND m.revision_id=NEW.grant_revision_id
 AND m.interpretation_state='CONFIRMED' AND tstzrange(m.valid_from,m.valid_to,'[)') @> e.evaluated_at
 AND NEW.valid_from>=m.valid_from AND (m.valid_to IS NULL OR (NEW.valid_to IS NOT NULL AND NEW.valid_to<=m.valid_to))
 AND tstzrange(NEW.valid_from,NEW.valid_to,'[)') @> e.evaluated_at)
 THEN RAISE EXCEPTION '87 grant member/evaluation mismatch';END IF;
 IF EXISTS((SELECT dependency_id FROM staff_core.grant_dependencies_75 WHERE revision_id=NEW.grant_revision_id)
 EXCEPT (SELECT dependency_id FROM staff_core.grant_dependency_snapshots_87 WHERE binding_id=NEW.binding_id))
 OR NOT EXISTS(SELECT 1 FROM staff_core.grant_dependency_snapshots_87 WHERE binding_id=NEW.binding_id)
 OR NOT staff_core.binding_snapshots_match_87(NEW.binding_id,e.evaluated_at,true)
 THEN RAISE EXCEPTION '87 complete current typed dependency snapshot required';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER binding_header_guard_87 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.grant_evidence_bindings_87 FOR EACH ROW EXECUTE FUNCTION staff_core.binding_header_guard_87();
CREATE FUNCTION staff_core.binding_seal_audit_87() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO staff_core.grant_binding_events_87(binding_id,event_kind,actor_id,operation_id,reason_code)
 VALUES(NEW.binding_id,'SEALED',NEW.recorded_actor_id,NEW.operation_id,'STRUCTURE_RECORDED');
 RETURN NEW;
END $$;
CREATE TRIGGER binding_seal_audit_87 AFTER UPDATE ON staff_core.grant_evidence_bindings_87 FOR EACH ROW WHEN (NOT OLD.sealed AND NEW.sealed) EXECUTE FUNCTION staff_core.binding_seal_audit_87();

-- Reject-only structural diagnostic. All scopes require EXACT equality here;
-- hierarchy inheritance and resource mapping remain unadopted. Never returns data.
CREATE FUNCTION staff_core.binding_diagnostic_at_87(p_binding uuid,p_org uuid,p_account uuid,p_scope uuid,
 p_system text,p_resource_kind text,p_action text,p_resource text,p_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE b staff_core.grant_evidence_bindings_87; r staff_core.access_grant_revisions_75; ref jsonb; result text;
BEGIN
 SELECT * INTO b FROM staff_core.grant_evidence_bindings_87 WHERE binding_id=p_binding AND sealed;
 IF NOT FOUND OR p_at IS NULL THEN result:='DENIED_NO_BINDING';
 ELSIF ROW(b.org_id,b.account_id,b.scope_id) IS DISTINCT FROM ROW(p_org,p_account,p_scope) THEN result:='DENIED_BOUNDARY';
 ELSE
  SELECT * INTO r FROM staff_core.access_grant_revisions_75 WHERE revision_id=b.grant_revision_id;
  ref:=staff_core.grant_dependency_reference_at_83(b.grant_id,p_at);
  IF ROW(r.system_code,r.resource_kind,r.action_code) IS DISTINCT FROM ROW(p_system,p_resource_kind,p_action)
   OR (r.resource_external_id IS NOT NULL AND r.resource_external_id IS DISTINCT FROM p_resource) THEN result:='DENIED_OPERATION_RESOURCE';
  ELSIF EXISTS(SELECT 1 FROM staff_core.grant_binding_events_87 WHERE binding_id=p_binding AND event_kind='INVALIDATED') THEN result:='DENIED_INVALIDATED';
  ELSIF NOT tstzrange(b.valid_from,b.valid_to,'[)') @> p_at THEN result:='DENIED_PERIOD';
  ELSIF (ref->>'set_id') IS DISTINCT FROM b.grant_set_id::text OR (ref->>'revision_id') IS DISTINCT FROM b.grant_revision_id::text
   OR NOT EXISTS(SELECT 1 FROM staff_core.access_grants g WHERE g.grant_id=b.grant_id AND g.lock_version=b.grant_lock_version)
   OR NOT staff_core.binding_snapshots_match_87(p_binding,p_at,true) THEN result:='DENIED_STALE_SNAPSHOT';
  ELSIF ref->>'dependency_state'<>'DEPENDENCY_REFERENCES_READY' THEN result:='DENIED_REFERENCE';
  ELSIF NOT EXISTS(SELECT 1 FROM staff_core.account_auth_controls WHERE account_id=p_account AND provisioning_state='LINKED' AND credential_state='READY')
   OR EXISTS(SELECT 1 FROM staff_core.stop_segments_66 s WHERE s.account_id=p_account AND s.effective_from<=p_at AND (s.effective_to IS NULL OR p_at<s.effective_to)
   AND (s.suspension_kind='ACCOUNT_GLOBAL' OR (s.org_id=p_org AND (s.suspension_kind='ORG_ACCESS' OR s.system_code=p_system)))
   AND NOT EXISTS(SELECT 1 FROM staff_core.release_segments_66 z WHERE z.suspension_id=s.suspension_id AND z.release_effective_at<=p_at)) THEN result:='DENIED_AUTH_RECORD';
  ELSE result:='EVIDENCE_UNVERIFIED';END IF;
 END IF;
 RETURN jsonb_build_object('status',result,'authorization_verified',false,'validation_level','ISOLATED_SQL_STRUCTURE',
 'evaluated_at',p_at);
END $$;
CREATE INDEX binding_grant_87 ON staff_core.grant_evidence_bindings_87(grant_id,grant_revision_id);
CREATE INDEX binding_grant_set_87 ON staff_core.grant_evidence_bindings_87(grant_id,grant_set_id);
CREATE INDEX binding_grant_context_87 ON staff_core.grant_evidence_bindings_87(grant_id,grant_revision_id,person_id,org_id);
CREATE INDEX binding_scope_87 ON staff_core.grant_evidence_bindings_87(scope_id,scope_revision_id,org_id);
CREATE INDEX binding_evidence_context_87 ON staff_core.grant_evidence_bindings_87(evidence_id,request_revision_id,decision_id,org_id,person_id,account_id);
CREATE INDEX binding_actor_87 ON staff_core.grant_evidence_bindings_87(recorded_actor_id);
CREATE INDEX binding_operation_87 ON staff_core.grant_evidence_bindings_87(operation_id);
CREATE INDEX snapshot_dependency_87 ON staff_core.grant_dependency_snapshots_87(dependency_id);
CREATE INDEX snapshot_relation_87 ON staff_core.grant_dependency_snapshots_87(relation_id,relation_set_id,relation_revision_id);
CREATE INDEX snapshot_assignment_87 ON staff_core.grant_dependency_snapshots_87(assignment_id,assignment_set_id,assignment_revision_id);
CREATE INDEX snapshot_contract_87 ON staff_core.grant_dependency_snapshots_87(contract_id,contract_set_id,contract_revision_id);
CREATE INDEX snapshot_role_87 ON staff_core.grant_dependency_snapshots_87(role_assignment_id,role_set_id,role_revision_id);
CREATE INDEX binding_event_actor_87 ON staff_core.grant_binding_events_87(actor_id);
CREATE INDEX binding_event_operation_87 ON staff_core.grant_binding_events_87(operation_id);
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['grant_evidence_bindings_87','grant_dependency_snapshots_87','grant_binding_events_87'] LOOP
 EXECUTE format('ALTER TABLE staff_core.%I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE staff_core.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON staff_core.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;
REVOKE ALL ON SEQUENCE staff_core.grant_binding_events_87_event_id_seq FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION staff_core.binding_event_guard_87(),staff_core.binding_child_guard_87(),staff_core.binding_snapshots_match_87(uuid,timestamptz,boolean),
 staff_core.binding_header_guard_87(),staff_core.binding_seal_audit_87(),staff_core.binding_diagnostic_at_87(uuid,uuid,uuid,uuid,text,text,text,text,timestamptz)
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
