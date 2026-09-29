import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { requireLocalSupabase } from './local-boundary';

/**
 * ブラウザ（クライアントコンポーネント）から使うSupabaseクライアント。
 * anon keyのみを使用し、service role keyはここでは絶対に使わない。
 */
export function createClient() {
  return createBrowserClient<Database>(
    requireLocalSupabase(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_MIRAI_ENVIRONMENT),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
