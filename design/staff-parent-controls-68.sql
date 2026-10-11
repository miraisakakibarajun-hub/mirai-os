-- PARENT-CONTROLS-68. REVIEW DRAFT; run after history65, before66/59.
BEGIN;
ALTER TABLE staff_core.actor_registry ADD FOREIGN KEY(account_id) REFERENCES staff_core.account_links(account_id);
CREATE TABLE staff_core.organization_revisions (
 revision_id uuid PRIMARY KEY,org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),revision_no bigint NOT NULL CHECK(revision_no>0),
 legal_name text NOT NULL CHECK(length(btrim(legal_name))>0),organization_state text NOT NULL CHECK(length(organization_state)>0),
 valid_from date NOT NULL,valid_to date,recorded_at timestamptz NOT NULL,recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 supersedes_revision_id uuid,evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),change_reason text NOT NULL CHECK(length(btrim(change_reason))>0),
 UNIQUE(org_id,revision_no),UNIQUE(org_id,revision_id),CHECK(valid_to IS NULL OR valid_from<valid_to),
 FOREIGN KEY(org_id,supersedes_revision_id) REFERENCES staff_core.organization_revisions(org_id,revision_id),CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
ALTER TABLE staff_core.organizations ADD FOREIGN KEY(org_id,current_revision_id) REFERENCES staff_core.organization_revisions(org_id,revision_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE staff_core.organization_revision_sets (
 set_id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),
 set_no bigint NOT NULL CHECK(set_no>0), previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id), recorded_at timestamptz NOT NULL,
 sealed boolean NOT NULL DEFAULT false, UNIQUE(org_id,set_no), UNIQUE(org_id,set_id),
 FOREIGN KEY(org_id,previous_set_id) REFERENCES staff_core.organization_revision_sets(org_id,set_id),
 CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.organization_revision_set_members (
 set_id uuid NOT NULL, org_id uuid NOT NULL, segment_no bigint NOT NULL CHECK(segment_no>0), revision_id uuid NOT NULL,
 valid_from date NOT NULL, valid_to date, interpretation_state text NOT NULL
 CHECK(interpretation_state IN ('CONFIRMED','CANCELLED','UNVERIFIED')),
 PRIMARY KEY(set_id,segment_no), CHECK(valid_to IS NULL OR valid_from<valid_to),
 FOREIGN KEY(org_id,set_id) REFERENCES staff_core.organization_revision_sets(org_id,set_id),
 FOREIGN KEY(org_id,revision_id) REFERENCES staff_core.organization_revisions(org_id,revision_id)
);
ALTER TABLE staff_core.organizations ADD FOREIGN KEY(org_id,current_set_id)
 REFERENCES staff_core.organization_revision_sets(org_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION staff_core.guard_organization_member_68() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE closed boolean;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'History member append only'; END IF;
 SELECT sealed INTO closed FROM staff_core.organization_revision_sets WHERE set_id=NEW.set_id AND org_id=NEW.org_id FOR UPDATE;
 IF NOT FOUND OR closed THEN RAISE EXCEPTION 'History set unavailable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER member_guard_68 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.organization_revision_set_members
 FOR EACH ROW EXECUTE FUNCTION staff_core.guard_organization_member_68();
CREATE FUNCTION staff_core.seal_organization_set_68() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'History set deletion denied'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.sealed THEN RAISE EXCEPTION 'Create unsealed set first'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.sealed OR NOT NEW.sealed OR ROW(NEW.set_id,NEW.org_id,NEW.set_no,NEW.previous_set_id,NEW.operation_id,NEW.recorded_actor_id,NEW.recorded_at)
 IS DISTINCT FROM ROW(OLD.set_id,OLD.org_id,OLD.set_no,OLD.previous_set_id,OLD.operation_id,OLD.recorded_actor_id,OLD.recorded_at)
 THEN RAISE EXCEPTION 'History set immutable'; END IF;
 IF NEW.previous_set_id IS NULL THEN
  IF NEW.set_no<>1 THEN RAISE EXCEPTION 'First set must be one'; END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM staff_core.organization_revision_sets p WHERE p.set_id=NEW.previous_set_id AND p.org_id=NEW.org_id AND p.sealed AND p.set_no+1=NEW.set_no)
 THEN RAISE EXCEPTION 'Previous sealed set/order required'; END IF;
 IF EXISTS(SELECT 1 FROM staff_core.organization_revision_set_members m JOIN staff_core.organization_revisions r ON r.org_id=m.org_id AND r.revision_id=m.revision_id
 WHERE m.set_id=NEW.set_id AND NOT (daterange(r.valid_from,r.valid_to,'[)') @> daterange(m.valid_from,m.valid_to,'[)')))
 THEN RAISE EXCEPTION 'Member outside source revision period'; END IF;
 IF NOT EXISTS(SELECT 1 FROM staff_core.organization_revision_set_members WHERE set_id=NEW.set_id) THEN RAISE EXCEPTION 'Empty set denied'; END IF;
 IF EXISTS(SELECT 1 FROM staff_core.organization_revision_set_members a JOIN staff_core.organization_revision_set_members b ON a.set_id=b.set_id AND a.segment_no<b.segment_no
 WHERE a.set_id=NEW.set_id AND daterange(a.valid_from,a.valid_to,'[)') && daterange(b.valid_from,b.valid_to,'[)'))
 THEN RAISE EXCEPTION 'Overlapping interpretation denied'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER set_guard_68 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.organization_revision_sets
 FOR EACH ROW EXECUTE FUNCTION staff_core.seal_organization_set_68();
CREATE FUNCTION staff_core.require_organization_history_68() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r record; closed boolean;
BEGIN
 SELECT * INTO r FROM staff_core.organizations WHERE org_id=NEW.org_id;
 IF r.current_revision_id IS NULL OR r.current_set_id IS NULL THEN RAISE EXCEPTION 'History pointers required at commit'; END IF;
 SELECT sealed INTO closed FROM staff_core.organization_revision_sets WHERE org_id=r.org_id AND set_id=r.current_set_id;
 IF closed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sealed set required at commit'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER history_required_68 AFTER INSERT OR UPDATE ON staff_core.organizations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.require_organization_history_68();
CREATE TRIGGER revision_append_68 BEFORE UPDATE OR DELETE ON staff_core.organization_revisions
 FOR EACH ROW EXECUTE FUNCTION staff_core.append_only_68();
CREATE VIEW staff_core.organization_current_segments_68 WITH(security_invoker=true) AS
 SELECT b.org_id,s.set_id,s.set_no,m.segment_no,m.revision_id,m.valid_from,m.valid_to,m.interpretation_state,
 daterange(m.valid_from,m.valid_to,'[)') AS valid_period
 FROM staff_core.organizations b JOIN staff_core.organization_revision_sets s ON s.org_id=b.org_id AND s.set_id=b.current_set_id AND s.sealed
 JOIN staff_core.organization_revision_set_members m ON m.org_id=b.org_id AND m.set_id=s.set_id;
CREATE TABLE staff_core.person_organizations (
 relation_id uuid PRIMARY KEY,person_id uuid NOT NULL REFERENCES staff_core.persons(person_id),org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),
 current_revision_id uuid,current_set_id uuid,lock_version bigint NOT NULL CHECK(lock_version>0),created_at timestamptz NOT NULL,created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 UNIQUE(relation_id,org_id),UNIQUE(relation_id,person_id,org_id)
);
CREATE TABLE staff_core.person_organization_revisions (
 revision_id uuid PRIMARY KEY,relation_id uuid NOT NULL REFERENCES staff_core.person_organizations(relation_id),revision_no bigint NOT NULL CHECK(revision_no>0),
 relationship_state text NOT NULL CHECK(length(relationship_state)>0),verification_status text NOT NULL CHECK(length(verification_status)>0),valid_from date NOT NULL,valid_to date,
 recorded_at timestamptz NOT NULL,recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),supersedes_revision_id uuid,
 evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),change_reason text NOT NULL CHECK(length(btrim(change_reason))>0),
 UNIQUE(relation_id,revision_no),UNIQUE(relation_id,revision_id),CHECK(valid_to IS NULL OR valid_from<valid_to),
 FOREIGN KEY(relation_id,supersedes_revision_id) REFERENCES staff_core.person_organization_revisions(relation_id,revision_id),CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
ALTER TABLE staff_core.person_organizations ADD FOREIGN KEY(relation_id,current_revision_id) REFERENCES staff_core.person_organization_revisions(relation_id,revision_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE staff_core.relation_revision_sets (
 set_id uuid PRIMARY KEY, relation_id uuid NOT NULL REFERENCES staff_core.person_organizations(relation_id),
 set_no bigint NOT NULL CHECK(set_no>0), previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id), recorded_at timestamptz NOT NULL,
 sealed boolean NOT NULL DEFAULT false, UNIQUE(relation_id,set_no), UNIQUE(relation_id,set_id),
 FOREIGN KEY(relation_id,previous_set_id) REFERENCES staff_core.relation_revision_sets(relation_id,set_id),
 CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.relation_revision_set_members (
 set_id uuid NOT NULL, relation_id uuid NOT NULL, segment_no bigint NOT NULL CHECK(segment_no>0), revision_id uuid NOT NULL,
 valid_from date NOT NULL, valid_to date, interpretation_state text NOT NULL
 CHECK(interpretation_state IN ('CONFIRMED','CANCELLED','UNVERIFIED')),
 PRIMARY KEY(set_id,segment_no), CHECK(valid_to IS NULL OR valid_from<valid_to),
 FOREIGN KEY(relation_id,set_id) REFERENCES staff_core.relation_revision_sets(relation_id,set_id),
 FOREIGN KEY(relation_id,revision_id) REFERENCES staff_core.person_organization_revisions(relation_id,revision_id)
);
ALTER TABLE staff_core.person_organizations ADD FOREIGN KEY(relation_id,current_set_id)
 REFERENCES staff_core.relation_revision_sets(relation_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION staff_core.guard_relation_member_68() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE closed boolean;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'History member append only'; END IF;
 SELECT sealed INTO closed FROM staff_core.relation_revision_sets WHERE set_id=NEW.set_id AND relation_id=NEW.relation_id FOR UPDATE;
 IF NOT FOUND OR closed THEN RAISE EXCEPTION 'History set unavailable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER member_guard_68 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.relation_revision_set_members
 FOR EACH ROW EXECUTE FUNCTION staff_core.guard_relation_member_68();
CREATE FUNCTION staff_core.seal_relation_set_68() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'History set deletion denied'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.sealed THEN RAISE EXCEPTION 'Create unsealed set first'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.sealed OR NOT NEW.sealed OR ROW(NEW.set_id,NEW.relation_id,NEW.set_no,NEW.previous_set_id,NEW.operation_id,NEW.recorded_actor_id,NEW.recorded_at)
 IS DISTINCT FROM ROW(OLD.set_id,OLD.relation_id,OLD.set_no,OLD.previous_set_id,OLD.operation_id,OLD.recorded_actor_id,OLD.recorded_at)
 THEN RAISE EXCEPTION 'History set immutable'; END IF;
 IF NEW.previous_set_id IS NULL THEN
  IF NEW.set_no<>1 THEN RAISE EXCEPTION 'First set must be one'; END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM staff_core.relation_revision_sets p WHERE p.set_id=NEW.previous_set_id AND p.relation_id=NEW.relation_id AND p.sealed AND p.set_no+1=NEW.set_no)
 THEN RAISE EXCEPTION 'Previous sealed set/order required'; END IF;
 IF EXISTS(SELECT 1 FROM staff_core.relation_revision_set_members m JOIN staff_core.person_organization_revisions r ON r.relation_id=m.relation_id AND r.revision_id=m.revision_id
 WHERE m.set_id=NEW.set_id AND NOT (daterange(r.valid_from,r.valid_to,'[)') @> daterange(m.valid_from,m.valid_to,'[)')))
 THEN RAISE EXCEPTION 'Member outside source revision period'; END IF;
 IF NOT EXISTS(SELECT 1 FROM staff_core.relation_revision_set_members WHERE set_id=NEW.set_id) THEN RAISE EXCEPTION 'Empty set denied'; END IF;
 IF EXISTS(SELECT 1 FROM staff_core.relation_revision_set_members a JOIN staff_core.relation_revision_set_members b ON a.set_id=b.set_id AND a.segment_no<b.segment_no
 WHERE a.set_id=NEW.set_id AND daterange(a.valid_from,a.valid_to,'[)') && daterange(b.valid_from,b.valid_to,'[)'))
 THEN RAISE EXCEPTION 'Overlapping interpretation denied'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER set_guard_68 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.relation_revision_sets
 FOR EACH ROW EXECUTE FUNCTION staff_core.seal_relation_set_68();
CREATE FUNCTION staff_core.require_relation_history_68() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r record; closed boolean;
BEGIN
 SELECT * INTO r FROM staff_core.person_organizations WHERE relation_id=NEW.relation_id;
 IF r.current_revision_id IS NULL OR r.current_set_id IS NULL THEN RAISE EXCEPTION 'History pointers required at commit'; END IF;
 SELECT sealed INTO closed FROM staff_core.relation_revision_sets WHERE relation_id=r.relation_id AND set_id=r.current_set_id;
 IF closed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sealed set required at commit'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER history_required_68 AFTER INSERT OR UPDATE ON staff_core.person_organizations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.require_relation_history_68();
CREATE TRIGGER revision_append_68 BEFORE UPDATE OR DELETE ON staff_core.person_organization_revisions
 FOR EACH ROW EXECUTE FUNCTION staff_core.append_only_68();
CREATE VIEW staff_core.person_organization_current_segments_68 WITH(security_invoker=true) AS
 SELECT b.relation_id,s.set_id,s.set_no,m.segment_no,m.revision_id,m.valid_from,m.valid_to,m.interpretation_state,
 daterange(m.valid_from,m.valid_to,'[)') AS valid_period
 FROM staff_core.person_organizations b JOIN staff_core.relation_revision_sets s ON s.relation_id=b.relation_id AND s.set_id=b.current_set_id AND s.sealed
 JOIN staff_core.relation_revision_set_members m ON m.relation_id=b.relation_id AND m.set_id=s.set_id;
CREATE FUNCTION staff_core.guard_organization_identity_68() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Identity deletion denied'; END IF;
 IF ROW(NEW.org_id,NEW.org_code,NEW.created_at,NEW.created_actor_id) IS DISTINCT FROM ROW(OLD.org_id,OLD.org_code,OLD.created_at,OLD.created_actor_id) OR NEW.lock_version<>OLD.lock_version+1 THEN RAISE EXCEPTION 'Identity/version denied'; END IF;
 IF NEW.current_set_id IS DISTINCT FROM OLD.current_set_id AND NOT EXISTS(SELECT 1 FROM staff_core.organization_revision_sets WHERE set_id=NEW.current_set_id AND org_id=NEW.org_id AND previous_set_id=OLD.current_set_id AND sealed) THEN RAISE EXCEPTION 'Current set successor required'; END IF;
 IF NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id AND NOT EXISTS(SELECT 1 FROM staff_core.organization_revisions n JOIN staff_core.organization_revisions o ON o.revision_id=OLD.current_revision_id WHERE n.revision_id=NEW.current_revision_id AND n.org_id=NEW.org_id AND n.revision_no>o.revision_no) THEN RAISE EXCEPTION 'Current revision must advance'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER identity_guard_68 BEFORE UPDATE OR DELETE ON staff_core.organizations FOR EACH ROW EXECUTE FUNCTION staff_core.guard_organization_identity_68();
CREATE FUNCTION staff_core.guard_relation_identity_68() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Identity deletion denied'; END IF;
 IF ROW(NEW.relation_id,NEW.person_id,NEW.org_id,NEW.created_at,NEW.created_actor_id) IS DISTINCT FROM ROW(OLD.relation_id,OLD.person_id,OLD.org_id,OLD.created_at,OLD.created_actor_id) OR NEW.lock_version<>OLD.lock_version+1 THEN RAISE EXCEPTION 'Identity/version denied'; END IF;
 IF NEW.current_set_id IS DISTINCT FROM OLD.current_set_id AND NOT EXISTS(SELECT 1 FROM staff_core.relation_revision_sets WHERE set_id=NEW.current_set_id AND relation_id=NEW.relation_id AND previous_set_id=OLD.current_set_id AND sealed) THEN RAISE EXCEPTION 'Current set successor required'; END IF;
 IF NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id AND NOT EXISTS(SELECT 1 FROM staff_core.person_organization_revisions n JOIN staff_core.person_organization_revisions o ON o.revision_id=OLD.current_revision_id WHERE n.revision_id=NEW.current_revision_id AND n.relation_id=NEW.relation_id AND n.revision_no>o.revision_no) THEN RAISE EXCEPTION 'Current revision must advance'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER identity_guard_68 BEFORE UPDATE OR DELETE ON staff_core.person_organizations FOR EACH ROW EXECUTE FUNCTION staff_core.guard_relation_identity_68();
CREATE TABLE staff_core.auth_control_events (
 event_id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES staff_core.account_links(account_id),control_kind text NOT NULL CHECK(control_kind IN ('AUTH','AUTHZ')),
 before_state jsonb,after_state jsonb NOT NULL,recorded_at timestamptz NOT NULL,recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id)
);
CREATE TABLE staff_core.account_auth_controls (
 account_id uuid PRIMARY KEY REFERENCES staff_core.account_links(account_id),
 provisioning_state text NOT NULL CHECK(provisioning_state IN ('PREPARED','PROVISIONING','LINKED','RECONCILE_REQUIRED')),
 credential_state text NOT NULL CHECK(credential_state IN ('INITIAL_CHANGE_REQUIRED','READY','RESET_CHANGE_REQUIRED','UNKNOWN')),
 auth_epoch bigint NOT NULL CHECK(auth_epoch BETWEEN 1 AND 9007199254740991),lock_version bigint NOT NULL CHECK(lock_version>0),
 updated_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),updated_at timestamptz NOT NULL,
 evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),
 last_change_event_id uuid NOT NULL REFERENCES staff_core.auth_control_events(event_id) DEFERRABLE INITIALLY DEFERRED,
 CHECK(credential_state<>'READY' OR provisioning_state='LINKED')
);
CREATE TABLE staff_core.account_authz_controls (
 account_id uuid PRIMARY KEY REFERENCES staff_core.account_links(account_id),account_authz_version bigint NOT NULL CHECK(account_authz_version BETWEEN 1 AND 9007199254740991),
 lock_version bigint NOT NULL CHECK(lock_version>0),updated_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),updated_at timestamptz NOT NULL,
 evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),
 last_change_event_id uuid NOT NULL REFERENCES staff_core.auth_control_events(event_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE FUNCTION staff_core.guard_control_68() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE kind text;before_data jsonb;after_data jsonb;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Control deletion denied'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.lock_version<>OLD.lock_version+1 THEN RAISE EXCEPTION 'Control identity/version denied'; END IF;
  IF TG_TABLE_NAME='account_auth_controls' THEN
   IF NEW.auth_epoch<OLD.auth_epoch OR (ROW(NEW.provisioning_state,NEW.credential_state) IS DISTINCT FROM ROW(OLD.provisioning_state,OLD.credential_state) AND NEW.auth_epoch<=OLD.auth_epoch) THEN RAISE EXCEPTION 'Auth epoch must not regress; state change must advance'; END IF;
   before_data:=jsonb_build_object('provisioning',OLD.provisioning_state,'credential',OLD.credential_state,'epoch',OLD.auth_epoch,'lock',OLD.lock_version);
  ELSE
   IF NEW.account_authz_version<=OLD.account_authz_version THEN RAISE EXCEPTION 'Authz version must advance'; END IF;
   before_data:=jsonb_build_object('version',OLD.account_authz_version,'lock',OLD.lock_version);
  END IF;
 END IF;
 IF TG_TABLE_NAME='account_auth_controls' THEN
  IF NEW.provisioning_state='LINKED' AND NOT EXISTS(SELECT 1 FROM staff_core.account_links WHERE account_id=NEW.account_id AND subject IS NOT NULL) THEN RAISE EXCEPTION 'Linked subject required'; END IF;
  kind:='AUTH';after_data:=jsonb_build_object('provisioning',NEW.provisioning_state,'credential',NEW.credential_state,'epoch',NEW.auth_epoch,'lock',NEW.lock_version);
 ELSE kind:='AUTHZ';after_data:=jsonb_build_object('version',NEW.account_authz_version,'lock',NEW.lock_version);END IF;
 NEW.updated_at:=clock_timestamp();NEW.last_change_event_id:=gen_random_uuid();
 INSERT INTO staff_core.auth_control_events VALUES(NEW.last_change_event_id,NEW.account_id,kind,before_data,after_data,NEW.updated_at,NEW.updated_actor_id,NEW.evidence_ref,NEW.operation_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Control evidence unconfirmed'; END IF; RETURN NEW;
END $$;
CREATE TRIGGER auth_control_guard_68 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.account_auth_controls FOR EACH ROW EXECUTE FUNCTION staff_core.guard_control_68();
CREATE TRIGGER authz_control_guard_68 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.account_authz_controls FOR EACH ROW EXECUTE FUNCTION staff_core.guard_control_68();
CREATE TRIGGER control_event_append_68 BEFORE UPDATE OR DELETE ON staff_core.auth_control_events FOR EACH ROW EXECUTE FUNCTION staff_core.append_only_68();
-- Completed operation evidence used by a control event must not be rewritten.
-- Pending operations may still complete; external Auth workflows remain a
-- separate contract, so control events do not require premature final success.
CREATE FUNCTION staff_core.guard_control_operation_68() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.state='SUCCEEDED' AND EXISTS(SELECT 1 FROM staff_core.auth_control_events WHERE operation_id=OLD.operation_id)
 THEN RAISE EXCEPTION 'Completed control operation immutable'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
CREATE TRIGGER control_operation_68 BEFORE UPDATE OR DELETE ON staff_core.operation_requests FOR EACH ROW EXECUTE FUNCTION staff_core.guard_control_operation_68();
REVOKE ALL ON FUNCTION staff_core.guard_control_operation_68() FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.organization_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.organization_revisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.organization_revisions FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.organization_revision_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.organization_revision_sets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.organization_revision_sets FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.organization_revision_set_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.organization_revision_set_members FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.organization_revision_set_members FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.person_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.person_organizations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.person_organizations FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.person_organization_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.person_organization_revisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.person_organization_revisions FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.relation_revision_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.relation_revision_sets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.relation_revision_sets FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.relation_revision_set_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.relation_revision_set_members FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.relation_revision_set_members FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.account_auth_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.account_auth_controls FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.account_auth_controls FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.account_authz_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.account_authz_controls FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.account_authz_controls FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.auth_control_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.auth_control_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.auth_control_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON staff_core.organization_current_segments_68,staff_core.person_organization_current_segments_68 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION staff_core.guard_organization_member_68(),staff_core.seal_organization_set_68(),staff_core.require_organization_history_68(),staff_core.guard_relation_member_68(),staff_core.seal_relation_set_68(),staff_core.require_relation_history_68(),staff_core.guard_organization_identity_68(),staff_core.guard_relation_identity_68(),staff_core.guard_control_68() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
