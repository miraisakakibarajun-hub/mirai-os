import { createCandidateRouteHandlers } from './candidate-routes.mjs';

// Integration is deliberately unavailable until managed bindings, session
// verification, current authorization and a scoped DB pool are connected.
// Do not substitute a shared actor, broad grants or the development DB here.
export function getCandidateHandlers() {
  return createCandidateRouteHandlers();
}
