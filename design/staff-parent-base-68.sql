-- PARENT-CONTROLS-68. REVIEW DRAFT; run before history65, not deployed.
BEGIN;
CREATE TABLE staff_core.actor_registry (
 actor_id uuid PRIMARY KEY,actor_type text NOT NULL CHECK(actor_type IN ('PERSON_ACCOUNT','SERVICE','MIGRATION')),
 actor_state text NOT NULL CHECK(actor_state IN ('ACTIVE','STOPPED')),account_id uuid,
 created_at timestamptz NOT NULL,lock_version bigint NOT NULL CHECK(lock_version>0),
 evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),updated_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),updated_at timestamptz NOT NULL,
 CHECK((actor_type='PERSON_ACCOUNT')=(account_id IS NOT NULL))
);
CREATE UNIQUE INDEX person_account_actor_68 ON staff_core.actor_registry(account_id) WHERE actor_type='PERSON_ACCOUNT';
CREATE TABLE staff_core.organizations (
 org_id uuid PRIMARY KEY,org_code text NOT NULL UNIQUE CHECK(length(btrim(org_code))>0),
 current_revision_id uuid,current_set_id uuid,lock_version bigint NOT NULL CHECK(lock_version>0),
 created_at timestamptz NOT NULL,created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id)
);
CREATE FUNCTION staff_core.append_only_68() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Evidence append only'; END $$;
CREATE TABLE staff_core.actor_state_events (
 event_id uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),
 actor_state text NOT NULL,lock_version bigint NOT NULL,recorded_at timestamptz NOT NULL,
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),evidence_ref text NOT NULL,
 UNIQUE(actor_id,lock_version)
);
CREATE FUNCTION staff_core.guard_actor_68() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Actor deletion denied'; END IF;
 IF TG_OP='UPDATE' AND (ROW(NEW.actor_id,NEW.actor_type,NEW.account_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.actor_id,OLD.actor_type,OLD.account_id,OLD.created_at) OR NEW.lock_version<>OLD.lock_version+1)
 THEN RAISE EXCEPTION 'Actor identity/version denied'; END IF;
 NEW.updated_at:=clock_timestamp(); RETURN NEW;
END $$;
CREATE TRIGGER actor_guard_68 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.actor_registry FOR EACH ROW EXECUTE FUNCTION staff_core.guard_actor_68();
CREATE FUNCTION staff_core.record_actor_68() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO staff_core.actor_state_events VALUES(gen_random_uuid(),NEW.actor_id,NEW.actor_state,NEW.lock_version,NEW.updated_at,NEW.updated_actor_id,NEW.evidence_ref);
 IF NOT FOUND THEN RAISE EXCEPTION 'Actor evidence unconfirmed'; END IF; RETURN NULL;
END $$;
CREATE TRIGGER actor_record_68 AFTER INSERT OR UPDATE ON staff_core.actor_registry FOR EACH ROW EXECUTE FUNCTION staff_core.record_actor_68();
CREATE TRIGGER actor_event_append_68 BEFORE UPDATE OR DELETE ON staff_core.actor_state_events FOR EACH ROW EXECUTE FUNCTION staff_core.append_only_68();
ALTER TABLE staff_core.actor_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.actor_registry FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.actor_registry FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.organizations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.organizations FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_core.actor_state_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.actor_state_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON staff_core.actor_state_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION staff_core.append_only_68(),staff_core.guard_actor_68(),staff_core.record_actor_68() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
