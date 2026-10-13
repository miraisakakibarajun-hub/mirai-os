-- GRANT-DEPENDENCY-REFERENCE-83: unapplied read-only diagnostic proposal.
-- Requires65/68/75/76/77/78/80/81/82; never verifies authorization.
BEGIN;
CREATE INDEX grant_dependency_lookup_83 ON staff_core.grant_dependencies_75(grant_id,revision_id,dependency_id);
CREATE FUNCTION staff_core.grant_dependency_reference_at_83(p_grant uuid,p_at timestamptz) RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH tick AS MATERIALIZED(SELECT p_at at,(p_at AT TIME ZONE 'Asia/Tokyo')::date business_day),
 ctx AS MATERIALIZED(
 SELECT g.grant_id,g.account_id,g.person_id,g.org_id,s.set_id,r.revision_id,r.scope_id,r.scope_revision_id,r.grant_state,r.authz_version,r.system_code,r.resource_kind,r.action_code,r.resource_external_id
 FROM staff_core.access_grants g JOIN staff_core.grant_revision_sets_75 s ON s.grant_id=g.grant_id AND s.set_id=g.current_set_id AND s.sealed
 JOIN staff_core.grant_revision_set_members_75 m ON m.set_id=s.set_id JOIN staff_core.access_grant_revisions_75 r ON r.revision_id=m.revision_id AND r.sealed CROSS JOIN tick
 WHERE g.grant_id=p_grant AND m.interpretation_state='CONFIRMED' AND m.valid_from<=tick.at AND (m.valid_to IS NULL OR tick.at<m.valid_to)
 AND r.valid_from<=tick.at AND (r.valid_to IS NULL OR tick.at<r.valid_to)),
 parents AS MATERIALIZED(
 SELECT c.*,
 EXISTS(SELECT 1 FROM staff_core.persons p JOIN staff_core.person_current_segments_65 ps ON ps.person_id=p.person_id
 WHERE p.person_id=c.person_id AND p.record_status='CONFIRMED' AND p.merged_into_person_id IS NULL AND ps.interpretation_state='CONFIRMED' AND ps.valid_period @>tick.business_day) person_record_ready,
 EXISTS(SELECT 1 FROM staff_core.account_current_segments_65 ac JOIN staff_core.account_link_revisions ar ON ar.revision_id=ac.revision_id
 WHERE ac.account_id=c.account_id AND ar.account_state='ACTIVE' AND ac.interpretation_state='CONFIRMED' AND ac.valid_period @>tick.at) account_record_ready,
 EXISTS(SELECT 1 FROM staff_core.scope_definitions sc WHERE sc.scope_id=c.scope_id AND sc.org_id=c.org_id AND staff_core.scope_operating_reference_at_80(sc.scope_id,tick.at)='REFERENCE_ACTIVE' AND (sc.scope_kind<>'DEPARTMENT' OR staff_core.department_structure_reference_at_80(sc.department_id,tick.at)='STRUCTURE_READY')) scope_record_ready,
 EXISTS(SELECT 1 FROM staff_core.scope_definitions d JOIN staff_core.scope_revision_sets_76 s ON s.scope_id=d.scope_id AND s.set_id=d.current_set_id AND s.sealed JOIN staff_core.scope_revision_set_members_76 m ON m.set_id=s.set_id JOIN staff_core.scope_definition_revisions r ON r.revision_id=m.revision_id AND r.sealed
 WHERE d.scope_id=c.scope_id AND d.org_id=c.org_id AND r.revision_id=c.scope_revision_id AND r.scope_state='ACTIVE' AND r.verification_status='CONFIRMED' AND m.interpretation_state='CONFIRMED' AND m.valid_from<=tick.at AND (m.valid_to IS NULL OR tick.at<m.valid_to) AND r.valid_from<=tick.at AND (r.valid_to IS NULL OR tick.at<r.valid_to)) bound_scope_revision_current
 FROM ctx c CROSS JOIN tick),
 refs AS MATERIALIZED(
 SELECT d.dependency_id,d.dependency_kind,COALESCE(d.person_org_relation_id,d.assignment_id,d.contract_id,d.role_assignment_id) target_id,
 CASE d.dependency_kind
 WHEN 'PERSON_ORG' THEN EXISTS(SELECT 1 FROM staff_core.person_organizations po JOIN staff_core.person_organization_current_segments_68 s ON s.relation_id=po.relation_id JOIN staff_core.person_organization_revisions r ON r.revision_id=s.revision_id
 WHERE po.relation_id=d.person_org_relation_id AND po.person_id=d.person_id AND po.org_id=d.org_id AND r.relationship_state='ACTIVE' AND r.verification_status='CONFIRMED' AND s.interpretation_state='CONFIRMED' AND s.valid_period @>tick.business_day)
 WHEN 'ASSIGNMENT' THEN staff_core.assignment_reference_at_80(d.assignment_id,tick.at)='ASSIGNMENT_READY'
 WHEN 'CONTRACT' THEN staff_core.contract_reference_at_81(d.contract_id,tick.at)='CONTRACT_READY'
 WHEN 'ROLE_ASSIGNMENT' THEN staff_core.role_assignment_reference_at_82(d.role_assignment_id,tick.at)='ROLE_ASSIGNMENT_READY'
 ELSE false END reference_ready,
 CASE d.dependency_kind
 WHEN 'ASSIGNMENT' THEN CASE WHEN EXISTS(SELECT 1 FROM staff_core.assignments a WHERE a.assignment_id=d.assignment_id AND a.scope_id=c.scope_id) THEN 'EXACT_SCOPE_REFERENCE' ELSE 'SCOPE_POLICY_UNDECIDED' END
 WHEN 'ROLE_ASSIGNMENT' THEN CASE WHEN EXISTS(SELECT 1 FROM staff_core.role_assignments a WHERE a.role_assignment_id=d.role_assignment_id AND a.scope_id=c.scope_id) THEN 'EXACT_SCOPE_REFERENCE' ELSE 'SCOPE_POLICY_UNDECIDED' END
 ELSE 'ORG_BOUND_REFERENCE' END scope_relation
 FROM ctx c JOIN staff_core.grant_dependencies_75 d ON d.grant_id=c.grant_id AND d.revision_id=c.revision_id AND d.person_id=c.person_id AND d.org_id=c.org_id CROSS JOIN tick),
 summary AS (
 SELECT count(*)::int dependency_count,COALESCE(bool_and(reference_ready),false) references_ready,
 COALESCE(bool_or(dependency_kind='PERSON_ORG'),false) has_person_org,
 COALESCE(bool_or(scope_relation='SCOPE_POLICY_UNDECIDED'),false) scope_policy_undecided,
 COALESCE(jsonb_agg(jsonb_build_object('dependency_id',dependency_id,'kind',dependency_kind,'target_id',target_id,'reference_ready',reference_ready,'scope_relation',scope_relation) ORDER BY dependency_id),'[]'::jsonb) dependencies
 FROM refs)
 SELECT jsonb_build_object(
 'grant_id',p_grant,'set_id',(SELECT set_id FROM ctx),'revision_id',(SELECT revision_id FROM ctx),
 'evaluated_at',p_at,'business_day',(SELECT business_day FROM tick),'grant_state',(SELECT grant_state FROM ctx),
 'person_record_ready',COALESCE((SELECT person_record_ready FROM parents),false),
 'account_record_ready',COALESCE((SELECT account_record_ready FROM parents),false),
 'scope_record_ready',COALESCE((SELECT scope_record_ready FROM parents),false),
 'bound_scope_revision_current',COALESCE((SELECT bound_scope_revision_current FROM parents),false),
 'dependency_count',s.dependency_count,'references_ready',s.references_ready,'has_person_org',s.has_person_org,
 'dependency_state',CASE
 WHEN NOT EXISTS(SELECT 1 FROM ctx) THEN 'GRANT_NOT_CURRENT'
 WHEN (SELECT grant_state FROM ctx)<>'ACTIVE' THEN 'GRANT_NOT_ACTIVE'
 WHEN NOT COALESCE((SELECT person_record_ready AND account_record_ready AND scope_record_ready FROM parents),false) OR NOT s.has_person_org OR NOT s.references_ready THEN 'DEPENDENCIES_NOT_READY'
 WHEN s.scope_policy_undecided THEN 'SCOPE_POLICY_UNDECIDED'
 WHEN NOT COALESCE((SELECT bound_scope_revision_current FROM parents),false) THEN 'BOUND_SCOPE_REVIEW_REQUIRED'
 ELSE 'DEPENDENCY_REFERENCES_READY' END,
 'dependencies',s.dependencies,'authorization_state','AUTHORIZATION_UNVERIFIED','authorization_verified',false)
 FROM summary s
$$;
CREATE FUNCTION staff_core.grant_dependency_reference_83(p_grant uuid) RETURNS jsonb LANGUAGE sql SET search_path='' AS $$
 WITH tick AS MATERIALIZED(SELECT clock_timestamp() at) SELECT staff_core.grant_dependency_reference_at_83(p_grant,tick.at) FROM tick
$$;
REVOKE ALL ON FUNCTION staff_core.grant_dependency_reference_at_83(uuid,timestamptz),staff_core.grant_dependency_reference_83(uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;

