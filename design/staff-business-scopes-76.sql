-- BUSINESS-SCOPE-76 / review-only structural reference proposal.
-- No hierarchical permission inheritance; no actor authorization.
-- Requires organizations/actors68, operations72. Entity histories and
-- business_sites relationships are NOT supplied by these identity registries.
BEGIN;
CREATE TABLE staff_core.businesses (
 business_id uuid PRIMARY KEY,org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),
 business_code text NOT NULL CHECK(length(btrim(business_code))>0),
 created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),created_at timestamptz NOT NULL,
 UNIQUE(business_id,org_id),UNIQUE(org_id,business_code)
);
CREATE TABLE staff_core.sites (
 site_id uuid PRIMARY KEY,org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),
 site_code text NOT NULL CHECK(length(btrim(site_code))>0),
 created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),created_at timestamptz NOT NULL,
 UNIQUE(site_id,org_id),UNIQUE(org_id,site_code)
);
CREATE TABLE staff_core.departments (
 department_id uuid PRIMARY KEY,org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),
 department_code text NOT NULL CHECK(length(btrim(department_code))>0),
 created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),created_at timestamptz NOT NULL,
 UNIQUE(department_id,org_id),UNIQUE(org_id,department_code)
);
CREATE TABLE staff_core.scope_definitions (
 scope_id uuid PRIMARY KEY,org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),
 scope_kind text NOT NULL CHECK(scope_kind IN ('ORG','BUSINESS','SITE','DEPARTMENT','BUSINESS_SITE')),
 business_id uuid,site_id uuid,department_id uuid,current_set_id uuid NOT NULL,
 lock_version bigint NOT NULL CHECK(lock_version>0),created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),created_at timestamptz NOT NULL,
 UNIQUE(scope_id,org_id),UNIQUE NULLS NOT DISTINCT(org_id,scope_kind,business_id,site_id,department_id),
 FOREIGN KEY(business_id,org_id) REFERENCES staff_core.businesses(business_id,org_id),
 FOREIGN KEY(site_id,org_id) REFERENCES staff_core.sites(site_id,org_id),
 FOREIGN KEY(department_id,org_id) REFERENCES staff_core.departments(department_id,org_id),
 CHECK((scope_kind='ORG' AND business_id IS NULL AND site_id IS NULL AND department_id IS NULL)
 OR(scope_kind='BUSINESS' AND business_id IS NOT NULL AND site_id IS NULL AND department_id IS NULL)
 OR(scope_kind='SITE' AND business_id IS NULL AND site_id IS NOT NULL AND department_id IS NULL)
 OR(scope_kind='DEPARTMENT' AND business_id IS NULL AND site_id IS NULL AND department_id IS NOT NULL)
 OR(scope_kind='BUSINESS_SITE' AND business_id IS NOT NULL AND site_id IS NOT NULL AND department_id IS NULL))
);
CREATE TABLE staff_core.scope_definition_revisions (
 revision_id uuid PRIMARY KEY,scope_id uuid NOT NULL,org_id uuid NOT NULL,revision_no bigint NOT NULL CHECK(revision_no>0),supersedes_revision_id uuid,
 scope_name text NOT NULL CHECK(length(btrim(scope_name))>0),scope_state text NOT NULL CHECK(scope_state IN ('ACTIVE','STOPPED')),
 verification_status text NOT NULL CHECK(verification_status IN ('CONFIRMED','UNVERIFIED')),
 valid_from timestamptz NOT NULL,valid_to timestamptz,CHECK(valid_to IS NULL OR valid_from<valid_to),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),sealed boolean NOT NULL,
 FOREIGN KEY(scope_id,org_id) REFERENCES staff_core.scope_definitions(scope_id,org_id),
 UNIQUE(scope_id,revision_id,org_id),UNIQUE(scope_id,revision_id),UNIQUE(scope_id,revision_no),
 FOREIGN KEY(scope_id,supersedes_revision_id) REFERENCES staff_core.scope_definition_revisions(scope_id,revision_id),CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
CREATE TABLE staff_core.scope_revision_sets_76 (
 set_id uuid PRIMARY KEY,scope_id uuid NOT NULL REFERENCES staff_core.scope_definitions(scope_id),set_no bigint NOT NULL CHECK(set_no>0),previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,sealed boolean NOT NULL,
 UNIQUE(scope_id,set_id),UNIQUE(scope_id,set_no),
 FOREIGN KEY(scope_id,previous_set_id) REFERENCES staff_core.scope_revision_sets_76(scope_id,set_id),CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.scope_revision_set_members_76 (
 set_id uuid NOT NULL,scope_id uuid NOT NULL,segment_no bigint NOT NULL CHECK(segment_no>0),revision_id uuid NOT NULL,
 valid_from timestamptz NOT NULL,valid_to timestamptz,interpretation_state text NOT NULL CHECK(interpretation_state IN ('CONFIRMED','UNVERIFIED','CANCELLED')),
 PRIMARY KEY(set_id,segment_no),CHECK(valid_to IS NULL OR valid_from<valid_to),
 FOREIGN KEY(scope_id,set_id) REFERENCES staff_core.scope_revision_sets_76(scope_id,set_id),
 FOREIGN KEY(scope_id,revision_id) REFERENCES staff_core.scope_definition_revisions(scope_id,revision_id)
);
ALTER TABLE staff_core.scope_definitions ADD FOREIGN KEY(scope_id,current_set_id) REFERENCES staff_core.scope_revision_sets_76(scope_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION staff_core.entity_identity_guard_76() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Organization entity identity immutable';END $$;
CREATE TRIGGER business_identity_guard_76 BEFORE UPDATE OR DELETE ON staff_core.businesses FOR EACH ROW EXECUTE FUNCTION staff_core.entity_identity_guard_76();
CREATE TRIGGER site_identity_guard_76 BEFORE UPDATE OR DELETE ON staff_core.sites FOR EACH ROW EXECUTE FUNCTION staff_core.entity_identity_guard_76();
CREATE TRIGGER department_identity_guard_76 BEFORE UPDATE OR DELETE ON staff_core.departments FOR EACH ROW EXECUTE FUNCTION staff_core.entity_identity_guard_76();
CREATE FUNCTION staff_core.scope_member_guard_76() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Business scope member immutable';END IF;
 PERFORM 1 FROM staff_core.scope_revision_sets_76 WHERE set_id=NEW.set_id AND sealed=false FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unsealed business scope set required';END IF;RETURN NEW;
END $$;
CREATE TRIGGER scope_member_guard_76 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.scope_revision_set_members_76 FOR EACH ROW EXECUTE FUNCTION staff_core.scope_member_guard_76();
CREATE FUNCTION staff_core.scope_seal_guard_76() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE prev uuid;no bigint;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Business scope history deletion denied';END IF;
 IF TG_OP='INSERT' THEN IF NEW.sealed THEN RAISE EXCEPTION 'Business scope must start unsealed';END IF;RETURN NEW;END IF;
 IF OLD.sealed OR NOT NEW.sealed OR (to_jsonb(NEW)-'sealed') IS DISTINCT FROM (to_jsonb(OLD)-'sealed') THEN RAISE EXCEPTION 'Only business scope sealing permitted';END IF;
 IF TG_TABLE_NAME='scope_definition_revisions' THEN
  prev:=NEW.supersedes_revision_id;no:=NEW.revision_no;
  IF prev IS NOT NULL AND NOT EXISTS(SELECT 1 FROM staff_core.scope_definition_revisions WHERE scope_id=NEW.scope_id AND revision_id=prev AND sealed AND revision_no<no) THEN RAISE EXCEPTION 'Sealed scope predecessor required';END IF;
 ELSE
  prev:=NEW.previous_set_id;no:=NEW.set_no;
  IF prev IS NOT NULL AND NOT EXISTS(SELECT 1 FROM staff_core.scope_revision_sets_76 WHERE scope_id=NEW.scope_id AND set_id=prev AND sealed AND set_no<no) THEN RAISE EXCEPTION 'Sealed scope set predecessor required';END IF;
  IF NOT EXISTS(SELECT 1 FROM staff_core.scope_revision_set_members_76 WHERE set_id=NEW.set_id) THEN RAISE EXCEPTION 'Scope set must have segments';END IF;
  IF EXISTS(SELECT 1 FROM staff_core.scope_revision_set_members_76 m JOIN staff_core.scope_definition_revisions r ON r.revision_id=m.revision_id WHERE m.set_id=NEW.set_id AND (NOT r.sealed OR m.valid_from<r.valid_from OR (r.valid_to IS NOT NULL AND (m.valid_to IS NULL OR m.valid_to>r.valid_to)))) THEN RAISE EXCEPTION 'Scope segment outside sealed revision';END IF;
  IF EXISTS(SELECT 1 FROM staff_core.scope_revision_set_members_76 a JOIN staff_core.scope_revision_set_members_76 b ON a.set_id=b.set_id AND a.segment_no<b.segment_no WHERE a.set_id=NEW.set_id AND a.interpretation_state<>'CANCELLED' AND b.interpretation_state<>'CANCELLED' AND tstzrange(a.valid_from,a.valid_to,'[)') && tstzrange(b.valid_from,b.valid_to,'[)')) THEN RAISE EXCEPTION 'Scope segments overlap';END IF;
 END IF;
 IF prev IS NULL AND no<>1 THEN RAISE EXCEPTION 'Initial scope version must be one';END IF;RETURN NEW;
END $$;
CREATE TRIGGER scope_revision_guard_76 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.scope_definition_revisions FOR EACH ROW EXECUTE FUNCTION staff_core.scope_seal_guard_76();
CREATE TRIGGER scope_set_guard_76 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.scope_revision_sets_76 FOR EACH ROW EXECUTE FUNCTION staff_core.scope_seal_guard_76();
CREATE FUNCTION staff_core.scope_identity_guard_76() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Business scope identity deletion denied';END IF;
 IF (to_jsonb(NEW)-ARRAY['current_set_id','lock_version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['current_set_id','lock_version']) OR NEW.lock_version<>OLD.lock_version+1 THEN RAISE EXCEPTION 'Business scope identity version denied';END IF;
 IF NEW.current_set_id IS DISTINCT FROM OLD.current_set_id AND NOT EXISTS(SELECT 1 FROM staff_core.scope_revision_sets_76 WHERE scope_id=NEW.scope_id AND set_id=NEW.current_set_id AND sealed AND previous_set_id=OLD.current_set_id) THEN RAISE EXCEPTION 'Business scope current set successor required';END IF;RETURN NEW;
END $$;
CREATE TRIGGER scope_identity_guard_76 BEFORE UPDATE OR DELETE ON staff_core.scope_definitions FOR EACH ROW EXECUTE FUNCTION staff_core.scope_identity_guard_76();
CREATE FUNCTION staff_core.scope_history_required_76() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM staff_core.scope_definitions d JOIN staff_core.scope_revision_sets_76 s ON s.scope_id=d.scope_id AND s.set_id=d.current_set_id WHERE d.scope_id=NEW.scope_id AND s.sealed) THEN RAISE EXCEPTION 'Sealed business scope current set required';END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER scope_history_required_76 AFTER INSERT OR UPDATE ON staff_core.scope_definitions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.scope_history_required_76();
CREATE VIEW staff_core.scope_reference_candidates_76 WITH(security_invoker=true) AS
 WITH tick AS MATERIALIZED(SELECT clock_timestamp() t)
 SELECT d.scope_id,d.org_id,d.scope_kind,d.business_id,d.site_id,d.department_id,s.set_id,m.revision_id,
 r.scope_name,r.scope_state,r.verification_status,false AS authorization_verified
 FROM staff_core.scope_definitions d JOIN staff_core.scope_revision_sets_76 s ON s.scope_id=d.scope_id AND s.set_id=d.current_set_id AND s.sealed
 JOIN staff_core.scope_revision_set_members_76 m ON m.set_id=s.set_id JOIN staff_core.scope_definition_revisions r ON r.revision_id=m.revision_id AND r.sealed CROSS JOIN tick
 WHERE m.interpretation_state='CONFIRMED' AND m.valid_from<=tick.t AND (m.valid_to IS NULL OR tick.t<m.valid_to)
 AND r.valid_from<=tick.t AND (r.valid_to IS NULL OR tick.t<r.valid_to);
-- Exact typed tuple identity, NOT hierarchy containment or permission.
CREATE FUNCTION staff_core.scope_reference_match_76(p_scope uuid,p_org uuid,p_kind text,p_business uuid,p_site uuid,p_department uuid) RETURNS text LANGUAGE sql SET search_path='' AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM staff_core.scope_reference_candidates_76 v WHERE v.scope_id=p_scope AND v.org_id=p_org AND v.scope_kind=p_kind
 AND v.business_id IS NOT DISTINCT FROM p_business AND v.site_id IS NOT DISTINCT FROM p_site AND v.department_id IS NOT DISTINCT FROM p_department
 AND v.scope_state='ACTIVE' AND v.verification_status='CONFIRMED') THEN 'STRUCTURE_MATCH' ELSE 'STRUCTURE_MISMATCH' END
$$;
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['businesses','sites','departments','scope_definitions','scope_definition_revisions','scope_revision_sets_76','scope_revision_set_members_76'] LOOP
 EXECUTE format('ALTER TABLE staff_core.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE staff_core.%I FORCE ROW LEVEL SECURITY',n);
 EXECUTE format('REVOKE ALL ON staff_core.%I FROM PUBLIC,anon,authenticated,service_role',n);END LOOP;END $$;
REVOKE ALL ON staff_core.scope_reference_candidates_76 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION staff_core.entity_identity_guard_76(),staff_core.scope_member_guard_76(),staff_core.scope_seal_guard_76(),staff_core.scope_identity_guard_76(),staff_core.scope_history_required_76(),staff_core.scope_reference_match_76(uuid,uuid,text,uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
