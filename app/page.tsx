import Link from "next/link";
import LogoutButton from "./components/LogoutButton";
import { createClient } from "@/lib/supabase/server";

const menuItems = [
  {
    number: "01",
    title: "利用者管理",
    description: "利用者の基本情報・支援情報を一元管理",
    href: "/users",
  },
  {
    number: "02",
    title: "サービス等利用計画",
    description: "計画案・本計画の作成と管理",
    href: null,
  },
  {
    number: "03",
    title: "モニタリング",
    description: "実施時期の確認と記録作成",
    href: null,
  },
  {
    number: "04",
    title: "支援記録",
    description: "日々の相談・支援内容を記録",
    href: null,
  },
  {
    number: "05",
    title: "AI作成支援",
    description: "記録を基に文書作成をサポート",
    href: null,
  },
  {
    number: "06",
    title: "ダッシュボード",
    description: "期限・進捗・未対応事項を確認",
    href: null,
  },
];

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return (
    <main className="min-h-screen bg-[#F4F5F7] text-[#16233F]">
      <header className="border-b border-[#A9824F]/40 bg-[#16233F] text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-xs font-medium tracking-[0.28em] text-[#D8C4A5]">
              MIRAI WELFARE MANAGEMENT SYSTEM
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-wide">
              MIRAI OS
            </h1>
          </div>

          <div className="text-right">
            <p className="text-sm text-[#D8C4A5]">相談支援AIシステム</p>

            {user ? (
              <div className="mt-1 flex items-center justify-end gap-3">
                <p className="text-xs text-white/60">{user.email}</p>
                <LogoutButton />
              </div>
            ) : (
              <Link
                href="/login"
                className="mt-1 inline-block text-xs text-white/60 underline"
              >
                ログイン
              </Link>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-2xl border border-[#A9824F]/30 bg-white p-8 shadow-sm">
          <p className="text-sm font-semibold tracking-[0.2em] text-[#A9824F]">
            AI-2026-024
          </p>

          <h2 className="mt-3 text-3xl font-semibold leading-tight md:text-4xl">
            相談支援業務を、
            <br className="hidden md:block" />
            もっと確実に、もっと分かりやすく。
          </h2>

          <p className="mt-5 max-w-3xl leading-7 text-slate-600">
            利用者情報、サービス等利用計画、モニタリング、支援記録を一元管理し、
            AIが文書作成と期限管理を支援します。
          </p>

          <div className="mt-7 inline-flex rounded-full bg-[#16233F] px-5 py-2 text-sm font-medium text-white">
            開発環境 正常稼働中
          </div>
        </div>

        <div className="mt-10">
          <div className="flex items-end justify-between border-b border-slate-300 pb-4">
            <div>
              <p className="text-sm font-semibold tracking-[0.18em] text-[#A9824F]">
                MAIN MENU
              </p>
              <h3 className="mt-1 text-2xl font-semibold">メインメニュー</h3>
            </div>

            <p className="hidden text-sm text-slate-500 md:block">
              機能は順次実装します
            </p>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {menuItems.map((item) =>
              item.href ? (
                <Link
                  key={item.number}
                  href={item.href}
                  className="group min-h-44 rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-[#A9824F] hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#A9824F]">
                      {item.number}
                    </span>
                    <span className="text-xs font-semibold text-[#A9824F]">
                      利用可能
                    </span>
                  </div>

                  <h4 className="mt-6 text-xl font-semibold group-hover:text-[#A9824F]">
                    {item.title}
                  </h4>

                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    {item.description}
                  </p>
                </Link>
              ) : (
                <button
                  key={item.number}
                  type="button"
                  className="group min-h-44 rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-[#A9824F] hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#A9824F]">
                      {item.number}
                    </span>
                    <span className="text-xs text-slate-400">準備中</span>
                  </div>

                  <h4 className="mt-6 text-xl font-semibold group-hover:text-[#A9824F]">
                    {item.title}
                  </h4>

                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    {item.description}
                  </p>
                </button>
              )
            )}
          </div>
        </div>
      </section>

      <footer className="mt-8 border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
          <p>一般社団法人みらい ／ AI本部</p>
          <p>MIRAI OS Ver1.0 Implementation Project</p>
        </div>
      </footer>
    </main>
  );
}