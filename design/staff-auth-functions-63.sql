-- AUTH-DB-63. REVIEW DRAFT. Run only after task59 and reviewed parent projections.
-- account_current_v1/stop_current_v1/release_current_v1 are REQUIRED adapters
-- of the existing staff_core masters, not new masters. Test fixtures supply
-- them locally; production history/approval projection remains unimplemented.
BEGIN;
CREATE TABLE staff_auth_private.execution_bindings (
 db_role name PRIMARY KEY, issuer text NOT NULL, org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id),
 use_case text NOT NULL CHECK(use_case IN ('RUNTIME','WORKER')),
 actor_id uuid REFERENCES staff_core.actor_registry(actor_id),
 CHECK((use_case='WORKER')=(actor_id IS NOT NULL))
);
REVOKE ALL ON staff_auth_private.execution_bindings FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE staff_auth_private.session_revocation_outbox ADD UNIQUE(operation_id,record_id);
ALTER TABLE staff_auth_private.session_audit_events ADD CONSTRAINT audit_operation_record_fk
 FOREIGN KEY(operation_id,record_id) REFERENCES staff_auth_private.session_revocation_outbox(operation_id,record_id);

CREATE FUNCTION staff_auth_private.guard_session_update_v1() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Session deletion denied'; END IF;
 IF ROW(NEW.record_id,NEW.token_hash,NEW.issuer,NEW.org_id,NEW.account_id,NEW.person_id,NEW.auth_user_id,NEW.provider_session_id,NEW.auth_epoch,NEW.purpose,NEW.expires_at_iso,NEW.expires_at,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.record_id,OLD.token_hash,OLD.issuer,OLD.org_id,OLD.account_id,OLD.person_id,OLD.auth_user_id,OLD.provider_session_id,OLD.auth_epoch,OLD.purpose,OLD.expires_at_iso,OLD.expires_at,OLD.created_at)
 THEN RAISE EXCEPTION 'Session identity immutable'; END IF;
 IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN RAISE EXCEPTION 'Revocation time immutable'; END IF;
 IF NEW.state IS DISTINCT FROM OLD.state AND NOT(OLD.state='ACTIVE' AND NEW.state IN ('EXPIRED','REVOKED') OR OLD.state='EXPIRED' AND NEW.state='REVOKED')
 THEN RAISE EXCEPTION 'Session transition denied'; END IF;
 IF ROW(NEW.credential_version,NEW.credential_key_id,NEW.credential_nonce,NEW.credential_ciphertext,NEW.credential_tag,NEW.credentials_purged_at)
 IS DISTINCT FROM ROW(OLD.credential_version,OLD.credential_key_id,OLD.credential_nonce,OLD.credential_ciphertext,OLD.credential_tag,OLD.credentials_purged_at)
 THEN RAISE EXCEPTION 'Credential mutation requires future maintenance operation'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER session_immutable_v1 BEFORE UPDATE OR DELETE ON staff_auth_private.managed_sessions FOR EACH ROW EXECUTE FUNCTION staff_auth_private.guard_session_update_v1();
CREATE FUNCTION staff_auth_private.guard_audit_v1() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Audit append only'; END $$;
CREATE TRIGGER audit_append_v1 BEFORE UPDATE OR DELETE ON staff_auth_private.session_audit_events FOR EACH ROW EXECUTE FUNCTION staff_auth_private.guard_audit_v1();

CREATE FUNCTION staff_auth_private.guard_outbox_v1() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Cleanup deletion denied'; END IF;
 IF ROW(NEW.operation_id,NEW.record_id,NEW.scope,NEW.created_at) IS DISTINCT FROM ROW(OLD.operation_id,OLD.record_id,OLD.scope,OLD.created_at)
 THEN RAISE EXCEPTION 'Cleanup identity immutable'; END IF;
 IF NEW.state IS DISTINCT FROM OLD.state AND NOT(OLD.state IN ('PENDING','RETRY') AND NEW.state='LEASED' OR OLD.state='LEASED' AND NEW.state IN ('COMPLETED','RETRY','RECONCILE_REQUIRED'))
 THEN RAISE EXCEPTION 'Cleanup transition denied'; END IF;
 IF NEW.state='LEASED' THEN
  IF NEW.attempt_count<>OLD.attempt_count+1 OR OLD.state='LEASED' AND OLD.lease_until>clock_timestamp() THEN RAISE EXCEPTION 'Lease claim denied'; END IF;
 ELSIF NEW.attempt_count<>OLD.attempt_count THEN RAISE EXCEPTION 'Attempt count immutable outside claim'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cleanup_immutable_v1 BEFORE UPDATE OR DELETE ON staff_auth_private.session_revocation_outbox FOR EACH ROW EXECUTE FUNCTION staff_auth_private.guard_outbox_v1();

CREATE FUNCTION staff_auth_private.bound_v1(p_case text) RETURNS staff_auth_private.execution_bindings
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b staff_auth_private.execution_bindings;
BEGIN
 SELECT * INTO b FROM staff_auth_private.execution_bindings WHERE db_role=session_user AND use_case=p_case FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Execution binding unavailable'; END IF;
 IF p_case='WORKER' THEN
  PERFORM 1 FROM staff_core.actor_registry WHERE actor_id=b.actor_id AND actor_type='SERVICE' AND actor_state='ACTIVE' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Technical actor unavailable'; END IF;
 END IF;
 RETURN b;
END $$;

CREATE FUNCTION staff_auth_private.fence_key_v1(p_issuer text,p_org uuid) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT '["STAFF_AUTH_ORG_V1",'||to_json(p_issuer)::text||','||to_json(p_org::text)::text||']'
$$;

CREATE FUNCTION staff_auth_private.account_valid_v1(p_account uuid,p_org uuid,p_issuer text,p_purpose text,p_os text DEFAULT NULL) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a record; t timestamptz:=clock_timestamp(); n integer;
BEGIN
 SELECT count(*) INTO n FROM staff_auth_private.account_current_v1 WHERE account_id=p_account AND org_id=p_org AND issuer=p_issuer;
 IF n<>1 THEN RETURN false; END IF;
 SELECT * INTO a FROM staff_auth_private.account_current_v1 WHERE account_id=p_account AND org_id=p_org AND issuer=p_issuer;
 IF p_purpose NOT IN ('BUSINESS_AUTH','PASSWORD_CHANGE') OR a.account_state IS DISTINCT FROM 'ACTIVE' OR a.person_status IS DISTINCT FROM 'CONFIRMED'
 OR a.organization_state IS DISTINCT FROM 'ACTIVE' OR a.valid_from IS NULL OR a.valid_from>t OR a.valid_to<=t
 OR a.org_valid_from IS NULL OR a.org_valid_from>t OR a.org_valid_to<=t
 OR a.provisioning_state IS DISTINCT FROM 'LINKED' OR a.auth_epoch IS NULL OR a.auth_epoch<1 OR a.authz_version IS NULL OR a.authz_version<1
 OR a.subject IS NULL THEN RETURN false; END IF;
 IF p_purpose='BUSINESS_AUTH' AND (a.credential_state IS DISTINCT FROM 'READY' OR a.business_binding_valid IS DISTINCT FROM true) THEN RETURN false; END IF;
 IF p_purpose='PASSWORD_CHANGE' AND (a.credential_state IS NULL OR a.credential_state NOT IN ('INITIAL_CHANGE_REQUIRED','RESET_CHANGE_REQUIRED')) THEN RETURN false; END IF;
 -- Projections include all stops and only confirmed successful releases.
 IF EXISTS(SELECT 1 FROM staff_auth_private.stop_current_v1 s WHERE s.account_id=p_account AND
   (s.suspension_kind IS NULL OR s.suspension_kind NOT IN ('ACCOUNT_GLOBAL','ORG_ACCESS','OS_ACCESS') OR s.effective_from IS NULL OR s.effective_to<=s.effective_from OR (s.suspension_kind='ACCOUNT_GLOBAL' AND (s.org_id IS NOT NULL OR s.system_code IS NOT NULL)) OR (s.suspension_kind='ORG_ACCESS' AND (s.org_id IS NULL OR s.system_code IS NOT NULL)) OR (s.suspension_kind='OS_ACCESS' AND (s.org_id IS NULL OR s.system_code IS NULL)))) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM staff_auth_private.stop_current_v1 s WHERE s.account_id=p_account AND s.effective_from<=t AND (s.effective_to IS NULL OR t<s.effective_to)
 AND NOT EXISTS(SELECT 1 FROM staff_auth_private.release_current_v1 r WHERE r.suspension_id=s.suspension_id AND r.release_effective_at<=t)
 AND (s.suspension_kind='ACCOUNT_GLOBAL' OR p_purpose='BUSINESS_AUTH' AND s.org_id=p_org AND (s.suspension_kind='ORG_ACCESS' OR s.suspension_kind='OS_ACCESS' AND p_os IS NOT NULL AND s.system_code=p_os)))
 THEN RETURN false; END IF;
 RETURN true;
END $$;

CREATE FUNCTION staff_auth_private.login_ticket_v1(p_login text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b staff_auth_private.execution_bindings; a record; n integer; purpose text;
BEGIN
 b:=staff_auth_private.bound_v1('RUNTIME');
 IF p_login IS NULL OR length(p_login) NOT BETWEEN 1 AND 128 THEN RETURN NULL; END IF;
 SELECT count(*) INTO n FROM staff_auth_private.account_current_v1 WHERE login_name=p_login AND issuer=b.issuer AND org_id=b.org_id;
 IF n<>1 THEN RETURN NULL; END IF;
 SELECT * INTO a FROM staff_auth_private.account_current_v1 WHERE login_name=p_login AND issuer=b.issuer AND org_id=b.org_id;
 purpose:=CASE WHEN a.credential_state='READY' THEN 'BUSINESS_AUTH' ELSE 'PASSWORD_CHANGE' END;
 IF NOT staff_auth_private.account_valid_v1(a.account_id,b.org_id,b.issuer,purpose) OR a.provider_login_identifier IS NULL THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('accountId',a.account_id,'personId',a.person_id,'authUserId',a.subject,'issuer',b.issuer,'orgId',b.org_id,'authEpoch',a.auth_epoch,'credentialState',a.credential_state,'providerLoginIdentifier',a.provider_login_identifier);
END $$;

CREATE FUNCTION staff_auth_private.read_session_v1(p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b staff_auth_private.execution_bindings; v jsonb;
BEGIN
 b:=staff_auth_private.bound_v1('RUNTIME'); IF p_hash IS NULL OR p_hash!~'^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 SELECT to_jsonb(s) INTO v FROM staff_auth_private.managed_sessions s WHERE token_hash=p_hash AND issuer=b.issuer AND org_id=b.org_id;
 RETURN v;
END $$;

CREATE FUNCTION staff_auth_private.confirm_current_session_v1(p_hash text,p_record uuid,p_epoch bigint,p_purpose text,p_expiry text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b staff_auth_private.execution_bindings; s staff_auth_private.managed_sessions; a record; t timestamptz;
BEGIN
 b:=staff_auth_private.bound_v1('RUNTIME');
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(staff_auth_private.fence_key_v1(b.issuer,b.org_id),0));
 SELECT * INTO s FROM staff_auth_private.managed_sessions WHERE token_hash=p_hash AND record_id=p_record AND issuer=b.issuer AND org_id=b.org_id FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF; t:=clock_timestamp();
 IF s.state<>'ACTIVE' OR s.auth_epoch IS DISTINCT FROM p_epoch OR s.purpose IS DISTINCT FROM p_purpose OR s.expires_at_iso IS DISTINCT FROM p_expiry OR s.expires_at<=t THEN RETURN false; END IF;
 IF NOT staff_auth_private.account_valid_v1(s.account_id,b.org_id,b.issuer,s.purpose) THEN RETURN false; END IF;
 SELECT * INTO a FROM staff_auth_private.account_current_v1 WHERE account_id=s.account_id AND issuer=b.issuer AND org_id=b.org_id;
 IF a.person_id<>s.person_id OR a.subject<>s.auth_user_id OR a.auth_epoch<>s.auth_epoch THEN RETURN false; END IF;
 RETURN EXISTS(SELECT 1 FROM auth.sessions ps JOIN auth.users u ON u.id=ps.user_id WHERE ps.id=s.provider_session_id AND u.id=s.auth_user_id AND u.deleted_at IS NULL AND u.is_anonymous=false AND (u.banned_until IS NULL OR u.banned_until<=clock_timestamp()) AND (ps.not_after IS NULL OR ps.not_after>clock_timestamp())) AND s.expires_at>clock_timestamp();
END $$;

CREATE FUNCTION staff_auth_private.confirm_login_v1(p_record uuid,p_hash text,p_account uuid,p_person uuid,p_user uuid,p_session uuid,p_epoch bigint,p_purpose text,p_expiry text,p_envelope jsonb) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b staff_auth_private.execution_bindings; a record; t timestamptz; e timestamptz;
BEGIN
 b:=staff_auth_private.bound_v1('RUNTIME');
 PERFORM pg_advisory_xact_lock_shared(hashtextextended(staff_auth_private.fence_key_v1(b.issuer,b.org_id),0));
 IF NOT staff_auth_private.account_valid_v1(p_account,b.org_id,b.issuer,p_purpose) THEN RAISE EXCEPTION 'Binding denied'; END IF;
 SELECT * INTO a FROM staff_auth_private.account_current_v1 WHERE account_id=p_account AND issuer=b.issuer AND org_id=b.org_id;
 IF a.person_id IS DISTINCT FROM p_person OR a.subject IS DISTINCT FROM p_user OR a.auth_epoch IS DISTINCT FROM p_epoch THEN RAISE EXCEPTION 'Binding changed'; END IF;
 IF p_envelope IS NULL OR jsonb_typeof(p_envelope)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_envelope))<>5
 OR NOT p_envelope ?& ARRAY['version','keyId','nonce','ciphertext','tag'] THEN RAISE EXCEPTION 'Envelope rejected'; END IF;
 IF p_expiry IS NULL OR p_expiry!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$' THEN RAISE EXCEPTION 'Deadline rejected'; END IF;
 e:=p_expiry::timestamptz; t:=clock_timestamp();
 IF e<=t OR e>t+interval '1 day' OR NOT EXISTS(SELECT 1 FROM auth.sessions ps JOIN auth.users u ON u.id=ps.user_id WHERE ps.id=p_session AND u.id=p_user AND u.deleted_at IS NULL AND u.is_anonymous=false AND (u.banned_until IS NULL OR u.banned_until<=t) AND (ps.not_after IS NULL OR e<=ps.not_after)) THEN RAISE EXCEPTION 'Auth session denied'; END IF;
 INSERT INTO staff_auth_private.managed_sessions(record_id,token_hash,issuer,org_id,account_id,person_id,auth_user_id,provider_session_id,auth_epoch,purpose,state,created_at,expires_at,expires_at_iso,credential_version,credential_key_id,credential_nonce,credential_ciphertext,credential_tag)
 VALUES(p_record,p_hash,b.issuer,b.org_id,p_account,p_person,p_user,p_session,p_epoch,p_purpose,'ACTIVE',t,e,p_expiry,p_envelope->>'version',p_envelope->>'keyId',p_envelope->>'nonce',p_envelope->>'ciphertext',p_envelope->>'tag');
 IF NOT FOUND THEN RAISE EXCEPTION 'Session persistence unconfirmed'; END IF;
 INSERT INTO staff_auth_private.session_audit_events(event_id,record_id,event_code,recorded_at,attribution) VALUES(gen_random_uuid(),p_record,'SESSION_CREATED',t,'VERIFIED_AUTH_SESSION');
 IF NOT FOUND THEN RAISE EXCEPTION 'Audit persistence unconfirmed'; END IF;
 RETURN p_record;
END $$;

CREATE FUNCTION staff_auth_private.revoke_local_session_v1(p_hash text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b staff_auth_private.execution_bindings; s staff_auth_private.managed_sessions; o staff_auth_private.session_revocation_outbox; t timestamptz; op uuid;
BEGIN
 b:=staff_auth_private.bound_v1('RUNTIME'); IF p_hash IS NULL OR p_hash!~'^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'Selector rejected'; END IF;
 SELECT * INTO s FROM staff_auth_private.managed_sessions WHERE token_hash=p_hash AND issuer=b.issuer AND org_id=b.org_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO o FROM staff_auth_private.session_revocation_outbox WHERE record_id=s.record_id FOR UPDATE;
 IF s.state='REVOKED' THEN
  IF o.operation_id IS NULL THEN RAISE EXCEPTION 'Revocation inconsistent'; END IF;
  IF o.state='COMPLETED' THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('operationId',o.operation_id,'recordId',s.record_id);
 END IF;
 IF o.operation_id IS NOT NULL THEN RAISE EXCEPTION 'Revocation inconsistent'; END IF;
 t:=clock_timestamp(); op:=gen_random_uuid();
 UPDATE staff_auth_private.managed_sessions SET state='REVOKED',revoked_at=t WHERE record_id=s.record_id;
 INSERT INTO staff_auth_private.session_revocation_outbox(operation_id,record_id,scope,state,created_at,next_attempt_at,attempt_count) VALUES(op,s.record_id,'LOCAL','PENDING',t,t,0);
 INSERT INTO staff_auth_private.session_audit_events(event_id,record_id,operation_id,event_code,recorded_at,attribution) VALUES(gen_random_uuid(),s.record_id,op,'SESSION_REVOKED',t,'SESSION_COOKIE_POSSESSION');
 IF NOT FOUND THEN RAISE EXCEPTION 'Audit persistence unconfirmed'; END IF;
 RETURN jsonb_build_object('operationId',op,'recordId',s.record_id);
END $$;

CREATE FUNCTION staff_auth_private.claim_revocation_v1(p_operation uuid,p_lease_seconds integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b staff_auth_private.execution_bindings; o record; token uuid; t timestamptz;
BEGIN
 b:=staff_auth_private.bound_v1('WORKER'); IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 1 AND 3600 THEN RAISE EXCEPTION 'Lease rejected'; END IF;
 t:=clock_timestamp();
 SELECT q.operation_id,q.record_id INTO o FROM staff_auth_private.session_revocation_outbox q JOIN staff_auth_private.managed_sessions s ON s.record_id=q.record_id WHERE s.issuer=b.issuer AND s.org_id=b.org_id AND s.state='REVOKED' AND (p_operation IS NULL OR q.operation_id=p_operation) AND ((q.state IN ('PENDING','RETRY') AND q.next_attempt_at<=t) OR (q.state='LEASED' AND q.lease_until<=t)) ORDER BY q.next_attempt_at,q.operation_id FOR UPDATE OF q SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL; END IF; token:=gen_random_uuid(); t:=clock_timestamp();
 UPDATE staff_auth_private.session_revocation_outbox SET state='LEASED',lease_token=token,lease_until=t+make_interval(secs=>p_lease_seconds),attempt_count=attempt_count+1 WHERE operation_id=o.operation_id;
 RETURN jsonb_build_object('operationId',o.operation_id,'recordId',o.record_id,'leaseToken',token);
END $$;

CREATE FUNCTION staff_auth_private.read_claim_credentials_v1(p_operation uuid,p_record uuid,p_token uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b staff_auth_private.execution_bindings; s staff_auth_private.managed_sessions; o staff_auth_private.session_revocation_outbox;
BEGIN
 b:=staff_auth_private.bound_v1('WORKER');
 SELECT * INTO s FROM staff_auth_private.managed_sessions WHERE record_id=p_record AND issuer=b.issuer AND org_id=b.org_id AND state='REVOKED' FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT * INTO o FROM staff_auth_private.session_revocation_outbox WHERE operation_id=p_operation AND record_id=p_record FOR UPDATE;
 IF NOT FOUND OR o.state<>'LEASED' OR o.lease_token IS DISTINCT FROM p_token OR o.lease_until<=clock_timestamp() THEN RETURN NULL; END IF;
 RETURN to_jsonb(s);
END $$;

CREATE FUNCTION staff_auth_private.finish_revocation_v1(p_operation uuid,p_record uuid,p_token uuid,p_outcome text,p_error text,p_next timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b staff_auth_private.execution_bindings; t timestamptz; code text;
BEGIN
 b:=staff_auth_private.bound_v1('WORKER');
 IF p_outcome IS NULL OR p_outcome NOT IN ('COMPLETED','RETRY','RECONCILE_REQUIRED') THEN RAISE EXCEPTION 'Outcome rejected'; END IF;
 IF p_outcome='COMPLETED' AND (p_error IS NOT NULL OR p_next IS NOT NULL) OR p_outcome<>'COMPLETED' AND (p_error IS NULL OR p_error NOT IN ('PROVIDER_UNAVAILABLE','RESULT_UNKNOWN','CREDENTIAL_UNAVAILABLE','PERSISTENCE_UNCONFIRMED')) OR p_outcome='RECONCILE_REQUIRED' AND p_next IS NOT NULL THEN RAISE EXCEPTION 'Evidence rejected'; END IF;
 PERFORM 1 FROM staff_auth_private.managed_sessions WHERE record_id=p_record AND issuer=b.issuer AND org_id=b.org_id AND state='REVOKED' FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF;
 PERFORM 1 FROM staff_auth_private.session_revocation_outbox WHERE operation_id=p_operation AND record_id=p_record FOR UPDATE;
 IF NOT FOUND THEN RETURN false; END IF; t:=clock_timestamp();
 IF p_outcome='RETRY' AND (p_next IS NULL OR p_next<=t) THEN RAISE EXCEPTION 'Retry deadline rejected'; END IF;
 UPDATE staff_auth_private.session_revocation_outbox SET state=p_outcome,lease_token=NULL,lease_until=NULL,completed_at=CASE WHEN p_outcome='COMPLETED' THEN t ELSE NULL END,next_attempt_at=coalesce(p_next,next_attempt_at),last_error_code=p_error
 WHERE operation_id=p_operation AND record_id=p_record AND state='LEASED' AND lease_token=p_token AND lease_until>t;
 IF NOT FOUND THEN RETURN false; END IF;
 code:=CASE p_outcome WHEN 'COMPLETED' THEN 'PROVIDER_REVOCATION_COMPLETED' WHEN 'RETRY' THEN 'PROVIDER_REVOCATION_RETRY' ELSE 'PROVIDER_REVOCATION_RECONCILE' END;
 INSERT INTO staff_auth_private.session_audit_events(event_id,record_id,operation_id,event_code,recorded_at,attribution,actor_id) VALUES(gen_random_uuid(),p_record,p_operation,code,t,'TECHNICAL_ACTOR',b.actor_id);
 IF NOT FOUND THEN RAISE EXCEPTION 'Audit persistence unconfirmed'; END IF;
 RETURN true;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA staff_auth_private FROM PUBLIC,anon,authenticated,service_role;
-- Function ownership, minimal column grants, RLS and connection memberships
-- require the environment's reviewed deployment script. Not enabled here.
COMMIT;
