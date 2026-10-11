import {createStaffSessionHTTP} from './session-access.mjs';
// The private session store, live checks, scoped revocation and durable provider
// cleanup queue are not connected. Never treat a raw cookie/JWT as permission.
export function getStaffSessionHandlers() {
 return createStaffSessionHTTP();
}
