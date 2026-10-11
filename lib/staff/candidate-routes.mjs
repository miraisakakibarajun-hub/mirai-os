import {createCandidateHTTP} from './candidate-http.mjs';
import {createCandidateResultHTTP,createCandidateResultService,createCandidateResultRepository} from './candidate-result.mjs';
import {createCandidateService} from './registration-port.mjs';
import {createTransactionRepository} from './transaction-repository.mjs';
import {createPostgresOperations} from './postgres-operations.mjs';
import {createVerifiedAuthenticator,createOriginGuard} from './auth-context.mjs';
import {createBindingResolver} from './binding-resolver.mjs';

export function createCandidateRouteHandlers(config=null) {
 // No environment flag bypasses missing identity, session or permission hooks.
 const functions=['createClient','loadBindingSnapshot','verifySession','authorize','authorizeInTransaction'];
 if(!config||!config.pool?.connect||functions.some(k=>typeof config[k]!=='function')||!config.issuer||!config.orgId||!Array.isArray(config.allowedOrigins)||!config.allowedOrigins.length) {
  return {save:createCandidateHTTP({authenticate:null,checkCSRF:null,saveCandidate:null}),check:createCandidateResultHTTP({authenticate:null,checkCSRF:null,findCandidateResult:null})};
 }
 const resolveBinding=createBindingResolver(config);
 const authenticate=createVerifiedAuthenticator({createClient:config.createClient,resolveBinding});
 const checkCSRF=createOriginGuard(config);
 const operations=createPostgresOperations();
 const repository=createTransactionRepository({pool:config.pool,operations,authorizeInTransaction:config.authorizeInTransaction});
 const resultRepository=createCandidateResultRepository({pool:config.pool,operations,authorizeInTransaction:config.authorizeInTransaction});
 return {
  save:createCandidateHTTP({authenticate,checkCSRF,saveCandidate:createCandidateService({authorize:config.authorize,repository})}),
  check:createCandidateResultHTTP({authenticate,checkCSRF,findCandidateResult:createCandidateResultService({authorize:config.authorize,repository:resultRepository})})
 };
}
