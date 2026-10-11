import { getStaffLoginHandlers } from '@/lib/staff/login-runtime';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return getStaffLoginHandlers().change(request);
}
