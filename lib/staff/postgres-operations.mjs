// Server-only parameterized SQL hooks. Trusted context must come from server auth.
export function createPostgresOperations() {
 return {
  async lockAndFindOperation(client,{orgId,actorId,operation,idempotencyKey}) {
   const scope=JSON.stringify([orgId,actorId,operation,idempotencyKey]);
   // Transaction advisory lock covers absent keys too. Hash collision only serializes extra work.
   await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))',[scope]);
   const r=await client.query('SELECT fingerprint, result FROM staff_core.candidate_operations WHERE org_id=$1 AND actor_id=$2 AND operation=$3 AND idempotency_key=$4',[orgId,actorId,operation,idempotencyKey]);
   return r.rows[0];
  },
  async insertCandidate(c,{candidateId,revisionId,context}) {
   await c.query('INSERT INTO staff_core.import_candidates(candidate_id,org_id,current_revision_id,created_actor_id) VALUES($1,$2,$3,$4)',[candidateId,context.orgId,revisionId,context.actorId]);
  },
  async insertRevision(c,{candidateId,revisionId,revisionNo,sourceRef,reason,context}) {
   await c.query('INSERT INTO staff_core.candidate_revisions(candidate_revision_id,candidate_id,org_id,revision_no,source_ref,reason,recorded_actor_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[revisionId,candidateId,context.orgId,revisionNo,sourceRef,reason,context.actorId]);
  },
  async insertItems(c,{revisionId,items}) {
   for(let i=0;i<items.length;i++) await c.query('INSERT INTO staff_core.candidate_items(candidate_revision_id,item_no,item_kind,received_value) VALUES($1,$2,$3,$4::jsonb)',[revisionId,i+1,items[i].kind,JSON.stringify({value:items[i].value})]);
  },
  async insertAudit(c,{candidateId,revisionId,context,action,reason}) {
   await c.query('INSERT INTO staff_core.candidate_audit(org_id,candidate_id,revision_id,actor_id,action,reason) VALUES($1,$2,$3,$4,$5,$6)',[context.orgId,candidateId,revisionId,context.actorId,action,reason]);
  },
  async insertOperation(c,{context,operation,idempotencyKey,fingerprint,result}) {
   await c.query('INSERT INTO staff_core.candidate_operations(org_id,actor_id,operation,idempotency_key,fingerprint,result) VALUES($1,$2,$3,$4,$5,$6::jsonb)',[context.orgId,context.actorId,operation,idempotencyKey,fingerprint,JSON.stringify(result)]);
  }
 };
}
