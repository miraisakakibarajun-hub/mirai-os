-- INITIAL-ADMISSION-70 projection variant. REVIEW DRAFT / not deployed.
-- Requires history65, effect evidence66 and the documented org/relation/auth
-- control/actor contract. Uses reviewed parent/history68; approval/Auth remain external prerequisites.
BEGIN;
CREATE VIEW staff_auth_private.account_current_v1 WITH(security_invoker=true) AS
WITH time_point AS MATERIALIZED (
 -- One fresh clock per projection evaluation. Statement start can precede
 -- lock waits and must not keep yesterday's person segment after midnight.
 SELECT at,(at AT TIME ZONE 'Asia/Tokyo')::date AS business_day
 FROM (SELECT clock_timestamp() AS at) stamp
), current_relations AS (
 SELECT DISTINCT r.person_id,r.org_id FROM staff_core.person_organizations r
 JOIN staff_core.person_organization_current_segments_68 rs ON rs.relation_id=r.relation_id
 JOIN staff_core.person_organization_revisions rv ON rv.revision_id=rs.revision_id AND rv.relation_id=r.relation_id
 CROSS JOIN time_point t WHERE rv.relationship_state='ACTIVE' AND rv.verification_status='CONFIRMED' AND rs.interpretation_state='CONFIRMED'
 AND rs.valid_period @> t.business_day
), org_edges AS (
 SELECT a.account_id,r.org_id,true AS relation_valid FROM staff_core.account_links a
 JOIN current_relations r ON r.person_id=a.person_id
 UNION ALL
 SELECT a.account_id,d.org_id,false FROM staff_core.initial_auth_admissions g
 JOIN staff_core.initial_auth_request_details d USING(request_revision_id)
 JOIN staff_core.account_links a ON a.account_id=d.account_id AND a.person_id=d.person_id AND a.issuer=d.issuer
 JOIN staff_core.account_auth_controls c ON c.account_id=a.account_id
 CROSS JOIN time_point t
 WHERE c.provisioning_state='LINKED' AND c.credential_state='INITIAL_CHANGE_REQUIRED'
 AND c.auth_epoch=d.auth_epoch AND d.valid_from<=t.at AND t.at<d.valid_to
), permitted_orgs AS (
 SELECT account_id,org_id,bool_or(relation_valid) AS relation_valid FROM org_edges GROUP BY account_id,org_id
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
 CASE WHEN os.interpretation_state='CONFIRMED' THEN ov.organization_state ELSE 'UNVERIFIED' END AS organization_state,ac.valid_from,ac.valid_to,
 (os.valid_from::timestamp AT TIME ZONE 'Asia/Tokyo') AS org_valid_from,
 (os.valid_to::timestamp AT TIME ZONE 'Asia/Tokyo') AS org_valid_to,
 authc.provisioning_state,authc.credential_state,authc.auth_epoch,authz.account_authz_version AS authz_version,
 (r.relation_valid AND coalesce(actors.actor_count=1,false)) AS business_binding_valid
FROM staff_core.account_links a
JOIN staff_core.persons p ON p.person_id=a.person_id
JOIN staff_core.person_current_segments_65 pc ON pc.person_id=p.person_id
JOIN staff_core.account_current_segments_65 ac ON ac.account_id=a.account_id
JOIN staff_core.account_link_revisions v ON v.account_id=a.account_id AND v.revision_id=ac.revision_id
JOIN permitted_orgs r ON r.account_id=a.account_id
JOIN staff_core.organizations o ON o.org_id=r.org_id
JOIN staff_core.organization_current_segments_68 os ON os.org_id=o.org_id
JOIN staff_core.organization_revisions ov ON ov.org_id=o.org_id AND ov.revision_id=os.revision_id
LEFT JOIN staff_core.account_auth_controls authc ON authc.account_id=a.account_id
LEFT JOIN staff_core.account_authz_controls authz ON authz.account_id=a.account_id
LEFT JOIN live_actors actors ON actors.account_id=a.account_id
CROSS JOIN time_point t
WHERE pc.valid_period @> t.business_day AND ac.valid_period @> t.at AND os.valid_period @> t.business_day;
-- Include ALL stops, regardless of org/workflow/purpose; filter at evaluation.
CREATE VIEW staff_auth_private.stop_current_v1 WITH(security_invoker=true) AS
 SELECT suspension_id,account_id,suspension_kind,org_id,system_code,effective_from,effective_to FROM staff_core.stop_segments_66;
-- Already-persisted success evidence is immutable. Keep future releases here
-- and apply their timestamp at evaluation; do not join current request pointers.
CREATE VIEW staff_auth_private.release_current_v1 WITH(security_invoker=true) AS
 SELECT suspension_id,release_effective_at FROM staff_core.release_segments_66;
REVOKE ALL ON staff_auth_private.account_current_v1,staff_auth_private.stop_current_v1,staff_auth_private.release_current_v1 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
