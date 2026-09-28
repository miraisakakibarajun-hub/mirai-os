"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type PlanConsistency = "ok" | "missing" | "duplicate";

type UserEditData = {
  id: string;
  name: string;
  kana: string;
  birthDate: string;
  status: string;
  renewalDate: string | null;
  planConsistency: PlanConsistency;
};

type FetchState = "loading" | "not-found" | "error" | "loaded";
type SubmitState = "idle" | "saving" | "update-error";

const STATUS_OPTIONS = ["準備中", "利用中", "保留", "終了"];

export default function UserEditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<UserEditData | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [submitErrorMessage, setSubmitErrorMessage] = useState<string | null>(
    null
  );

  useEffect(() => {
    let isMounted = true;

    async function fetchUser() {
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
        .eq("id", params.id)
        .maybeSingle();

      if (!isMounted) return;

      if (error) {
        if (error.code === "22P02") {
          setFetchState("not-found");
        } else {
          setFetchState("error");
        }
        return;
      }

      if (!data) {
        setFetchState("not-found");
        return;
      }

      const activePlans = data.plans ?? [];

      const planConsistency: PlanConsistency =
        activePlans.length === 1
          ? "ok"
          : activePlans.length === 0
            ? "missing"
            : "duplicate";

      setUser({
        id: data.id,
        name: data.name,
        kana: data.kana,
        birthDate: data.birth_date,
        status: data.status,
        renewalDate:
          planConsistency === "ok" ? activePlans[0].renewal_date : null,
        planConsistency,
      });
      setFetchState("loaded");
    }

    fetchUser();

    return () => {
      isMounted = false;
    };
  }, [params.id]);

  function toDisplayMessage(error: { code?: string; message: string }): string {
    switch (error.code) {
      case "M1001":
        return "ログイン中のアカウントに職員情報が紐づいていません。管理者にご連絡ください。";
      case "M1002":
        return "この利用者は既に削除されている可能性があります。一覧からご確認ください。";
      case "M1003":
        return "この利用者の計画データに不整合があるため更新できません。管理者にご確認ください。";
      default:
        return "更新に失敗しました。時間をおいて再度お試しください。";
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;

    setSubmitErrorMessage(null);
    setSubmitState("saving");

    const formData = new FormData(event.currentTarget);
    const supabase = createClient();

    const { data, error } = await supabase.rpc("update_user_with_plan", {
      p_user_id: user.id,
      p_name: String(formData.get("name") ?? ""),
      p_kana: String(formData.get("kana") ?? ""),
      p_birth_date: String(formData.get("birthDate") ?? ""),
      p_status: String(formData.get("status") ?? ""),
      p_renewal_date: String(formData.get("renewalDate") ?? ""),
    });

    if (error) {
      setSubmitErrorMessage(toDisplayMessage(error));
      setSubmitState("update-error");
      return;
    }

    if (!data || data.length === 0 || !data[0]?.user_id) {
      setSubmitErrorMessage(
        "更新処理は完了しましたが、結果を確認できませんでした。お手数ですが詳細画面から更新内容をご確認ください。"
      );
      setSubmitState("update-error");
      return;
    }

    router.push(`/users/${data[0].user_id}`);
  }

  if (fetchState === "loading") {
    return (
      <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl bg-white p-10 text-center shadow">
            <p className="text-slate-500">読み込み中...</p>
          </div>
        </div>
      </main>
    );
  }

  if (fetchState === "error") {
    return (
      <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl bg-white p-10 text-center shadow">
            <p className="font-semibold text-red-700">
              データの取得に失敗しました。
            </p>

            <p className="mt-2 text-sm text-slate-500">
              時間をおいて再度お試しください。
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

  if (fetchState === "not-found") {
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

  if (user.planConsistency !== "ok") {
    return (
      <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl bg-white p-10 text-center shadow">
            <p className="font-semibold text-red-700">
              この利用者は計画データに不整合があるため編集できません（要確認）。
            </p>

            <p className="mt-2 text-sm text-slate-500">
              管理者にご確認のうえ、データを修正してから編集してください。
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
              defaultValue={user.renewalDate ?? ""}
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

          {submitState === "update-error" && submitErrorMessage && (
            <p className="text-sm font-semibold text-red-600">
              {submitErrorMessage}
            </p>
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
              disabled={submitState === "saving"}
              className="rounded-lg bg-[#16233F] px-6 py-3 font-semibold text-white disabled:opacity-60"
            >
              {submitState === "saving" ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
