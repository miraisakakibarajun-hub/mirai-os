"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { FormEvent } from "react";

type SavedUser = {
  id: string;
  name: string;
  kana: string;
  birthDate: string;
  renewalDate: string;
  status: string;
};

const STATUS_OPTIONS = ["準備中", "利用中", "保留", "終了"];

export default function UserEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<SavedUser | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    const formData = new FormData(event.currentTarget);

    const updatedUser: SavedUser = {
      ...user,
      name: String(formData.get("name") ?? user.name),
      kana: String(formData.get("kana") ?? user.kana),
      birthDate: String(formData.get("birthDate") ?? user.birthDate),
      renewalDate: String(formData.get("renewalDate") ?? user.renewalDate),
      status: String(formData.get("status") ?? user.status),
    };

    try {
      const savedData = localStorage.getItem("mirai-users");
      const savedUsers = savedData
        ? (JSON.parse(savedData) as SavedUser[])
        : [];

      const updatedUsers = savedUsers.map((savedUser) =>
        savedUser.id === updatedUser.id ? updatedUser : savedUser
      );

      localStorage.setItem("mirai-users", JSON.stringify(updatedUsers));
    } catch {
      setSaveError(
        "保存に失敗しました。時間をおいて再度お試しください。既存のデータは変更されていません。"
      );
      return;
    }

    router.push(`/users/${updatedUser.id}`);
  }

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
          USER EDIT
        </p>

        <h1 className="mt-2 text-3xl font-bold">利用者情報編集</h1>

        <form
          className="mt-8 space-y-5 rounded-xl bg-white p-6 shadow"
          onSubmit={handleSubmit}
        >
          <label className="block">
            <span className="font-semibold">氏名</span>

            <input
              type="text"
              name="name"
              defaultValue={user.name}
              required
              className="mt-2 w-full rounded-lg border p-3"
            />
          </label>

          <label className="block">
            <span className="font-semibold">フリガナ</span>

            <input
              type="text"
              name="kana"
              defaultValue={user.kana}
              required
              className="mt-2 w-full rounded-lg border p-3"
            />
          </label>

          <label className="block">
            <span className="font-semibold">生年月日</span>

            <input
              type="date"
              name="birthDate"
              defaultValue={user.birthDate}
              required
              className="mt-2 w-full rounded-lg border p-3"
            />
          </label>

          <label className="block">
            <span className="font-semibold">計画更新期限</span>

            <input
              type="date"
              name="renewalDate"
              defaultValue={user.renewalDate}
              required
              className="mt-2 w-full rounded-lg border p-3"
            />
          </label>

          <label className="block">
            <span className="font-semibold">状態</span>

            <select
              name="status"
              defaultValue={user.status}
              className="mt-2 w-full rounded-lg border bg-white p-3"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          {saveError && (
            <p className="text-sm font-semibold text-red-600">{saveError}</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Link
              href={`/users/${user.id}`}
              className="rounded-lg border px-5 py-3 font-semibold"
            >
              キャンセル
            </Link>

            <button
              type="submit"
              className="rounded-lg bg-[#16233F] px-6 py-3 font-semibold text-white"
            >
              保存
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
