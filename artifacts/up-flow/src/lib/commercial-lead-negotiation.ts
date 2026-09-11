export const GROUP_UP_PLAN_VALUES = ["starter", "growth", "none"] as const;
export const UP_ZERO_PLAN_VALUES = [
  "essential",
  "elite",
  "pro",
  "none",
] as const;

export type GroupUpPlan = (typeof GROUP_UP_PLAN_VALUES)[number];
export type UpZeroPlan = (typeof UP_ZERO_PLAN_VALUES)[number];

export const NEGOTIATED_SCOPE_ITEMS = {
  group_up: {
    starter: [
      {
        key: "group_up.performance_team",
        labelKey: "commercialLead.scope.performanceTeam",
      },
      { key: "group_up.meta_ads", labelKey: "commercialLead.scope.metaAds" },
      {
        key: "group_up.google_ads",
        labelKey: "commercialLead.scope.googleAds",
      },
      {
        key: "group_up.pinterest_ads",
        labelKey: "commercialLead.scope.pinterestAds",
      },
      {
        key: "group_up.tiktok_ads",
        labelKey: "commercialLead.scope.tiktokAds",
      },
      {
        key: "group_up.designer_team",
        labelKey: "commercialLead.scope.designerTeam",
      },
      {
        key: "group_up.support_team",
        labelKey: "commercialLead.scope.supportTeam",
      },
      {
        key: "group_up.weekly_reports",
        labelKey: "commercialLead.scope.weeklyReports",
      },
      {
        key: "group_up.dashboard_basic",
        labelKey: "commercialLead.scope.dashboardBasic",
      },
    ],
    growth: [
      {
        key: "group_up.performance_team",
        labelKey: "commercialLead.scope.performanceTeam",
      },
      { key: "group_up.meta_ads", labelKey: "commercialLead.scope.metaAds" },
      {
        key: "group_up.google_ads",
        labelKey: "commercialLead.scope.googleAds",
      },
      {
        key: "group_up.pinterest_ads",
        labelKey: "commercialLead.scope.pinterestAds",
      },
      {
        key: "group_up.tiktok_ads",
        labelKey: "commercialLead.scope.tiktokAds",
      },
      {
        key: "group_up.designer_team",
        labelKey: "commercialLead.scope.designerTeam",
      },
      {
        key: "group_up.support_team",
        labelKey: "commercialLead.scope.supportTeam",
      },
      {
        key: "group_up.weekly_reports",
        labelKey: "commercialLead.scope.weeklyReports",
      },
      {
        key: "group_up.dashboard_basic",
        labelKey: "commercialLead.scope.dashboardBasic",
      },
      {
        key: "group_up.motion_team",
        labelKey: "commercialLead.scope.motionTeam",
      },
      { key: "group_up.crm_team", labelKey: "commercialLead.scope.crmTeam" },
      {
        key: "group_up.dashboard_erp",
        labelKey: "commercialLead.scope.dashboardErp",
      },
    ],
    none: [],
  },
  up_zero: {
    essential: [
      {
        key: "up_zero.standard_template",
        labelKey: "commercialLead.scope.standardTemplate",
      },
      { key: "up_zero.users_3", labelKey: "commercialLead.scope.users3" },
    ],
    pro: [
      {
        key: "up_zero.standard_template",
        labelKey: "commercialLead.scope.standardTemplate",
      },
      { key: "up_zero.training_4", labelKey: "commercialLead.scope.training4" },
      { key: "up_zero.users_6", labelKey: "commercialLead.scope.users6" },
    ],
    elite: [
      {
        key: "up_zero.custom_template",
        labelKey: "commercialLead.scope.customTemplate",
      },
      { key: "up_zero.training_8", labelKey: "commercialLead.scope.training8" },
      { key: "up_zero.users_0", labelKey: "commercialLead.scope.users0" },
    ],
    none: [],
  },
} as const;

export type NegotiatedScopeItem = {
  key: string;
  labelKey: string;
};

export function negotiatedScopeItems(
  groupUpPlan: GroupUpPlan,
  upZeroPlan: UpZeroPlan,
): NegotiatedScopeItem[] {
  return [
    ...NEGOTIATED_SCOPE_ITEMS.group_up[groupUpPlan],
    ...NEGOTIATED_SCOPE_ITEMS.up_zero[upZeroPlan],
  ];
}

export type CommercialLeadNegotiationInput = {
  groupUpPlan: GroupUpPlan;
  groupUpMonthlyFee: number | null;
  upZeroPlan: UpZeroPlan;
  upZeroMonthlyFee: number | null;
  upZeroImplementationFee: number | null;
  negotiatedScope: string[];
};

export type CommercialLeadNegotiationValidation =
  | { ok: true; data: CommercialLeadNegotiationInput }
  | {
      ok: false;
      field:
        | "group_up_monthly_fee"
        | "up_zero_monthly_fee"
        | "up_zero_implementation_fee"
        | "negotiated_scope";
    };

function normalizedFee(plan: string, fee: number | null) {
  if (plan === "none") return null;
  return typeof fee === "number" && Number.isFinite(fee) && fee > 0
    ? fee
    : null;
}

export function validateCommercialLeadNegotiation(
  input: CommercialLeadNegotiationInput,
): CommercialLeadNegotiationValidation {
  const groupUpMonthlyFee = normalizedFee(
    input.groupUpPlan,
    input.groupUpMonthlyFee,
  );
  if (input.groupUpPlan !== "none" && groupUpMonthlyFee === null) {
    return { ok: false, field: "group_up_monthly_fee" };
  }

  const upZeroMonthlyFee = normalizedFee(
    input.upZeroPlan,
    input.upZeroMonthlyFee,
  );
  if (input.upZeroPlan !== "none" && upZeroMonthlyFee === null) {
    return { ok: false, field: "up_zero_monthly_fee" };
  }

  const upZeroImplementationFee =
    input.upZeroPlan === "none"
      ? null
      : typeof input.upZeroImplementationFee === "number" &&
          Number.isFinite(input.upZeroImplementationFee) &&
          input.upZeroImplementationFee >= 0
        ? input.upZeroImplementationFee
        : null;
  if (input.upZeroPlan !== "none" && upZeroImplementationFee === null) {
    return { ok: false, field: "up_zero_implementation_fee" };
  }

  const expectedScope = negotiatedScopeItems(
    input.groupUpPlan,
    input.upZeroPlan,
  ).map((item) => item.key);
  const submittedScope = Array.from(new Set(input.negotiatedScope));
  if (
    submittedScope.length !== expectedScope.length ||
    expectedScope.some((key) => !submittedScope.includes(key))
  ) {
    return { ok: false, field: "negotiated_scope" };
  }

  return {
    ok: true,
    data: {
      ...input,
      groupUpMonthlyFee,
      upZeroMonthlyFee,
      upZeroImplementationFee,
      negotiatedScope: expectedScope,
    },
  };
}
