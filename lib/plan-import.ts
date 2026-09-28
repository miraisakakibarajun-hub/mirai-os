export type PlanImport = {
  field: 'userWish' | 'familyWish' | 'overallPolicy' | 'longTermGoal' | 'shortTermGoal';
  document_id: string;
  document_version: number;
  source_body: string;
  imported_text: string;
};
export type SavedPlanImport = Omit<PlanImport,'source_body'> & {
  id: string; revision: number; saved_text: string; recorded_at: string; imported_by: string;
  source_content: { body: string; model?: string; sources?: { kind: string; id: string; version: number }[] } | null;
};
