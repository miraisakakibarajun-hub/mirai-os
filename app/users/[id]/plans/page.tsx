"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import PlanReviewPanel from './PlanReviewPanel';
import { parseReview, type PlanReview } from '@/lib/plan-review';
import type { PlanImport } from '@/lib/plan-import';
import PlanDraftImport from './PlanDraftImport';
import type { ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { emptyPlan, parsePlan, validatePlan, type PlanData, type ServiceItem } from "@/lib/plan-content";

type SavedUser = {
  id: string;
  name: string;
};

type FetchState = "loading" | "not-found" | "error" | "loaded";

function emptyServiceItem(): ServiceItem {
  return {
    id: crypto.randomUUID(),
    serviceName: "",
    content: "",
    frequency: "",
  };
}

export default function UserPlansPage() {
  const { id } = useParams<{ id: string }>();
  return <PlanEditor key={id} />;
}

function PlanEditor() {
  const params = useParams<{ id: string }>();
  const [user, setUser] = useState<SavedUser | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>("loading");
  const [plan, setPlan] = useState<PlanData>(emptyPlan());
  const [savedPlan, setSavedPlan] = useState<PlanData>(emptyPlan());
  const [pendingImport, setPendingImport] = useState(false);
  const [imports,setImports] = useState<PlanImport[]>([]);
  const dirty = imports.length > 0 || JSON.stringify(plan) !== JSON.stringify(savedPlan);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [planId, setPlanId] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [review, setReview] = useState<PlanReview | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const editable = review?.state === 'draft' || review?.state === 'rejected';
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const requestId = useRef(0);
  const saveLock = useRef(false);

  useEffect(() => {
    let isMounted = true;
    requestId.current += 1;

    async function fetchUser() {
      setFetchState("loading");
      setUser(null);
      setPlan(emptyPlan());
      setSaveMessage(null);
      setPlanId(null);
      setNotice(null);
      setLoadError(null);
      setSaving(false);
      saveLock.current = false;

      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("users")
          .select("id, name")
          .eq("id", params.id)
          .maybeSingle();

        if (!isMounted) return;

        if (error) {
          setFetchState(error.code === "22P02" ? "not-found" : "error");
          return;
        }

        if (!data) {
          setFetchState("not-found");
          return;
        }

        const { data: activePlan, error: planError } = await supabase
          .from("plans")
          .select("id, content, content_version")
          .eq("user_id", data.id)
          .eq("status", "active")
          .maybeSingle();
        if (!isMounted) return;
        if (planError || !activePlan) {
          setLoadError(planError
            ? "計画情報を取得できませんでした。時間をおいて再読み込みしてください。"
            : "有効な計画が見つかりません。管理者に確認してください。");
          setFetchState("error");
          return;
        }
        let loadedPlan = emptyPlan();
        if (activePlan.content !== null) {
          loadedPlan = parsePlan(activePlan.content);
        } else {
          // クラウド未保存の場合だけ旧データを復元。読込時には送信・削除しない。
          try {
            const raw = localStorage.getItem("mirai-plans");
            const legacy = raw ? JSON.parse(raw) : null;
            if (legacy && Object.prototype.hasOwnProperty.call(legacy, data.id)) {
              loadedPlan = parsePlan(legacy[data.id]);
              setNotice("このブラウザーの旧保存データを表示しています。内容を確認し「保存」を押すと共有保存されます。");
            }
          } catch {
            setLoadError("このブラウザーの旧計画データを読み取れませんでした。データを消さずに管理者へ確認してください。");
            setFetchState("error");
            return;
          }
        }
        const { data: reviewData, error: reviewFailure } = await supabase.rpc('get_plan_review', { p_plan_id: activePlan.id });
        if (!isMounted) return;
        if (reviewFailure) {
          setReviewError(reviewFailure.code === 'M7003' ? 'この計画を編集・承認する権限がありません。' : '確認状態を取得できません。再読み込みしてください。');
        } else { setReview(parseReview(reviewData)); }
        setPlan(loadedPlan);
        setSavedPlan(loadedPlan);
        setPlanId(activePlan.id);
        setVersion(activePlan.content_version);
        setUser(data);
        setFetchState("loaded");
      } catch {
        if (isMounted) setFetchState("error");
      }
    }

    void fetchUser();

    return () => {
      isMounted = false;
      requestId.current += 1;
    };
  }, [params.id]);

  useEffect(() => {
    if (!dirty && !pendingImport) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, pendingImport]);

  function updateField(field: keyof Omit<PlanData, "services">, value: string) {
    setPlan((prev) => ({ ...prev, [field]: value }));
    setSaveMessage(null);
  }

  function applyImport(field: PlanImport['field'], value: string, source: PlanImport) {
    if (imports.length >= 20) { setSaveMessage('取り込み履歴は一度に20件までです。候補をクリアして共有保存してから続けてください。'); return false; }
    updateField(field,value); setImports(previous => [...previous,source]); return true;
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

  async function handleSave() {
    if (!user || user.id !== params.id || !planId || saveLock.current || !editable) return;
    if (pendingImport) { setSaveMessage('取り込む文章が残っています。取り込むか、クリアしてから保存してください。'); return; }
    const validation = validatePlan(plan);
    if (validation) { setSaveMessage(validation); return; }
    saveLock.current = true;
    setSaving(true);
    setSaveMessage(null);
    const currentRequest = requestId.current;
    try {
      const { data, error } = await createClient().rpc("save_plan_with_imports", {
        p_plan_id: planId,
        p_user_id: user.id,
        p_expected_version: version,
        p_content: plan,
        p_imports: imports,
      });
      if (currentRequest !== requestId.current) return;
      if (error || !data || data.length !== 1) {
        setSaveMessage(error?.code?.startsWith('M800')
          ? '取り込み元の文書が変更されたか、履歴を保存できません。入力は残しています。保存前に戻して、最新の文書から取り込み直してください。'
          : error?.code === "M2001"
          ? "別の画面で計画が変更されたか、更新できなくなりました。入力内容を控えてから再読み込みしてください。"
          : "保存できませんでした。入力内容は画面に残っています。通信状況とログイン状態を確認してください。");
        return;
      }
      setVersion(data[0].content_version);
      setSavedPlan(plan);
      setImports([]);
      setNotice(null);
      setSaveMessage("共有保存しました。");
      await refreshReview(planId);
    } catch {
      if (currentRequest === requestId.current) setSaveMessage("保存結果を確認できませんでした。入力内容を控えてから再読み込みして確認してください。");
    } finally {
      if (currentRequest === requestId.current) {
        saveLock.current = false;
        setSaving(false);
      }
    }
  }
  async function refreshReview(id: string) {
    const { data, error } = await createClient().rpc('get_plan_review', { p_plan_id: id });
    if (error) { setReview(null); setReviewError('確認状態を取得できません。入力内容を控え、再読み込みしてください。'); return; }
    setReview(parseReview(data));
    setReviewError(null);
  }

  async function handleReviewAction(action: string, reason: string) {
    if (!planId || !review || saveLock.current || dirty || pendingImport || notice) return;
    saveLock.current = true; setSaving(true); setSaveMessage(null); setReviewError(null);
    const currentRequest = requestId.current;
    try {
      const { data, error } = await createClient().rpc('act_plan_review', { p_plan_id: planId, p_revision: version, p_epoch: review.epoch, p_action: action, p_reason: reason });
      if (currentRequest !== requestId.current) return;
      if (error) { setReviewError(error.code === 'M7002' ? error.message : '操作できませんでした。別の画面での変更や権限を確認し、再読み込みしてください。'); return; }
      const next = parseReview(data);
      setReview(next);
      if (action === 'revise') {
        const latest = next.revisions[0];
        setVersion(latest.revision); setPlan(latest.content); setSavedPlan(latest.content);
      }
    } catch { if (currentRequest === requestId.current) setReviewError('操作結果を確認できません。再読み込みして状態を確認してください。'); }
    finally { if (currentRequest === requestId.current) { saveLock.current = false; setSaving(false); } }
  }
  if (fetchState === "not-found" || fetchState === "error") {
    return (
      <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
        <div className="mx-auto max-w-2xl">
          <div className="rounded-xl bg-white p-10 text-center shadow">
            <p className="font-semibold text-slate-700">
              {fetchState === "not-found"
                ? "指定された利用者が見つかりませんでした。"
                : loadError ?? "利用者または計画情報の読み込みに失敗しました。"}
            </p>

            <p className="mt-2 text-sm text-slate-500">
              {fetchState === "not-found"
                ? "一覧から利用者を選び直してください。"
                : "通信状況を確認し、ページを再読み込みしてください。"}
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

  if (fetchState === "loading" || !user || user.id !== params.id) {
    return (
      <main className="min-h-screen bg-slate-50 p-8 text-slate-900">
        <div className="mx-auto max-w-2xl">
          <p className="text-slate-500">読み込み中...</p>
        </div>
      </main>
    );
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

        {notice && <p role="status" className="mt-4 rounded-lg bg-amber-50 p-4 text-sm text-amber-900">{notice}</p>}
        {reviewError && <p role="alert" className="mt-4 rounded bg-amber-50 p-4">{reviewError}</p>}
        {review && <PlanReviewPanel userId={user.id} planId={planId!} key={version + ':' + review.epoch + ':' + dirty} review={review} version={version} blocked={dirty || pendingImport || !!notice} busy={saving} onAction={handleReviewAction} />}
        <fieldset disabled={saving || !editable} className="min-w-0 border-0 p-0">
        <PlanDraftImport userId={user.id} plan={plan} onApply={applyImport} onPendingChange={setPendingImport} />
        {imports.length > 0 && <div className="mt-4 rounded border p-3"><p>未保存の取り込み履歴：{imports.length}件。本文と一緒に共有保存されます。</p><button type="button" className="mt-2 rounded border p-2" onClick={()=>{setPlan(savedPlan);setImports([]);setSaveMessage('未保存の変更を取り消しました。');}}>取り込みを含む未保存の変更をすべて取り消す</button><p className="text-sm">手入力の修正も保存前に戻ります。取り込み候補が残る場合は、候補欄もクリアしてください。</p></div>}
        {dirty && <p role="status" className="mt-4 font-semibold text-amber-800">計画に未保存の変更があります。</p>}
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

        <section className="mt-6 rounded-xl bg-white p-6 shadow"><h2 className="text-lg font-bold">次回モニタリングで確認する項目</h2><textarea aria-label="次回モニタリングで確認する項目" value={plan.monitoringChecks ?? ''} onChange={handleTextChange('monitoringChecks')} rows={4} className="mt-2 w-full rounded border p-3" /></section>
        {/* 7. ボタン */}
        <div className="mt-6 flex items-center justify-end gap-3">
          {saveMessage && (
            <p role="status" className="mr-auto text-sm font-semibold text-[#A9824F]">
              {saveMessage}
            </p>
          )}

          <Link
            href={`/users/${user.id}`}
            onClick={event => { if (saving || ((dirty || pendingImport) && !window.confirm('未保存の変更を破棄して戻りますか？'))) event.preventDefault(); }}
            className="rounded-lg border px-5 py-3 font-semibold"
          >
            利用者詳細へ戻る
          </Link>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[#16233F] px-6 py-3 font-semibold text-white"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
        </fieldset>
      </div>
    </main>
  );
}
