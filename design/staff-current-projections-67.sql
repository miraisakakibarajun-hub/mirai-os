-- CURRENT-PROJECTION-67. REVIEW DRAFT / not deployed.
-- Requires history65, effect evidence66 and the documented org/relation/auth
-- control/actor contract. Supporting parent history is not implemented here.
BEGIN;
CREATE VIEW staff_auth_private.account_current_v1 WITH(security_invoker=true) AS
WITH time_point AS MATERIALIZED (
 -- One fresh clock per projection evaluation. Statement start can precede
 -- lock waits and must not keep yesterday's person segment after midnight.
 SELECT at,(at AT TIME ZONE 'Asia/Tokyo')::date AS business_day
 FROM (SELECT clock_timestamp() AS at) stamp
), current_relations AS (
 SELECT DISTINCT r.person_id,r.org_id FROM staff_core.person_organizations r
 CROSS JOIN time_point t WHERE r.relationship_state='ACTIVE' AND r.verification_status='CONFIRMED'
 AND r.valid_from IS NOT NULL AND r.valid_from<=t.business_day AND (r.valid_to IS NULL OR t.business_day<r.valid_to)
), live_actors AS (
 SELECT account_id,count(*) AS actor_count FROM staff_core.actor_registry
 WHERE actor_type='PERSON_ACCOUNT' AND actor_state='ACTIVE' GROUP BY account_id
)
SELECT a.account_id,a.person_id,
 -- Auth UUID is an external string in the master. Invalid/non-Supabase IDs
 -- stay unknown instead of throwing or inventing a replacement UUID.
 CASE WHEN a.subject ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN a.subject::uuid ELSE NULL END AS subject,
 a.issuer,o.org_id,v.login_name,v.provider_login_identifier,
 CASE WHEN ac.interpretation_state='CONFIRMED' THEN v.account_state ELSE 'UNVERIFIED' END AS account_state,
 CASE WHEN pc.interpretation_state='CONFIRMED' THEN p.record_status ELSE 'UNVERIFIED' END AS person_status,
 o.organization_state,ac.valid_from,ac.valid_to,
 (o.valid_from::timestamp AT TIME ZONE 'Asia/Tokyo') AS org_valid_from,
 (o.valid_to::timestamp AT TIME ZONE 'Asia/Tokyo') AS org_valid_to,
 authc.provisioning_state,authc.credential_state,authc.auth_epoch,authz.account_authz_version AS authz_version,
 coalesce(actors.actor_count=1,false) AS business_binding_valid
FROM staff_core.account_links a
JOIN staff_core.persons p ON p.person_id=a.person_id
JOIN staff_core.person_current_segments_65 pc ON pc.person_id=p.person_id
JOIN staff_core.account_current_segments_65 ac ON ac.account_id=a.account_id
JOIN staff_core.account_link_revisions v ON v.account_id=a.account_id AND v.revision_id=ac.revision_id
JOIN current_relations r ON r.person_id=a.person_id
JOIN staff_core.organizations o ON o.org_id=r.org_id
LEFT JOIN staff_core.account_auth_controls authc ON authc.account_id=a.account_id
LEFT JOIN staff_core.account_authz_controls authz ON authz.account_id=a.account_id
LEFT JOIN live_actors actors ON actors.account_id=a.account_id
CROSS JOIN time_point t
WHERE pc.valid_period @> t.business_day AND ac.valid_period @> t.at;
-- Include ALL stops, regardless of org/workflow/purpose; filter at evaluation.
CREATE VIEW staff_auth_private.stop_current_v1 WITH(security_invoker=true) AS
 SELECT suspension_id,account_id,suspension_kind,org_id,system_code,effective_from,effective_to FROM staff_core.stop_segments_66;
-- Already-persisted success evidence is immutable. Keep future releases here
-- and apply their timestamp at evaluation; do not join current request pointers.
CREATE VIEW staff_auth_private.release_current_v1 WITH(security_invoker=true) AS
 SELECT suspension_id,release_effective_at FROM staff_core.release_segments_66;
REVOKE ALL ON staff_auth_private.account_current_v1,staff_auth_private.stop_current_v1,staff_auth_private.release_current_v1 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
