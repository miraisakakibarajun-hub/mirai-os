import type { PlanData } from '@/lib/plan-content';
import ApprovedAiNote from '@/app/components/ApprovedAiNote';
import styles from './print.module.css';

export type PrintPlan = { name: string; revision: number; content: PlanData; approvedAt: string; approver: string; planId?:string; userId?:string; outputAt?:string; templateVersion?:string };
export default function PlanPrintDocument({ name, revision, content: p, approvedAt, approver, planId, userId, outputAt, templateVersion }: PrintPlan) {
  const fields: [string, string][] = [['本人の希望',p.userWish],['家族の希望',p.familyWish],['総合的援助方針',p.overallPolicy],['長期目標',p.longTermGoal],['短期目標',p.shortTermGoal]];
  return <article lang="ja" className={styles.document}>
    <header className={styles.header}>
      <p className={styles.kicker}>MIRAI OS ／ 承認版 第{revision}版</p>
      <h1>サービス等利用計画</h1>
      <ApprovedAiNote content={p} revision={revision} />
      <p className={styles.name}>利用者氏名：{name}</p>
      <p className={styles.approval}>承認日時：{new Date(approvedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}（日本時間）<br />承認者：{approver}</p>
      <p className={styles.footer}>本文は承認された第{revision}版です。利用者情報と本文は承認時の保存情報です。<br />MIRAI OSの出力様式です。自治体等の指定様式ではありません。</p>
    <p className={styles.footer}>計画ID：{planId} ／ 利用者ID：{userId}<br/>出力日時：{outputAt} ／ 様式版：{templateVersion} ／ 承認済み</p></header>
    <dl className={styles.dates}>
      <div><dt>計画期間</dt><dd>{p.planPeriodStart || '未入力'} ～ {p.planPeriodEnd || '未入力'}</dd></div>
      <div><dt>作成日</dt><dd>{p.createdDate || '未入力'}</dd></div>
      <div><dt>モニタリング予定日</dt><dd>{p.monitoringDate || '未入力'}</dd></div>
    </dl>
    {fields.map(([label,value],i)=><section className={styles.section} key={label}><h2>{i+1}. {label}</h2><p>{value || '未入力'}</p></section>)}
    <section className={styles.section}><h2>6. サービス内容</h2>
      {p.services.length ? p.services.map((s,i)=><div className={styles.service} key={s.id}>
        <h3>{i+1}. {s.serviceName || 'サービス名未入力'}</h3>
        <p className={styles.serviceMeta}><strong>頻度：</strong>{s.frequency || '未入力'}</p>
        <p><strong>内容：</strong>{s.content || '未入力'}</p>
      </div>) : <p>未入力</p>}
    </section>
    {p.monitoringChecks && <section className={styles.section}><h2>7. 次回モニタリングで確認する項目</h2><p>{p.monitoringChecks}</p></section>}
  </article>;
}
