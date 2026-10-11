import {getStaffSessionHandlers} from '@/lib/staff/session-runtime';
export const runtime='nodejs';
export async function POST(request: Request) {
 return getStaffSessionHandlers().logout(request);
}
