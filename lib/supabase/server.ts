import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * サーバー（Server Component / Server Action）から使うSupabaseクライアント。
 * こちらもanon keyのみを使用する。ログインセッションはCookie経由で管理される。
 * service role keyは、将来的に管理者専用の処理が必要になった場合のみ、
 * 別の専用クライアント（lib/supabase/admin.ts等）として切り出して扱う。
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Componentから呼ばれた場合、Cookieの書き込みはできない。
            // ミドルウェアでセッションを更新している場合は無視してよいエラーのため、
            // ここでは何もしない。
          }
        },
      },
    }
  );
}
