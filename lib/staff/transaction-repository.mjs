import {createHash, randomUUID} from 'node:crypto';

// Server-only orchestration. All hooks receive the SAME transaction client.
// No production SQL, schema, auth provider or connection credentials are supplied.
export function createTransactionRepository({pool,operations,authorizeInTransaction}) {
  if (!pool?.connect || !operations || !authorizeInTransaction) throw new TypeError('Dependencies required');
  return {async saveReceivedCandidate(request) {
    const {context,items,sourceRef,reason,idempotencyKey}=request;
    const fingerprint=createHash('sha256').update(JSON.stringify({items,sourceRef,reason})).digest('hex');
    const client=await pool.connect();
    let begun=false;
    try {
      await client.query('BEGIN'); begun=true;
      // Authorization must remain protected until commit by the supplied hook.
      if (!await authorizeInTransaction(client,context,'CANDIDATE_SAVE')) {
        await client.query('ROLLBACK'); begun=false;
        return {status:403,code:'ACCESS_DENIED'};
      }
      // MUST serialize this (org, actor, operation, key), including absent rows.
      const prior=await operations.lockAndFindOperation(client,{...context,operation:'CANDIDATE_SAVE',idempotencyKey});
      if (prior) {
        await client.query('ROLLBACK'); begun=false;
        return prior.fingerprint===fingerprint ? prior.result : {status:409,code:'IDEMPOTENCY_CONFLICT'};
      }
      const candidateId=randomUUID(), revisionId=randomUUID();
      await operations.insertCandidate(client,{candidateId,revisionId,context});
      await operations.insertRevision(client,{candidateId,revisionId,revisionNo:1,sourceRef,reason,context});
      await operations.insertItems(client,{revisionId,items});
      await operations.insertAudit(client,{candidateId,revisionId,context,action:'CANDIDATE_RECEIVED',reason});
      const result={status:201,code:'CANDIDATE_SAVED',candidateId,revisionId};
      await operations.insertOperation(client,{context,operation:'CANDIDATE_SAVE',idempotencyKey,fingerprint,result});
      await client.query('COMMIT'); begun=false;
      return result;
    } catch (error) {
      if (begun) {
        try {await client.query('ROLLBACK');} catch { /* Original failure remains the cause. */ }
      }
      // COMMIT/network errors may have an unknown outcome: caller must look up
      // the SAME key, never mint a new key as an automatic retry.
      throw error;
    } finally {client.release();}
  }};
}
