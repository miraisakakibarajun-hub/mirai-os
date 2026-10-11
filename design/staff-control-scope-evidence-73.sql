-- SCOPE-EVIDENCE-73: structural scope check, NOT actor authority.
BEGIN;
CREATE FUNCTION staff_core.validate_effect_scope_73() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c staff_core.change_requests;d staff_core.suspension_request_details;scope uuid;org uuid;sys text;action text;
BEGIN
 SELECT * INTO c FROM staff_core.change_requests WHERE request_id=NEW.request_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Request unavailable for scope check'; END IF;
 IF TG_TABLE_NAME='initial_auth_admissions' THEN
  SELECT org_id INTO org FROM staff_core.initial_auth_request_details WHERE request_revision_id=NEW.request_revision_id;
  SELECT control_scope_id INTO scope FROM staff_core.request_revisions WHERE request_revision_id=NEW.request_revision_id;action:='INITIAL_AUTH_ADMISSION';
 ELSE
  SELECT * INTO d FROM staff_core.suspension_request_details WHERE request_revision_id=NEW.request_revision_id;
  scope:=d.control_scope_id;org:=d.org_id;sys:=d.system_code;
  action:=CASE d.suspension_kind WHEN 'ACCOUNT_GLOBAL' THEN 'ACCOUNT_GLOBAL_' WHEN 'ORG_ACCESS' THEN 'ORG_' WHEN 'OS_ACCESS' THEN 'OS_' ELSE NULL END||CASE d.action_kind WHEN 'STOP' THEN 'STOP' WHEN 'RELEASE' THEN 'RELEASE' ELSE NULL END;
 END IF;
 PERFORM 1 FROM staff_core.control_scopes WHERE control_scope_id=scope FOR SHARE;
 IF NOT staff_core.scope_contains_73(scope,org,action,sys) THEN RAISE EXCEPTION 'Effect outside confirmed current control scope'; END IF;
 RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER initial_scope_73 AFTER INSERT ON staff_core.initial_auth_admissions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.validate_effect_scope_73();
CREATE CONSTRAINT TRIGGER stop_scope_73 AFTER INSERT ON staff_core.access_suspensions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.validate_effect_scope_73();
CREATE CONSTRAINT TRIGGER release_scope_73 AFTER INSERT ON staff_core.suspension_releases DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION staff_core.validate_effect_scope_73();
REVOKE ALL ON FUNCTION staff_core.validate_effect_scope_73() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
