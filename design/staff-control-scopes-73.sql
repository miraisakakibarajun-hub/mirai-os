-- CONTROL-SCOPE-73 / REVIEW DRAFT / not deployed.
-- After parent-base68, before workflow72. Describes scope, NOT actor authority.
BEGIN;
CREATE TABLE staff_core.control_scopes (
 control_scope_id uuid PRIMARY KEY,scope_code text NOT NULL UNIQUE CHECK(length(btrim(scope_code))>0),
 current_revision_id uuid NOT NULL,lock_version bigint NOT NULL CHECK(lock_version>0),
 created_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),created_at timestamptz NOT NULL
);
CREATE TABLE staff_core.control_scope_revisions_73 (
 revision_id uuid PRIMARY KEY,control_scope_id uuid NOT NULL REFERENCES staff_core.control_scopes(control_scope_id),
 revision_no bigint NOT NULL CHECK(revision_no>0),previous_revision_id uuid,
 management_kind text NOT NULL CHECK(management_kind IN ('ORG_CONTROL','PLATFORM_CONTROL')),
 scope_state text NOT NULL CHECK(scope_state IN ('ACTIVE','STOPPED')),
 verification_status text NOT NULL CHECK(verification_status IN ('CONFIRMED','UNVERIFIED')),
 allow_account_global boolean NOT NULL,
 valid_from timestamptz NOT NULL,valid_to timestamptz,CHECK(valid_to IS NULL OR valid_from<valid_to),
 recorded_actor_id uuid NOT NULL REFERENCES staff_core.actor_registry(actor_id),recorded_at timestamptz NOT NULL,
 evidence_ref text NOT NULL CHECK(length(btrim(evidence_ref))>0),sealed boolean NOT NULL,
 UNIQUE(control_scope_id,revision_id),UNIQUE(control_scope_id,revision_no),
 FOREIGN KEY(control_scope_id,previous_revision_id) REFERENCES staff_core.control_scope_revisions_73(control_scope_id,revision_id),
 CHECK(previous_revision_id IS DISTINCT FROM revision_id),
 CHECK(management_kind<>'ORG_CONTROL' OR allow_account_global=false)
);
ALTER TABLE staff_core.control_scopes ADD FOREIGN KEY(control_scope_id,current_revision_id)
 REFERENCES staff_core.control_scope_revisions_73(control_scope_id,revision_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE staff_core.control_scope_organizations_73 (
 revision_id uuid NOT NULL REFERENCES staff_core.control_scope_revisions_73(revision_id),
 org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),PRIMARY KEY(revision_id,org_id)
);
CREATE TABLE staff_core.control_scope_actions_73 (
 revision_id uuid NOT NULL REFERENCES staff_core.control_scope_revisions_73(revision_id),
 action_code text NOT NULL CHECK(action_code IN ('ORG_STOP','ORG_RELEASE','OS_STOP','OS_RELEASE','ACCOUNT_GLOBAL_STOP','ACCOUNT_GLOBAL_RELEASE','INITIAL_AUTH_ADMISSION')),
 PRIMARY KEY(revision_id,action_code)
);
CREATE TABLE staff_core.control_scope_systems_73 (
 revision_id uuid NOT NULL,org_id uuid NOT NULL,system_code text NOT NULL CHECK(length(btrim(system_code))>0),
 PRIMARY KEY(revision_id,org_id,system_code),
 FOREIGN KEY(revision_id,org_id) REFERENCES staff_core.control_scope_organizations_73(revision_id,org_id)
);
CREATE FUNCTION staff_core.guard_scope_member_73() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'Scope snapshot member immutable'; END IF;
 PERFORM 1 FROM staff_core.control_scope_revisions_73 WHERE revision_id=NEW.revision_id AND sealed=false FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unsealed scope snapshot required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER scope_org_member_73 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.control_scope_organizations_73 FOR EACH ROW EXECUTE FUNCTION staff_core.guard_scope_member_73();
CREATE TRIGGER scope_action_member_73 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.control_scope_actions_73 FOR EACH ROW EXECUTE FUNCTION staff_core.guard_scope_member_73();
CREATE TRIGGER scope_system_member_73 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.control_scope_systems_73 FOR EACH ROW EXECUTE FUNCTION staff_core.guard_scope_member_73();
CREATE FUNCTION staff_core.guard_scope_revision_73() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Scope history deletion denied'; END IF;
 IF TG_OP='INSERT' THEN IF NEW.sealed THEN RAISE EXCEPTION 'Scope must start unsealed'; END IF;RETURN NEW;END IF;
 IF OLD.sealed OR NOT NEW.sealed OR (to_jsonb(NEW)-'sealed') IS DISTINCT FROM (to_jsonb(OLD)-'sealed')
 THEN RAISE EXCEPTION 'Only scope sealing permitted'; END IF;
 IF NEW.previous_revision_id IS NULL THEN
  IF NEW.revision_no<>1 THEN RAISE EXCEPTION 'Initial scope revision must be one'; END IF;
 ELSE
  PERFORM 1 FROM staff_core.control_scope_revisions_73 WHERE control_scope_id=NEW.control_scope_id AND revision_id=NEW.previous_revision_id AND sealed AND revision_no<NEW.revision_no;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sealed predecessor required'; END IF;
 END IF;
 IF NEW.management_kind='ORG_CONTROL' AND (SELECT count(*) FROM staff_core.control_scope_organizations_73 WHERE revision_id=NEW.revision_id)<>1 THEN RAISE EXCEPTION 'Org scope requires exactly one explicit org'; END IF;
 IF NOT NEW.allow_account_global AND EXISTS(SELECT 1 FROM staff_core.control_scope_actions_73 WHERE revision_id=NEW.revision_id AND action_code IN ('ACCOUNT_GLOBAL_STOP','ACCOUNT_GLOBAL_RELEASE')) THEN RAISE EXCEPTION 'Global action requires explicit platform scope'; END IF;
 IF EXISTS(SELECT 1 FROM staff_core.control_scope_actions_73 WHERE revision_id=NEW.revision_id AND action_code IN ('OS_STOP','OS_RELEASE')) AND NOT EXISTS(SELECT 1 FROM staff_core.control_scope_systems_73 WHERE revision_id=NEW.revision_id) THEN RAISE EXCEPTION 'OS actions require explicit systems'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER scope_revision_guard_73 BEFORE INSERT OR UPDATE OR DELETE ON staff_core.control_scope_revisions_73 FOR EACH ROW EXECUTE FUNCTION staff_core.guard_scope_revision_73();
CREATE FUNCTION staff_core.guard_scope_identity_73() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE t timestamptz:=clock_timestamp();
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Scope deletion denied'; END IF;
 IF ROW(NEW.control_scope_id,NEW.scope_code,NEW.created_actor_id,NEW.created_at) IS DISTINCT FROM ROW(OLD.control_scope_id,OLD.scope_code,OLD.created_actor_id,OLD.created_at) OR NEW.lock_version<>OLD.lock_version+1 THEN RAISE EXCEPTION 'Scope identity/version denied'; END IF;
 IF NEW.current_revision_id IS DISTINCT FROM OLD.current_revision_id THEN
  PERFORM 1 FROM staff_core.control_scope_revisions_73 WHERE revision_id=NEW.current_revision_id AND control_scope_id=NEW.control_scope_id AND sealed AND previous_revision_id=OLD.current_revision_id AND valid_from<=t AND (valid_to IS NULL OR t<valid_to);
  IF NOT FOUND THEN RAISE EXCEPTION 'Current scope requires effective sealed successor'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER scope_identity_73 BEFORE UPDATE OR DELETE ON staff_core.control_scopes FOR EACH ROW EXECUTE FUNCTION staff_core.guard_scope_identity_73();
CREATE FUNCTION staff_core.require_scope_history_73() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM staff_core.control_scopes c JOIN staff_core.control_scope_revisions_73 r ON r.control_scope_id=c.control_scope_id AND r.revision_id=c.current_revision_id WHERE c.control_scope_id=NEW.control_scope_id AND r.sealed AND r.valid_from<=clock_timestamp();
 IF NOT FOUND THEN RAISE EXCEPTION 'Sealed current scope required'; END IF;RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER scope_history_73 AFTER INSERT OR UPDATE ON staff_core.control_scopes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.require_scope_history_73();
CREATE FUNCTION staff_core.scope_contains_73(p_scope uuid,p_org uuid,p_action text,p_system text DEFAULT NULL) RETURNS boolean LANGUAGE sql SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM staff_core.control_scopes c JOIN staff_core.control_scope_revisions_73 r ON r.control_scope_id=c.control_scope_id AND r.revision_id=c.current_revision_id
 JOIN staff_core.control_scope_actions_73 a ON a.revision_id=r.revision_id AND a.action_code=p_action
 WHERE c.control_scope_id=p_scope AND r.sealed AND r.scope_state='ACTIVE' AND r.verification_status='CONFIRMED'
 AND r.valid_from<=clock_timestamp() AND (r.valid_to IS NULL OR clock_timestamp()<r.valid_to)
 AND ((p_action IN ('ACCOUNT_GLOBAL_STOP','ACCOUNT_GLOBAL_RELEASE') AND p_org IS NULL AND p_system IS NULL AND r.management_kind='PLATFORM_CONTROL' AND r.allow_account_global)
 OR(p_action IN ('ORG_STOP','ORG_RELEASE','INITIAL_AUTH_ADMISSION') AND p_org IS NOT NULL AND p_system IS NULL AND EXISTS(SELECT 1 FROM staff_core.control_scope_organizations_73 m WHERE m.revision_id=r.revision_id AND m.org_id=p_org))
 OR(p_action IN ('OS_STOP','OS_RELEASE') AND p_org IS NOT NULL AND p_system IS NOT NULL AND EXISTS(SELECT 1 FROM staff_core.control_scope_systems_73 m WHERE m.revision_id=r.revision_id AND m.org_id=p_org AND m.system_code=p_system))))
$$;
-- Readiness is NOT an authorization result. No adopted initial approval policy
-- exists yet. Scope membership must never open the apply path by itself.
CREATE FUNCTION staff_core.initial_policy_readiness_73(p_scope uuid,p_org uuid) RETURNS text LANGUAGE sql SET search_path='' AS $$
 SELECT CASE WHEN staff_core.scope_contains_73(p_scope,p_org,'INITIAL_AUTH_ADMISSION',NULL) THEN 'POLICY_UNDECIDED' ELSE 'SCOPE_DENIED' END
$$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['control_scopes','control_scope_revisions_73','control_scope_organizations_73','control_scope_actions_73','control_scope_systems_73'] LOOP
 EXECUTE format('ALTER TABLE staff_core.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE staff_core.%I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('REVOKE ALL ON staff_core.%I FROM PUBLIC,anon,authenticated,service_role',t);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION staff_core.guard_scope_member_73(),staff_core.guard_scope_revision_73(),staff_core.guard_scope_identity_73(),staff_core.require_scope_history_73(),staff_core.scope_contains_73(uuid,uuid,text,text),staff_core.initial_policy_readiness_73(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
