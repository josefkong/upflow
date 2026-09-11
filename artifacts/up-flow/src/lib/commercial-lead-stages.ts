export const COMMERCIAL_LEAD_STAGE_FIELD_NAME = "Upflow Commercial Lead Stage";

export const COMMERCIAL_LEAD_STAGES = [
  { key: "lead", name: "Lead", color: "#64748b", terminal: false },
  { key: "presentation_scheduled", name: "Agendamento da Apresentação", color: "#3b82f6", terminal: false },
  { key: "presentation_completed", name: "Apresentação Realizada", color: "#8b5cf6", terminal: false },
  { key: "qualification", name: "Qualificação", color: "#06b6d4", terminal: false },
  { key: "proposal_sending", name: "Envio da Proposta", color: "#f59e0b", terminal: false },
  { key: "awaiting_response", name: "Aguardando Resposta", color: "#ec4899", terminal: false },
  { key: "completed", name: "Concluído", color: "#22c55e", terminal: true },
  { key: "archived", name: "Arquivados", color: "#ef4444", terminal: true },
] as const;

export type CommercialLeadStage = (typeof COMMERCIAL_LEAD_STAGES)[number]["key"];

export function commercialLeadStageName(stage: CommercialLeadStage) {
  return COMMERCIAL_LEAD_STAGES.find((item) => item.key === stage)?.name ?? COMMERCIAL_LEAD_STAGES[0].name;
}

export function isCommercialLeadStage(value: string): value is CommercialLeadStage {
  return COMMERCIAL_LEAD_STAGES.some((item) => item.key === value);
}

export function commercialLeadStageFromName(value: string): CommercialLeadStage | null {
  return COMMERCIAL_LEAD_STAGES.find((item) => item.name === value)?.key ?? null;
}
