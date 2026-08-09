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

const BUSINESS_NAME = "AI文書作成";

export default function UserAiDocumentsPage() {
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

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-semibold tracking-[0.18em] text-[#A9824F]">
          SUPPORT MENU
        </p>

        <h1 className="mt-2 text-3xl font-bold">{BUSINESS_NAME}</h1>

        <div className="mt-8 rounded-xl bg-white p-10 text-center shadow">
          <p className="text-sm font-semibold text-slate-500">対象利用者</p>
          <p className="mt-1 text-lg font-semibold">{user.name}</p>

          <span className="mt-6 inline-block rounded-full bg-[#A9824F]/15 px-4 py-2 text-sm font-semibold text-[#8a6a3f]">
            準備中
          </span>

          <p className="mt-4 text-sm text-slate-500">
            {BUSINESS_NAME}機能は現在準備中です。今後こちらから開始できるようになります。
          </p>
        </div>

        <div className="mt-6">
          <Link
            href={`/users/${user.id}`}
            className="text-sm font-semibold text-[#16233F] underline"
          >
            利用者詳細へ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
