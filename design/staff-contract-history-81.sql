-- CONTRACT-HISTORY-81: contract terms/history proposal. UNAPPLIED.
-- actual_ended_on is the exclusive effective end date; scheduled_contract_end
-- is the inclusive planned last day. Neither is inferred by this DDL.
-- Fresh schema only; requires65/68/72/77. No migration/backfill.
BEGIN;
CREATE TABLE staff_core.contracts (
 contract_id uuid PRIMARY KEY,person_id uuid NOT NULL REFERENCES staff_core.persons(person_id),org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),person_org_relation_id uuid NOT NULL,predecessor_contract_id uuid,
 current_set_id uuid,lock_version bigint NOT NULL CHECK(lock_version>0),created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),created_at timestamptz NOT NULL,
 UNIQUE(contract_id,person_id,org_id),
 FOREIGN KEY(person_org_relation_id,person_id,org_id) REFERENCES staff_core.person_organizations(relation_id,person_id,org_id),
 FOREIGN KEY(predecessor_contract_id,person_id,org_id) REFERENCES staff_core.contracts(contract_id,person_id,org_id),CHECK(predecessor_contract_id IS DISTINCT FROM contract_id)
);
CREATE TABLE staff_core.contract_revisions_81 (
 revision_id uuid PRIMARY KEY,contract_id uuid NOT NULL,person_id uuid NOT NULL,org_id uuid NOT NULL,revision_no bigint NOT NULL CHECK(revision_no>0),supersedes_revision_id uuid,
 contract_state text NOT NULL CHECK(contract_state IN ('ACTIVE','SUSPENDED','ENDED')),verification_status text NOT NULL CHECK(verification_status IN ('CONFIRMED','UNVERIFIED')),
 contract_kind text NOT NULL CHECK(contract_kind IN ('EMPLOYMENT','OUTSOURCING','UNCONFIRMED')),
 contract_detail_code text NOT NULL CHECK(contract_detail_code IN ('EMPLOYEE','PART_TIME','CONTRACT_FOR_WORK','OUTSOURCED','UNCONFIRMED')),
 contract_term_mode text NOT NULL CHECK(contract_term_mode IN ('NO_FIXED_TERM','FIXED_TERM','UNCONFIRMED')),
 contract_started_on date NOT NULL,scheduled_contract_end date,actual_ended_on date,
 CHECK((contract_detail_code IN ('EMPLOYEE','PART_TIME') AND contract_kind='EMPLOYMENT') OR(contract_detail_code IN ('CONTRACT_FOR_WORK','OUTSOURCED') AND contract_kind='OUTSOURCING') OR(contract_detail_code='UNCONFIRMED' AND contract_kind='UNCONFIRMED')),
 CHECK(contract_detail_code NOT IN ('EMPLOYEE','PART_TIME','CONTRACT_FOR_WORK') OR contract_term_mode='NO_FIXED_TERM'),
 CHECK((contract_term_mode='FIXED_TERM' AND scheduled_contract_end IS NOT NULL) OR(contract_term_mode IN ('NO_FIXED_TERM','UNCONFIRMED') AND scheduled_contract_end IS NULL)),
 CHECK(scheduled_contract_end IS NULL OR scheduled_contract_end>=contract_started_on),
 CHECK(actual_ended_on IS NULL OR actual_ended_on>contract_started_on),
 CHECK((contract_state='ENDED' AND actual_ended_on IS NOT NULL) OR(contract_state IN ('ACTIVE','SUSPENDED') AND actual_ended_on IS NULL)),
 valid_from date NOT NULL,valid_to date,CHECK(valid_to IS NULL OR valid_from<valid_to),CHECK(contract_started_on<=valid_from),CHECK(actual_ended_on IS NULL OR actual_ended_on=valid_from),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),change_reason text NOT NULL CHECK(length(btrim(change_reason))>0),
 FOREIGN KEY(contract_id,person_id,org_id) REFERENCES staff_core.contracts(contract_id,person_id,org_id),
 UNIQUE(contract_id,revision_id),UNIQUE(contract_id,revision_no),FOREIGN KEY(contract_id,supersedes_revision_id) REFERENCES staff_core.contract_revisions_81(contract_id,revision_id),CHECK(supersedes_revision_id IS DISTINCT FROM revision_id)
);
CREATE TABLE staff_core.contract_revision_sets_81 (
 set_id uuid PRIMARY KEY,contract_id uuid NOT NULL REFERENCES staff_core.contracts(contract_id),set_no bigint NOT NULL CHECK(set_no>0),previous_set_id uuid,
 operation_id uuid NOT NULL REFERENCES staff_core.operation_requests(operation_id),recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,sealed boolean NOT NULL,
 UNIQUE(contract_id,set_id),UNIQUE(contract_id,set_no),FOREIGN KEY(contract_id,previous_set_id) REFERENCES staff_core.contract_revision_sets_81(contract_id,set_id),CHECK(previous_set_id IS DISTINCT FROM set_id)
);
CREATE TABLE staff_core.contract_revision_set_members_81 (
 set_id uuid NOT NULL,contract_id uuid NOT NULL,segment_no bigint NOT NULL CHECK(segment_no>0),revision_id uuid NOT NULL,
 valid_from date NOT NULL,valid_to date,interpretation_state text NOT NULL CHECK(interpretation_state IN ('CONFIRMED','UNVERIFIED','CANCELLED')),
 PRIMARY KEY(set_id,segment_no),CHECK(valid_to IS NULL OR valid_from<valid_to),FOREIGN KEY(contract_id,set_id) REFERENCES staff_core.contract_revision_sets_81(contract_id,set_id),FOREIGN KEY(contract_id,revision_id) REFERENCES staff_core.contract_revisions_81(contract_id,revision_id)
);
ALTER TABLE staff_core.contracts ADD FOREIGN KEY(contract_id,current_set_id) REFERENCES staff_core.contract_revision_sets_81(contract_id,set_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TRIGGER contract_revision_insert_81 BEFORE INSERT ON staff_core.contract_revisions_81 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_insert_77('contract_id');
CREATE TRIGGER contract_revision_append_81 BEFORE UPDATE OR DELETE ON staff_core.contract_revisions_81 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_revision_append_77();
CREATE TRIGGER contract_set_guard_81 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.contract_revision_sets_81 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_set_guard_77('contract_revisions_81','contract_revision_set_members_81','contract_id');
CREATE TRIGGER contract_member_guard_81 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.contract_revision_set_members_81 FOR EACH ROW EXECUTE FUNCTION staff_core.organization_member_guard_77('contract_revision_sets_81');
CREATE FUNCTION staff_core.contract_identity_guard_81() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Assignment identity immutable';END IF;
 IF (to_jsonb(NEW)-ARRAY['current_set_id','lock_version']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['current_set_id','lock_version']) OR NEW.lock_version<>OLD.lock_version+1 THEN RAISE EXCEPTION 'Assignment identity/version denied';END IF;
 IF NEW.current_set_id IS DISTINCT FROM OLD.current_set_id THEN
  IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Assignment adoption requires read committed';END IF;
  PERFORM 1 FROM staff_core.organizations WHERE org_id=NEW.org_id FOR UPDATE;
  IF NEW.current_set_id IS NULL OR NOT EXISTS(SELECT 1 FROM staff_core.contract_revision_sets_81 WHERE contract_id=NEW.contract_id AND set_id=NEW.current_set_id AND sealed AND previous_set_id IS NOT DISTINCT FROM OLD.current_set_id) THEN RAISE EXCEPTION 'Sealed contract successor required';END IF;
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER contract_identity_guard_81 BEFORE UPDATE OR DELETE ON staff_core.contracts FOR EACH ROW EXECUTE FUNCTION staff_core.contract_identity_guard_81();
CREATE VIEW staff_core.contract_current_segments_81 WITH(security_invoker=true) AS
 SELECT a.*,m.segment_no,m.revision_id,m.valid_from,m.valid_to,m.interpretation_state,r.contract_state,r.verification_status,r.contract_kind,r.contract_detail_code,r.contract_term_mode,r.contract_started_on,r.scheduled_contract_end,r.actual_ended_on,daterange(m.valid_from,m.valid_to,'[)') valid_period,false authorization_verified
 FROM staff_core.contracts a JOIN staff_core.contract_revision_sets_81 s ON s.contract_id=a.contract_id AND s.set_id=a.current_set_id AND s.sealed JOIN staff_core.contract_revision_set_members_81 m ON m.set_id=s.set_id JOIN staff_core.contract_revisions_81 r ON r.revision_id=m.revision_id;
CREATE FUNCTION staff_core.contract_consistency_81() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a staff_core.contracts;
BEGIN
 SELECT * INTO a FROM staff_core.contracts WHERE contract_id=NEW.contract_id;
 IF a.current_set_id IS NULL THEN RETURN NULL;END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Assignment adoption requires read committed';END IF;
 PERFORM 1 FROM staff_core.organizations WHERE org_id=a.org_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM staff_core.contract_revision_sets_81 WHERE contract_id=a.contract_id AND set_id=a.current_set_id AND sealed) THEN RAISE EXCEPTION 'Sealed contract current set required';END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER contract_consistency_81 AFTER INSERT OR UPDATE ON staff_core.contracts DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.contract_consistency_81();
CREATE FUNCTION staff_core.contract_reference_at_81(p_contract uuid,p_at timestamptz) RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 WITH tick AS MATERIALIZED(SELECT p_at at,(p_at AT TIME ZONE 'Asia/Tokyo')::date business_day)
 SELECT CASE WHEN EXISTS(SELECT 1 FROM staff_core.contract_current_segments_81 c
 JOIN staff_core.persons p ON p.person_id=c.person_id JOIN staff_core.person_current_segments_65 ps ON ps.person_id=p.person_id
 JOIN staff_core.person_organizations po ON po.relation_id=c.person_org_relation_id AND po.person_id=c.person_id AND po.org_id=c.org_id JOIN staff_core.person_organization_current_segments_68 rs ON rs.relation_id=po.relation_id JOIN staff_core.person_organization_revisions pr ON pr.revision_id=rs.revision_id
 JOIN staff_core.organization_current_segments_68 os ON os.org_id=c.org_id JOIN staff_core.organization_revisions o ON o.revision_id=os.revision_id CROSS JOIN tick
 WHERE c.contract_id=p_contract AND c.contract_state='ACTIVE' AND c.verification_status='CONFIRMED' AND c.interpretation_state='CONFIRMED' AND c.valid_period @>tick.business_day
 AND c.contract_detail_code<>'UNCONFIRMED' AND c.contract_kind<>'UNCONFIRMED' AND c.contract_started_on<=tick.business_day AND c.actual_ended_on IS NULL
 AND (c.contract_term_mode='NO_FIXED_TERM' OR(c.contract_term_mode='FIXED_TERM' AND tick.business_day<=c.scheduled_contract_end))
 AND p.record_status='CONFIRMED' AND p.merged_into_person_id IS NULL AND ps.interpretation_state='CONFIRMED' AND ps.valid_period @>tick.business_day
 AND rs.interpretation_state='CONFIRMED' AND rs.valid_period @>tick.business_day AND pr.relationship_state='ACTIVE' AND pr.verification_status='CONFIRMED'
 AND os.interpretation_state='CONFIRMED' AND os.valid_period @>tick.business_day AND o.organization_state='ACTIVE') THEN 'CONTRACT_READY' ELSE 'CONTRACT_NOT_READY' END
$$;
CREATE FUNCTION staff_core.contract_reference_81(p_contract uuid) RETURNS text LANGUAGE sql SET search_path='' AS $$
 WITH tick AS MATERIALIZED(SELECT clock_timestamp() at) SELECT staff_core.contract_reference_at_81(p_contract,tick.at) FROM tick
$$;
DO $$ DECLARE n text;BEGIN FOREACH n IN ARRAY ARRAY['contracts','contract_revisions_81','contract_revision_sets_81','contract_revision_set_members_81'] LOOP EXECUTE format('ALTER TABLE staff_core.%I ENABLE ROW LEVEL SECURITY',n);EXECUTE format('ALTER TABLE staff_core.%I FORCE ROW LEVEL SECURITY',n);EXECUTE format('REVOKE ALL ON staff_core.%I FROM PUBLIC,anon,authenticated,service_role',n);END LOOP;END $$;
REVOKE ALL ON staff_core.contract_current_segments_81 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION staff_core.contract_identity_guard_81(),staff_core.contract_consistency_81(),staff_core.contract_reference_at_81(uuid,timestamptz),staff_core.contract_reference_81(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
