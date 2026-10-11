import {getStaffSessionHandlers} from '@/lib/staff/session-runtime';
export const runtime='nodejs';
export async function GET(request: Request) {
 return getStaffSessionHandlers().status(request);
}
