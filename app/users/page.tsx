"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SavedUser = {
  id: string;
  name: string;
  kana: string;
  birthDate: string;
  renewalDate: string;
  status: string;
};

export default function UsersPage() {
  const [users, setUsers] = useState<SavedUser[]>([]);

  useEffect(() => {
    // localStorageはサーバー側で参照できないため、マウント後に読み込んで
    // Reactの状態と同期する（外部システムとの同期はEffectの正しい用途）。
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const savedData = localStorage.getItem("mirai-users");
      const savedUsers = savedData
        ? (JSON.parse(savedData) as SavedUser[])
        : [];

      setUsers(savedUsers);
    } catch {
      setUsers([]);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
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
          {users.length === 0 ? (
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
                      {user.renewalDate}
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