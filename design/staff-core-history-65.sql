-- CORE-HISTORY-65. REVIEW DRAFT ONLY; not a staging migration.
-- Requires reviewed staff_core.actor_registry(actor_id) and
-- staff_core.operation_requests(operation_id). No bootstrap actor is created.
BEGIN;
CREATE TABLE staff_core.persons (
 person_id uuid PRIMARY KEY, current_revision_id uuid, current_set_id uuid,
 record_status text NOT NULL CHECK(length(record_status)>0),
 merged_into_person_id uuid REFERENCES staff_core.persons(person_id),
 created_at timestamptz NOT NULL, created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 lock_version bigint NOT NULL CHECK(lock_version>0),
 -- Merge procedure/cycle handling is outside this slice: deny all merges here.
 CHECK(merged_into_person_id IS NULL)
);
CREATE TABLE staff_core.person_revisions (
 revision_id uuid PRIMARY KEY, person_id uuid NOT NULL REFERENCES staff_core.persons(person_id),
 revision_no bigint NOT NULL CHECK(revision_no>0), legal_name text NOT NULL CHECK(length(btrim(legal_name))>0),
 display_name text, furigana text, valid_from date NOT NULL, valid_to date,
 recorded_at timestamptz NOT NULL, recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 supersedes_revision_id uuid, evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),
 change_reason text NOT NULL CHECK(length(btrim(change_reason))>0),
 CHECK(valid_to IS NULL OR valid_from<valid_to),
 UNIQUE(person_id,revision_no), UNIQUE(person_id,revision_id),
 FOREIGN KEY(person_id,supersedes_revision_id) REFERENCES staff_core.person_revisions(person_id,revision_id),
 CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
ALTER TABLE staff_core.persons ADD FOREIGN KEY(person_id,current_revision_id)
 REFERENCES staff_core.person_revisions(person_id,revision_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE staff_core.account_links (
 account_id uuid PRIMARY KEY, person_id uuid NOT NULL REFERENCES staff_core.persons(person_id),
 issuer text NOT NULL CHECK(length(btrim(issuer))>0), subject text CHECK(subject IS NULL OR length(btrim(subject))>0),
 current_revision_id uuid, current_set_id uuid, lock_version bigint NOT NULL CHECK(lock_version>0),
 UNIQUE(issuer,subject), UNIQUE(account_id,person_id),
 created_at timestamptz NOT NULL, created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id)
);
-- The management fields (state/login/period/evidence) live in immutable
-- revisions below. No competing mutable copy on account_links in this proposal.
CREATE TABLE staff_core.account_link_revisions (
 revision_id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES staff_core.account_links(account_id),
 revision_no bigint NOT NULL CHECK(revision_no>0), account_state text NOT NULL CHECK(length(account_state)>0),
 login_name text CHECK(login_name IS NULL OR length(login_name) BETWEEN 1 AND 128),
 provider_login_identifier text, valid_from timestamptz NOT NULL, valid_to timestamptz,
 recorded_at timestamptz NOT NULL, recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 supersedes_revision_id uuid, evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),
 change_reason text NOT NULL CHECK(length(btrim(change_reason))>0),
 CHECK(valid_to IS NULL OR valid_from<valid_to),
 UNIQUE(account_id,revision_no), UNIQUE(account_id,revision_id),
 FOREIGN KEY(account_id,supersedes_revision_id) REFERENCES staff_core.account_link_revisions(account_id,revision_id),
 CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
ALTER TABLE staff_core.account_links ADD FOREIGN KEY(account_id,current_revision_id)
 REFERENCES staff_core.account_link_revisions(account_id,revision_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION staff_core.append_only_65() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'History mutation denied'; END $$;
CREATE TABLE staff_core.person_revision_sets (
 set_id uuid PRIMARY KEY, person_id uuid NOT NULL REFERENCES staff_core.persons(person_id),
 set_no bigint NOT NULL CHECK(set_no>0), previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id), recorded_at timestamptz NOT NULL,
 sealed boolean NOT NULL DEFAULT false, UNIQUE(person_id,set_no), UNIQUE(person_id,set_id),
 FOREIGN KEY(person_id,previous_set_id) REFERENCES staff_core.person_revision_sets(person_id,set_id),
 CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.person_revision_set_members (
 set_id uuid NOT NULL, person_id uuid NOT NULL, segment_no bigint NOT NULL CHECK(segment_no>0), revision_id uuid NOT NULL,
 valid_from date NOT NULL, valid_to date, interpretation_state text NOT NULL
 CHECK(interpretation_state IN ('CONFIRMED','CANCELLED','UNVERIFIED')),
 PRIMARY KEY(set_id,segment_no), CHECK(valid_to IS NULL OR valid_from<valid_to),
 FOREIGN KEY(person_id,set_id) REFERENCES staff_core.person_revision_sets(person_id,set_id),
 FOREIGN KEY(person_id,revision_id) REFERENCES staff_core.person_revisions(person_id,revision_id)
);
ALTER TABLE staff_core.persons ADD FOREIGN KEY(person_id,current_set_id)
 REFERENCES staff_core.person_revision_sets(person_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION staff_core.guard_person_member_65() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE closed boolean;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'History member append only'; END IF;
 SELECT sealed INTO closed FROM staff_core.person_revision_sets WHERE set_id=NEW.set_id AND person_id=NEW.person_id FOR UPDATE;
 IF NOT FOUND OR closed THEN RAISE EXCEPTION 'History set unavailable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER member_guard_65 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.person_revision_set_members
 FOR EACH ROW EXECUTE FUNCTION staff_core.guard_person_member_65();
CREATE FUNCTION staff_core.seal_person_set_65() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'History set deletion denied'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.sealed THEN RAISE EXCEPTION 'Create unsealed set first'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.sealed OR NOT NEW.sealed OR ROW(NEW.set_id,NEW.person_id,NEW.set_no,NEW.previous_set_id,NEW.operation_id,NEW.recorded_actor_id,NEW.recorded_at)
 IS DISTINCT FROM ROW(OLD.set_id,OLD.person_id,OLD.set_no,OLD.previous_set_id,OLD.operation_id,OLD.recorded_actor_id,OLD.recorded_at)
 THEN RAISE EXCEPTION 'History set immutable'; END IF;
 IF NEW.previous_set_id IS NULL THEN
  IF NEW.set_no<>1 THEN RAISE EXCEPTION 'First set must be one'; END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM staff_core.person_revision_sets p WHERE p.set_id=NEW.previous_set_id AND p.person_id=NEW.person_id AND p.sealed AND p.set_no+1=NEW.set_no)
 THEN RAISE EXCEPTION 'Previous sealed set/order required'; END IF;
 IF EXISTS(SELECT 1 FROM staff_core.person_revision_set_members m JOIN staff_core.person_revisions r ON r.person_id=m.person_id AND r.revision_id=m.revision_id
 WHERE m.set_id=NEW.set_id AND NOT (daterange(r.valid_from,r.valid_to,'[)') @> daterange(m.valid_from,m.valid_to,'[)')))
 THEN RAISE EXCEPTION 'Member outside source revision period'; END IF;
 IF NOT EXISTS(SELECT 1 FROM staff_core.person_revision_set_members WHERE set_id=NEW.set_id) THEN RAISE EXCEPTION 'Empty set denied'; END IF;
 IF EXISTS(SELECT 1 FROM staff_core.person_revision_set_members a JOIN staff_core.person_revision_set_members b ON a.set_id=b.set_id AND a.segment_no<b.segment_no
 WHERE a.set_id=NEW.set_id AND daterange(a.valid_from,a.valid_to,'[)') && daterange(b.valid_from,b.valid_to,'[)'))
 THEN RAISE EXCEPTION 'Overlapping interpretation denied'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER set_guard_65 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.person_revision_sets
 FOR EACH ROW EXECUTE FUNCTION staff_core.seal_person_set_65();
CREATE FUNCTION staff_core.require_person_history_65() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r record; closed boolean;
BEGIN
 SELECT * INTO r FROM staff_core.persons WHERE person_id=NEW.person_id;
 IF r.current_revision_id IS NULL OR r.current_set_id IS NULL THEN RAISE EXCEPTION 'History pointers required at commit'; END IF;
 SELECT sealed INTO closed FROM staff_core.person_revision_sets WHERE person_id=r.person_id AND set_id=r.current_set_id;
 IF closed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sealed set required at commit'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER history_required_65 AFTER INSERT OR UPDATE ON staff_core.persons
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.require_person_history_65();
CREATE TRIGGER revision_append_65 BEFORE UPDATE OR DELETE ON staff_core.person_revisions
 FOR EACH ROW EXECUTE FUNCTION staff_core.append_only_65();
CREATE VIEW staff_core.person_current_segments_65 WITH(security_invoker=true) AS
 SELECT b.person_id,s.set_id,s.set_no,m.segment_no,m.revision_id,m.valid_from,m.valid_to,m.interpretation_state,
 daterange(m.valid_from,m.valid_to,'[)') AS valid_period
 FROM staff_core.persons b JOIN staff_core.person_revision_sets s ON s.person_id=b.person_id AND s.set_id=b.current_set_id AND s.sealed
 JOIN staff_core.person_revision_set_members m ON m.person_id=b.person_id AND m.set_id=s.set_id;
CREATE TABLE staff_core.account_revision_sets (
 set_id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES staff_core.account_links(account_id),
 set_no bigint NOT NULL CHECK(set_no>0), previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id), recorded_at timestamptz NOT NULL,
 sealed boolean NOT NULL DEFAULT false, UNIQUE(account_id,set_no), UNIQUE(account_id,set_id),
 FOREIGN KEY(account_id,previous_set_id) REFERENCES staff_core.account_revision_sets(account_id,set_id),
 CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.account_revision_set_members (
 set_id uuid NOT NULL, account_id uuid NOT NULL, segment_no bigint NOT NULL CHECK(segment_no>0), revision_id uuid NOT NULL,
 valid_from timestamptz NOT NULL, valid_to timestamptz, interpretation_state text NOT NULL
 CHECK(interpretation_state IN ('CONFIRMED','CANCELLED','UNVERIFIED')),
 PRIMARY KEY(set_id,segment_no), CHECK(valid_to IS NULL OR valid_from<valid_to),
 FOREIGN KEY(account_id,set_id) REFERENCES staff_core.account_revision_sets(account_id,set_id),
 FOREIGN KEY(account_id,revision_id) REFERENCES staff_core.account_link_revisions(account_id,revision_id)
);
ALTER TABLE staff_core.account_links ADD FOREIGN KEY(account_id,current_set_id)
 REFERENCES staff_core.account_revision_sets(account_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE FUNCTION staff_core.guard_account_member_65() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE closed boolean;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'History member append only'; END IF;
 SELECT sealed INTO closed FROM staff_core.account_revision_sets WHERE set_id=NEW.set_id AND account_id=NEW.account_id FOR UPDATE;
 IF NOT FOUND OR closed THEN RAISE EXCEPTION 'History set unavailable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER member_guard_65 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.account_revision_set_members
 FOR EACH ROW EXECUTE FUNCTION staff_core.guard_account_member_65();
CREATE FUNCTION staff_core.seal_account_set_65() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'History set deletion denied'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.sealed THEN RAISE EXCEPTION 'Create unsealed set first'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.sealed OR NOT NEW.sealed OR ROW(NEW.set_id,NEW.account_id,NEW.set_no,NEW.previous_set_id,NEW.operation_id,NEW.recorded_actor_id,NEW.recorded_at)
 IS DISTINCT FROM ROW(OLD.set_id,OLD.account_id,OLD.set_no,OLD.previous_set_id,OLD.operation_id,OLD.recorded_actor_id,OLD.recorded_at)
 THEN RAISE EXCEPTION 'History set immutable'; END IF;
 IF NEW.previous_set_id IS NULL THEN
  IF NEW.set_no<>1 THEN RAISE EXCEPTION 'First set must be one'; END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM staff_core.account_revision_sets p WHERE p.set_id=NEW.previous_set_id AND p.account_id=NEW.account_id AND p.sealed AND p.set_no+1=NEW.set_no)
 THEN RAISE EXCEPTION 'Previous sealed set/order required'; END IF;
 IF EXISTS(SELECT 1 FROM staff_core.account_revision_set_members m JOIN staff_core.account_link_revisions r ON r.account_id=m.account_id AND r.revision_id=m.revision_id
 WHERE m.set_id=NEW.set_id AND NOT (tstzrange(r.valid_from,r.valid_to,'[)') @> tstzrange(m.valid_from,m.valid_to,'[)')))
 THEN RAISE EXCEPTION 'Member outside source revision period'; END IF;
 IF NOT EXISTS(SELECT 1 FROM staff_core.account_revision_set_members WHERE set_id=NEW.set_id) THEN RAISE EXCEPTION 'Empty set denied'; END IF;
 IF EXISTS(SELECT 1 FROM staff_core.account_revision_set_members a JOIN staff_core.account_revision_set_members b ON a.set_id=b.set_id AND a.segment_no<b.segment_no
 WHERE a.set_id=NEW.set_id AND tstzrange(a.valid_from,a.valid_to,'[)') && tstzrange(b.valid_from,b.valid_to,'[)'))
 THEN RAISE EXCEPTION 'Overlapping interpretation denied'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER set_guard_65 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.account_revision_sets
 FOR EACH ROW EXECUTE FUNCTION staff_core.seal_account_set_65();
CREATE FUNCTION staff_core.require_account_history_65() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r record; closed boolean;
BEGIN
 SELECT * INTO r FROM staff_core.account_links WHERE account_id=NEW.account_id;
 IF r.current_revision_id IS NULL OR r.current_set_id IS NULL THEN RAISE EXCEPTION 'History pointers required at commit'; END IF;
 SELECT sealed INTO closed FROM staff_core.account_revision_sets WHERE account_id=r.account_id AND set_id=r.current_set_id;
 IF closed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Sealed set required at commit'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER history_required_65 AFTER INSERT OR UPDATE ON staff_core.account_links
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.require_account_history_65();
CREATE TRIGGER revision_append_65 BEFORE UPDATE OR DELETE ON staff_core.account_link_revisions
 FOR EACH ROW EXECUTE FUNCTION staff_core.append_only_65();
CREATE VIEW staff_core.account_current_segments_65 WITH(security_invoker=true) AS
 SELECT b.account_id,s.set_id,s.set_no,m.segment_no,m.revision_id,m.valid_from,m.valid_to,m.interpretation_state,
 tstzrange(m.valid_from,m.valid_to,'[)') AS valid_period
 FROM staff_core.account_links b JOIN staff_core.account_revision_sets s ON s.account_id=b.account_id AND s.set_id=b.current_set_id AND s.sealed
 JOIN staff_core.account_revision_set_members m ON m.account_id=b.account_id AND m.set_id=s.set_id;
CREATE FUNCTION staff_core.guard_person_identity_65() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Person deletion denied'; END IF;
 IF ROW(NEW.person_id,NEW.created_at,NEW.created_actor_id) IS DISTINCT FROM ROW(OLD.person_id,OLD.created_at,OLD.created_actor_id)
 OR NEW.lock_version<>OLD.lock_version+1 THEN RAISE EXCEPTION 'Person identity/version denied'; END IF;
 IF NEW.current_set_id IS DISTINCT FROM OLD.current_set_id AND NOT EXISTS(
 SELECT 1 FROM staff_core.person_revision_sets WHERE set_id=NEW.current_set_id AND person_id=NEW.person_id AND previous_set_id=OLD.current_set_id AND sealed)
 THEN RAISE EXCEPTION 'Current set successor required'; END IF;
 IF NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id AND NOT EXISTS(
 SELECT 1 FROM staff_core.person_revisions n JOIN staff_core.person_revisions o ON o.revision_id=OLD.current_revision_id
 WHERE n.revision_id=NEW.current_revision_id AND n.person_id=NEW.person_id AND n.revision_no>o.revision_no)
 THEN RAISE EXCEPTION 'Current revision must advance'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER person_guard_65 BEFORE UPDATE OR DELETE ON staff_core.persons FOR EACH ROW EXECUTE FUNCTION staff_core.guard_person_identity_65();
CREATE FUNCTION staff_core.guard_account_identity_65() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Account deletion denied'; END IF;
 IF ROW(NEW.account_id,NEW.person_id,NEW.issuer,NEW.created_at,NEW.created_actor_id) IS DISTINCT FROM ROW(OLD.account_id,OLD.person_id,OLD.issuer,OLD.created_at,OLD.created_actor_id)
 OR OLD.subject IS NOT NULL AND NEW.subject IS DISTINCT FROM OLD.subject OR NEW.lock_version<>OLD.lock_version+1
 THEN RAISE EXCEPTION 'Account identity/version denied'; END IF;
 IF NEW.current_set_id IS DISTINCT FROM OLD.current_set_id AND NOT EXISTS(
 SELECT 1 FROM staff_core.account_revision_sets WHERE set_id=NEW.current_set_id AND account_id=NEW.account_id AND previous_set_id=OLD.current_set_id AND sealed)
 THEN RAISE EXCEPTION 'Current set successor required'; END IF;
 IF NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id AND NOT EXISTS(
 SELECT 1 FROM staff_core.account_link_revisions n JOIN staff_core.account_link_revisions o ON o.revision_id=OLD.current_revision_id
 WHERE n.revision_id=NEW.current_revision_id AND n.account_id=NEW.account_id AND n.revision_no>o.revision_no)
 THEN RAISE EXCEPTION 'Current revision must advance'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER account_guard_65 BEFORE UPDATE OR DELETE ON staff_core.account_links FOR EACH ROW EXECUTE FUNCTION staff_core.guard_account_identity_65();
-- Closed by default. No runtime grants or deployment memberships here.
ALTER TABLE staff_core.persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.persons FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.persons FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.person_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.person_revisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.person_revisions FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.account_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.account_links FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.account_links FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.account_link_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.account_link_revisions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.account_link_revisions FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.person_revision_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.person_revision_sets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.person_revision_sets FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.person_revision_set_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.person_revision_set_members FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.person_revision_set_members FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.account_revision_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.account_revision_sets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.account_revision_sets FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.account_revision_set_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.account_revision_set_members FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.account_revision_set_members FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON staff_core.person_current_segments_65,staff_core.account_current_segments_65 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION staff_core.append_only_65(),staff_core.guard_person_member_65(),staff_core.guard_account_member_65(),staff_core.seal_person_set_65(),staff_core.seal_account_set_65(),staff_core.require_person_history_65(),staff_core.require_account_history_65(),staff_core.guard_person_identity_65(),staff_core.guard_account_identity_65() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
