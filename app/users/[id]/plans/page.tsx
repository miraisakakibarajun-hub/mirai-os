"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { ChangeEvent } from "react";

type SavedUser = {
  id: string;
  name: string;
  kana: string;
  birthDate: string;
  renewalDate: string;
  status: string;
};

type ServiceItem = {
  id: string;
  serviceName: string;
  content: string;
  frequency: string;
};

type PlanData = {
  planPeriodStart: string;
  planPeriodEnd: string;
  createdDate: string;
  monitoringDate: string;
  userWish: string;
  familyWish: string;
  overallPolicy: string;
  longTermGoal: string;
  shortTermGoal: string;
  services: ServiceItem[];
};

type SavedPlans = Record<string, PlanData>;

const PLANS_STORAGE_KEY = "mirai-plans";

function emptyPlan(): PlanData {
  return {
    planPeriodStart: "",
    planPeriodEnd: "",
    createdDate: "",
    monitoringDate: "",
    userWish: "",
    familyWish: "",
    overallPolicy: "",
    longTermGoal: "",
    shortTermGoal: "",
    services: [],
  };
}

function emptyServiceItem(): ServiceItem {
  return {
    id: crypto.randomUUID(),
    serviceName: "",
    content: "",
    frequency: "",
  };
}

export default function UserPlansPage() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<SavedUser | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [plan, setPlan] = useState<PlanData>(emptyPlan());
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    // localStorageはサーバー側で参照できないため、マウント後に読み込んで
    // Reactの状態と同期する（外部システムとの同期はEffectの正しい用途）。
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const savedUsersRaw = localStorage.getItem("mirai-users");
      const savedUsers = savedUsersRaw
        ? (JSON.parse(savedUsersRaw) as SavedUser[])
        : [];

      const found = savedUsers.find((savedUser) => savedUser.id === params.id);

      if (!found) {
        setNotFound(true);
        return;
      }

      setUser(found);

      const savedPlansRaw = localStorage.getItem(PLANS_STORAGE_KEY);
      const savedPlans = savedPlansRaw
        ? (JSON.parse(savedPlansRaw) as SavedPlans)
        : {};

      const existingPlan = savedPlans[found.id];

      if (existingPlan) {
        setPlan(existingPlan);
      }
    } catch {
      setNotFound(true);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [params.id]);

  function updateField(field: keyof Omit<PlanData, "services">, value: string) {
    setPlan((prev) => ({ ...prev, [field]: value }));
  }

  function handleTextChange(field: keyof Omit<PlanData, "services">) {
    return (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      updateField(field, event.target.value);
    };
  }

  function addServiceItem() {
    setPlan((prev) => ({
      ...prev,
      services: [...prev.services, emptyServiceItem()],
    }));
  }

  function removeServiceItem(id: string) {
    setPlan((prev) => ({
      ...prev,
      services: prev.services.filter((service) => service.id !== id),
    }));
  }

  function updateServiceItem(
    id: string,
    field: keyof Omit<ServiceItem, "id">,
    value: string
  ) {
    setPlan((prev) => ({
      ...prev,
      services: prev.services.map((service) =>
        service.id === id ? { ...service, [field]: value } : service
      ),
    }));
  }

  function handleSave() {
    if (!user) return;

    try {
      const savedPlansRaw = localStorage.getItem(PLANS_STORAGE_KEY);
      const savedPlans = savedPlansRaw
        ? (JSON.parse(savedPlansRaw) as SavedPlans)
        : {};

      const updatedPlans: SavedPlans = {
        ...savedPlans,
        [user.id]: plan,
      };

      localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify(updatedPlans));
    } catch {
      localStorage.setItem(
        PLANS_STORAGE_KEY,
        JSON.stringify({ [user.id]: plan })
      );
    }

    setSaveMessage("保存しました。");
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
          SUPPORT MENU
        </p>

        <h1 className="mt-2 text-3xl font-bold">サービス等利用計画</h1>

        <p className="mt-2 text-slate-600">
          対象利用者：
          <span className="font-semibold">{user.name}</span>
        </p>

        {/* 1. 基本情報 */}
        <section className="mt-8 space-y-5 rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-bold text-[#16233F]">1. 基本情報</h2>

          <div className="grid gap-5 sm:grid-cols-2">
            <label className="block">
              <span className="font-semibold">計画期間（開始）</span>

              <input
                type="date"
                value={plan.planPeriodStart}
                onChange={handleTextChange("planPeriodStart")}
                className="mt-2 w-full rounded-lg border p-3"
              />
            </label>

            <label className="block">
              <span className="font-semibold">計画期間（終了）</span>

              <input
                type="date"
                value={plan.planPeriodEnd}
                onChange={handleTextChange("planPeriodEnd")}
                className="mt-2 w-full rounded-lg border p-3"
              />
            </label>

            <label className="block">
              <span className="font-semibold">作成日</span>

              <input
                type="date"
                value={plan.createdDate}
                onChange={handleTextChange("createdDate")}
                className="mt-2 w-full rounded-lg border p-3"
              />
            </label>

            <label className="block">
              <span className="font-semibold">モニタリング予定日</span>

              <input
                type="date"
                value={plan.monitoringDate}
                onChange={handleTextChange("monitoringDate")}
                className="mt-2 w-full rounded-lg border p-3"
              />
            </label>
          </div>
        </section>

        {/* 2. 利用者の希望 */}
        <section className="mt-6 space-y-5 rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-bold text-[#16233F]">2. 利用者の希望</h2>

          <label className="block">
            <span className="font-semibold">本人の希望</span>

            <textarea
              value={plan.userWish}
              onChange={handleTextChange("userWish")}
              rows={3}
              className="mt-2 w-full rounded-lg border p-3"
              placeholder="本人の希望を入力してください"
            />
          </label>

          <label className="block">
            <span className="font-semibold">家族の希望</span>

            <textarea
              value={plan.familyWish}
              onChange={handleTextChange("familyWish")}
              rows={3}
              className="mt-2 w-full rounded-lg border p-3"
              placeholder="家族の希望を入力してください"
            />
          </label>
        </section>

        {/* 3. 総合的援助方針 */}
        <section className="mt-6 space-y-5 rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-bold text-[#16233F]">
            3. 総合的援助方針
          </h2>

          <textarea
            value={plan.overallPolicy}
            onChange={handleTextChange("overallPolicy")}
            rows={4}
            className="w-full rounded-lg border p-3"
            placeholder="総合的な援助方針を入力してください"
          />
        </section>

        {/* 4. 長期目標 */}
        <section className="mt-6 space-y-5 rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-bold text-[#16233F]">4. 長期目標</h2>

          <textarea
            value={plan.longTermGoal}
            onChange={handleTextChange("longTermGoal")}
            rows={3}
            className="w-full rounded-lg border p-3"
            placeholder="長期目標を入力してください"
          />
        </section>

        {/* 5. 短期目標 */}
        <section className="mt-6 space-y-5 rounded-xl bg-white p-6 shadow">
          <h2 className="text-lg font-bold text-[#16233F]">5. 短期目標</h2>

          <textarea
            value={plan.shortTermGoal}
            onChange={handleTextChange("shortTermGoal")}
            rows={3}
            className="w-full rounded-lg border p-3"
            placeholder="短期目標を入力してください"
          />
        </section>

        {/* 6. サービス内容 */}
        <section className="mt-6 space-y-5 rounded-xl bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#16233F]">
              6. サービス内容
            </h2>

            <button
              type="button"
              onClick={addServiceItem}
              className="rounded-lg border border-[#A9824F] px-4 py-2 text-sm font-semibold text-[#A9824F] transition hover:bg-[#A9824F]/10"
            >
              ＋ 追加
            </button>
          </div>

          {plan.services.length === 0 ? (
            <p className="text-sm text-slate-500">
              サービス内容が登録されていません。「＋ 追加」から入力してください。
            </p>
          ) : (
            <div className="space-y-4">
              {plan.services.map((service, index) => (
                <div
                  key={service.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-500">
                      サービス {index + 1}
                    </p>

                    <button
                      type="button"
                      onClick={() => removeServiceItem(service.id)}
                      className="text-sm font-semibold text-red-600 hover:underline"
                    >
                      削除
                    </button>
                  </div>

                  <div className="mt-3 grid gap-4 sm:grid-cols-3">
                    <label className="block">
                      <span className="text-sm font-semibold">
                        サービス名
                      </span>

                      <input
                        type="text"
                        value={service.serviceName}
                        onChange={(event) =>
                          updateServiceItem(
                            service.id,
                            "serviceName",
                            event.target.value
                          )
                        }
                        className="mt-2 w-full rounded-lg border p-2.5"
                        placeholder="例：居宅介護"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-semibold">内容</span>

                      <input
                        type="text"
                        value={service.content}
                        onChange={(event) =>
                          updateServiceItem(
                            service.id,
                            "content",
                            event.target.value
                          )
                        }
                        className="mt-2 w-full rounded-lg border p-2.5"
                        placeholder="例：生活援助"
                      />
                    </label>

                    <label className="block">
                      <span className="text-sm font-semibold">頻度</span>

                      <input
                        type="text"
                        value={service.frequency}
                        onChange={(event) =>
                          updateServiceItem(
                            service.id,
                            "frequency",
                            event.target.value
                          )
                        }
                        className="mt-2 w-full rounded-lg border p-2.5"
                        placeholder="例：週2回"
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 7. ボタン */}
        <div className="mt-6 flex items-center justify-end gap-3">
          {saveMessage && (
            <p className="mr-auto text-sm font-semibold text-[#A9824F]">
              {saveMessage}
            </p>
          )}

          <Link
            href={`/users/${user.id}`}
            className="rounded-lg border px-5 py-3 font-semibold"
          >
            利用者詳細へ戻る
          </Link>

          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-[#16233F] px-6 py-3 font-semibold text-white"
          >
            保存
          </button>
        </div>
      </div>
    </main>
  );
}
