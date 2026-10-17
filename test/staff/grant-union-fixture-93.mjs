// SYNTHETIC PURE MODEL ONLY. No DB, Provider, session, HTTP, environment or writer access.
// Exact scope only. No implied hierarchy and no new deny-grant semantics.
export const policy93 = 'FIXTURE_COMPLETE_GRANT_UNION_93';
const actions = new Set(['OS_ENTER', 'LIST', 'BODY_READ', 'BODY_EDIT', 'APPROVE']);
const fake = value => typeof value === 'string' && /^FAKE_[A-Z0-9_]+$/.test(value);
export function evaluateFixture93(context, resource, action) {
  const excluded = [];
  const result = (status, reason, witnesses = [], entryWitnesses = []) => ({
    status, reason, witnesses, entryWitnesses, excluded,
    policyVersion: policy93, evaluatedAt: Number.isFinite(context?.now) ? context.now : null,
    resourceMappingVersion: resource?.version ?? null,
    productionAuthorized: false, validationLevel: 'MODEL', syntheticOnly: true,
  });
  // Mandatory rejection occurs before even reading the grant collection.
  if (!context || context.syntheticOnly !== true || context.policyVersion !== policy93
      || context.authenticated !== true || context.accountActive !== true
      || context.sessionActive !== true || context.staffActive !== true
      || context.stopped !== false) return result('DENY', 'MANDATORY_STATE');
  if (!Number.isFinite(context.now) || !resource || resource.syntheticOnly !== true
      || !Number.isInteger(resource.version) || resource.version < 1
      || !actions.has(action) || !context.assignments || typeof context.assignments !== 'object'
      || ![context.person, context.tenant, context.org, context.system, resource.id,
        resource.tenant, resource.org, resource.system, resource.scope].every(fake)
      || context.tenant !== resource.tenant || context.org !== resource.org
      || context.system !== resource.system) return result('DENY', 'INVALID_BOUNDARY');
  if (!Array.isArray(context.grants)) return result('DENY', 'INVALID_GRANTS');
  const seen = new Set();
  for (const g of context.grants) {
    if (!g || g.kind !== 'ALLOW' || ![g.id, g.person, g.tenant, g.org, g.system, g.scope, g.assignmentId].every(fake)
        || !actions.has(g.action) || !['ACTIVE', 'REVOKED'].includes(g.state)
        || !Number.isInteger(g.version) || g.version < 1 || !Number.isFinite(g.from)
        || !(g.to === null || (Number.isFinite(g.to) && g.from < g.to)) || seen.has(g.id)) {
      return result('DENY', 'INVALID_OR_UNSUPPORTED_GRANT');
    }
    seen.add(g.id);
  }
  const active = [];
  for (const g of context.grants) {
    let reason;
    if (g.person !== context.person || g.tenant !== resource.tenant
        || g.org !== resource.org || g.system !== resource.system) reason = 'GRANT_BOUNDARY';
    else if (g.state !== 'ACTIVE') reason = 'REVOKED';
    else if (context.assignments[g.assignmentId] !== true) reason = 'ASSIGNMENT_INACTIVE_OR_UNKNOWN';
    else if (context.now < g.from || (g.to !== null && context.now >= g.to)) reason = 'OUTSIDE_PERIOD';
    if (reason) excluded.push({grantId: g.id, version: g.version, reason});
    else active.push(g);
  }
  const witness = list => list.map(g => ({grantId: g.id, version: g.version})).sort((a,b) => a.grantId.localeCompare(b.grantId));
  const entry = witness(active.filter(g => g.action === 'OS_ENTER' && g.scope === 'FAKE_ORG_SCOPE'));
  if (!entry.length) return result('DENY', 'OS_ENTRY_REQUIRED');
  const matched = action === 'OS_ENTER' ? active.filter(g => g.action === 'OS_ENTER' && g.scope === 'FAKE_ORG_SCOPE')
    : active.filter(g => g.action === action && g.scope === resource.scope);
  const witnesses = witness(matched);
  for (const g of active) if (!matched.includes(g) && g.action !== 'OS_ENTER') excluded.push({grantId:g.id,version:g.version,reason:'ACTION_OR_SCOPE_MISMATCH'});
  return witnesses.length ? result('ALLOW', 'COMPLETE_WITNESS', witnesses, entry)
    : result('DENY', 'ACTION_SCOPE_REQUIRED', [], entry);
}
