import type { PlanData } from './plan-content';
export const changeFields = [
 ['continuingWishes','継続している本人の希望'],
 ['progress','実現・前進したこと'],
 ['discoveries','新しく分かったこと'],
 ['wishChanges','本人の気持ち・希望の変化'],
 ['familyChanges','家族の意向の変化'],
 ['considerations','次回計画で検討した方がよいこと'],
] as const;
export type MonitoringChanges = Record<(typeof changeFields)[number][0], string>;
export type MonitoringAiContext = {
 plan: {id:string; revision:number; approvedAt:string; content:PlanData; selection:string} | null;
 sourceVersion:string;
 available:boolean;
};
