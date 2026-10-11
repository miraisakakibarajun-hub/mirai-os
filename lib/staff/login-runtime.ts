import { createLoginHandlers } from './login-routes.mjs';

// No live provider, identity mapping, initial grants or reset executor are
// assumed. Wire all trusted adapters only after the bootstrap prerequisites.
export function getStaffLoginHandlers() {
  return createLoginHandlers();
}
