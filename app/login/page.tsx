"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsSubmitting(false);

    if (error) {
      setErrorMessage(
        "ログインできませんでした。メールアドレスとパスワードをご確認ください。"
      );
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
      <div className="mx-auto max-w-md">
        <p className="text-sm font-semibold tracking-[0.18em] text-[#A9824F]">
          MIRAI OS
        </p>

        <h1 className="mt-2 text-3xl font-bold">ログイン</h1>

        <p className="mt-2 text-slate-600">
          職員アカウントでログインしてください。
        </p>

        <form
          className="mt-8 space-y-5 rounded-xl bg-white p-6 shadow"
          onSubmit={handleSubmit}
        >
          <label className="block">
            <span className="font-semibold">メールアドレス</span>

            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="mt-2 w-full rounded-lg border p-3"
              placeholder="you@example.com"
            />
          </label>

          <label className="block">
            <span className="font-semibold">パスワード</span>

            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
              className="mt-2 w-full rounded-lg border p-3"
              placeholder="••••••••"
            />
          </label>

          {errorMessage && (
            <p className="text-sm font-semibold text-red-600">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-[#16233F] px-6 py-3 font-semibold text-white disabled:opacity-60"
          >
            {isSubmitting ? "ログイン中..." : "ログイン"}
          </button>
        </form>
      </div>
    </main>
  );
}
