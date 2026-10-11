import {createCandidateHTTP} from './candidate-http.mjs';

// A missing committed result does not prove that an earlier request never ran.
const pending=()=>({status:202,code:'RESULT_NOT_VISIBLE',nextAction:'CHECK_AGAIN_OR_RETRY_SAME_KEY',reuseIdempotencyKey:true});
export function createCandidateResultService({authorize,repository}) {
 return async (input,context)=>{
  if(!context?.actorId||!context?.orgId)return {status:401,code:'AUTHENTICATION_REQUIRED'};
  if(!authorize||!repository)return {status:503,code:'DEPENDENCY_UNAVAILABLE',nextAction:'WAIT'};
  if(!await authorize(context,'CANDIDATE_SAVE'))return {status:403,code:'ACCESS_DENIED'};
  if(!input||Array.isArray(input)||Object.keys(input).length!==1||typeof input.idempotencyKey!=='string'||! /\S/u.test(input.idempotencyKey))return {status:422,code:'VALIDATION_ERROR'};
  return repository.findCandidateResult({context,idempotencyKey:input.idempotencyKey});
 };
}
export function createCandidateResultRepository({pool,operations,authorizeInTransaction}) {
 if(!pool?.connect||!operations?.lockAndFindOperation||!authorizeInTransaction)throw new TypeError('Dependencies required');
 return {async findCandidateResult({context,idempotencyKey}) {
  const client=await pool.connect();let begun=false;
  try {
   await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');begun=true;
   await client.query("SET LOCAL lock_timeout = '2s'");
   await client.query("SET LOCAL statement_timeout = '5s'");
   if(!await authorizeInTransaction(client,context,'CANDIDATE_SAVE'))return {status:403,code:'ACCESS_DENIED'};
   const prior=await operations.lockAndFindOperation(client,{orgId:context.orgId,actorId:context.actorId,operation:'CANDIDATE_SAVE',idempotencyKey});
   if(!prior)return pending();
   const r=prior.result,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
   if(r?.status!==201||r.code!=='CANDIDATE_SAVED'||!uuid.test(r.candidateId)||!uuid.test(r.revisionId))throw new Error('Invalid stored result');
   // Return identifiers only. Never return raw stored JSON or fingerprints.
   return {status:200,code:'CANDIDATE_SAVED',candidateId:r.candidateId,revisionId:r.revisionId};
  } finally {
   try {if(begun)await client.query('ROLLBACK');}finally {client.release();}
  }
 }};
}
export function createCandidateResultHTTP({authenticate,checkCSRF,findCandidateResult}) {
 return createCandidateHTTP({authenticate,checkCSRF,saveCandidate:findCandidateResult,maxBytes:4096,
  responseStatuses:[200,202,401,403,422,503],
  failureResponse:{code:'RESULT_CHECK_UNAVAILABLE',nextAction:'CHECK_AGAIN',reuseIdempotencyKey:true}});
}
