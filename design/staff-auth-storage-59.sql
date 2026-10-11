-- AUTH-STORAGE-59: REVIEW DRAFT ONLY. Not an automatic migration.
-- Requires adopted staff_core persons/account_links/organizations/actor_registry
-- DDL first. No parent rows, accounts, grants, keys or Auth users are created.
BEGIN;
CREATE SCHEMA staff_auth_private;
REVOKE ALL ON SCHEMA staff_auth_private FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE staff_auth_private.managed_sessions (
  record_id uuid PRIMARY KEY,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  issuer text NOT NULL CHECK (length(btrim(issuer)) > 0),
  org_id uuid NOT NULL REFERENCES staff_core.organizations(org_id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES staff_core.account_links(account_id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES staff_core.persons(person_id) ON DELETE RESTRICT,
  auth_user_id uuid NOT NULL, -- external identifier; deliberately no auth.users CASCADE
  provider_session_id uuid NOT NULL, -- verified auth.sessions identity; no external FK
  auth_epoch bigint NOT NULL CHECK (auth_epoch BETWEEN 1 AND 9007199254740991),
  purpose text NOT NULL CHECK (purpose IN ('BUSINESS_AUTH','PASSWORD_CHANGE')),
  state text NOT NULL CHECK (state IN ('ACTIVE','REVOKED','EXPIRED')),
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  -- Preserve exact crypto AAD spelling through DB serialization; do not rebuild
  -- it with driver locale, SQL formatting or timezone-dependent conversion.
  expires_at_iso text NOT NULL CHECK (
    expires_at_iso ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
    AND expires_at_iso::timestamptz = expires_at),
  revoked_at timestamptz,
  credential_version text,
  credential_key_id text,
  credential_nonce text,
  credential_ciphertext text,
  credential_tag text,
  credentials_purged_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK ((state = 'REVOKED') = (revoked_at IS NOT NULL)),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at),
  CHECK (
    (credentials_purged_at IS NULL AND credential_version IS NOT NULL
      AND credential_version = 'AES256GCM_V1'
      AND credential_key_id IS NOT NULL AND credential_key_id ~ '^[A-Za-z0-9_-]{1,64}$'
      AND credential_nonce IS NOT NULL AND credential_nonce ~ '^[A-Za-z0-9_-]{16}$'
      AND credential_ciphertext IS NOT NULL AND length(credential_ciphertext) BETWEEN 1 AND 50000 AND credential_ciphertext ~ '^[A-Za-z0-9_-]+$'
      AND credential_tag IS NOT NULL AND credential_tag ~ '^[A-Za-z0-9_-]{22}$')
    OR (state <> 'ACTIVE' AND credentials_purged_at IS NOT NULL
      AND credential_version IS NULL AND credential_key_id IS NULL
      AND credential_nonce IS NULL AND credential_ciphertext IS NULL AND credential_tag IS NULL)
  )
);
CREATE INDEX managed_sessions_account_idx ON staff_auth_private.managed_sessions(account_id, auth_epoch);
CREATE INDEX managed_sessions_person_idx ON staff_auth_private.managed_sessions(person_id);
CREATE INDEX managed_sessions_org_idx ON staff_auth_private.managed_sessions(org_id);
CREATE INDEX managed_sessions_provider_idx ON staff_auth_private.managed_sessions(issuer, provider_session_id);
CREATE INDEX managed_sessions_expiry_idx ON staff_auth_private.managed_sessions(expires_at) WHERE state = 'ACTIVE';

CREATE TABLE staff_auth_private.session_revocation_outbox (
  operation_id uuid PRIMARY KEY,
  record_id uuid NOT NULL UNIQUE REFERENCES staff_auth_private.managed_sessions(record_id) ON DELETE RESTRICT,
  scope text NOT NULL CHECK (scope = 'LOCAL'),
  state text NOT NULL CHECK (state IN ('PENDING','LEASED','RETRY','COMPLETED','RECONCILE_REQUIRED')),
  created_at timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL,
  attempt_count integer NOT NULL CHECK (attempt_count >= 0),
  lease_token uuid,
  lease_until timestamptz,
  completed_at timestamptz,
  -- Fixed technical code only: never store provider response bodies or tokens.
  last_error_code text CHECK (last_error_code IN ('PROVIDER_UNAVAILABLE','RESULT_UNKNOWN','CREDENTIAL_UNAVAILABLE','PERSISTENCE_UNCONFIRMED')),
  CHECK ((state = 'LEASED') = (lease_token IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK ((lease_token IS NULL) = (lease_until IS NULL)),
  CHECK (state = 'LEASED' OR (lease_token IS NULL AND lease_until IS NULL)),
  CHECK ((state = 'COMPLETED') = (completed_at IS NOT NULL)),
  CHECK (completed_at IS NULL OR completed_at >= created_at)
);
CREATE INDEX session_revocation_due_idx ON staff_auth_private.session_revocation_outbox(next_attempt_at, operation_id) WHERE state IN ('PENDING','RETRY');
CREATE INDEX session_revocation_lease_idx ON staff_auth_private.session_revocation_outbox(lease_until) WHERE state = 'LEASED';

-- Authentication evidence, separate from business approval audit. A verified
-- session can exist before a business actor is issued. Never invent an actor.
CREATE TABLE staff_auth_private.session_audit_events (
  event_id uuid PRIMARY KEY,
  record_id uuid NOT NULL REFERENCES staff_auth_private.managed_sessions(record_id) ON DELETE RESTRICT,
  operation_id uuid REFERENCES staff_auth_private.session_revocation_outbox(operation_id) ON DELETE RESTRICT,
  event_code text NOT NULL CHECK (event_code IN ('SESSION_CREATED','SESSION_REVOKED','PROVIDER_REVOCATION_COMPLETED','PROVIDER_REVOCATION_RETRY','PROVIDER_REVOCATION_RECONCILE','SESSION_EXPIRED','CREDENTIALS_PURGED')),
  recorded_at timestamptz NOT NULL,
  attribution text NOT NULL CHECK (attribution IN ('VERIFIED_AUTH_SESSION','SESSION_COOKIE_POSSESSION','TECHNICAL_ACTOR')),
  actor_id uuid REFERENCES staff_core.actor_registry(actor_id) ON DELETE RESTRICT,
  CHECK ((attribution = 'TECHNICAL_ACTOR') = (actor_id IS NOT NULL)),
  CHECK ((event_code = 'SESSION_CREATED' AND attribution = 'VERIFIED_AUTH_SESSION' AND operation_id IS NULL)
    OR (event_code = 'SESSION_REVOKED' AND attribution = 'SESSION_COOKIE_POSSESSION' AND operation_id IS NOT NULL)
    OR (event_code IN ('PROVIDER_REVOCATION_COMPLETED','PROVIDER_REVOCATION_RETRY','PROVIDER_REVOCATION_RECONCILE') AND attribution = 'TECHNICAL_ACTOR' AND operation_id IS NOT NULL)
    OR (event_code IN ('SESSION_EXPIRED','CREDENTIALS_PURGED') AND attribution = 'TECHNICAL_ACTOR' AND operation_id IS NULL))
);
CREATE INDEX session_audit_record_idx ON staff_auth_private.session_audit_events(record_id, recorded_at);
CREATE INDEX session_audit_operation_idx ON staff_auth_private.session_audit_events(operation_id);
CREATE INDEX session_audit_actor_idx ON staff_auth_private.session_audit_events(actor_id);
CREATE UNIQUE INDEX session_audit_once_idx ON staff_auth_private.session_audit_events(record_id, event_code)
  WHERE event_code IN ('SESSION_CREATED','SESSION_REVOKED','PROVIDER_REVOCATION_COMPLETED','SESSION_EXPIRED','CREDENTIALS_PURGED');

-- Intentionally no application grants/policies or SECURITY DEFINER bypass.
-- Dedicated constrained runtime/worker roles and functions remain a later task.
ALTER TABLE staff_auth_private.managed_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_auth_private.managed_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_auth_private.session_revocation_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_auth_private.session_revocation_outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE staff_auth_private.session_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_auth_private.session_audit_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA staff_auth_private FROM PUBLIC, anon, authenticated, service_role;
COMMIT;
