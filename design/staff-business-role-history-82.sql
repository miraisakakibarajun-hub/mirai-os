-- BUSINESS-ROLE-HISTORY-82: unapplied candidate, no automatic grants.
-- Fresh candidate schema65/68/72/76/77/78/80; no actual catalog seeds.
BEGIN;
CREATE TABLE staff_core.business_roles (
 role_id uuid PRIMARY KEY,role_code text NOT NULL UNIQUE CHECK(length(btrim(role_code))>0 AND role_code=btrim(role_code) AND role_code NOT IN ('UNSET','UNCONFIRMED','未設定')),
 current_set_id uuid,lock_version bigint NOT NULL CHECK(lock_version>0),created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),created_at timestamptz NOT NULL
);
CREATE INDEX business_role_creator_82 ON staff_core.business_roles(created_actor_id);
CREATE TABLE staff_core.business_role_revisions_82 (
 revision_id uuid PRIMARY KEY,role_id uuid NOT NULL,revision_no bigint NOT NULL CHECK(revision_no>0),supersedes_revision_id uuid,
 role_name text NOT NULL CHECK(length(btrim(role_name))>0 AND btrim(role_name) NOT IN ('未設定','UNSET','UNCONFIRMED')),role_category text NOT NULL CHECK(role_category IN ('OCCUPATION','TITLE','DUTY')),role_state text NOT NULL CHECK(role_state IN ('ACTIVE','STOPPED','ENDED')),verification_status text NOT NULL CHECK(verification_status IN ('CONFIRMED','UNVERIFIED')),allowed_scope_kinds text[] NOT NULL CHECK(cardinality(allowed_scope_kinds)>0 AND array_position(allowed_scope_kinds,NULL) IS NULL AND allowed_scope_kinds <@ ARRAY['ORG','BUSINESS','SITE','DEPARTMENT','BUSINESS_SITE']::text[]),
 valid_from date NOT NULL,valid_to date,CHECK(valid_to IS NULL OR valid_from<valid_to),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),change_reason text NOT NULL CHECK(length(btrim(change_reason))>0),
 UNIQUE(role_id,revision_id),UNIQUE(role_id,revision_no),FOREIGN KEY(role_id,supersedes_revision_id) REFERENCES staff_core.business_role_revisions_82(role_id,revision_id),CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
CREATE TABLE staff_core.business_role_revision_sets_82 (
 set_id uuid PRIMARY KEY,role_id uuid NOT NULL REFERENCES staff_core.business_roles(role_id),set_no bigint NOT NULL CHECK(set_no>0),previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,sealed boolean NOT NULL,
 UNIQUE(role_id,set_id),UNIQUE(role_id,set_no),FOREIGN KEY(role_id,previous_set_id) REFERENCES staff_core.business_role_revision_sets_82(role_id,set_id),CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.business_role_revision_set_members_82 (
 set_id uuid NOT NULL,role_id uuid NOT NULL,segment_no bigint NOT NULL CHECK(segment_no>0),revision_id uuid NOT NULL,
 valid_from date NOT NULL,valid_to date,interpretation_state text NOT NULL CHECK(interpretation_state IN ('CONFIRMED','UNVERIFIED','CANCELLED')),
 PRIMARY KEY(set_id,segment_no),CHECK(valid_to IS NULL OR valid_from<valid_to),FOREIGN KEY(role_id,set_id) REFERENCES staff_core.business_role_revision_sets_82(role_id,set_id),FOREIGN KEY(role_id,revision_id) REFERENCES staff_core.business_role_revisions_82(role_id,revision_id)
);
ALTER TABLE staff_core.business_roles ADD FOREIGN KEY(role_id,current_set_id) REFERENCES staff_core.business_role_revision_sets_82(role_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TRIGGER business_role_revision_insert_82 BEFORE INSERT ON staff_core.business_role_revisions_82 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_insert_77('role_id');
CREATE TRIGGER business_role_revision_append_82 BEFORE UPDATE OR DELETE ON staff_core.business_role_revisions_82 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_append_77();
CREATE TRIGGER business_role_set_guard_82 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.business_role_revision_sets_82 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_set_guard_77('business_role_revisions_82','business_role_revision_set_members_82','role_id');
CREATE TRIGGER business_role_member_guard_82 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.business_role_revision_set_members_82 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_member_guard_77('business_role_revision_sets_82');
CREATE INDEX business_role_revision_actor_82 ON staff_core.business_role_revisions_82(recorded_actor_id);
CREATE INDEX business_role_set_operation_82 ON staff_core.business_role_revision_sets_82(operation_id);
CREATE INDEX business_role_set_actor_82 ON staff_core.business_role_revision_sets_82(recorded_actor_id);
CREATE INDEX business_role_member_revision_82 ON staff_core.business_role_revision_set_members_82(role_id,revision_id);
ALTER TABLE staff_core.business_role_revisions_82 ADD FOREIGN KEY(role_id) REFERENCES staff_core.business_roles(role_id);
CREATE TABLE staff_core.role_assignments (
 role_assignment_id uuid PRIMARY KEY,person_id uuid NOT NULL REFERENCES staff_core.persons(person_id),org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),person_org_relation_id uuid NOT NULL,
 role_id uuid NOT NULL REFERENCES staff_core.business_roles(role_id),scope_id uuid NOT NULL,assignment_id uuid,
 current_set_id uuid,lock_version bigint NOT NULL CHECK(lock_version>0),created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),created_at timestamptz NOT NULL,
 UNIQUE(role_assignment_id,person_id,org_id),
 FOREIGN KEY(person_org_relation_id,person_id,org_id) REFERENCES staff_core.person_organizations(relation_id,person_id,org_id),
 FOREIGN KEY(scope_id,org_id) REFERENCES staff_core.scope_definitions(scope_id,org_id),
 FOREIGN KEY(assignment_id,person_id,org_id) REFERENCES staff_core.assignments(assignment_id,person_id,org_id)
);
CREATE INDEX role_assignment_person_82 ON staff_core.role_assignments(person_id,org_id,role_id,scope_id);
CREATE INDEX role_assignment_org_82 ON staff_core.role_assignments(org_id);
CREATE INDEX role_assignment_relation_82 ON staff_core.role_assignments(person_org_relation_id,person_id,org_id);
CREATE INDEX role_assignment_role_82 ON staff_core.role_assignments(role_id);
CREATE INDEX role_assignment_scope_82 ON staff_core.role_assignments(scope_id,org_id);
CREATE INDEX role_assignment_assignment_82 ON staff_core.role_assignments(assignment_id,person_id,org_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX role_assignment_creator_82 ON staff_core.role_assignments(created_actor_id);
CREATE TABLE staff_core.role_assignment_revisions_82 (
 revision_id uuid PRIMARY KEY,role_assignment_id uuid NOT NULL,person_id uuid NOT NULL,org_id uuid NOT NULL,revision_no bigint NOT NULL CHECK(revision_no>0),supersedes_revision_id uuid,
 role_state text NOT NULL CHECK(role_state IN ('ACTIVE','SUSPENDED','ENDED')),verification_status text NOT NULL CHECK(verification_status IN ('CONFIRMED','UNVERIFIED')),appointment_evidence_ref text NOT NULL CHECK(length(btrim(appointment_evidence_ref))>0),
 valid_from date NOT NULL,valid_to date,CHECK(valid_to IS NULL OR valid_from<valid_to),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),change_reason text NOT NULL CHECK(length(btrim(change_reason))>0),
 UNIQUE(role_assignment_id,revision_id),UNIQUE(role_assignment_id,revision_no),FOREIGN KEY(role_assignment_id,supersedes_revision_id) REFERENCES staff_core.role_assignment_revisions_82(role_assignment_id,revision_id),CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
CREATE TABLE staff_core.role_assignment_revision_sets_82 (
 set_id uuid PRIMARY KEY,role_assignment_id uuid NOT NULL REFERENCES staff_core.role_assignments(role_assignment_id),set_no bigint NOT NULL CHECK(set_no>0),previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,sealed boolean NOT NULL,
 UNIQUE(role_assignment_id,set_id),UNIQUE(role_assignment_id,set_no),FOREIGN KEY(role_assignment_id,previous_set_id) REFERENCES staff_core.role_assignment_revision_sets_82(role_assignment_id,set_id),CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.role_assignment_revision_set_members_82 (
 set_id uuid NOT NULL,role_assignment_id uuid NOT NULL,segment_no bigint NOT NULL CHECK(segment_no>0),revision_id uuid NOT NULL,
 valid_from date NOT NULL,valid_to date,interpretation_state text NOT NULL CHECK(interpretation_state IN ('CONFIRMED','UNVERIFIED','CANCELLED')),
 PRIMARY KEY(set_id,segment_no),CHECK(valid_to IS NULL OR valid_from<valid_to),FOREIGN KEY(role_assignment_id,set_id) REFERENCES staff_core.role_assignment_revision_sets_82(role_assignment_id,set_id),FOREIGN KEY(role_assignment_id,revision_id) REFERENCES staff_core.role_assignment_revisions_82(role_assignment_id,revision_id)
);
ALTER TABLE staff_core.role_assignments ADD FOREIGN KEY(role_assignment_id,current_set_id) REFERENCES staff_core.role_assignment_revision_sets_82(role_assignment_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TRIGGER role_assignment_revision_insert_82 BEFORE INSERT ON staff_core.role_assignment_revisions_82 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_insert_77('role_assignment_id');
CREATE TRIGGER role_assignment_revision_append_82 BEFORE UPDATE OR DELETE ON staff_core.role_assignment_revisions_82 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_append_77();
CREATE TRIGGER role_assignment_set_guard_82 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.role_assignment_revision_sets_82 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_set_guard_77('role_assignment_revisions_82','role_assignment_revision_set_members_82','role_assignment_id');
CREATE TRIGGER role_assignment_member_guard_82 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.role_assignment_revision_set_members_82 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_member_guard_77('role_assignment_revision_sets_82');
CREATE INDEX role_assignment_revision_actor_82 ON staff_core.role_assignment_revisions_82(recorded_actor_id);
CREATE INDEX role_assignment_set_operation_82 ON staff_core.role_assignment_revision_sets_82(operation_id);
CREATE INDEX role_assignment_set_actor_82 ON staff_core.role_assignment_revision_sets_82(recorded_actor_id);
CREATE INDEX role_assignment_member_revision_82 ON staff_core.role_assignment_revision_set_members_82(role_assignment_id,revision_id);
ALTER TABLE staff_core.role_assignment_revisions_82 ADD FOREIGN KEY(role_assignment_id,person_id,org_id) REFERENCES staff_core.role_assignments(role_assignment_id,person_id,org_id);
CREATE FUNCTION staff_core.role_history_identity_82() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE key uuid;ok boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Role identity immutable';END IF;
 IF (to_jsonb(NEW)-ARRAY['current_set_id','lock_version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['current_set_id','lock_version']) OR NEW.lock_version<>OLD.lock_version+1 THEN RAISE EXCEPTION 'Role identity/version denied';END IF;
 IF NEW.current_set_id IS DISTINCT FROM OLD.current_set_id THEN
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Role adoption requires read committed';END IF;
  IF TG_TABLE_NAME='role_assignments' THEN
   PERFORM 1 FROM staff_core.business_roles WHERE role_id=NEW.role_id FOR UPDATE;
   PERFORM 1 FROM staff_core.organizations WHERE org_id=NEW.org_id FOR UPDATE;
  END IF;
  key:=(to_jsonb(NEW)->>TG_ARGV[0])::uuid;
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM staff_core.%I WHERE %I=$1 AND set_id=$2 AND sealed AND previous_set_id IS NOT DISTINCT FROM $3)',TG_ARGV[1],TG_ARGV[0]) INTO ok USING key,NEW.current_set_id,OLD.current_set_id;
  IF NEW.current_set_id IS NULL OR NOT ok THEN RAISE EXCEPTION 'Sealed role successor required';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER business_role_identity_82 BEFORE UPDATE OR DELETE ON staff_core.business_roles FOR EACH ROW EXECUTE FUNCTION staff_core.role_history_identity_82('role_id','business_role_revision_sets_82');
CREATE TRIGGER role_assignment_identity_82 BEFORE UPDATE OR DELETE ON staff_core.role_assignments FOR EACH ROW EXECUTE FUNCTION staff_core.role_history_identity_82('role_assignment_id','role_assignment_revision_sets_82');
CREATE VIEW staff_core.business_role_current_segments_82 WITH(security_invoker=true) AS
 SELECT b.*,m.segment_no,m.revision_id,m.valid_from,m.valid_to,m.interpretation_state,r.role_name,r.role_category,r.role_state,r.verification_status,r.allowed_scope_kinds,daterange(m.valid_from,m.valid_to,'[)') valid_period,false authorization_verified
 FROM staff_core.business_roles b JOIN staff_core.business_role_revision_sets_82 s ON s.role_id=b.role_id AND s.set_id=b.current_set_id AND s.sealed JOIN staff_core.business_role_revision_set_members_82 m ON m.set_id=s.set_id JOIN staff_core.business_role_revisions_82 r ON r.revision_id=m.revision_id;
CREATE VIEW staff_core.role_assignment_current_segments_82 WITH(security_invoker=true) AS
 SELECT a.*,m.segment_no,m.revision_id,m.valid_from,m.valid_to,m.interpretation_state,r.role_state,r.verification_status,r.appointment_evidence_ref,daterange(m.valid_from,m.valid_to,'[)') valid_period,false authorization_verified
 FROM staff_core.role_assignments a JOIN staff_core.role_assignment_revision_sets_82 s ON s.role_assignment_id=a.role_assignment_id AND s.set_id=a.current_set_id AND s.sealed JOIN staff_core.role_assignment_revision_set_members_82 m ON m.set_id=s.set_id JOIN staff_core.role_assignment_revisions_82 r ON r.revision_id=m.revision_id;
CREATE FUNCTION staff_core.role_history_consistency_82() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE key uuid;pointer uuid;ok boolean;a staff_core.role_assignments;
BEGIN
 key:=(to_jsonb(NEW)->>TG_ARGV[0])::uuid;
 EXECUTE format('SELECT current_set_id FROM staff_core.%I WHERE %I=$1',TG_TABLE_NAME,TG_ARGV[0]) INTO pointer USING key;
 IF pointer IS NULL THEN RETURN NULL;END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Role adoption requires read committed';END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM staff_core.%I WHERE %I=$1 AND set_id=$2 AND sealed)',TG_ARGV[1],TG_ARGV[0]) INTO ok USING key,pointer;
 IF NOT ok THEN RAISE EXCEPTION 'Sealed role current set required';END IF;
 IF TG_TABLE_NAME='role_assignments' THEN
  SELECT * INTO a FROM staff_core.role_assignments WHERE role_assignment_id=key;
  PERFORM 1 FROM staff_core.business_roles WHERE role_id=a.role_id FOR UPDATE;
  PERFORM 1 FROM staff_core.organizations WHERE org_id=a.org_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM staff_core.role_assignment_current_segments_82 x JOIN staff_core.role_assignment_current_segments_82 y ON y.person_id=x.person_id AND y.org_id=x.org_id AND y.role_id=x.role_id AND y.scope_id=x.scope_id AND y.role_assignment_id>x.role_assignment_id WHERE x.person_id=a.person_id AND x.org_id=a.org_id AND x.role_id=a.role_id AND x.scope_id=a.scope_id AND x.role_state<>'ENDED' AND y.role_state<>'ENDED' AND x.interpretation_state<>'CANCELLED' AND y.interpretation_state<>'CANCELLED' AND x.valid_period && y.valid_period) THEN RAISE EXCEPTION 'Role appointment periods overlap';END IF;
  IF a.assignment_id IS NOT NULL AND EXISTS(SELECT 1 FROM staff_core.role_assignment_current_segments_82 x WHERE x.role_assignment_id=a.role_assignment_id AND x.role_state='ACTIVE' AND x.verification_status='CONFIRMED' AND x.interpretation_state='CONFIRMED' AND NOT EXISTS(
   SELECT 1 FROM staff_core.assignments g WHERE g.assignment_id=a.assignment_id AND g.scope_id=a.scope_id AND COALESCE((SELECT range_agg(v.valid_period) FROM staff_core.assignment_current_segments_80 v WHERE v.assignment_id=g.assignment_id AND v.assignment_state='ACTIVE' AND v.verification_status='CONFIRMED' AND v.interpretation_state='CONFIRMED'),'{}'::datemultirange) @>x.valid_period
  )) THEN RAISE EXCEPTION 'Role linked assignment scope/period not covered';END IF;
 END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER business_role_consistency_82 AFTER INSERT OR UPDATE ON staff_core.business_roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.role_history_consistency_82('role_id','business_role_revision_sets_82');
CREATE CONSTRAINT TRIGGER role_assignment_consistency_82 AFTER INSERT OR UPDATE ON staff_core.role_assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.role_history_consistency_82('role_assignment_id','role_assignment_revision_sets_82');
CREATE FUNCTION staff_core.role_assignment_reference_at_82(p_role_assignment uuid,p_at timestamptz) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 WITH tick AS MATERIALIZED(SELECT p_at at,(p_at AT TIME ZONE 'Asia/Tokyo')::date business_day)
 SELECT CASE WHEN EXISTS(SELECT 1 FROM staff_core.role_assignment_current_segments_82 a
 JOIN staff_core.persons p ON p.person_id=a.person_id JOIN staff_core.person_current_segments_65 ps ON ps.person_id=p.person_id
 JOIN staff_core.person_organizations po ON po.relation_id=a.person_org_relation_id AND po.person_id=a.person_id AND po.org_id=a.org_id
 JOIN staff_core.person_organization_current_segments_68 rs ON rs.relation_id=po.relation_id JOIN staff_core.person_organization_revisions pr ON pr.revision_id=rs.revision_id
 JOIN staff_core.business_role_current_segments_82 r ON r.role_id=a.role_id
 JOIN staff_core.scope_definitions sc ON sc.scope_id=a.scope_id AND sc.org_id=a.org_id CROSS JOIN tick
 WHERE a.role_assignment_id=p_role_assignment AND a.role_state='ACTIVE' AND a.verification_status='CONFIRMED' AND a.interpretation_state='CONFIRMED' AND a.valid_period @>tick.business_day
 AND r.role_state='ACTIVE' AND r.verification_status='CONFIRMED' AND r.interpretation_state='CONFIRMED' AND r.valid_period @>tick.business_day AND sc.scope_kind=ANY(r.allowed_scope_kinds)
 AND p.record_status='CONFIRMED' AND p.merged_into_person_id IS NULL AND ps.interpretation_state='CONFIRMED' AND ps.valid_period @>tick.business_day
 AND rs.interpretation_state='CONFIRMED' AND rs.valid_period @>tick.business_day AND pr.relationship_state='ACTIVE' AND pr.verification_status='CONFIRMED'
 AND staff_core.scope_operating_reference_at_80(sc.scope_id,tick.at)='REFERENCE_ACTIVE'
 AND (sc.scope_kind<>'DEPARTMENT' OR staff_core.department_structure_reference_at_80(sc.department_id,tick.at)='STRUCTURE_READY')
 AND (a.assignment_id IS NULL OR EXISTS(SELECT 1 FROM staff_core.assignments g WHERE g.assignment_id=a.assignment_id AND g.scope_id=a.scope_id
  AND staff_core.assignment_reference_at_80(g.assignment_id,tick.at)='ASSIGNMENT_READY'
  AND COALESCE((SELECT range_agg(v.valid_period) FROM staff_core.assignment_current_segments_80 v WHERE v.assignment_id=g.assignment_id AND v.assignment_state='ACTIVE' AND v.verification_status='CONFIRMED' AND v.interpretation_state='CONFIRMED'),'{}'::datemultirange) @>a.valid_period))) THEN 'ROLE_ASSIGNMENT_READY' ELSE 'ROLE_ASSIGNMENT_NOT_READY' END
$$;
CREATE FUNCTION staff_core.role_assignment_reference_82(p_role_assignment uuid) RETURNS text LANGUAGE sql SET search_path='' AS $$
 WITH tick AS MATERIALIZED(SELECT clock_timestamp() at) SELECT staff_core.role_assignment_reference_at_82(p_role_assignment,tick.at) FROM tick
$$;
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['business_roles','business_role_revisions_82','business_role_revision_sets_82','business_role_revision_set_members_82','role_assignments','role_assignment_revisions_82','role_assignment_revision_sets_82','role_assignment_revision_set_members_82'] LOOP EXECUTE format('ALTER TABLE staff_core.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE staff_core.%I FORCE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON staff_core.%I FROM PUBLIC,anon,authenticated,service_role',n);END LOOP;END $$;
REVOKE ALL ON staff_core.business_role_current_segments_82,staff_core.role_assignment_current_segments_82 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION staff_core.role_history_identity_82(),staff_core.role_history_consistency_82(),staff_core.role_assignment_reference_at_82(uuid,timestamptz),staff_core.role_assignment_reference_82(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;

