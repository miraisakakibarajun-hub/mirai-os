"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NewUserPage() {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSaving(true);

    const formData = new FormData(event.currentTarget);
    const supabase = createClient();

    const { data, error } = await supabase.rpc("create_user_with_plan", {
      p_name: String(formData.get("name") ?? ""),
      p_kana: String(formData.get("kana") ?? ""),
      p_birth_date: String(formData.get("birthDate") ?? ""),
      p_status: "準備中",
      p_renewal_date: String(formData.get("renewalDate") ?? ""),
    });

    if (error) {
      setErrorMessage(toDisplayMessage(error));
      setIsSaving(false);
      return;
    }

    // RPCはtable(user_id, plan_id)を返すため配列で返る。
    // 戻り値が存在しない場合は、成功したのか失敗したのか不明な異常状態として扱い、
    // 誤った遷移（/users/undefined 等）を避けるためここで止める。
    if (!data || data.length === 0 || !data[0]?.user_id) {
      setErrorMessage(
        "登録処理は完了しましたが、結果を確認できませんでした。お手数ですが一覧から登録内容をご確認ください。"
      );
      setIsSaving(false);
      return;
    }

    router.push(`/users/${data[0].user_id}`);
  }

  function toDisplayMessage(error: { code?: string; message: string }): string {
    switch (error.code) {
      case "M1001":
        return "ログイン中のアカウントに職員情報が紐づいていません。管理者にご連絡ください。";
      default:
        return "保存に失敗しました。時間をおいて再度お試しください。";
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold">利用者新規登録</h1>
        <p className="mt-2 text-slate-600">利用者の基本情報を入力してください。</p>

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
          </label>

          <label className="block">
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

          {errorMessage && (
            <p className="text-sm font-semibold text-red-600">{errorMessage}</p>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Link
              href="/users"
              className="rounded-lg border px-5 py-3 font-semibold"
            >
              一覧へ戻る
            </Link>

            <button
              type="submit"
              disabled={isSaving}
              className="rounded-lg bg-[#16233F] px-6 py-3 font-semibold text-white disabled:opacity-60"
            >
              {isSaving ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
