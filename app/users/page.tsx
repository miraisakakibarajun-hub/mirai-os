"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type PlanConsistency = "ok" | "missing" | "duplicate";

type UserListItem = {
  id: string;
  name: string;
  kana: string;
  birthDate: string;
  status: string;
  renewalDate: string | null;
  planConsistency: PlanConsistency;
};

type FetchState = "loading" | "error" | "loaded";

function normalizeName(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60)).replace(/\s/g, '');
}
const destinations = { plans: 'サービス等利用計画', records: '支援記録', 'ai-documents': 'AI作成支援' } as const;
export default function UsersPage() {
  return <Suspense fallback={<main className="p-8">読み込み中...</main>}><UserSelection /></Suspense>;
}
function UserSelection() {
  const params = useSearchParams();
  const values = params.getAll('task');
  const task = values.length === 1 && Object.hasOwn(destinations, values[0]) ? values[0] as keyof typeof destinations : null;
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("loading");

  useEffect(() => {
    let isMounted = true;

    async function fetchUsers() {
      try {
      const supabase = createClient();
      const allUsers: UserListItem[] = [];
      for (let offset = 0; ; offset += 500) {

      const { data, error } = await supabase
        .from("users")
        .select(
          `
          id,
          name,
          kana,
          birth_date,
          status,
          plans ( renewal_date, status )
        `
        )
        .eq("plans.status", "active")
        .order("name").order("id").range(offset, offset + 499);

      if (!isMounted) return;

      if (error) {
        setFetchState("error");
        return;
      }

      const items: UserListItem[] = (data ?? []).map((row) => {
        const activePlans = row.plans ?? [];

        const planConsistency: PlanConsistency =
          activePlans.length === 1
            ? "ok"
            : activePlans.length === 0
              ? "missing"
              : "duplicate";

        return {
          id: row.id,
          name: row.name,
          kana: row.kana,
          birthDate: row.birth_date,
          status: row.status,
          renewalDate:
            planConsistency === "ok" ? activePlans[0].renewal_date : null,
          planConsistency,
        };
      });

      allUsers.push(...items);
      if ((data ?? []).length < 500) break;
      }
      if (!isMounted) return;
      setUsers(allUsers);
      setFetchState("loaded");
      } catch { if (isMounted) setFetchState("error"); }
    }

    fetchUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  const normalizedSearch = normalizeName(search);
  const visibleUsers = users.filter(user => normalizeName(user.name).includes(normalizedSearch) || normalizeName(user.kana).includes(normalizedSearch));
  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.18em] text-[#A9824F]">
              USER MANAGEMENT
            </p>

            <h1 className="mt-2 text-3xl font-bold">{task ? destinations[task] + '：利用者を選択' : '利用者一覧'}</h1>

            <p className="mt-2 text-slate-600">
              {task ? '利用者名を選ぶと、' + destinations[task] + 'の画面へ進みます。' : '登録した利用者と計画更新期限を確認できます。'}
            </p>
          </div>

          <Link
            href="/users/new"
            className="rounded-lg bg-[#16233F] px-5 py-3 font-semibold text-white"
          >
            ＋ 新規登録
          </Link>
        </div>

        <div className="mt-6 rounded-xl border bg-white p-4">
          <label htmlFor="user-search" className="block font-semibold">氏名・フリガナで検索</label>
          <div className="mt-2 flex gap-3">
            <input id="user-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="例：太郎、てすと" className="min-w-0 flex-1 rounded border p-2" />
            <button type="button" onClick={() => setSearch('')} className="rounded border px-4 py-2">検索を解除</button>
          </div>
          <p className="mt-2 text-sm text-slate-600">氏名の一部でも検索できます。空白・全角半角・ひらがなとカタカナの違いを区別しません。</p>
          {fetchState === 'loaded' && <p role="status" className="mt-2">表示：{visibleUsers.length}人 ／ 全{users.length}人</p>}
        </div>
        <div className="mt-8 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {fetchState === "loading" ? (
            <div className="p-10 text-center">
              <p className="text-slate-500">読み込み中...</p>
            </div>
          ) : fetchState === "error" ? (
            <div className="p-10 text-center">
              <p className="font-semibold text-red-700">
                データの取得に失敗しました。
              </p>
              <p className="mt-2 text-sm text-slate-500">
                時間をおいて再度お試しください。
              </p>
            </div>
          ) : users.length === 0 ? (
            <div className="p-10 text-center">
              <p className="font-semibold text-slate-700">
                登録された利用者はいません。
              </p>

              <p className="mt-2 text-sm text-slate-500">
                「＋ 新規登録」から利用者を登録してください。
              </p>
            </div>
          ) : visibleUsers.length === 0 ? (
            <p className="p-10 text-center">条件に一致する利用者はいません。検索文字を変更してください。</p>
          ) : (
            <table className="w-full border-collapse">
              <thead className="bg-[#16233F] text-left text-white">
                <tr>
                  <th className="px-5 py-4">氏名</th>
                  <th className="px-5 py-4">フリガナ</th>
                  <th className="px-5 py-4">生年月日</th>
                  <th className="px-5 py-4">計画更新期限</th>
                  <th className="px-5 py-4">状態</th>
                </tr>
              </thead>

              <tbody>
                {visibleUsers.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t border-slate-200 hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 font-semibold">
                      <Link
                        href={`/users/${user.id}${task ? "/" + task : ""}`}
                        className="text-[#16233F] underline-offset-2 hover:underline"
                      >
                        {user.name}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-slate-600">{user.kana}</td>
                    <td className="px-5 py-4 text-slate-600">
                      {user.birthDate}
                    </td>
                    <td className="px-5 py-4 text-slate-600">
                      {user.planConsistency === "ok" ? (
                        user.renewalDate
                      ) : (
                        <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
                          {user.planConsistency === "missing"
                            ? "計画未設定（要確認）"
                            : "計画重複（要確認）"}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
                        {user.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-6">
          <Link
            href="/"
            className="text-sm font-semibold text-[#16233F] underline"
          >
            ホームへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
