-- ASSIGNMENT-HISTORY-80: physical candidate for contract79. UNAPPLIED.
-- Fresh schema only; requires65/68/72/76/77/78. No migration/backfill.
BEGIN;
CREATE TABLE staff_core.assignments (
 assignment_id uuid PRIMARY KEY,person_id uuid NOT NULL REFERENCES staff_core.persons(person_id),org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),scope_id uuid NOT NULL,
 current_set_id uuid,lock_version bigint NOT NULL CHECK(lock_version>0),created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),created_at timestamptz NOT NULL,
 UNIQUE(assignment_id,person_id,org_id),UNIQUE(assignment_id),UNIQUE(person_id,org_id,scope_id),FOREIGN KEY(scope_id,org_id) REFERENCES staff_core.scope_definitions(scope_id,org_id)
);
CREATE TABLE staff_core.assignment_revisions_80 (
 revision_id uuid PRIMARY KEY,assignment_id uuid NOT NULL,person_id uuid NOT NULL,org_id uuid NOT NULL,revision_no bigint NOT NULL CHECK(revision_no>0),supersedes_revision_id uuid,
 assignment_state text NOT NULL CHECK(assignment_state IN ('ACTIVE','SUSPENDED','ENDED')),verification_status text NOT NULL CHECK(verification_status IN ('CONFIRMED','UNVERIFIED')),
 primary_kind text NOT NULL CHECK(primary_kind IN ('UNSET','PRIMARY','SECONDARY')),
 valid_from date NOT NULL,valid_to date,CHECK(valid_to IS NULL OR valid_from<valid_to),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),change_reason text NOT NULL CHECK(length(btrim(change_reason))>0),
 FOREIGN KEY(assignment_id,person_id,org_id) REFERENCES staff_core.assignments(assignment_id,person_id,org_id),
 UNIQUE(assignment_id,revision_id),UNIQUE(assignment_id,revision_no),FOREIGN KEY(assignment_id,supersedes_revision_id) REFERENCES staff_core.assignment_revisions_80(assignment_id,revision_id),CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
CREATE TABLE staff_core.assignment_revision_sets_80 (
 set_id uuid PRIMARY KEY,assignment_id uuid NOT NULL REFERENCES staff_core.assignments(assignment_id),set_no bigint NOT NULL CHECK(set_no>0),previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,sealed boolean NOT NULL,
 UNIQUE(assignment_id,set_id),UNIQUE(assignment_id,set_no),FOREIGN KEY(assignment_id,previous_set_id) REFERENCES staff_core.assignment_revision_sets_80(assignment_id,set_id),CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.assignment_revision_set_members_80 (
 set_id uuid NOT NULL,assignment_id uuid NOT NULL,segment_no bigint NOT NULL CHECK(segment_no>0),revision_id uuid NOT NULL,
 valid_from date NOT NULL,valid_to date,interpretation_state text NOT NULL CHECK(interpretation_state IN ('CONFIRMED','UNVERIFIED','CANCELLED')),
 PRIMARY KEY(set_id,segment_no),CHECK(valid_to IS NULL OR valid_from<valid_to),FOREIGN KEY(assignment_id,set_id) REFERENCES staff_core.assignment_revision_sets_80(assignment_id,set_id),FOREIGN KEY(assignment_id,revision_id) REFERENCES staff_core.assignment_revisions_80(assignment_id,revision_id)
);
ALTER TABLE staff_core.assignments ADD FOREIGN KEY(assignment_id,current_set_id) REFERENCES staff_core.assignment_revision_sets_80(assignment_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TRIGGER assignment_revision_insert_80 BEFORE INSERT ON staff_core.assignment_revisions_80 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_insert_77('assignment_id');
CREATE TRIGGER assignment_revision_append_80 BEFORE UPDATE OR DELETE ON staff_core.assignment_revisions_80 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_append_77();
CREATE TRIGGER assignment_set_guard_80 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.assignment_revision_sets_80 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_set_guard_77('assignment_revisions_80','assignment_revision_set_members_80','assignment_id');
CREATE TRIGGER assignment_member_guard_80 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.assignment_revision_set_members_80 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_member_guard_77('assignment_revision_sets_80');
CREATE FUNCTION staff_core.assignment_identity_guard_80() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Assignment identity immutable';END IF;
 IF (to_jsonb(NEW)-ARRAY['current_set_id','lock_version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['current_set_id','lock_version']) OR NEW.lock_version<>OLD.lock_version+1 THEN RAISE EXCEPTION 'Assignment identity/version denied';END IF;
 IF NEW.current_set_id IS DISTINCT FROM OLD.current_set_id THEN
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Assignment adoption requires read committed';END IF;
  PERFORM 1 FROM staff_core.organizations WHERE org_id=NEW.org_id FOR UPDATE;
  IF NEW.current_set_id IS NULL OR NOT EXISTS(SELECT 1 FROM staff_core.assignment_revision_sets_80 WHERE assignment_id=NEW.assignment_id AND set_id=NEW.current_set_id AND sealed AND previous_set_id IS NOT DISTINCT FROM OLD.current_set_id) THEN RAISE EXCEPTION 'Sealed assignment successor required';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER assignment_identity_guard_80 BEFORE UPDATE OR DELETE ON staff_core.assignments FOR EACH ROW EXECUTE FUNCTION staff_core.assignment_identity_guard_80();
CREATE VIEW staff_core.assignment_current_segments_80 WITH(security_invoker=true) AS
 SELECT a.*,m.segment_no,m.revision_id,m.valid_from,m.valid_to,m.interpretation_state,r.assignment_state,r.verification_status,r.primary_kind,daterange(m.valid_from,m.valid_to,'[)') valid_period,false authorization_verified
 FROM staff_core.assignments a JOIN staff_core.assignment_revision_sets_80 s ON s.assignment_id=a.assignment_id AND s.set_id=a.current_set_id AND s.sealed JOIN staff_core.assignment_revision_set_members_80 m ON m.set_id=s.set_id JOIN staff_core.assignment_revisions_80 r ON r.revision_id=m.revision_id;
CREATE FUNCTION staff_core.assignment_consistency_80() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a staff_core.assignments;
BEGIN
 SELECT * INTO a FROM staff_core.assignments WHERE assignment_id=NEW.assignment_id;
 IF a.current_set_id IS NULL THEN RETURN NULL;END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Assignment adoption requires read committed';END IF;
 PERFORM 1 FROM staff_core.organizations WHERE org_id=a.org_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM staff_core.assignment_revision_sets_80 WHERE assignment_id=a.assignment_id AND set_id=a.current_set_id AND sealed) THEN RAISE EXCEPTION 'Sealed assignment current set required';END IF;
 IF EXISTS(SELECT 1 FROM staff_core.assignment_current_segments_80 x JOIN staff_core.assignment_current_segments_80 y ON y.person_id=x.person_id AND y.org_id=x.org_id AND y.assignment_id>x.assignment_id WHERE x.org_id=a.org_id AND x.person_id=a.person_id AND x.primary_kind='PRIMARY' AND y.primary_kind='PRIMARY' AND x.assignment_state<>'ENDED' AND y.assignment_state<>'ENDED' AND x.interpretation_state<>'CANCELLED' AND y.interpretation_state<>'CANCELLED' AND x.valid_period && y.valid_period) THEN RAISE EXCEPTION 'Assignment primary periods overlap';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER assignment_consistency_80 AFTER INSERT OR UPDATE ON staff_core.assignments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.assignment_consistency_80();
CREATE FUNCTION staff_core.scope_operating_reference_at_80(p_scope uuid,p_at timestamptz) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 WITH tick AS MATERIALIZED(SELECT at,(at AT TIME ZONE 'Asia/Tokyo')::date AS business_day FROM (SELECT p_at at) t)
 SELECT CASE WHEN EXISTS(SELECT 1 FROM staff_core.scope_definitions v JOIN staff_core.scope_revision_sets_76 ss ON ss.scope_id=v.scope_id AND ss.set_id=v.current_set_id AND ss.sealed JOIN staff_core.scope_revision_set_members_76 sm ON sm.set_id=ss.set_id JOIN staff_core.scope_definition_revisions sr ON sr.revision_id=sm.revision_id AND sr.sealed CROSS JOIN tick
 JOIN staff_core.organization_current_segments_68 o ON o.org_id=v.org_id JOIN staff_core.organization_revisions r ON r.revision_id=o.revision_id
 WHERE v.scope_id=p_scope AND sr.scope_state='ACTIVE' AND sr.verification_status='CONFIRMED' AND sm.interpretation_state='CONFIRMED' AND sm.valid_from<=tick.at AND (sm.valid_to IS NULL OR tick.at<sm.valid_to) AND sr.valid_from<=tick.at AND (sr.valid_to IS NULL OR tick.at<sr.valid_to) AND o.interpretation_state='CONFIRMED' AND o.valid_period @>tick.business_day AND r.organization_state='ACTIVE'
 AND (v.scope_kind='ORG'
 OR(v.scope_kind='BUSINESS' AND EXISTS(SELECT 1 FROM staff_core.business_current_segments_77 b WHERE b.business_id=v.business_id AND b.org_id=v.org_id AND b.interpretation_state='CONFIRMED' AND b.verification_status='CONFIRMED' AND b.entity_state='ACTIVE' AND b.valid_period @>tick.business_day))
 OR(v.scope_kind='SITE' AND EXISTS(SELECT 1 FROM staff_core.site_current_segments_77 s WHERE s.site_id=v.site_id AND s.org_id=v.org_id AND s.interpretation_state='CONFIRMED' AND s.verification_status='CONFIRMED' AND s.entity_state='ACTIVE' AND s.valid_period @>tick.business_day))
 OR(v.scope_kind='DEPARTMENT' AND EXISTS(SELECT 1 FROM staff_core.department_current_segments_77 d WHERE d.department_id=v.department_id AND d.org_id=v.org_id AND d.interpretation_state='CONFIRMED' AND d.verification_status='CONFIRMED' AND d.entity_state='ACTIVE' AND d.valid_period @>tick.business_day))
 OR(v.scope_kind='BUSINESS_SITE' AND EXISTS(SELECT 1 FROM staff_core.business_site_current_segments_77 l JOIN staff_core.business_current_segments_77 b ON b.business_id=l.business_id AND b.org_id=l.org_id JOIN staff_core.site_current_segments_77 s ON s.site_id=l.site_id AND s.org_id=l.org_id WHERE l.org_id=v.org_id AND l.business_id=v.business_id AND l.site_id=v.site_id AND l.interpretation_state='CONFIRMED' AND l.verification_status='CONFIRMED' AND l.relationship_state='ACTIVE' AND l.valid_period @>tick.business_day AND b.interpretation_state='CONFIRMED' AND b.verification_status='CONFIRMED' AND b.entity_state='ACTIVE' AND b.valid_period @>tick.business_day AND s.interpretation_state='CONFIRMED' AND s.verification_status='CONFIRMED' AND s.entity_state='ACTIVE' AND s.valid_period @>tick.business_day)))) THEN 'REFERENCE_ACTIVE' ELSE 'REFERENCE_INACTIVE' END
$$;
CREATE FUNCTION staff_core.department_structure_reference_at_80(p_department uuid,p_at timestamptz) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 WITH RECURSIVE tick AS MATERIALIZED(SELECT (p_at AT TIME ZONE 'Asia/Tokyo')::date AS business_day),
 eligible AS MATERIALIZED(
 SELECT h.department_id,h.org_id,h.structure_kind,h.parent_department_id FROM staff_core.department_structure_current_segments_78 h
 JOIN staff_core.department_current_segments_77 d ON d.department_id=h.department_id AND d.org_id=h.org_id
 JOIN staff_core.organization_current_segments_68 o ON o.org_id=h.org_id JOIN staff_core.organization_revisions r ON r.revision_id=o.revision_id CROSS JOIN tick
 WHERE h.structure_state='ACTIVE' AND h.verification_status='CONFIRMED' AND h.interpretation_state='CONFIRMED' AND h.valid_period @>tick.business_day
 AND d.entity_state='ACTIVE' AND d.verification_status='CONFIRMED' AND d.interpretation_state='CONFIRMED' AND d.valid_period @>tick.business_day
 AND o.interpretation_state='CONFIRMED' AND o.valid_period @>tick.business_day AND r.organization_state='ACTIVE'
 AND (h.business_id IS NULL OR EXISTS(SELECT 1 FROM staff_core.business_current_segments_77 b WHERE b.business_id=h.business_id AND b.org_id=h.org_id AND b.entity_state='ACTIVE' AND b.verification_status='CONFIRMED' AND b.interpretation_state='CONFIRMED' AND b.valid_period @>tick.business_day))
 AND (h.site_id IS NULL OR EXISTS(SELECT 1 FROM staff_core.site_current_segments_77 s WHERE s.site_id=h.site_id AND s.org_id=h.org_id AND s.entity_state='ACTIVE' AND s.verification_status='CONFIRMED' AND s.interpretation_state='CONFIRMED' AND s.valid_period @>tick.business_day))
 AND (h.business_id IS NULL OR h.site_id IS NULL OR EXISTS(SELECT 1 FROM staff_core.business_site_current_segments_77 l WHERE l.business_id=h.business_id AND l.site_id=h.site_id AND l.org_id=h.org_id AND l.relationship_state='ACTIVE' AND l.verification_status='CONFIRMED' AND l.interpretation_state='CONFIRMED' AND l.valid_period @>tick.business_day))),
 lineage(department_id,org_id,structure_kind,parent_department_id,path) AS (
 SELECT e.department_id,e.org_id,e.structure_kind,e.parent_department_id,ARRAY[e.department_id] FROM eligible e WHERE e.department_id=p_department
 UNION ALL SELECT e.department_id,e.org_id,e.structure_kind,e.parent_department_id,w.path||e.department_id FROM lineage w JOIN eligible e ON e.department_id=w.parent_department_id AND e.org_id=w.org_id WHERE w.structure_kind='CHILD' AND NOT e.department_id=ANY(w.path))
 SELECT CASE WHEN EXISTS(SELECT 1 FROM lineage WHERE structure_kind='ROOT') THEN 'STRUCTURE_READY' ELSE 'STRUCTURE_NOT_READY' END
$$;
CREATE FUNCTION staff_core.assignment_reference_at_80(p_assignment uuid,p_at timestamptz) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 WITH tick AS MATERIALIZED(SELECT p_at at,(p_at AT TIME ZONE 'Asia/Tokyo')::date business_day)
 SELECT CASE WHEN EXISTS(SELECT 1 FROM staff_core.assignment_current_segments_80 a
 JOIN staff_core.persons p ON p.person_id=a.person_id JOIN staff_core.person_current_segments_65 ps ON ps.person_id=p.person_id
 JOIN staff_core.person_organizations po ON po.person_id=a.person_id AND po.org_id=a.org_id JOIN staff_core.person_organization_current_segments_68 os ON os.relation_id=po.relation_id JOIN staff_core.person_organization_revisions pr ON pr.revision_id=os.revision_id
 JOIN staff_core.scope_definitions sc ON sc.scope_id=a.scope_id AND sc.org_id=a.org_id CROSS JOIN tick
 WHERE a.assignment_id=p_assignment AND a.assignment_state='ACTIVE' AND a.verification_status='CONFIRMED' AND a.interpretation_state='CONFIRMED' AND a.valid_period @>tick.business_day
 AND p.record_status='CONFIRMED' AND p.merged_into_person_id IS NULL AND ps.interpretation_state='CONFIRMED' AND ps.valid_period @>tick.business_day
 AND os.interpretation_state='CONFIRMED' AND os.valid_period @>tick.business_day AND pr.relationship_state='ACTIVE' AND pr.verification_status='CONFIRMED'
 AND staff_core.scope_operating_reference_at_80(sc.scope_id,tick.at)='REFERENCE_ACTIVE'
 AND (sc.scope_kind<>'DEPARTMENT' OR staff_core.department_structure_reference_at_80(sc.department_id,tick.at)='STRUCTURE_READY')) THEN 'ASSIGNMENT_READY' ELSE 'ASSIGNMENT_NOT_READY' END
$$;
CREATE FUNCTION staff_core.assignment_reference_80(p_assignment uuid) RETURNS text LANGUAGE sql SET search_path='' AS $$
 WITH tick AS MATERIALIZED(SELECT clock_timestamp() at) SELECT staff_core.assignment_reference_at_80(p_assignment,tick.at) FROM tick
$$;
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['assignments','assignment_revisions_80','assignment_revision_sets_80','assignment_revision_set_members_80'] LOOP EXECUTE format('ALTER TABLE staff_core.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE staff_core.%I FORCE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON staff_core.%I FROM PUBLIC,anon,authenticated,service_role',n);END LOOP;END $$;
REVOKE ALL ON staff_core.assignment_current_segments_80 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION staff_core.assignment_identity_guard_80(),staff_core.assignment_consistency_80(),staff_core.scope_operating_reference_at_80(uuid,timestamptz),staff_core.department_structure_reference_at_80(uuid,timestamptz),staff_core.assignment_reference_at_80(uuid,timestamptz),staff_core.assignment_reference_80(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
