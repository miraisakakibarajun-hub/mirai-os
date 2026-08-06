"use client";
import { useRouter } from "next/navigation";
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

export default function NewUserPage() {
   const router = useRouter();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);

    const newUser: SavedUser = {
      id: crypto.randomUUID(),
      name: String(formData.get("name") ?? ""),
      kana: String(formData.get("kana") ?? ""),
      birthDate: String(formData.get("birthDate") ?? ""),
      renewalDate: String(formData.get("renewalDate") ?? ""),
      status: "準備中",
    };

    try {
      const savedData = localStorage.getItem("mirai-users");
      const existingUsers = savedData
        ? (JSON.parse(savedData) as SavedUser[])
        : [];

      const updatedUsers = [...existingUsers, newUser];

      localStorage.setItem("mirai-users", JSON.stringify(updatedUsers));
    } catch {
      // 既存データの読み込みに失敗した場合は空の状態から保存する
      localStorage.setItem("mirai-users", JSON.stringify([newUser]));
    }

    router.push("/users");
  } return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold">利用者新規登録</h1>

        <p className="mt-2 text-slate-600">
          利用者の基本情報を入力してください。
        </p>

        <form
          className="mt-8 space-y-5 rounded-xl bg-white p-6 shadow"
          onSubmit={handleSubmit}
        >
          <label className="block">
            <span className="font-semibold">氏名</span>

            <input
              type="text"
              name="name"
              required
              className="mt-2 w-full rounded-lg border p-3"
              placeholder="例：山田 太郎"
            />
          </label>

          <label className="block">
            <span className="font-semibold">フリガナ</span>

            <input
              type="text"
              name="kana"
              required
              className="mt-2 w-full rounded-lg border p-3"
              placeholder="例：ヤマダ タロウ"
            />
          </label><label className="block">
  <span className="font-semibold">生年月日</span>

  <input
    type="date"
    name="birthDate"
    required
    className="mt-2 w-full rounded-lg border p-3"
  />
</label>

<label className="block">
  <span className="font-semibold">計画更新期限</span>

  <input
    type="date"
    name="renewalDate"
    required
    className="mt-2 w-full rounded-lg border p-3"
  />
</label>

<div className="flex justify-end gap-3 pt-4">
  <Link
    href="/users"
    className="rounded-lg border px-5 py-3 font-semibold"
  >
    一覧へ戻る
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