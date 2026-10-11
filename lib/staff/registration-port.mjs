import {toReceivedItems} from './validation.mjs';

// No database or auth provider is installed by this preparation module.
// Actor and org context must come from a trusted server, never the form.
export function createCandidateService({authorize,repository}) {
  return async function saveCandidate(input,context) {
    if (!context?.actorId || !context?.orgId) return {status:401,code:'AUTHENTICATION_REQUIRED'};
    if (!authorize || !repository) return {status:503,code:'DEPENDENCY_UNAVAILABLE',nextAction:'WAIT'};
    if (!await authorize(context,'CANDIDATE_SAVE')) return {status:403,code:'ACCESS_DENIED'};
    const fields=['received','sourceRef','reason','idempotencyKey'];
    if (!input || Object.keys(input).some(k=>!fields.includes(k)) || ['sourceRef','reason','idempotencyKey'].some(k=>typeof input[k]!=='string'||! /\S/u.test(input[k]))) return {status:422,code:'VALIDATION_ERROR'};
    let items;
    try {items=toReceivedItems(input.received);} catch {return {status:422,code:'VALIDATION_ERROR'};}
    // Repository must atomically recheck authorization and save candidate,
    // revision, items, audit and operation result with idempotency protection.
    return repository.saveReceivedCandidate({context,items,sourceRef:input.sourceRef,reason:input.reason,idempotencyKey:input.idempotencyKey});
  };
}
