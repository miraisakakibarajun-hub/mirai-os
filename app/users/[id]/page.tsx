"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type SavedUser = {
  id: string;
  name: string;
  kana: string;
  birthDate: string;
  renewalDate: string;
  status: string;
};

function calculateAge(birthDate: string): number | null {
  if (!birthDate) return null;

  const birth = new Date(birthDate);

  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age -= 1;
  }

  return age;
}

export default function UserDetailPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<SavedUser | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    // localStorageはサーバー側で参照できないため、マウント後に読み込んで
    // Reactの状態と同期する（外部システムとの同期はEffectの正しい用途）。
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const savedData = localStorage.getItem("mirai-users");
      const savedUsers = savedData
        ? (JSON.parse(savedData) as SavedUser[])
        : [];

      const found = savedUsers.find((savedUser) => savedUser.id === params.id);

      if (found) {
        setUser(found);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [params.id]);

  if (notFound) {
    return (
      <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl bg-white p-10 text-center shadow">
            <p className="font-semibold text-slate-700">
              指定された利用者が見つかりませんでした。
            </p>

            <p className="mt-2 text-sm text-slate-500">
              一覧から利用者を選び直してください。
            </p>
          </div>

          <div className="mt-6">
            <Link
              href="/users"
              className="text-sm font-semibold text-[#16233F] underline"
            >
              一覧へ戻る
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  const age = calculateAge(user.birthDate);

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-[#A9824F]">
          USER DETAIL
        </p>

        <h1 className="mt-2 text-3xl font-bold">利用者詳細</h1>

        <p className="mt-2 text-slate-600">
          登録されている利用者情報を確認できます。
        </p>

        <div className="mt-8 space-y-6 rounded-xl bg-white p-6 shadow">
          <div>
            <p className="text-sm font-semibold text-slate-500">氏名</p>
            <p className="mt-1 text-lg font-semibold">{user.name}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-500">フリガナ</p>
            <p className="mt-1 text-lg">{user.kana}</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-slate-500">生年月日</p>
              <p className="mt-1 text-lg">{user.birthDate}</p>
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-500">年齢</p>
              <p className="mt-1 text-lg">
                {age !== null ? `${age}歳` : "-"}
              </p>
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-500">
              計画更新期限
            </p>
            <p className="mt-1 text-lg">{user.renewalDate}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-500">状態</p>
            <p className="mt-2">
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
                {user.status}
              </span>
            </p>
          </div>
        </div>

        <div className="mt-8">
          <p className="text-sm font-semibold tracking-[0.18em] text-[#A9824F]">
            SUPPORT MENU
          </p>

          <h2 className="mt-2 text-xl font-bold">相談支援メニュー</h2>

          <p className="mt-1 text-sm text-slate-600">
            この利用者に対する相談支援業務は、ここから開始できます。
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {[
              {
                label: "サービス等利用計画",
                description: "計画の作成・確認を行います",
                href: `/users/${user.id}/plans`,
              },
              {
                label: "モニタリング",
                description: "モニタリング記録を管理します",
                href: `/users/${user.id}/monitoring`,
              },
              {
                label: "支援記録",
                description: "日々の支援記録を管理します",
                href: `/users/${user.id}/records`,
              },
              {
                label: "AI文書作成",
                description: "AIによる文書作成を支援します",
                href: `/users/${user.id}/ai-documents`,
              },
            ].map((menu) => (
              <Link
                key={menu.href}
                href={menu.href}
                className="group flex items-center justify-between rounded-xl border border-[#A9824F]/30 bg-white p-5 shadow transition hover:border-[#A9824F] hover:shadow-md"
              >
                <div>
                  <p className="text-base font-semibold text-[#16233F]">
                    {menu.label}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {menu.description}
                  </p>
                </div>

                <span className="ml-4 text-lg font-semibold text-[#A9824F] transition group-hover:translate-x-0.5">
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Link
            href="/users"
            className="rounded-lg border px-5 py-3 font-semibold"
          >
            一覧へ戻る
          </Link>

          <Link
            href={`/users/${user.id}/edit`}
            className="rounded-lg bg-[#16233F] px-6 py-3 font-semibold text-white"
          >
            編集
          </Link>
        </div>
      </div>
    </main>
  );
}
