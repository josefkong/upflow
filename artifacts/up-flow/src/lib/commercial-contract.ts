export const COMMERCIAL_CONTRACT_SERVICES = [
  "Meta Ads",
  "Google Ads",
  "TikTok Ads",
  "Pinterest Ads",
  "Social Media",
  "Creative",
  "Video",
  "Website",
  "E-Commerce",
  "SEO",
  "Email Marketing",
  "Tracking/Analytics",
  "Influencers / UGC",
  "Up Zero",
  "Up Motion",
  "Implantação de IA",
  "Suporte",
] as const;

const GROUP_UP_PLAN_NAMES = {
  starter: "Starter",
  growth: "Growth",
  none: "Nenhum",
} as const;

const UP_ZERO_PLAN_NAMES = {
  essential: "Essencial",
  elite: "Elite",
  pro: "Pro",
  none: "Nenhum",
} as const;

type ContractLeadSnapshot = {
  group_up_plan: string | null;
  group_up_monthly_fee: unknown;
  up_zero_plan: string | null;
  up_zero_monthly_fee: unknown;
};

export function commercialContractPlanFromLead(lead: ContractLeadSnapshot) {
  const plans = [] as string[];
  if (lead.group_up_plan && lead.group_up_plan !== "none") {
    const groupUpPlan =
      GROUP_UP_PLAN_NAMES[
        lead.group_up_plan as keyof typeof GROUP_UP_PLAN_NAMES
      ] ?? lead.group_up_plan;
    plans.push(`Plano Grupo UP — ${groupUpPlan}`);
  }
  if (lead.up_zero_plan && lead.up_zero_plan !== "none") {
    const upZeroPlan =
      UP_ZERO_PLAN_NAMES[
        lead.up_zero_plan as keyof typeof UP_ZERO_PLAN_NAMES
      ] ?? lead.up_zero_plan;
    plans.push(`Plano UP Zero — ${upZeroPlan}`);
  }
  return plans.join(" + ");
}

export function commercialContractMonthlyFeeFromLead(lead: ContractLeadSnapshot) {
  return [lead.group_up_monthly_fee, lead.up_zero_monthly_fee].reduce<number>(
    (total, value) => total + (value === null ? 0 : Number(value)),
    0,
  );
}
