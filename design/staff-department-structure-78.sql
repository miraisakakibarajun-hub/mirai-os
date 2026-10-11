-- DEPARTMENT-STRUCTURE-78: unapplied candidate, not approval/permission.
-- After 76/77. Existing departments start with UNKNOWN hierarchy (NULL pointer).
BEGIN;
ALTER TABLE staff_core.departments ADD current_structure_set_id uuid;
CREATE TABLE staff_core.department_structure_revisions_78 (
 revision_id uuid PRIMARY KEY,department_id uuid NOT NULL,org_id uuid NOT NULL,revision_no bigint NOT NULL CHECK(revision_no>0),supersedes_revision_id uuid,
 structure_kind text NOT NULL CHECK(structure_kind IN ('ROOT','CHILD')),parent_department_id uuid,business_id uuid,site_id uuid,
 structure_state text NOT NULL CHECK(structure_state IN ('ACTIVE','ENDED')),verification_status text NOT NULL CHECK(verification_status IN ('CONFIRMED','UNVERIFIED')),
 valid_from date NOT NULL,valid_to date,CHECK(valid_to IS NULL OR valid_from<valid_to),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),change_reason text NOT NULL CHECK(length(btrim(change_reason))>0),
 FOREIGN KEY(department_id,org_id) REFERENCES staff_core.departments(department_id,org_id),
 FOREIGN KEY(parent_department_id,org_id) REFERENCES staff_core.departments(department_id,org_id),
 FOREIGN KEY(business_id,org_id) REFERENCES staff_core.businesses(business_id,org_id),FOREIGN KEY(site_id,org_id) REFERENCES staff_core.sites(site_id,org_id),
 CHECK((structure_kind='ROOT' AND parent_department_id IS NULL) OR (structure_kind='CHILD' AND parent_department_id IS NOT NULL)),CHECK(parent_department_id IS DISTINCT FROM department_id),
 UNIQUE(department_id,revision_id),UNIQUE(department_id,revision_no),FOREIGN KEY(department_id,supersedes_revision_id) REFERENCES staff_core.department_structure_revisions_78(department_id,revision_id),CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
CREATE TABLE staff_core.department_structure_revision_sets_78 (
 set_id uuid PRIMARY KEY,department_id uuid NOT NULL REFERENCES staff_core.departments(department_id),set_no bigint NOT NULL CHECK(set_no>0),previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,sealed boolean NOT NULL,
 UNIQUE(department_id,set_id),UNIQUE(department_id,set_no),FOREIGN KEY(department_id,previous_set_id) REFERENCES staff_core.department_structure_revision_sets_78(department_id,set_id),CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.department_structure_revision_set_members_78 (
 set_id uuid NOT NULL,department_id uuid NOT NULL,segment_no bigint NOT NULL CHECK(segment_no>0),revision_id uuid NOT NULL,valid_from date NOT NULL,valid_to date,
 interpretation_state text NOT NULL CHECK(interpretation_state IN ('CONFIRMED','UNVERIFIED','CANCELLED')),
 PRIMARY KEY(set_id,segment_no),CHECK(valid_to IS NULL OR valid_from<valid_to),FOREIGN KEY(department_id,set_id) REFERENCES staff_core.department_structure_revision_sets_78(department_id,set_id),FOREIGN KEY(department_id,revision_id) REFERENCES staff_core.department_structure_revisions_78(department_id,revision_id)
);
ALTER TABLE staff_core.departments ADD FOREIGN KEY(department_id,current_structure_set_id) REFERENCES staff_core.department_structure_revision_sets_78(department_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TRIGGER structure_revision_insert_78 BEFORE INSERT ON staff_core.department_structure_revisions_78 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_insert_77('department_id');
CREATE TRIGGER structure_revision_append_78 BEFORE UPDATE OR DELETE ON staff_core.department_structure_revisions_78 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_append_77();
CREATE TRIGGER structure_member_guard_78 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.department_structure_revision_set_members_78 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_member_guard_77('department_structure_revision_sets_78');
CREATE TRIGGER structure_set_guard_78 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.department_structure_revision_sets_78 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_set_guard_77('department_structure_revisions_78','department_structure_revision_set_members_78','department_id');
CREATE OR REPLACE FUNCTION staff_core.entity_identity_guard_76() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE stem text;kname text;k uuid;ok boolean;excluded text[]:=ARRAY['current_set_id','lock_version'];
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Organization identity deletion denied';END IF;
 IF TG_TABLE_NAME='departments' THEN excluded:=array_append(excluded,'current_structure_set_id');END IF;
 IF (to_jsonb(NEW)-excluded) IS DISTINCT FROM (to_jsonb(OLD)-excluded) OR NEW.lock_version<>OLD.lock_version+1 THEN RAISE EXCEPTION 'Organization identity version denied';END IF;
 CASE TG_TABLE_NAME WHEN 'businesses' THEN stem:='business';kname:='business_id';WHEN 'sites' THEN stem:='site';kname:='site_id';WHEN 'departments' THEN stem:='department';kname:='department_id';WHEN 'business_sites' THEN stem:='business_site';kname:='relation_id';ELSE RAISE EXCEPTION 'Unknown organization identity';END CASE;
 k:=(to_jsonb(NEW)->>kname)::uuid;
 IF NEW.current_set_id IS DISTINCT FROM OLD.current_set_id THEN
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM staff_core.%I WHERE %I=$1 AND set_id=$2 AND sealed AND previous_set_id=$3)',stem||'_revision_sets_77',kname) INTO ok USING k,NEW.current_set_id,OLD.current_set_id;
  IF NOT ok THEN RAISE EXCEPTION 'Organization current set successor required';END IF;
 END IF;
 IF TG_TABLE_NAME='departments' THEN
  IF NEW.current_structure_set_id IS DISTINCT FROM OLD.current_structure_set_id THEN
   IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Structure writes require read committed';END IF;
   -- DB fallback serialization; trusted writer must take org lock BEFORE department rows.
   PERFORM 1 FROM staff_core.organizations WHERE org_id=NEW.org_id FOR UPDATE;
   IF NEW.current_structure_set_id IS NULL THEN RAISE EXCEPTION 'Structure pointer clearing denied';END IF;
   SELECT EXISTS(SELECT 1 FROM staff_core.department_structure_revision_sets_78 WHERE department_id=NEW.department_id AND set_id=NEW.current_structure_set_id AND sealed AND previous_set_id IS NOT DISTINCT FROM OLD.current_structure_set_id) INTO ok;
   IF NOT ok THEN RAISE EXCEPTION 'Structure sealed successor required';END IF;
  END IF;
 END IF;RETURN NEW;
END $$;
CREATE VIEW staff_core.department_structure_current_segments_78 WITH(security_invoker=true) AS
 SELECT d.department_id,d.org_id,s.set_id,m.revision_id,m.valid_from,m.valid_to,m.interpretation_state,r.structure_kind,r.parent_department_id,r.business_id,r.site_id,r.structure_state,r.verification_status,
 daterange(m.valid_from,m.valid_to,'[)') AS valid_period,false AS authorization_verified
 FROM staff_core.departments d JOIN staff_core.department_structure_revision_sets_78 s ON s.department_id=d.department_id AND s.set_id=d.current_structure_set_id AND s.sealed
 JOIN staff_core.department_structure_revision_set_members_78 m ON m.set_id=s.set_id JOIN staff_core.department_structure_revisions_78 r ON r.revision_id=m.revision_id;
CREATE FUNCTION staff_core.department_structure_consistency_78() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE pointer uuid;ok boolean;
BEGIN
 SELECT current_structure_set_id INTO pointer FROM staff_core.departments WHERE department_id=NEW.department_id;
 IF pointer IS NULL THEN RETURN NULL;END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Structure writes require read committed';END IF;
 PERFORM 1 FROM staff_core.organizations WHERE org_id=NEW.org_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM staff_core.department_structure_revision_sets_78 WHERE department_id=NEW.department_id AND set_id=pointer AND sealed) THEN RAISE EXCEPTION 'Sealed structure current set required';END IF;
 WITH RECURSIVE edges AS MATERIALIZED(
 SELECT department_id,parent_department_id,valid_period FROM staff_core.department_structure_current_segments_78 WHERE org_id=NEW.org_id AND structure_state='ACTIVE' AND interpretation_state<>'CANCELLED' AND parent_department_id IS NOT NULL),
 walk(node,path,period,cycle) AS (
 SELECT parent_department_id,ARRAY[department_id,parent_department_id],valid_period,parent_department_id=department_id FROM edges
 UNION ALL SELECT e.parent_department_id,w.path||e.parent_department_id,w.period*e.valid_period,e.parent_department_id=ANY(w.path)
 FROM walk w JOIN edges e ON e.department_id=w.node AND e.valid_period&&w.period WHERE NOT w.cycle)
 SELECT EXISTS(SELECT 1 FROM walk WHERE cycle) INTO ok;
 IF ok THEN RAISE EXCEPTION 'Department hierarchy temporal cycle';END IF;
 SELECT EXISTS(SELECT 1 FROM staff_core.department_structure_current_segments_78 c JOIN staff_core.department_structure_current_segments_78 p ON p.department_id=c.parent_department_id AND p.org_id=c.org_id AND p.valid_period&&c.valid_period
 WHERE c.org_id=NEW.org_id AND c.structure_state='ACTIVE' AND p.structure_state='ACTIVE' AND c.interpretation_state<>'CANCELLED' AND p.interpretation_state<>'CANCELLED'
 AND ((p.business_id IS NOT NULL AND c.business_id IS DISTINCT FROM p.business_id) OR(p.site_id IS NOT NULL AND c.site_id IS DISTINCT FROM p.site_id))) INTO ok;
 IF ok THEN RAISE EXCEPTION 'Department child context contradicts parent';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER department_structure_consistency_78 AFTER INSERT OR UPDATE ON staff_core.departments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.department_structure_consistency_78();
CREATE FUNCTION staff_core.department_structure_reference_78(p_department uuid) RETURNS text LANGUAGE sql SET search_path='' AS $$
 WITH RECURSIVE tick AS MATERIALIZED(SELECT (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date AS business_day),
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
ALTER TABLE staff_core.department_structure_revisions_78 ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.department_structure_revisions_78 FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_core.department_structure_revision_sets_78 ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.department_structure_revision_sets_78 FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_core.department_structure_revision_set_members_78 ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.department_structure_revision_set_members_78 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.department_structure_revisions_78,staff_core.department_structure_revision_sets_78,staff_core.department_structure_revision_set_members_78,staff_core.department_structure_current_segments_78 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION staff_core.entity_identity_guard_76(),staff_core.department_structure_consistency_78(),staff_core.department_structure_reference_78(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
