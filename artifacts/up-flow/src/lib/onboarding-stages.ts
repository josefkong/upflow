export const SHARED_ONBOARDING_STAGES = [
  {
    key: "agendamento-onboardings",
    name: "Agendamento dos Onboardings",
    color: "#f59e0b",
    terminal: false,
    departments: ["Suporte + Financeiro", "Performance", "Criação"],
  },
  {
    key: "onboarding-suporte",
    name: "Onboarding de Suporte",
    color: "#3b82f6",
    terminal: false,
    departments: ["Suporte", "Financeiro", "Administração"],
  },
  {
    key: "onboarding-performance",
    name: "Onboarding de Performance",
    color: "#8b5cf6",
    terminal: false,
    departments: ["Marketing B2B", "Marketing B2C"],
  },
  {
    key: "onboarding-criacao",
    name: "Onboarding de Criação",
    color: "#ec4899",
    terminal: true,
    departments: ["Criativo e Design", "Produção"],
  },
] as const;

export type SharedOnboardingStage =
  (typeof SHARED_ONBOARDING_STAGES)[number]["name"];

export const LEGACY_SHARED_ONBOARDING_STAGES = [
  {
    key: "onboarding-interno",
    name: "Onboarding Interno",
    replacement: "Onboarding de Suporte",
  },
  {
    key: "onboarding-externo",
    name: "Onboarding Externo",
    replacement: "Onboarding de Performance",
  },
  {
    key: "go-live",
    name: "Go Live",
    replacement: "Onboarding de Criação",
  },
] as const satisfies ReadonlyArray<{
  key: string;
  name: string;
  replacement: SharedOnboardingStage;
}>;

const STAGE_BY_AUTOMATION_PREFIX = [
  {
    prefix: "shared_onboarding:scheduling:",
    stage: "Agendamento dos Onboardings",
  },
  {
    prefix: "shared_onboarding:support:",
    stage: "Onboarding de Suporte",
  },
  {
    prefix: "shared_onboarding:performance:",
    stage: "Onboarding de Performance",
  },
  {
    prefix: "shared_onboarding:creative:",
    stage: "Onboarding de Criação",
  },
] as const satisfies ReadonlyArray<{
  prefix: string;
  stage: SharedOnboardingStage;
}>;

export function sharedOnboardingStageLabel(
  automationKey: string | null | undefined,
) {
  return (
    STAGE_BY_AUTOMATION_PREFIX.find((phase) =>
      automationKey?.startsWith(phase.prefix),
    )?.stage ?? null
  );
}

export function onboardingStageDepartmentSummary(
  stageName: string | null | undefined,
) {
  const stage = SHARED_ONBOARDING_STAGES.find(
    (candidate) => candidate.name === stageName,
  );
  return stage?.departments.join(" · ") ?? null;
}

export function isSharedOnboardingSchedulingKey(
  automationKey: string | null | undefined,
) {
  return automationKey?.startsWith("shared_onboarding:scheduling:") ?? false;
}
