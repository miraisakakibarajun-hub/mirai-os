"use client";

import { useEffect, useState } from "react";
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

export default function UsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [fetchState, setFetchState] = useState<FetchState>("loading");

  useEffect(() => {
    let isMounted = true;

    async function fetchUsers() {
      const supabase = createClient();

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
        .order("name");

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

      setUsers(items);
      setFetchState("loaded");
    }

    fetchUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-5xl">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.18em] text-[#A9824F]">
              USER MANAGEMENT
            </p>

            <h1 className="mt-2 text-3xl font-bold">利用者一覧</h1>

            <p className="mt-2 text-slate-600">
              登録した利用者と計画更新期限を確認できます。
            </p>
          </div>

          <Link
            href="/users/new"
            className="rounded-lg bg-[#16233F] px-5 py-3 font-semibold text-white"
          >
            ＋ 新規登録
          </Link>
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
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="border-t border-slate-200 hover:bg-slate-50"
                  >
                    <td className="px-5 py-4 font-semibold">
                      <Link
                        href={`/users/${user.id}`}
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
