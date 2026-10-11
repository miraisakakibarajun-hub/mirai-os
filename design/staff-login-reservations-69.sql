-- LOGIN-RESERVATION-69: REVIEW DRAFT / not deployed.
-- Requires history65 and actor/history68. Apply before account revision writes.
BEGIN;
CREATE TABLE staff_core.login_identifier_reservations (
 issuer text COLLATE "C" NOT NULL,
 login_name text COLLATE "C" NOT NULL CHECK(length(login_name) BETWEEN 1 AND 128),
 person_id uuid NOT NULL REFERENCES staff_core.persons(person_id),
 first_account_id uuid NOT NULL,
 first_revision_id uuid NOT NULL,
 reserved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(issuer,login_name),
 FOREIGN KEY(first_account_id,person_id) REFERENCES staff_core.account_links(account_id,person_id),
 FOREIGN KEY(first_account_id,first_revision_id) REFERENCES staff_core.account_link_revisions(account_id,revision_id)
 DEFERRABLE INITIALLY DEFERRED
);
CREATE FUNCTION staff_core.validate_login_reservation_69() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM staff_core.account_links a JOIN staff_core.account_link_revisions v USING(account_id)
 WHERE a.account_id=NEW.first_account_id AND a.person_id=NEW.person_id AND v.revision_id=NEW.first_revision_id
 AND a.issuer COLLATE "C"=NEW.issuer AND v.login_name COLLATE "C"=NEW.login_name) THEN
  RAISE EXCEPTION 'Reservation must match original account revision';
 END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER reservation_source_69 AFTER INSERT ON staff_core.login_identifier_reservations
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.validate_login_reservation_69();
CREATE FUNCTION staff_core.reserve_login_identifier_69() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a staff_core.account_links; owner_id uuid;
BEGIN
 IF NEW.login_name IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO a FROM staff_core.account_links WHERE account_id=NEW.account_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Account identity unavailable'; END IF;
 -- Unique conflict serializes competing reservations. Never replace person_id.
 INSERT INTO staff_core.login_identifier_reservations(issuer,login_name,person_id,first_account_id,first_revision_id)
 VALUES(a.issuer,NEW.login_name,a.person_id,a.account_id,NEW.revision_id)
 ON CONFLICT(issuer,login_name) DO NOTHING;
 SELECT person_id INTO owner_id FROM staff_core.login_identifier_reservations
 WHERE issuer=a.issuer COLLATE "C" AND login_name=NEW.login_name COLLATE "C" FOR SHARE;
 IF NOT FOUND OR owner_id IS DISTINCT FROM a.person_id THEN
  RAISE EXCEPTION 'Login identifier permanently reserved for another person';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER reserve_login_69 BEFORE INSERT ON staff_core.account_link_revisions
 FOR EACH ROW EXECUTE FUNCTION staff_core.reserve_login_identifier_69();
CREATE TRIGGER reservation_append_69 BEFORE UPDATE OR DELETE ON staff_core.login_identifier_reservations
 FOR EACH ROW EXECUTE FUNCTION staff_core.append_only_65();
LOCK TABLE staff_core.account_links IN SHARE MODE;
LOCK TABLE staff_core.account_link_revisions IN SHARE ROW EXCLUSIVE MODE;
-- Existing history: fail migration on conflicting person ownership. Do not
-- choose an arbitrary winner or discard retired/cancelled/unverified revisions.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM staff_core.account_link_revisions v JOIN staff_core.account_links a USING(account_id)
 WHERE v.login_name IS NOT NULL GROUP BY a.issuer COLLATE "C",v.login_name COLLATE "C"
 HAVING count(DISTINCT a.person_id)>1) THEN
  RAISE EXCEPTION 'Historical login ownership conflict requires review';
 END IF;
END $$;
-- Locks above cover both preflight and backfill through outer COMMIT.
ALTER TABLE staff_core.login_identifier_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_core.login_identifier_reservations FORCE ROW LEVEL SECURITY;
INSERT INTO staff_core.login_identifier_reservations(issuer,login_name,person_id,first_account_id,first_revision_id)
 SELECT DISTINCT ON(a.issuer COLLATE "C",v.login_name COLLATE "C") a.issuer,v.login_name,a.person_id,a.account_id,v.revision_id
 FROM staff_core.account_link_revisions v JOIN staff_core.account_links a USING(account_id)
 WHERE v.login_name IS NOT NULL
 ORDER BY a.issuer COLLATE "C",v.login_name COLLATE "C",v.recorded_at,v.revision_id;
REVOKE ALL ON staff_core.login_identifier_reservations FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION staff_core.validate_login_reservation_69(),staff_core.reserve_login_identifier_69() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
