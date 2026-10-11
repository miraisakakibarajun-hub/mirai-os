import { getCandidateHandlers } from '@/lib/staff/candidate-runtime';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return getCandidateHandlers().check(request);
}
