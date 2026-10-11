-- ORGANIZATION-HISTORY-77: unapplied candidate, not actor authorization.
-- Fresh candidate schema only. Requires 68/72/76; no synthetic backfill.
BEGIN;
LOCK TABLE staff_core.businesses,staff_core.sites,staff_core.departments IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM staff_core.businesses) OR EXISTS(SELECT 1 FROM staff_core.sites) OR EXISTS(SELECT 1 FROM staff_core.departments) THEN RAISE EXCEPTION '77 requires empty identities or separately reviewed real history backfill';END IF;END $$;
ALTER TABLE staff_core.businesses ADD current_set_id uuid NOT NULL,ADD lock_version bigint NOT NULL CHECK(lock_version>0);
ALTER TABLE staff_core.sites ADD current_set_id uuid NOT NULL,ADD lock_version bigint NOT NULL CHECK(lock_version>0);
ALTER TABLE staff_core.departments ADD current_set_id uuid NOT NULL,ADD lock_version bigint NOT NULL CHECK(lock_version>0);
CREATE TABLE staff_core.business_sites (
 relation_id uuid PRIMARY KEY,org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),business_id uuid NOT NULL,site_id uuid NOT NULL,
 created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),created_at timestamptz NOT NULL,current_set_id uuid NOT NULL,lock_version bigint NOT NULL CHECK(lock_version>0),
 FOREIGN KEY(business_id,org_id) REFERENCES staff_core.businesses(business_id,org_id),FOREIGN KEY(site_id,org_id) REFERENCES staff_core.sites(site_id,org_id),
 UNIQUE(relation_id,org_id),UNIQUE(org_id,business_id,site_id)
);
CREATE TABLE staff_core.business_revisions_77 (
 revision_id uuid PRIMARY KEY,business_id uuid NOT NULL,org_id uuid NOT NULL,revision_no bigint NOT NULL CHECK(revision_no>0),supersedes_revision_id uuid,
 entity_name text NOT NULL CHECK(length(btrim(entity_name))>0),entity_kind text NOT NULL CHECK(length(btrim(entity_kind))>0),entity_state text NOT NULL CHECK(entity_state IN ('ACTIVE','STOPPED','ENDED')),
 verification_status text NOT NULL CHECK(verification_status IN ('CONFIRMED','UNVERIFIED')),valid_from date NOT NULL,valid_to date,CHECK(valid_to IS NULL OR valid_from<valid_to),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),change_reason text NOT NULL CHECK(length(btrim(change_reason))>0),
 FOREIGN KEY(business_id,org_id) REFERENCES staff_core.businesses(business_id,org_id),
 UNIQUE(business_id,revision_id),UNIQUE(business_id,revision_no),FOREIGN KEY(business_id,supersedes_revision_id) REFERENCES staff_core.business_revisions_77(business_id,revision_id),CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
CREATE TABLE staff_core.business_revision_sets_77 (
 set_id uuid PRIMARY KEY,business_id uuid NOT NULL REFERENCES staff_core.businesses(business_id),set_no bigint NOT NULL CHECK(set_no>0),previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,sealed boolean NOT NULL,
 UNIQUE(business_id,set_id),UNIQUE(business_id,set_no),FOREIGN KEY(business_id,previous_set_id) REFERENCES staff_core.business_revision_sets_77(business_id,set_id),CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.business_revision_set_members_77 (
 set_id uuid NOT NULL,business_id uuid NOT NULL,segment_no bigint NOT NULL CHECK(segment_no>0),revision_id uuid NOT NULL,
 valid_from date NOT NULL,valid_to date,interpretation_state text NOT NULL CHECK(interpretation_state IN ('CONFIRMED','UNVERIFIED','CANCELLED')),
 PRIMARY KEY(set_id,segment_no),CHECK(valid_to IS NULL OR valid_from<valid_to),FOREIGN KEY(business_id,set_id) REFERENCES staff_core.business_revision_sets_77(business_id,set_id),FOREIGN KEY(business_id,revision_id) REFERENCES staff_core.business_revisions_77(business_id,revision_id)
);
ALTER TABLE staff_core.businesses ADD FOREIGN KEY(business_id,current_set_id) REFERENCES staff_core.business_revision_sets_77(business_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE staff_core.site_revisions_77 (
 revision_id uuid PRIMARY KEY,site_id uuid NOT NULL,org_id uuid NOT NULL,revision_no bigint NOT NULL CHECK(revision_no>0),supersedes_revision_id uuid,
 entity_name text NOT NULL CHECK(length(btrim(entity_name))>0),entity_kind text NOT NULL CHECK(length(btrim(entity_kind))>0),entity_state text NOT NULL CHECK(entity_state IN ('ACTIVE','STOPPED','ENDED')),
 verification_status text NOT NULL CHECK(verification_status IN ('CONFIRMED','UNVERIFIED')),valid_from date NOT NULL,valid_to date,CHECK(valid_to IS NULL OR valid_from<valid_to),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),change_reason text NOT NULL CHECK(length(btrim(change_reason))>0),
 FOREIGN KEY(site_id,org_id) REFERENCES staff_core.sites(site_id,org_id),
 UNIQUE(site_id,revision_id),UNIQUE(site_id,revision_no),FOREIGN KEY(site_id,supersedes_revision_id) REFERENCES staff_core.site_revisions_77(site_id,revision_id),CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
CREATE TABLE staff_core.site_revision_sets_77 (
 set_id uuid PRIMARY KEY,site_id uuid NOT NULL REFERENCES staff_core.sites(site_id),set_no bigint NOT NULL CHECK(set_no>0),previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,sealed boolean NOT NULL,
 UNIQUE(site_id,set_id),UNIQUE(site_id,set_no),FOREIGN KEY(site_id,previous_set_id) REFERENCES staff_core.site_revision_sets_77(site_id,set_id),CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.site_revision_set_members_77 (
 set_id uuid NOT NULL,site_id uuid NOT NULL,segment_no bigint NOT NULL CHECK(segment_no>0),revision_id uuid NOT NULL,
 valid_from date NOT NULL,valid_to date,interpretation_state text NOT NULL CHECK(interpretation_state IN ('CONFIRMED','UNVERIFIED','CANCELLED')),
 PRIMARY KEY(set_id,segment_no),CHECK(valid_to IS NULL OR valid_from<valid_to),FOREIGN KEY(site_id,set_id) REFERENCES staff_core.site_revision_sets_77(site_id,set_id),FOREIGN KEY(site_id,revision_id) REFERENCES staff_core.site_revisions_77(site_id,revision_id)
);
ALTER TABLE staff_core.sites ADD FOREIGN KEY(site_id,current_set_id) REFERENCES staff_core.site_revision_sets_77(site_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE staff_core.department_revisions_77 (
 revision_id uuid PRIMARY KEY,department_id uuid NOT NULL,org_id uuid NOT NULL,revision_no bigint NOT NULL CHECK(revision_no>0),supersedes_revision_id uuid,
 entity_name text NOT NULL CHECK(length(btrim(entity_name))>0),entity_kind text NOT NULL CHECK(length(btrim(entity_kind))>0),entity_state text NOT NULL CHECK(entity_state IN ('ACTIVE','STOPPED','ENDED')),
 verification_status text NOT NULL CHECK(verification_status IN ('CONFIRMED','UNVERIFIED')),valid_from date NOT NULL,valid_to date,CHECK(valid_to IS NULL OR valid_from<valid_to),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),change_reason text NOT NULL CHECK(length(btrim(change_reason))>0),
 FOREIGN KEY(department_id,org_id) REFERENCES staff_core.departments(department_id,org_id),
 UNIQUE(department_id,revision_id),UNIQUE(department_id,revision_no),FOREIGN KEY(department_id,supersedes_revision_id) REFERENCES staff_core.department_revisions_77(department_id,revision_id),CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
CREATE TABLE staff_core.department_revision_sets_77 (
 set_id uuid PRIMARY KEY,department_id uuid NOT NULL REFERENCES staff_core.departments(department_id),set_no bigint NOT NULL CHECK(set_no>0),previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,sealed boolean NOT NULL,
 UNIQUE(department_id,set_id),UNIQUE(department_id,set_no),FOREIGN KEY(department_id,previous_set_id) REFERENCES staff_core.department_revision_sets_77(department_id,set_id),CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.department_revision_set_members_77 (
 set_id uuid NOT NULL,department_id uuid NOT NULL,segment_no bigint NOT NULL CHECK(segment_no>0),revision_id uuid NOT NULL,
 valid_from date NOT NULL,valid_to date,interpretation_state text NOT NULL CHECK(interpretation_state IN ('CONFIRMED','UNVERIFIED','CANCELLED')),
 PRIMARY KEY(set_id,segment_no),CHECK(valid_to IS NULL OR valid_from<valid_to),FOREIGN KEY(department_id,set_id) REFERENCES staff_core.department_revision_sets_77(department_id,set_id),FOREIGN KEY(department_id,revision_id) REFERENCES staff_core.department_revisions_77(department_id,revision_id)
);
ALTER TABLE staff_core.departments ADD FOREIGN KEY(department_id,current_set_id) REFERENCES staff_core.department_revision_sets_77(department_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE staff_core.business_site_revisions_77 (
 revision_id uuid PRIMARY KEY,relation_id uuid NOT NULL,org_id uuid NOT NULL,revision_no bigint NOT NULL CHECK(revision_no>0),supersedes_revision_id uuid,
 relationship_state text NOT NULL CHECK(relationship_state IN ('ACTIVE','ENDED')),
 verification_status text NOT NULL CHECK(verification_status IN ('CONFIRMED','UNVERIFIED')),valid_from date NOT NULL,valid_to date,CHECK(valid_to IS NULL OR valid_from<valid_to),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),change_reason text NOT NULL CHECK(length(btrim(change_reason))>0),
 FOREIGN KEY(relation_id,org_id) REFERENCES staff_core.business_sites(relation_id,org_id),
 UNIQUE(relation_id,revision_id),UNIQUE(relation_id,revision_no),FOREIGN KEY(relation_id,supersedes_revision_id) REFERENCES staff_core.business_site_revisions_77(relation_id,revision_id),CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
CREATE TABLE staff_core.business_site_revision_sets_77 (
 set_id uuid PRIMARY KEY,relation_id uuid NOT NULL REFERENCES staff_core.business_sites(relation_id),set_no bigint NOT NULL CHECK(set_no>0),previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,sealed boolean NOT NULL,
 UNIQUE(relation_id,set_id),UNIQUE(relation_id,set_no),FOREIGN KEY(relation_id,previous_set_id) REFERENCES staff_core.business_site_revision_sets_77(relation_id,set_id),CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.business_site_revision_set_members_77 (
 set_id uuid NOT NULL,relation_id uuid NOT NULL,segment_no bigint NOT NULL CHECK(segment_no>0),revision_id uuid NOT NULL,
 valid_from date NOT NULL,valid_to date,interpretation_state text NOT NULL CHECK(interpretation_state IN ('CONFIRMED','UNVERIFIED','CANCELLED')),
 PRIMARY KEY(set_id,segment_no),CHECK(valid_to IS NULL OR valid_from<valid_to),FOREIGN KEY(relation_id,set_id) REFERENCES staff_core.business_site_revision_sets_77(relation_id,set_id),FOREIGN KEY(relation_id,revision_id) REFERENCES staff_core.business_site_revisions_77(relation_id,revision_id)
);
ALTER TABLE staff_core.business_sites ADD FOREIGN KEY(relation_id,current_set_id) REFERENCES staff_core.business_site_revision_sets_77(relation_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION staff_core.organization_revision_insert_77() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k uuid;ok boolean;
BEGIN
 IF NEW.supersedes_revision_id IS NULL THEN IF NEW.revision_no<>1 THEN RAISE EXCEPTION 'Initial organization revision must be one';END IF;
 ELSE k:=(to_jsonb(NEW)->>TG_ARGV[0])::uuid;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM staff_core.%I WHERE %I=$1 AND revision_id=$2 AND revision_no<$3)',TG_TABLE_NAME,TG_ARGV[0]) INTO ok USING k,NEW.supersedes_revision_id,NEW.revision_no;
 IF NOT ok THEN RAISE EXCEPTION 'Prior organization revision required';END IF;END IF;RETURN NEW;
END $$;
CREATE FUNCTION staff_core.organization_revision_append_77() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Organization history immutable';END $$;
CREATE FUNCTION staff_core.organization_member_guard_77() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE closed boolean;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Organization segment immutable';END IF;
 EXECUTE format('SELECT sealed FROM staff_core.%I WHERE set_id=$1 FOR UPDATE',TG_ARGV[0]) INTO closed USING NEW.set_id;
 IF closed IS DISTINCT FROM false THEN RAISE EXCEPTION 'Unsealed organization set required';END IF;RETURN NEW;
END $$;
CREATE FUNCTION staff_core.organization_set_guard_77() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k uuid;ok boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Organization set deletion denied';END IF;
 IF TG_OP='INSERT' THEN IF NEW.sealed THEN RAISE EXCEPTION 'Organization set starts unsealed';END IF;RETURN NEW;END IF;
 IF OLD.sealed OR NOT NEW.sealed OR (to_jsonb(NEW)-'sealed') IS DISTINCT FROM (to_jsonb(OLD)-'sealed') THEN RAISE EXCEPTION 'Only organization set sealing permitted';END IF;
 k:=(to_jsonb(NEW)->>TG_ARGV[2])::uuid;
 IF NEW.previous_set_id IS NULL THEN
  IF NEW.set_no<>1 THEN RAISE EXCEPTION 'Initial organization set must be one';END IF;
 ELSE
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM staff_core.%I WHERE %I=$1 AND set_id=$2 AND sealed AND set_no<$3)',TG_TABLE_NAME,TG_ARGV[2]) INTO ok USING k,NEW.previous_set_id,NEW.set_no;
  IF NOT ok THEN RAISE EXCEPTION 'Sealed organization predecessor required';END IF;
 END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM staff_core.%I WHERE set_id=$1)',TG_ARGV[1]) INTO ok USING NEW.set_id;
 IF NOT ok THEN RAISE EXCEPTION 'Organization set requires segments';END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM staff_core.%I m JOIN staff_core.%I r ON r.revision_id=m.revision_id WHERE m.set_id=$1 AND (m.valid_from<r.valid_from OR (r.valid_to IS NOT NULL AND (m.valid_to IS NULL OR m.valid_to>r.valid_to))))',TG_ARGV[1],TG_ARGV[0]) INTO ok USING NEW.set_id;
 IF ok THEN RAISE EXCEPTION 'Organization segment outside revision';END IF;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM staff_core.%I a JOIN staff_core.%I b ON a.set_id=b.set_id AND a.segment_no<b.segment_no WHERE a.set_id=$1 AND a.interpretation_state<>''CANCELLED'' AND b.interpretation_state<>''CANCELLED'' AND daterange(a.valid_from,a.valid_to,''[)'') && daterange(b.valid_from,b.valid_to,''[)''))',TG_ARGV[1],TG_ARGV[1]) INTO ok USING NEW.set_id;
 IF ok THEN RAISE EXCEPTION 'Organization segments overlap';END IF;RETURN NEW;
END $$;
-- Replaces only the 76 identity UPDATE guard. Code, org and creation stay fixed.
CREATE OR REPLACE FUNCTION staff_core.entity_identity_guard_76() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE stem text;kname text;k uuid;ok boolean;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Organization identity deletion denied';END IF;
 IF (to_jsonb(NEW)-ARRAY['current_set_id','lock_version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['current_set_id','lock_version']) OR NEW.lock_version<>OLD.lock_version+1 THEN RAISE EXCEPTION 'Organization identity version denied';END IF;
 CASE TG_TABLE_NAME WHEN 'businesses' THEN stem:='business';kname:='business_id';WHEN 'sites' THEN stem:='site';kname:='site_id';WHEN 'departments' THEN stem:='department';kname:='department_id';WHEN 'business_sites' THEN stem:='business_site';kname:='relation_id';ELSE RAISE EXCEPTION 'Unknown organization identity';END CASE;
 k:=(to_jsonb(NEW)->>kname)::uuid;
 IF NEW.current_set_id IS DISTINCT FROM OLD.current_set_id THEN
  EXECUTE format('SELECT EXISTS(SELECT 1 FROM staff_core.%I WHERE %I=$1 AND set_id=$2 AND sealed AND previous_set_id=$3)',stem||'_revision_sets_77',kname) INTO ok USING k,NEW.current_set_id,OLD.current_set_id;
  IF NOT ok THEN RAISE EXCEPTION 'Organization current set successor required';END IF;
 END IF;RETURN NEW;
END $$;
CREATE FUNCTION staff_core.organization_history_required_77() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE k uuid;ok boolean;
BEGIN
 k:=(to_jsonb(NEW)->>TG_ARGV[1])::uuid;
 EXECUTE format('SELECT EXISTS(SELECT 1 FROM staff_core.%I i JOIN staff_core.%I s ON s.%I=i.%I AND s.set_id=i.current_set_id WHERE i.%I=$1 AND s.sealed)',TG_TABLE_NAME,TG_ARGV[0],TG_ARGV[1],TG_ARGV[1],TG_ARGV[1]) INTO ok USING k;
 IF NOT ok THEN RAISE EXCEPTION 'Sealed organization current set required';END IF;RETURN NULL;
END $$;
CREATE TRIGGER business_site_identity_guard_77 BEFORE UPDATE OR DELETE ON staff_core.business_sites FOR EACH ROW EXECUTE FUNCTION staff_core.entity_identity_guard_76();
CREATE TRIGGER business_revision_insert_77 BEFORE INSERT ON staff_core.business_revisions_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_insert_77('business_id');
CREATE TRIGGER business_append_77 BEFORE UPDATE OR DELETE ON staff_core.business_revisions_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_append_77();
CREATE TRIGGER business_member_guard_77 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.business_revision_set_members_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_member_guard_77('business_revision_sets_77');
CREATE TRIGGER business_set_guard_77 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.business_revision_sets_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_set_guard_77('business_revisions_77','business_revision_set_members_77','business_id');
CREATE CONSTRAINT TRIGGER business_history_required_77 AFTER INSERT OR UPDATE ON staff_core.businesses DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.organization_history_required_77('business_revision_sets_77','business_id');
CREATE VIEW staff_core.business_current_segments_77 WITH(security_invoker=true) AS
 SELECT i.*,s.set_id,m.segment_no,m.revision_id,m.valid_from,m.valid_to,m.interpretation_state,
 r.verification_status,r.entity_name,r.entity_kind,r.entity_state,daterange(m.valid_from,m.valid_to,'[)') AS valid_period
 FROM staff_core.businesses i JOIN staff_core.business_revision_sets_77 s ON s.business_id=i.business_id AND s.set_id=i.current_set_id AND s.sealed
 JOIN staff_core.business_revision_set_members_77 m ON m.set_id=s.set_id JOIN staff_core.business_revisions_77 r ON r.revision_id=m.revision_id;
CREATE TRIGGER site_revision_insert_77 BEFORE INSERT ON staff_core.site_revisions_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_insert_77('site_id');
CREATE TRIGGER site_append_77 BEFORE UPDATE OR DELETE ON staff_core.site_revisions_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_append_77();
CREATE TRIGGER site_member_guard_77 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.site_revision_set_members_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_member_guard_77('site_revision_sets_77');
CREATE TRIGGER site_set_guard_77 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.site_revision_sets_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_set_guard_77('site_revisions_77','site_revision_set_members_77','site_id');
CREATE CONSTRAINT TRIGGER site_history_required_77 AFTER INSERT OR UPDATE ON staff_core.sites DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.organization_history_required_77('site_revision_sets_77','site_id');
CREATE VIEW staff_core.site_current_segments_77 WITH(security_invoker=true) AS
 SELECT i.*,s.set_id,m.segment_no,m.revision_id,m.valid_from,m.valid_to,m.interpretation_state,
 r.verification_status,r.entity_name,r.entity_kind,r.entity_state,daterange(m.valid_from,m.valid_to,'[)') AS valid_period
 FROM staff_core.sites i JOIN staff_core.site_revision_sets_77 s ON s.site_id=i.site_id AND s.set_id=i.current_set_id AND s.sealed
 JOIN staff_core.site_revision_set_members_77 m ON m.set_id=s.set_id JOIN staff_core.site_revisions_77 r ON r.revision_id=m.revision_id;
CREATE TRIGGER department_revision_insert_77 BEFORE INSERT ON staff_core.department_revisions_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_insert_77('department_id');
CREATE TRIGGER department_append_77 BEFORE UPDATE OR DELETE ON staff_core.department_revisions_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_append_77();
CREATE TRIGGER department_member_guard_77 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.department_revision_set_members_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_member_guard_77('department_revision_sets_77');
CREATE TRIGGER department_set_guard_77 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.department_revision_sets_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_set_guard_77('department_revisions_77','department_revision_set_members_77','department_id');
CREATE CONSTRAINT TRIGGER department_history_required_77 AFTER INSERT OR UPDATE ON staff_core.departments DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.organization_history_required_77('department_revision_sets_77','department_id');
CREATE VIEW staff_core.department_current_segments_77 WITH(security_invoker=true) AS
 SELECT i.*,s.set_id,m.segment_no,m.revision_id,m.valid_from,m.valid_to,m.interpretation_state,
 r.verification_status,r.entity_name,r.entity_kind,r.entity_state,daterange(m.valid_from,m.valid_to,'[)') AS valid_period
 FROM staff_core.departments i JOIN staff_core.department_revision_sets_77 s ON s.department_id=i.department_id AND s.set_id=i.current_set_id AND s.sealed
 JOIN staff_core.department_revision_set_members_77 m ON m.set_id=s.set_id JOIN staff_core.department_revisions_77 r ON r.revision_id=m.revision_id;
CREATE TRIGGER business_site_revision_insert_77 BEFORE INSERT ON staff_core.business_site_revisions_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_insert_77('relation_id');
CREATE TRIGGER business_site_append_77 BEFORE UPDATE OR DELETE ON staff_core.business_site_revisions_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_append_77();
CREATE TRIGGER business_site_member_guard_77 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.business_site_revision_set_members_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_member_guard_77('business_site_revision_sets_77');
CREATE TRIGGER business_site_set_guard_77 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.business_site_revision_sets_77 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_set_guard_77('business_site_revisions_77','business_site_revision_set_members_77','relation_id');
CREATE CONSTRAINT TRIGGER business_site_history_required_77 AFTER INSERT OR UPDATE ON staff_core.business_sites DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.organization_history_required_77('business_site_revision_sets_77','relation_id');
CREATE VIEW staff_core.business_site_current_segments_77 WITH(security_invoker=true) AS
 SELECT i.*,s.set_id,m.segment_no,m.revision_id,m.valid_from,m.valid_to,m.interpretation_state,
 r.verification_status,r.relationship_state,daterange(m.valid_from,m.valid_to,'[)') AS valid_period
 FROM staff_core.business_sites i JOIN staff_core.business_site_revision_sets_77 s ON s.relation_id=i.relation_id AND s.set_id=i.current_set_id AND s.sealed
 JOIN staff_core.business_site_revision_set_members_77 m ON m.set_id=s.set_id JOIN staff_core.business_site_revisions_77 r ON r.revision_id=m.revision_id;
-- One Japanese business-day clock across relation, business, site and org.
CREATE VIEW staff_core.business_site_operating_candidates_77 WITH(security_invoker=true) AS
 WITH tick AS MATERIALIZED(SELECT (clock_timestamp() AT TIME ZONE 'Asia/Tokyo')::date AS business_day)
 SELECT l.relation_id,l.org_id,l.business_id,l.site_id,l.revision_id,b.revision_id AS business_revision_id,s.revision_id AS site_revision_id,false AS authorization_verified
 FROM staff_core.business_site_current_segments_77 l JOIN staff_core.business_current_segments_77 b ON b.business_id=l.business_id AND b.org_id=l.org_id
 JOIN staff_core.site_current_segments_77 s ON s.site_id=l.site_id AND s.org_id=l.org_id
 JOIN staff_core.organization_current_segments_68 o ON o.org_id=l.org_id JOIN staff_core.organization_revisions r ON r.revision_id=o.revision_id CROSS JOIN tick
 WHERE l.interpretation_state='CONFIRMED' AND l.verification_status='CONFIRMED' AND l.relationship_state='ACTIVE' AND l.valid_period @>tick.business_day
 AND b.interpretation_state='CONFIRMED' AND b.verification_status='CONFIRMED' AND b.entity_state='ACTIVE' AND b.valid_period @>tick.business_day
 AND s.interpretation_state='CONFIRMED' AND s.verification_status='CONFIRMED' AND s.entity_state='ACTIVE' AND s.valid_period @>tick.business_day
 AND o.interpretation_state='CONFIRMED' AND r.organization_state='ACTIVE' AND o.valid_period @>tick.business_day;
CREATE FUNCTION staff_core.scope_operating_reference_77(p_scope uuid) RETURNS text LANGUAGE sql SET search_path='' AS $$
 WITH tick AS MATERIALIZED(SELECT at,(at AT TIME ZONE 'Asia/Tokyo')::date AS business_day FROM (SELECT clock_timestamp() at) t)
 SELECT CASE WHEN EXISTS(SELECT 1 FROM staff_core.scope_definitions v JOIN staff_core.scope_revision_sets_76 ss ON ss.scope_id=v.scope_id AND ss.set_id=v.current_set_id AND ss.sealed JOIN staff_core.scope_revision_set_members_76 sm ON sm.set_id=ss.set_id JOIN staff_core.scope_definition_revisions sr ON sr.revision_id=sm.revision_id AND sr.sealed CROSS JOIN tick
 JOIN staff_core.organization_current_segments_68 o ON o.org_id=v.org_id JOIN staff_core.organization_revisions r ON r.revision_id=o.revision_id
 WHERE v.scope_id=p_scope AND sr.scope_state='ACTIVE' AND sr.verification_status='CONFIRMED' AND sm.interpretation_state='CONFIRMED' AND sm.valid_from<=tick.at AND (sm.valid_to IS NULL OR tick.at<sm.valid_to) AND sr.valid_from<=tick.at AND (sr.valid_to IS NULL OR tick.at<sr.valid_to) AND o.interpretation_state='CONFIRMED' AND o.valid_period @>tick.business_day AND r.organization_state='ACTIVE'
 AND (v.scope_kind='ORG'
 OR(v.scope_kind='BUSINESS' AND EXISTS(SELECT 1 FROM staff_core.business_current_segments_77 b WHERE b.business_id=v.business_id AND b.org_id=v.org_id AND b.interpretation_state='CONFIRMED' AND b.verification_status='CONFIRMED' AND b.entity_state='ACTIVE' AND b.valid_period @>tick.business_day))
 OR(v.scope_kind='SITE' AND EXISTS(SELECT 1 FROM staff_core.site_current_segments_77 s WHERE s.site_id=v.site_id AND s.org_id=v.org_id AND s.interpretation_state='CONFIRMED' AND s.verification_status='CONFIRMED' AND s.entity_state='ACTIVE' AND s.valid_period @>tick.business_day))
 OR(v.scope_kind='DEPARTMENT' AND EXISTS(SELECT 1 FROM staff_core.department_current_segments_77 d WHERE d.department_id=v.department_id AND d.org_id=v.org_id AND d.interpretation_state='CONFIRMED' AND d.verification_status='CONFIRMED' AND d.entity_state='ACTIVE' AND d.valid_period @>tick.business_day))
 OR(v.scope_kind='BUSINESS_SITE' AND EXISTS(SELECT 1 FROM staff_core.business_site_current_segments_77 l JOIN staff_core.business_current_segments_77 b ON b.business_id=l.business_id AND b.org_id=l.org_id JOIN staff_core.site_current_segments_77 s ON s.site_id=l.site_id AND s.org_id=l.org_id WHERE l.org_id=v.org_id AND l.business_id=v.business_id AND l.site_id=v.site_id AND l.interpretation_state='CONFIRMED' AND l.verification_status='CONFIRMED' AND l.relationship_state='ACTIVE' AND l.valid_period @>tick.business_day AND b.interpretation_state='CONFIRMED' AND b.verification_status='CONFIRMED' AND b.entity_state='ACTIVE' AND b.valid_period @>tick.business_day AND s.interpretation_state='CONFIRMED' AND s.verification_status='CONFIRMED' AND s.entity_state='ACTIVE' AND s.valid_period @>tick.business_day)))) THEN 'REFERENCE_ACTIVE' ELSE 'REFERENCE_INACTIVE' END
$$;
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['business_sites','business_revisions_77','business_revision_sets_77','business_revision_set_members_77','site_revisions_77','site_revision_sets_77','site_revision_set_members_77','department_revisions_77','department_revision_sets_77','department_revision_set_members_77','business_site_revisions_77','business_site_revision_sets_77','business_site_revision_set_members_77'] LOOP EXECUTE format('ALTER TABLE staff_core.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE staff_core.%I FORCE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON staff_core.%I FROM PUBLIC,anon,authenticated,service_role',n);END LOOP;END $$;
REVOKE ALL ON staff_core.business_current_segments_77,staff_core.site_current_segments_77,staff_core.department_current_segments_77,staff_core.business_site_current_segments_77,staff_core.business_site_operating_candidates_77 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION staff_core.organization_revision_insert_77(),staff_core.organization_revision_append_77(),staff_core.organization_member_guard_77(),staff_core.organization_set_guard_77(),staff_core.entity_identity_guard_76(),staff_core.organization_history_required_77(),staff_core.scope_operating_reference_77(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
