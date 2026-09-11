import { Prisma, type ClientSalesChannel } from "@prisma/client";
import type { OnboardingCapabilities } from "@/lib/types";
import {
  canAccessWorkspace,
  isWorkspaceAdminFor,
  type AuthUser,
} from "@/lib/auth-helpers";
import { recordActivity } from "@/lib/activity";
import { logError } from "@/lib/log-error";
import {
  ownerKeyForDepartmentLabel,
  ownerKeyForTaskRoute,
} from "@/lib/onboarding-department-owners";
import {
  type OnboardingTaskRoute,
  isFinanceCampaignStartedAutomationKey,
  normalizeOnboardingRouteValue,
  marketingFormRouteForOnboarding,
  routeForOnboardingChecklistItem,
  routeForResponsibleDepartment,
  routeForService,
} from "@/lib/onboarding-routing";
import {
  SHARED_ONBOARDING_EXECUTION_KEYS,
  SHARED_ONBOARDING_SCHEDULING_KEYS,
  SHARED_ONBOARDING_SEQUENTIAL_ENTRY_KEY,
  SHARED_ONBOARDING_TASK_AUTOMATION_KEY,
  isSharedOnboardingAutomationKey,
  sharedOnboardingItemIsUnlocked,
  sharedOnboardingPhaseIndex,
  syncSharedOnboardingTaskStage,
} from "@/lib/onboarding-shared-flow";
import { isSharedOnboardingSchedulingKey } from "@/lib/onboarding-stages";
import { prisma } from "@/lib/prisma";
import { broadcastNotification } from "@/lib/supabase-server";
import { formatDate } from "@/lib/utils";

import { notifyTaskAssignee } from "@/lib/task-assignment-notifications";
import { deleteTasksByIds } from "@/lib/task-delete";
export { routeForService } from "@/lib/onboarding-routing";

export const ONBOARDING_STATUSES = [
  "pending_commercial_setup",
  "pending_finance_registration",
  "pending_contract_upload",
  "pending_internal_assignment",
  "pending_support_group",
  "pending_onboarding_scheduling",
  "onboarding_in_progress",
  "onboarding_complete",
] as const;

export const DEFAULT_ONBOARDING_SERVICES = [
  "Meta Ads",
  "Google Ads",
  "Social Media",
  "Creative",
  "Video",
  "Email Marketing",
  "Website",
  "Tracking/Analytics",
  "SEO",
  "Support",
] as const;

export const MARKETING_B2B_FORM_SERVICES = [
  "Meta Ads",
  "Google Ads",
  "TikTok Ads",
  "Pinterest Ads",
  "E-Commerce",
  "Vesti",
  "Up Zero",
  "Up Motion",
  "UP Motion v.1",
  "UP Motion v.2",
  "Implantacao IA",
] as const;

export const MARKETING_B2C_FORM_SERVICES = [
  "Meta Ads",
  "Google Ads",
  "TikTok Ads",
  "Pinterest Ads",
  "E-Commerce",
  "Vesti",
  "Nuvemshop",
  "Google Shopping",
  "Social Media",
  "Up Zero",
  "Up Motion",
  "UP Motion v.1",
  "UP Motion v.2",
  "Implantacao IA",
  "Influencers / UGC",
] as const;

export const UP_ZERO_CONFIGURATION_AUTOMATION_KEY =
  "up_zero_website_configuration";
export const UP_ZERO_CONFIGURATION_TASK_TITLE = "Configure UP Zero website";
export const UP_ZERO_MARKETING_B2B_DEPENDENCY_MESSAGE =
  "Waiting for UP Zero website configuration by Technical Support.";
export const VESTI_CAMPAIGN_STARTED_AUTOMATION_KEY =
  "marketing_b2b_vesti_campaign_start";
export const UP_ZERO_CAMPAIGN_STARTED_AUTOMATION_KEY =
  "marketing_b2b_up_zero_campaign_start";
export const CAMPAIGN_STARTED_TASK_TITLE = "Iniciar Campanha";

export function isUpZeroConfigurationChecklistItem(item: {
  automation_key?: string | null;
  department?: string | null;
  title?: string | null;
}) {
  const department = normalizedName(item.department ?? "");
  const isTechnicalSupport =
    ownerKeyForDepartmentLabel(item.department) === "technical_support" ||
    department.includes("support") ||
    department.includes("suporte");
  return Boolean(
    item.automation_key === UP_ZERO_CONFIGURATION_AUTOMATION_KEY ||
    (isTechnicalSupport &&
      normalizedName(item.title ?? "") ===
        normalizedName(UP_ZERO_CONFIGURATION_TASK_TITLE)),
  );
}

export const UP_ZERO_SEQUENCE_STATUSES = [
  "commercial_pending",
  "technical_support_pending",
  "up_zero_configuration_in_progress",
  "marketing_b2b_ready",
  "marketing_b2b_in_progress",
] as const;

type ServiceWorkflowStep = {
  title: string;
  description: string;
  meeting?: boolean;
  priority?: "low" | "medium" | "high";
  automationKey?: string;
  marketingB2BOnly?: boolean;
};

const ONBOARDING_PRESENTATION_URL = "https://www.canva.com/folder/FAHOKHrZriY";

export const VESTI_ONBOARDING_WORKFLOW = [
  {
    title: "Criar grupo de WhatsApp e capa",
    description:
      "Criar o grupo de WhatsApp do cliente, adicionar os participantes e configurar a capa.",
  },
  {
    title: "Agendar apresentação e dia do onboarding",
    description:
      "Apresentar-se ao cliente e marcar a data e o horário do onboarding.",
    meeting: true,
    priority: "high",
  },
  {
    title: "Realizar onboarding",
    description: `Realizar o onboarding usando a apresentação oficial: ${ONBOARDING_PRESENTATION_URL}`,
    priority: "high",
  },
  {
    title: "Registrar anotações pós-onboarding no ClickUp",
    description:
      "Documentar decisões, responsáveis, prazos, acessos e pendências levantadas durante o onboarding.",
  },
  {
    title: "Solicitar materiais e acessos ao cliente",
    description:
      "Solicitar lista de clientes para Lookalike; acesso ao painel/API da Vesti; Drive com fotos e vídeos; e compra do domínio.",
    priority: "high",
  },
  {
    title: "Obter acessos de Meta, GA4 e GTM",
    description:
      "Confirmar e registrar os acessos necessários ao Meta, Google Analytics 4 e Google Tag Manager.",
    priority: "high",
  },
  {
    title: "Solicitar configuração do domínio na Vesti para o Chiliti",
    description:
      "Solicitar ao cliente a configuração do domínio na Vesti e encaminhar as informações para o Chiliti.",
  },
  {
    title: "Solicitar inclusão do cliente no Power BI da Vesti",
    description:
      "Solicitar à Vesti a inclusão do novo cliente no Power BI e confirmar a disponibilidade dos dados.",
  },
  {
    title: "Realizar configuração técnica",
    description:
      "Configurar rastreamento web (Meta Ads, GA4, Microsoft Clarity e GTM Web) e rastreamento server-side (domínio, Stape e GTM Server).",
    priority: "high",
  },
  {
    title: "Criar e validar o UP Dash",
    description:
      "Obter API Key e Company ID da Vesti; conectar os dados; criar o dashboard; validar os dados do cliente; e enviar o acesso ao cliente.",
    priority: "high",
  },
  {
    title: CAMPAIGN_STARTED_TASK_TITLE,
    description:
      "Iniciar a campanha do cliente. Ao concluir, o Financeiro recebe automaticamente o aviso de início dos serviços.",
    priority: "high",
    automationKey: VESTI_CAMPAIGN_STARTED_AUTOMATION_KEY,
    marketingB2BOnly: true,
  },
] as const satisfies readonly ServiceWorkflowStep[];

export const UP_ZERO_ONBOARDING_WORKFLOW = [
  {
    title: "Criar grupo de WhatsApp e capa",
    description:
      "Criar o grupo de WhatsApp do cliente, adicionar os participantes e configurar a capa.",
  },
  {
    title: "Agendar apresentação e dia do onboarding",
    description:
      "Apresentar-se ao cliente e marcar a data e o horário do onboarding.",
    meeting: true,
    priority: "high",
  },
  {
    title: "Realizar onboarding",
    description: `Realizar o onboarding usando a apresentação oficial: ${ONBOARDING_PRESENTATION_URL}`,
    priority: "high",
  },
  {
    title: "Registrar anotações pós-onboarding no ClickUp",
    description:
      "Documentar decisões, responsáveis, prazos, acessos e pendências levantadas durante o onboarding.",
  },
  {
    title: "Solicitar materiais ao cliente",
    description:
      "Solicitar lista de clientes para Lookalike e Drive com fotos e vídeos.",
    priority: "high",
  },
  {
    title: "Obter acessos de Meta, GA4 e GTM",
    description:
      "Confirmar e registrar os acessos necessários ao Meta, Google Analytics 4 e Google Tag Manager.",
    priority: "high",
  },
  {
    title: "Realizar configuração técnica",
    description:
      "Configurar Meta Ads (pixel e API Token), GA4 (ID e chave secreta da API) e Microsoft Clarity (ID do projeto).",
    priority: "high",
  },
  {
    title: "Preparar briefing de criativos",
    description:
      "Consolidar o briefing de criativos com ofertas, formatos, referências, mensagens e materiais disponíveis.",
  },
  {
    title: "Treinar o cliente no uso do UP Dash",
    description:
      "Apresentar o UP Dash ao cliente, explicar os indicadores e orientar o uso recorrente do dashboard.",
  },
  {
    title: CAMPAIGN_STARTED_TASK_TITLE,
    description:
      "Iniciar a campanha do cliente. Ao concluir, o Financeiro recebe automaticamente o aviso de início dos serviços.",
    priority: "high",
    automationKey: UP_ZERO_CAMPAIGN_STARTED_AUTOMATION_KEY,
    marketingB2BOnly: true,
  },
] as const satisfies readonly ServiceWorkflowStep[];

export type Tx = Prisma.TransactionClient;
type Db = typeof prisma | Tx;

type OnboardingTaskProjectInput = {
  workspaceId: string;
  companyId?: string | null;
  companyName?: string;
  sourceProjectId?: string | null;
  sourceProjectSpaceId?: string | null;
  ownerId: string;
  route: OnboardingTaskRoute;
};

type UserRef = { id: string; name: string; email: string };

type CompanySnapshot = {
  id: string;
  workspace_id: string;
  name: string;
  owner_id: string;
  included_services: Prisma.JsonValue | null;
  service_type: string | null;
  plan_name: string | null;
};

type SourceProjectSnapshot = {
  id: string;
  name: string;
  workspace_id: string;
  space_id: string | null;
  company_id: string | null;
  owner_id: string;
  closing_date: Date | null;
  onboarding_start_date: Date | null;
  responsible_salesperson_id: string | null;
  initial_notes: string | null;
  space?: {
    id: string;
    name: string;
  } | null;
};

type CreatedOnboardingTask = {
  id: string;
  title: string;
  route: OnboardingTaskRoute;
  project_id: string;
  assignee_id: string | null;
};

export type OnboardingCreationResult = {
  onboarding: Awaited<ReturnType<typeof recomputeOnboardingProgress>>;
  notificationTargets: OnboardingAssignmentNotificationTarget[];
  createdTasks: CreatedOnboardingTask[];
  missingMappings: string[];
  reused: boolean;
};

export type ClientOnboardingWizardInput = {
  workspaceId: string;
  actorId: string;
  companyId?: string | null;
  name: string;
  website?: string | null;
  industry?: string | null;
  salesChannel?: ClientSalesChannel | null;
  serviceType?: string | null;
  planName?: string | null;
  billingCycle?: string | null;
  includedServices: string[];
  notes?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactRole?: string | null;
  ownerId?: string | null;
  expectedStartDate?: Date | null;
  closingDate?: Date | null;
  initialNotes?: string | null;
  responsibleSalespersonId?: string | null;
  responsibleDepartmentId?: string | null;
  responsibleDepartmentName?: string | null;
  contractValue?: number | null;
};

export type ClientOnboardingWizardResult = {
  company_id: string;
  onboarding_id: string;
  redirect_url: string;
  created_tasks: CreatedOnboardingTask[];
  notifications: number;
  missing_mappings: string[];
};

export type OnboardingAssignmentNotificationTarget = {
  userId: string | null | undefined;
  taskId: string;
  workspaceId: string;
  onboardingId: string;
  actorId: string;
  label: string;
  companyId?: string | null;
};

const ONBOARDING_SAFE_SCALAR_SELECT = {
  id: true,
  workspace_id: true,
  company_id: true,
  project_id: true,
  status: true,
  sequence_status: true,
  progress: true,
  closing_date: true,
  expected_start_date: true,
  responsible_salesperson_id: true,
  initial_notes: true,
  contracted_services: true,
  commercial_completed_at: true,
  technical_support_started_at: true,
  up_zero_configuration_completed_at: true,
  marketing_b2b_released_at: true,
  marketing_b2b_dependency_override_reason: true,
  marketing_b2b_dependency_overridden_by: true,
  marketing_b2b_dependency_overridden_at: true,
  completed_at: true,
  completion_override_reason: true,
  completion_overridden_by: true,
  completion_overridden_at: true,
  created_by: true,
  created_at: true,
  updated_at: true,
} as const satisfies Prisma.ClientOnboardingSelect;

const ROUTE_SPACE_ALIASES: Record<OnboardingTaskRoute, string[]> = {
  commercial: ["commercial", "comercial"],
  finance: ["finance", "financial", "financeiro"],
  support: ["support", "technical support", "suporte", "suporte tecnico"],
  marketing_b2b: ["marketing b2b", "paid media", "media buying"],
  marketing_b2c: [
    "marketing b2c",
    "consumer marketing",
    "b2c",
    "varejo",
    "ecommerce",
  ],
  creative_design: [
    "creative and design",
    "creative design",
    "creative & design",
    "criativo",
    "design",
  ],
  general_admin: ["general admin"],
};

const ROUTE_QUEUE_CONFIG: Record<
  OnboardingTaskRoute,
  {
    spaceName: string;
    projectName: string;
    description: string;
    aliases: string[];
  }
> = {
  commercial: {
    spaceName: "Commercial",
    projectName: "Contracts & Handoffs",
    description:
      "Reusable queue for client contracts, handoffs, and onboarding commercial checks.",
    aliases: ROUTE_SPACE_ALIASES.commercial,
  },
  finance: {
    spaceName: "Finance",
    projectName: "Onboarding",
    description: "Shared onboarding workflow mirrored across every department.",
    aliases: ROUTE_SPACE_ALIASES.finance,
  },
  support: {
    spaceName: "Support",
    projectName: "Onboarding",
    description: "Shared onboarding workflow mirrored across every department.",
    aliases: ROUTE_SPACE_ALIASES.support,
  },
  marketing_b2b: {
    spaceName: "Marketing B2B",
    projectName: "Service Onboarding",
    description:
      "Reusable queue for paid media, tracking, reporting, and marketing service kickoff tasks.",
    aliases: ROUTE_SPACE_ALIASES.marketing_b2b,
  },
  marketing_b2c: {
    spaceName: "Marketing B2C",
    projectName: "Service Onboarding",
    description:
      "Reusable queue for consumer marketing, e-commerce, traffic, and B2C onboarding tasks.",
    aliases: ROUTE_SPACE_ALIASES.marketing_b2c,
  },
  creative_design: {
    spaceName: "Creative & Design",
    projectName: "Service Onboarding",
    description:
      "Reusable queue for creative, video, website, and design service kickoff tasks.",
    aliases: ROUTE_SPACE_ALIASES.creative_design,
  },
  general_admin: {
    spaceName: "General Admin",
    projectName: "Onboarding Triage",
    description:
      "Review and route onboarding work that does not yet belong to a department.",
    aliases: ROUTE_SPACE_ALIASES.general_admin,
  },
};

function uniqueStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

export function parseContractedServices(value: unknown): string[] {
  if (Array.isArray(value)) {
    return uniqueStrings(
      value.map((item) => (typeof item === "string" ? item : null)),
    );
  }
  if (typeof value === "string") {
    return uniqueStrings(value.split(/,|\r?\n/));
  }
  return [];
}

export function financeRegistrationComplete(company: {
  legal_name: string | null;
  cnpj: string | null;
  billing_email: string | null;
  main_contact_email: string | null;
  contract_value: number | null;
  payment_terms: string | null;
  contract_start_date: Date | null;
}) {
  return Boolean(
    company.legal_name &&
    company.cnpj &&
    company.billing_email &&
    company.main_contact_email &&
    company.contract_value != null &&
    company.payment_terms &&
    company.contract_start_date,
  );
}

export async function getOnboardingCompletionBlocker(
  db: Db,
  onboardingId: string,
  item: {
    id: string;
    department: string;
    title?: string | null;
    task_id?: string | null;
    automation_key?: string | null;
  },
  options: { ignoreCurrentConditionRequirement?: boolean } = {},
) {
  const department = item.department.toLowerCase();
  const isUpZeroConfiguration = isUpZeroConfigurationChecklistItem(item);

  const sharedPhase = sharedOnboardingPhaseIndex(item.automation_key);
  if (sharedPhase !== null) {
    const sharedItems = await db.onboardingChecklistItem.findMany({
      where: {
        onboarding_id: onboardingId,
        automation_key: { startsWith: "shared_onboarding:" },
      },
      orderBy: [{ sort_order: "asc" }, { created_at: "asc" }, { id: "asc" }],
      select: {
        automation_key: true,
        status: true,
        sort_order: true,
        title: true,
      },
    });
    if (!sharedOnboardingItemIsUnlocked(sharedItems, item.automation_key)) {
      const currentCondition = sharedItems.find(
        (candidate) =>
          candidate.automation_key !== SHARED_ONBOARDING_TASK_AUTOMATION_KEY &&
          sharedOnboardingPhaseIndex(candidate.automation_key) !== null &&
          candidate.status !== "complete",
      );
      return currentCondition
        ? `Conclua primeiro a etapa anterior. Ainda falta “${currentCondition.title}”.`
        : "Conclua a etapa anterior antes de avançar o onboarding.";
    }
  }

  // Opening the routed form or scheduling dialog fulfils the current
  // condition; it must only be blocked by earlier sequential conditions.
  if (options.ignoreCurrentConditionRequirement) return null;

  // The three scheduling checks are completed by their linked calendar event.
  // The later shared checks are explicit departmental confirmations; their
  // detailed checklists will be added inside each phase without reviving the
  // legacy finance/support form gates.
  if (
    sharedPhase !== null &&
    !isSharedOnboardingSchedulingKey(item.automation_key)
  ) {
    return null;
  }

  if (isFinanceCampaignStartedAutomationKey(item.automation_key)) {
    return null;
  }

  if (item.task_id && !isUpZeroConfiguration) {
    const gate = await getUpZeroMarketingB2BGate(db, onboardingId);
    if (gate?.blocked && gate.marketing_b2b_task_ids.includes(item.task_id)) {
      return gate.message;
    }
  }

  if (department.includes("finance")) {
    const onboarding = await db.clientOnboarding.findUnique({
      where: { id: onboardingId },
      select: {
        company: {
          select: {
            legal_name: true,
            cnpj: true,
            billing_email: true,
            main_contact_email: true,
            contract_value: true,
            payment_terms: true,
            contract_start_date: true,
          },
        },
      },
    });
    if (
      !onboarding?.company ||
      !financeRegistrationComplete(onboarding.company)
    ) {
      return "Complete the finance registration fields before marking Finance done.";
    }
  }

  if (department.includes("contract")) {
    const contractCount = await db.clientContract.count({
      where: { onboarding_id: onboardingId },
    });
    if (contractCount === 0)
      return "Upload a private contract before marking Contract done.";
  }

  if (department.includes("support") && !isUpZeroConfiguration) {
    const support = await db.supportGroup.findUnique({
      where: { onboarding_id: onboardingId },
      select: { group_created: true },
    });
    if (!support?.group_created)
      return "Create the support group before marking Support done.";
  }

  if (department.includes("internal")) {
    const missingLeader = await db.onboardingServiceAssignment.findFirst({
      where: {
        onboarding_id: onboardingId,
        OR: [{ leader_id: null }, { status: "needs_mapping" }],
      },
      select: { id: true },
    });
    if (missingLeader)
      return "Assign leaders for every contracted service before marking Internal Assignment done.";
  }

  if (department.includes("marketing b2b")) {
    const form = await db.marketingB2BOnboardingForm.findUnique({
      where: { checklist_item_id: item.id },
      select: { status: true },
    });
    if (form && form.status !== "complete") {
      return "Finalize the Marketing B2B onboarding form before marking this task done.";
    }
  }

  if (department.includes("marketing b2c")) {
    const form = await db.marketingB2COnboardingForm.findUnique({
      where: { checklist_item_id: item.id },
      select: { status: true },
    });
    if (form && form.status !== "complete") {
      return "Finalize the Marketing B2C onboarding form before marking this task done.";
    }
  }

  const meeting = await db.onboardingMeeting.findFirst({
    where: { onboarding_id: onboardingId, checklist_item_id: item.id },
    select: { scheduled: true },
  });
  if (meeting && !meeting.scheduled)
    return "Schedule the onboarding meeting before marking this task done.";

  return null;
}

export async function getOnboardingTaskCompletionBlocker(
  db: Db,
  taskId: string,
) {
  const item = await db.onboardingChecklistItem.findFirst({
    where: { task_id: taskId },
    select: {
      id: true,
      onboarding_id: true,
      department: true,
      title: true,
      task_id: true,
      automation_key: true,
    },
  });
  if (!item) return null;
  if (isSharedOnboardingAutomationKey(item.automation_key)) {
    return "Esta tarefa avança automaticamente quando o departamento responsável conclui as condições da etapa atual.";
  }
  return getOnboardingCompletionBlocker(db, item.onboarding_id, item);
}

function departmentStatus(department: string) {
  const key = department.toLowerCase();
  if (key.includes("commercial")) return "pending_commercial_setup";
  if (key.includes("finance")) return "pending_finance_registration";
  if (key.includes("contract")) return "pending_contract_upload";
  if (key.includes("internal")) return "pending_internal_assignment";
  if (key.includes("support")) return "pending_support_group";
  if (key.includes("service")) return "pending_onboarding_scheduling";
  return "onboarding_in_progress";
}

function serviceKey(service: string) {
  return service.trim().toLowerCase();
}

function normalizedName(value: string) {
  return normalizeOnboardingRouteValue(value);
}

export function hasUpZeroService(services: unknown) {
  return parseContractedServices(services).some(
    (service) => normalizedName(service) === "up zero",
  );
}

function serviceWorkflowFor(
  service: string,
  route?: OnboardingTaskRoute | null,
): { serviceName: string; steps: readonly ServiceWorkflowStep[] } | null {
  const key = normalizedName(service);
  const workflow =
    key === "vesti"
      ? { serviceName: "Vesti", steps: VESTI_ONBOARDING_WORKFLOW }
      : key === "up zero"
        ? { serviceName: "UP Zero", steps: UP_ZERO_ONBOARDING_WORKFLOW }
        : null;
  if (!workflow) return null;

  const steps: readonly ServiceWorkflowStep[] = workflow.steps;

  return {
    ...workflow,
    steps:
      route === "marketing_b2c"
        ? steps.filter((step) => !step.marketingB2BOnly)
        : steps,
  };
}

async function persistedMarketingFormRoute(
  tx: Tx,
  onboardingId: string,
): Promise<"marketing_b2b" | "marketing_b2c" | null> {
  const [b2cForm, b2bForm] = await Promise.all([
    tx.marketingB2COnboardingForm.findFirst({
      where: { onboarding_id: onboardingId },
      select: { id: true },
    }),
    tx.marketingB2BOnboardingForm.findFirst({
      where: { onboarding_id: onboardingId },
      select: { id: true },
    }),
  ]);

  // Existing onboarding records keep their original route even if a later
  // client edit removes or changes service_type. Favor B2C if malformed
  // legacy data contains both forms: that conservative choice prevents a
  // B2B-only campaign handoff from appearing in a consumer workflow.
  if (b2cForm) return "marketing_b2c";
  if (b2bForm) return "marketing_b2b";
  return null;
}

export function isMarketingB2BFormService(service: string) {
  const key = normalizedName(service);
  return (
    key === "marketing b2b" ||
    key === "b2b" ||
    key === "meta ads" ||
    key === "google ads" ||
    key === "tiktok ads" ||
    key === "pinterest ads" ||
    key === "e commerce" ||
    key === "ecommerce" ||
    key === "vesti" ||
    key === "up zero" ||
    key === "up motion" ||
    key.startsWith("up motion ") ||
    key === "implantacao ia" ||
    key === "implementacao ia" ||
    key === "ai implementation"
  );
}

export function isMarketingB2CFormService(service: string) {
  const key = normalizedName(service);
  return (
    key === "marketing b2c" ||
    key === "b2c" ||
    key === "meta ads" ||
    key === "google ads" ||
    key === "tiktok ads" ||
    key === "pinterest ads" ||
    key === "e commerce" ||
    key === "ecommerce" ||
    key === "vesti" ||
    key === "nuvemshop" ||
    key === "google shopping" ||
    key === "social media" ||
    key === "up zero" ||
    key === "up motion" ||
    key.startsWith("up motion ") ||
    key === "implantacao ia" ||
    key === "implementacao ia" ||
    key === "ai implementation" ||
    key.includes("influencer") ||
    key.includes("ugc") ||
    key.includes("marketing b2c") ||
    key.includes("consumer marketing") ||
    key.includes("content calendar") ||
    key.includes("calendario de conteudo") ||
    key.includes("promotions") ||
    key.includes("promocoes") ||
    key.includes("campaigns") ||
    key.includes("campanhas") ||
    key === "ads" ||
    key.includes("trafego") ||
    key.includes("midia")
  );
}

function shouldCreateDedicatedServiceTask(service: string) {
  return serviceWorkflowFor(service) !== null;
}

function routeMatcher(route: OnboardingTaskRoute) {
  return ROUTE_QUEUE_CONFIG[route].aliases.map((alias) =>
    normalizedName(alias),
  );
}

async function findTargetSpace(
  db: Db,
  workspaceId: string,
  route: OnboardingTaskRoute,
) {
  const spaces = await db.space.findMany({
    where: { workspace_id: workspaceId },
    select: { id: true, name: true },
  });
  const aliases = routeMatcher(route);
  return (
    spaces.find((space) => aliases.includes(normalizedName(space.name))) ??
    spaces.find((space) => {
      const name = normalizedName(space.name);
      return aliases.some(
        (alias) => name.includes(alias) || alias.includes(name),
      );
    }) ??
    null
  );
}

async function ensureTargetSpace(
  db: Db,
  workspaceId: string,
  route: OnboardingTaskRoute,
  ownerId: string,
) {
  const existing = await findTargetSpace(db, workspaceId, route);
  if (existing) return existing;
  const config = ROUTE_QUEUE_CONFIG[route];
  return db.space.create({
    data: {
      workspace_id: workspaceId,
      owner_id: ownerId,
      name: config.spaceName,
      icon: null,
    },
    select: { id: true, name: true },
  });
}

export async function resolveOnboardingTaskProjectId(
  db: Db,
  input: OnboardingTaskProjectInput,
): Promise<string> {
  const route = input.route;
  const config = ROUTE_QUEUE_CONFIG[route];
  const targetSpace = await ensureTargetSpace(
    db,
    input.workspaceId,
    route,
    input.ownerId,
  );

  const existingProject = await db.project.findFirst({
    where: {
      workspace_id: input.workspaceId,
      space_id: targetSpace.id,
      company_id: null,
      name: config.projectName,
    },
    select: { id: true, onboarding_enabled: true, kind: true },
  });
  if (existingProject) {
    if (
      !existingProject.onboarding_enabled ||
      existingProject.kind !== "operational_queue"
    ) {
      await db.project.update({
        where: { id: existingProject.id },
        data: { onboarding_enabled: true, kind: "operational_queue" },
      });
    }
    return existingProject.id;
  }

  const createdProject = await db.project.create({
    data: {
      name: config.projectName,
      description: config.description,
      workspace_id: input.workspaceId,
      owner_id: input.ownerId,
      space_id: targetSpace.id,
      company_id: null,
      onboarding_enabled: true,
      kind: "operational_queue",
    },
    select: { id: true },
  });
  return createdProject.id;
}

async function ensureFolder(
  db: Db,
  input: {
    workspaceId: string;
    spaceId: string;
    ownerId: string;
    name: string;
    parentId?: string | null;
    icon?: string | null;
    sidebarHidden?: boolean;
  },
) {
  const existing = await db.folder.findFirst({
    where: {
      workspace_id: input.workspaceId,
      space_id: input.spaceId,
      parent_id: input.parentId ?? null,
      name: { equals: input.name, mode: "insensitive" },
    },
    select: { id: true, name: true, sidebar_hidden: true },
  });
  if (existing) {
    const sidebarHidden = input.sidebarHidden ?? false;
    if (existing.sidebar_hidden !== sidebarHidden) {
      return db.folder.update({
        where: { id: existing.id },
        data: { sidebar_hidden: sidebarHidden },
        select: { id: true, name: true },
      });
    }
    return existing;
  }

  return db.folder.create({
    data: {
      workspace_id: input.workspaceId,
      space_id: input.spaceId,
      owner_id: input.ownerId,
      parent_id: input.parentId ?? null,
      name: input.name,
      icon: input.icon ?? null,
      sidebar_hidden: input.sidebarHidden ?? false,
    },
    select: { id: true, name: true },
  });
}

type OnboardingMirrorProject = {
  id: string;
  spaceId: string;
  spaceName: string;
};

export async function ensureOnboardingMirrorProjectForSpace(
  db: Db,
  input: {
    workspaceId: string;
    spaceId: string;
    spaceName: string;
    ownerId: string;
  },
): Promise<OnboardingMirrorProject> {
  const existingProject = await db.project.findFirst({
    where: {
      workspace_id: input.workspaceId,
      space_id: input.spaceId,
      company_id: null,
      name: { equals: "Onboarding", mode: "insensitive" },
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: {
      id: true,
      onboarding_enabled: true,
      sidebar_hidden: true,
      kind: true,
    },
  });

  if (existingProject) {
    if (
      !existingProject.onboarding_enabled ||
      existingProject.sidebar_hidden ||
      existingProject.kind !== "operational_queue"
    ) {
      await db.project.update({
        where: { id: existingProject.id },
        data: {
          onboarding_enabled: true,
          sidebar_hidden: false,
          kind: "operational_queue",
        },
        select: { id: true },
      });
    }
    return {
      id: existingProject.id,
      spaceId: input.spaceId,
      spaceName: input.spaceName,
    };
  }

  const createdProject = await db.project.create({
    data: {
      workspace_id: input.workspaceId,
      owner_id: input.ownerId,
      space_id: input.spaceId,
      company_id: null,
      name: "Onboarding",
      description:
        "Projeto departamental espelhado do onboarding. As tarefas desta área atualizam o mesmo fluxo central do cliente.",
      onboarding_enabled: true,
      sidebar_hidden: false,
      kind: "operational_queue",
    },
    select: { id: true },
  });

  return {
    id: createdProject.id,
    spaceId: input.spaceId,
    spaceName: input.spaceName,
  };
}

/**
 * Creates one stable Onboarding project in every existing Space. Tasks are not
 * cloned between these projects: every departmental task points to the same
 * ClientOnboarding checklist, which is the canonical shared state.
 */
export async function ensureWorkspaceOnboardingMirrorProjects(
  db: Db,
  input: { workspaceId: string; ownerId: string },
): Promise<OnboardingMirrorProject[]> {
  const spaces = await db.space.findMany({
    where: { workspace_id: input.workspaceId },
    orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
    select: { id: true, name: true },
  });

  return Promise.all(
    spaces.map((space) =>
      ensureOnboardingMirrorProjectForSpace(db, {
        workspaceId: input.workspaceId,
        spaceId: space.id,
        spaceName: space.name,
        ownerId: input.ownerId,
      }),
    ),
  );
}

function mirroredProjectForRoute(
  projects: OnboardingMirrorProject[],
  route: OnboardingTaskRoute,
) {
  const aliases = routeMatcher(route);
  return (
    projects.find((project) =>
      aliases.includes(normalizedName(project.spaceName)),
    ) ??
    projects.find((project) => {
      const name = normalizedName(project.spaceName);
      return aliases.some(
        (alias) => name.includes(alias) || alias.includes(name),
      );
    }) ??
    null
  );
}

async function resolveOnboardingMirrorProjectId(
  db: Db,
  input: {
    workspaceId: string;
    ownerId: string;
    route: OnboardingTaskRoute;
    mirrors?: OnboardingMirrorProject[];
  },
) {
  const existingMirror = mirroredProjectForRoute(
    input.mirrors ?? [],
    input.route,
  );
  if (existingMirror) return existingMirror.id;

  const targetSpace = await ensureTargetSpace(
    db,
    input.workspaceId,
    input.route,
    input.ownerId,
  );
  const project = await ensureOnboardingMirrorProjectForSpace(db, {
    workspaceId: input.workspaceId,
    spaceId: targetSpace.id,
    spaceName: targetSpace.name,
    ownerId: input.ownerId,
  });
  return project.id;
}

export async function resolveMarketingB2BOnboardingProjectId(
  db: Db,
  input: {
    workspaceId: string;
    companyId: string;
    companyName: string;
    ownerId: string;
  },
): Promise<string> {
  const targetSpace = await ensureTargetSpace(
    db,
    input.workspaceId,
    "marketing_b2b",
    input.ownerId,
  );
  const onboardingFolder = await ensureFolder(db, {
    workspaceId: input.workspaceId,
    spaceId: targetSpace.id,
    ownerId: input.ownerId,
    name: "Onboarding",
    parentId: null,
    icon: "folder",
    sidebarHidden: false,
  });
  const clientFolder = await ensureFolder(db, {
    workspaceId: input.workspaceId,
    spaceId: targetSpace.id,
    ownerId: input.ownerId,
    name: input.companyName,
    parentId: onboardingFolder.id,
    icon: "folder",
    sidebarHidden: false,
  });

  const projectName = input.companyName.trim() || "Marketing B2B Onboarding";
  const existingProject = await db.project.findFirst({
    where: {
      workspace_id: input.workspaceId,
      space_id: targetSpace.id,
      folder_id: clientFolder.id,
      company_id: input.companyId,
      name: projectName,
    },
    select: {
      id: true,
      onboarding_enabled: true,
      sidebar_hidden: true,
      kind: true,
    },
  });
  if (existingProject) {
    if (
      !existingProject.onboarding_enabled ||
      existingProject.sidebar_hidden ||
      existingProject.kind !== "onboarding"
    ) {
      await db.project.update({
        where: { id: existingProject.id },
        data: {
          onboarding_enabled: true,
          sidebar_hidden: false,
          kind: "onboarding",
        },
        select: { id: true },
      });
    }
    return existingProject.id;
  }

  const legacyProject = await db.project.findFirst({
    where: {
      workspace_id: input.workspaceId,
      space_id: targetSpace.id,
      folder_id: clientFolder.id,
      company_id: input.companyId,
      name: "Marketing B2B Onboarding",
    },
    select: { id: true },
  });
  if (legacyProject) {
    const renamed = await db.project.update({
      where: { id: legacyProject.id },
      data: {
        name: projectName,
        onboarding_enabled: true,
        sidebar_hidden: false,
        kind: "onboarding",
      },
      select: { id: true },
    });
    return renamed.id;
  }

  const createdProject = await db.project.create({
    data: {
      workspace_id: input.workspaceId,
      owner_id: input.ownerId,
      space_id: targetSpace.id,
      folder_id: clientFolder.id,
      company_id: input.companyId,
      name: projectName,
      onboarding_enabled: true,
      sidebar_hidden: false,
      kind: "onboarding",
      description:
        "Marketing B2B onboarding form and execution tasks for this client.",
    },
    select: { id: true },
  });
  return createdProject.id;
}

export async function resolveMarketingB2COnboardingProjectId(
  db: Db,
  input: {
    workspaceId: string;
    companyId: string;
    companyName: string;
    ownerId: string;
  },
): Promise<string> {
  const targetSpace = await ensureTargetSpace(
    db,
    input.workspaceId,
    "marketing_b2c",
    input.ownerId,
  );
  const onboardingFolder = await ensureFolder(db, {
    workspaceId: input.workspaceId,
    spaceId: targetSpace.id,
    ownerId: input.ownerId,
    name: "Onboarding",
    parentId: null,
    icon: "folder",
    sidebarHidden: false,
  });
  const clientFolder = await ensureFolder(db, {
    workspaceId: input.workspaceId,
    spaceId: targetSpace.id,
    ownerId: input.ownerId,
    name: input.companyName,
    parentId: onboardingFolder.id,
    icon: "folder",
    sidebarHidden: false,
  });

  const projectName = input.companyName.trim() || "Marketing B2C Onboarding";
  const legacyProjectName = "Marketing B2C Onboarding";
  const existingProject = await db.project.findFirst({
    where: {
      workspace_id: input.workspaceId,
      space_id: targetSpace.id,
      folder_id: clientFolder.id,
      company_id: input.companyId,
      name: projectName,
    },
    select: {
      id: true,
      onboarding_enabled: true,
      sidebar_hidden: true,
      kind: true,
    },
  });
  if (existingProject) {
    if (
      !existingProject.onboarding_enabled ||
      existingProject.sidebar_hidden ||
      existingProject.kind !== "onboarding"
    ) {
      await db.project.update({
        where: { id: existingProject.id },
        data: {
          onboarding_enabled: true,
          sidebar_hidden: false,
          kind: "onboarding",
        },
        select: { id: true },
      });
    }
    return existingProject.id;
  }

  if (projectName !== legacyProjectName) {
    const legacyProject = await db.project.findFirst({
      where: {
        workspace_id: input.workspaceId,
        space_id: targetSpace.id,
        folder_id: clientFolder.id,
        company_id: input.companyId,
        name: legacyProjectName,
      },
      select: { id: true },
    });
    if (legacyProject) {
      const renamedProject = await db.project.update({
        where: { id: legacyProject.id },
        data: {
          name: projectName,
          onboarding_enabled: true,
          sidebar_hidden: false,
          kind: "onboarding",
        },
        select: { id: true },
      });
      return renamedProject.id;
    }
  }

  const createdProject = await db.project.create({
    data: {
      workspace_id: input.workspaceId,
      owner_id: input.ownerId,
      space_id: targetSpace.id,
      folder_id: clientFolder.id,
      company_id: input.companyId,
      name: projectName,
      onboarding_enabled: true,
      sidebar_hidden: false,
      kind: "onboarding",
      description:
        "Marketing B2C onboarding form and execution tasks for this client.",
    },
    select: { id: true },
  });
  return createdProject.id;
}

async function resolveDepartmentClientOnboardingProjectId(
  db: Db,
  input: {
    workspaceId: string;
    companyId: string;
    companyName: string;
    ownerId: string;
    route: "finance" | "creative_design";
    rootFolderName: string;
    fallbackProjectName: string;
    description: string;
  },
): Promise<string> {
  const targetSpace = await ensureTargetSpace(
    db,
    input.workspaceId,
    input.route,
    input.ownerId,
  );
  const onboardingFolder = await ensureFolder(db, {
    workspaceId: input.workspaceId,
    spaceId: targetSpace.id,
    ownerId: input.ownerId,
    name: input.rootFolderName,
    parentId: null,
    icon: "folder",
    sidebarHidden: false,
  });
  const clientFolder = await ensureFolder(db, {
    workspaceId: input.workspaceId,
    spaceId: targetSpace.id,
    ownerId: input.ownerId,
    name: input.companyName,
    parentId: onboardingFolder.id,
    icon: "folder",
    sidebarHidden: false,
  });

  const projectName = input.companyName.trim() || input.fallbackProjectName;
  const existingProject = await db.project.findFirst({
    where: {
      workspace_id: input.workspaceId,
      space_id: targetSpace.id,
      folder_id: clientFolder.id,
      company_id: input.companyId,
      name: projectName,
    },
    select: { id: true, sidebar_hidden: true, kind: true },
  });
  if (existingProject) {
    if (
      existingProject.sidebar_hidden ||
      existingProject.kind !== "onboarding"
    ) {
      await db.project.update({
        where: { id: existingProject.id },
        data: { sidebar_hidden: false, kind: "onboarding" },
        select: { id: true },
      });
    }
    return existingProject.id;
  }

  const createdProject = await db.project.create({
    data: {
      workspace_id: input.workspaceId,
      owner_id: input.ownerId,
      space_id: targetSpace.id,
      folder_id: clientFolder.id,
      company_id: input.companyId,
      name: projectName,
      sidebar_hidden: false,
      kind: "onboarding",
      description: input.description,
    },
    select: { id: true },
  });
  return createdProject.id;
}

export async function resolveFinanceOnboardingProjectId(
  db: Db,
  input: {
    workspaceId: string;
    companyId: string;
    companyName: string;
    ownerId: string;
  },
): Promise<string> {
  return resolveDepartmentClientOnboardingProjectId(db, {
    ...input,
    route: "finance",
    rootFolderName: "Client Onboarding",
    fallbackProjectName: "Finance Onboarding",
    description:
      "Finance onboarding form, contract attachment, and billing setup for this client.",
  });
}

export async function resolveCreativeDesignOnboardingProjectId(
  db: Db,
  input: {
    workspaceId: string;
    companyId: string;
    companyName: string;
    ownerId: string;
  },
): Promise<string> {
  return resolveDepartmentClientOnboardingProjectId(db, {
    ...input,
    route: "creative_design",
    rootFolderName: "Client Onboarding",
    fallbackProjectName: "Creative Onboarding",
    description:
      "Creative and design onboarding scheduling tasks for this client.",
  });
}

async function resolveOnboardingRouteProjectId(
  db: Db,
  input: {
    workspaceId: string;
    companyId: string;
    companyName: string;
    ownerId: string;
    route: OnboardingTaskRoute;
  },
) {
  return resolveOnboardingMirrorProjectId(db, input);
}

async function collectTaskAndSubtaskIds(db: Db, taskId: string) {
  const ids = new Set([taskId]);
  let frontier = [taskId];

  while (frontier.length > 0) {
    const children = await db.task.findMany({
      where: { parent_id: { in: frontier } },
      select: { id: true },
    });
    frontier = children
      .map((child) => child.id)
      .filter((childId) => !ids.has(childId));
    for (const childId of frontier) ids.add(childId);
  }

  return [...ids];
}

export async function repairOnboardingTaskRouting(
  db: Db,
  input: { workspaceId: string; projectId: string; ownerId: string },
) {
  const checklistItems = await db.onboardingChecklistItem.findMany({
    where: {
      workspace_id: input.workspaceId,
      task_id: { not: null },
      task: { project_id: input.projectId },
    },
    select: {
      id: true,
      department: true,
      title: true,
      task: { select: { id: true, project_id: true, title: true } },
      onboarding: {
        select: {
          company_id: true,
          company: { select: { name: true } },
        },
      },
    },
  });
  if (checklistItems.length === 0) return { checked: 0, rehomed: 0 };

  const meetings = await db.onboardingMeeting.findMany({
    where: {
      workspace_id: input.workspaceId,
      checklist_item_id: { in: checklistItems.map((item) => item.id) },
    },
    select: { checklist_item_id: true, service: true },
  });
  const serviceByChecklistItemId = new Map(
    meetings
      .filter(
        (meeting): meeting is typeof meeting & { checklist_item_id: string } =>
          Boolean(meeting.checklist_item_id),
      )
      .map((meeting) => [meeting.checklist_item_id, meeting.service]),
  );
  const projectByRouteAndCompany = new Map<string, string>();
  let rehomed = 0;

  for (const item of checklistItems) {
    if (!item.task) continue;
    const route = routeForOnboardingChecklistItem({
      department: item.department,
      service: serviceByChecklistItemId.get(item.id),
      title: item.title,
      taskTitle: item.task.title,
    });
    const projectKey = `${item.onboarding.company_id}:${route}`;
    let targetProjectId = projectByRouteAndCompany.get(projectKey);
    if (!targetProjectId) {
      targetProjectId = await resolveOnboardingRouteProjectId(db, {
        workspaceId: input.workspaceId,
        companyId: item.onboarding.company_id,
        companyName: item.onboarding.company.name,
        ownerId: input.ownerId,
        route,
      });
      projectByRouteAndCompany.set(projectKey, targetProjectId);
    }
    if (item.task.project_id === targetProjectId) continue;

    const taskIds = await collectTaskAndSubtaskIds(db, item.task.id);
    await Promise.all([
      db.task.updateMany({
        where: { id: { in: taskIds } },
        data: {
          project_id: targetProjectId,
          company_id: item.onboarding.company_id,
        },
      }),
      db.calendarEvent.updateMany({
        where: { task_id: { in: taskIds } },
        data: {
          project_id: targetProjectId,
          company_id: item.onboarding.company_id,
        },
      }),
      db.timeEntry.updateMany({
        where: { task_id: { in: taskIds } },
        data: { project_id: targetProjectId },
      }),
      db.activityEvent.updateMany({
        where: { task_id: { in: taskIds } },
        data: {
          project_id: targetProjectId,
          company_id: item.onboarding.company_id,
        },
      }),
      db.marketingB2BOnboardingForm.updateMany({
        where: { task_id: { in: taskIds } },
        data: { project_id: targetProjectId },
      }),
      db.marketingB2COnboardingForm.updateMany({
        where: { task_id: { in: taskIds } },
        data: { project_id: targetProjectId },
      }),
    ]);
    rehomed += 1;
  }

  return { checked: checklistItems.length, rehomed };
}

export async function sendOnboardingAssignmentNotifications(
  targets: OnboardingAssignmentNotificationTarget[],
) {
  const uniqueTargets = new Map<
    string,
    OnboardingAssignmentNotificationTarget
  >();
  for (const target of targets) {
    if (!target.userId) continue;
    uniqueTargets.set(`${target.userId}:${target.taskId}`, target);
  }

  let sent = 0;
  for (const target of uniqueTargets.values()) {
    const created = await notifyTaskAssignee({
      taskId: target.taskId,
      userId: target.userId,
      workspaceId: target.workspaceId,
      data: {
        source: "client_onboarding",
        onboarding_id: target.onboardingId,
        company_id: target.companyId,
        label: target.label,
        task_title: target.label,
      },
    });
    if (created) sent += 1;
  }
  return sent;
}

async function sendOnboardingAdminSummaryNotifications(input: {
  workspaceId: string;
  actorId: string;
  onboardingId: string;
  companyId: string;
  companyName: string;
  createdTaskCount: number;
  missingMappings: string[];
}) {
  const admins = await prisma.workspaceMember.findMany({
    where: {
      workspace_id: input.workspaceId,
      status: "active",
      role: { in: ["owner", "admin"] },
      user_id: { not: input.actorId },
    },
    select: { user_id: true },
  });
  if (admins.length === 0) return 0;

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      type: "assigned" as const,
      user_id: admin.user_id,
      workspace_id: input.workspaceId,
      data: {
        source: "client_onboarding_summary",
        onboarding_id: input.onboardingId,
        company_id: input.companyId,
        task_title: `Onboarding started: ${input.companyName}`,
        label: `Onboarding started for ${input.companyName}`,
        created_task_count: input.createdTaskCount,
        missing_mappings: input.missingMappings,
      },
    })),
  });
  await Promise.all(
    admins.map((admin) =>
      broadcastNotification(admin.user_id).catch((err) =>
        logError("onboarding:admin-summary-broadcast", err, {
          user_id: admin.user_id,
          onboarding_id: input.onboardingId,
        }),
      ),
    ),
  );
  return admins.length;
}

async function findAdminFallback(
  db: Db,
  workspaceId: string,
): Promise<UserRef | null> {
  const member = await db.workspaceMember.findFirst({
    where: {
      workspace_id: workspaceId,
      status: "active",
      role: { in: ["owner", "admin"] },
    },
    orderBy: [{ role: "asc" }, { created_at: "asc" }],
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  if (member?.user) return member.user;

  const anyMember = await db.workspaceMember.findFirst({
    where: {
      workspace_id: workspaceId,
      status: "active",
      role: { not: "guest" },
    },
    orderBy: [{ created_at: "asc" }],
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  return anyMember?.user ?? null;
}

async function findDepartmentOwner(
  db: Db,
  workspaceId: string,
  route: OnboardingTaskRoute,
): Promise<UserRef | null> {
  const aliases = ROUTE_QUEUE_CONFIG[route].aliases;
  const member = await db.workspaceMember.findFirst({
    where: {
      workspace_id: workspaceId,
      status: "active",
      role: { not: "guest" },
      OR: aliases.map((alias) => ({
        department: { name: { contains: alias, mode: "insensitive" as const } },
      })),
    },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  return member?.user ?? null;
}

async function findDepartmentByRoute(
  db: Db,
  workspaceId: string,
  route: OnboardingTaskRoute,
) {
  const aliases = ROUTE_QUEUE_CONFIG[route].aliases;
  return db.department.findFirst({
    where: {
      workspace_id: workspaceId,
      OR: aliases.map((alias) => ({
        name: { contains: alias, mode: "insensitive" as const },
      })),
    },
    select: { id: true, name: true },
  });
}

async function ownerForRoute(
  db: Db,
  workspaceId: string,
  route: OnboardingTaskRoute,
  fallback: UserRef | null,
) {
  return (await findDepartmentOwner(db, workspaceId, route)) ?? fallback;
}

async function departmentForRoute(
  db: Db,
  workspaceId: string,
  route: OnboardingTaskRoute,
) {
  return findDepartmentByRoute(db, workspaceId, route);
}

type UpZeroGateTask = {
  id: string;
  title: string;
  status: string;
  owner: UserRef | null;
};

export type UpZeroMarketingB2BGate = {
  uses_up_zero: boolean;
  blocked: boolean;
  message: string | null;
  sequence_status: string;
  current_department: "Commercial" | "Technical Support" | "Marketing B2B";
  technical_support_task: UpZeroGateTask | null;
  marketing_b2b_task_ids: string[];
  overridden: boolean;
  override_reason: string | null;
};

async function marketingB2BTaskContext(
  db: Db,
  onboardingId: string,
  companyId: string,
) {
  const form = await db.marketingB2BOnboardingForm.findFirst({
    where: { onboarding_id: onboardingId },
    orderBy: [{ created_at: "asc" }],
    select: {
      task_id: true,
      project_id: true,
      task: {
        select: {
          id: true,
          title: true,
          assignee_id: true,
          project_id: true,
        },
      },
    },
  });
  if (!form) return { form: null, taskIds: [] as string[] };

  const canonicalProjectId = form.task.project_id || form.project_id;
  const tasks = await db.task.findMany({
    where: { project_id: canonicalProjectId, company_id: companyId },
    select: { id: true },
  });
  return { form, taskIds: tasks.map((task) => task.id) };
}

async function recordOnboardingTransition(
  db: Db,
  input: {
    workspaceId: string;
    onboardingId: string;
    companyId: string;
    projectId?: string | null;
    taskId?: string | null;
    actorId: string;
    type: string;
    previousStatus: string;
    nextStatus: string;
    metadata?: Prisma.InputJsonObject;
  },
) {
  await db.activityEvent.create({
    data: {
      workspace_id: input.workspaceId,
      actor_id: input.actorId,
      type: input.type,
      entity_type: "client_onboarding",
      entity_id: input.onboardingId,
      project_id: input.projectId ?? null,
      task_id: input.taskId ?? null,
      company_id: input.companyId,
      metadata: {
        previous_status: input.previousStatus,
        next_status: input.nextStatus,
        ...(input.metadata ?? {}),
      },
    },
  });
}

export async function getUpZeroMarketingB2BGate(
  db: Db,
  onboardingId: string,
): Promise<UpZeroMarketingB2BGate | null> {
  const onboarding = await db.clientOnboarding.findUnique({
    where: { id: onboardingId },
    select: {
      company_id: true,
      contracted_services: true,
      sequence_status: true,
      commercial_completed_at: true,
      up_zero_configuration_completed_at: true,
      marketing_b2b_released_at: true,
      marketing_b2b_dependency_override_reason: true,
      marketing_b2b_dependency_overridden_at: true,
    },
  });
  if (!onboarding) return null;

  const usesUpZero = hasUpZeroService(onboarding.contracted_services);
  const overridden = Boolean(onboarding.marketing_b2b_dependency_overridden_at);
  const released = Boolean(
    onboarding.marketing_b2b_released_at ||
    onboarding.up_zero_configuration_completed_at ||
    overridden,
  );
  const technicalItem = usesUpZero
    ? ((await db.onboardingChecklistItem.findUnique({
        where: {
          onboarding_id_automation_key: {
            onboarding_id: onboardingId,
            automation_key: UP_ZERO_CONFIGURATION_AUTOMATION_KEY,
          },
        },
        select: {
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              assignee: { select: { id: true, name: true, email: true } },
            },
          },
        },
      })) ??
      (await db.onboardingChecklistItem.findFirst({
        where: {
          onboarding_id: onboardingId,
          title: UP_ZERO_CONFIGURATION_TASK_TITLE,
        },
        select: {
          task: {
            select: {
              id: true,
              title: true,
              status: true,
              assignee: { select: { id: true, name: true, email: true } },
            },
          },
        },
      })))
    : null;
  const marketingContext = await marketingB2BTaskContext(
    db,
    onboardingId,
    onboarding.company_id,
  );
  const technicalTaskId = technicalItem?.task?.id ?? null;
  const marketingTaskIds = technicalTaskId
    ? marketingContext.taskIds.filter((taskId) => taskId !== technicalTaskId)
    : marketingContext.taskIds;
  const blocked = usesUpZero && !released;
  const currentDepartment = !onboarding.commercial_completed_at
    ? "Commercial"
    : blocked
      ? "Technical Support"
      : "Marketing B2B";

  return {
    uses_up_zero: usesUpZero,
    blocked,
    message: blocked ? UP_ZERO_MARKETING_B2B_DEPENDENCY_MESSAGE : null,
    sequence_status: onboarding.sequence_status,
    current_department: currentDepartment,
    technical_support_task: technicalItem?.task
      ? {
          id: technicalItem.task.id,
          title: technicalItem.task.title,
          status: technicalItem.task.status,
          owner: technicalItem.task.assignee,
        }
      : null,
    marketing_b2b_task_ids: marketingTaskIds,
    overridden,
    override_reason: onboarding.marketing_b2b_dependency_override_reason,
  };
}

async function releaseUpZeroMarketingB2B(
  db: Db,
  input: {
    onboardingId: string;
    actorId: string;
    technicalTaskId?: string | null;
    overrideReason?: string | null;
    existingOverride?: boolean;
  },
) {
  const onboarding = await db.clientOnboarding.findUniqueOrThrow({
    where: { id: input.onboardingId },
    select: {
      id: true,
      workspace_id: true,
      company_id: true,
      project_id: true,
      contracted_services: true,
      sequence_status: true,
      marketing_b2b_released_at: true,
      up_zero_configuration_completed_at: true,
      marketing_b2b_dependency_overridden_at: true,
      company: { select: { name: true } },
    },
  });
  if (!hasUpZeroService(onboarding.contracted_services)) {
    return {
      notificationTargets: [] as OnboardingAssignmentNotificationTarget[],
      released: false,
    };
  }
  const context = await marketingB2BTaskContext(
    db,
    onboarding.id,
    onboarding.company_id,
  );
  if (input.technicalTaskId && context.taskIds.length > 0) {
    await db.taskDependency.deleteMany({
      where: {
        depends_on_id: input.technicalTaskId,
        task_id: { in: context.taskIds },
      },
    });
  }

  const now = new Date();
  const firstRelease = !onboarding.marketing_b2b_released_at;
  const firstTechnicalCompletion =
    !input.overrideReason &&
    !input.existingOverride &&
    !onboarding.up_zero_configuration_completed_at;
  const firstOverride =
    Boolean(input.overrideReason) &&
    !onboarding.marketing_b2b_dependency_overridden_at;
  await db.clientOnboarding.update({
    where: { id: onboarding.id },
    data: {
      sequence_status: "marketing_b2b_ready",
      marketing_b2b_released_at: onboarding.marketing_b2b_released_at ?? now,
      ...(!input.overrideReason &&
        !input.existingOverride && {
          up_zero_configuration_completed_at:
            onboarding.up_zero_configuration_completed_at ?? now,
        }),
      ...(input.overrideReason && {
        marketing_b2b_dependency_override_reason: input.overrideReason,
        marketing_b2b_dependency_overridden_by: input.actorId,
        marketing_b2b_dependency_overridden_at:
          onboarding.marketing_b2b_dependency_overridden_at ?? now,
      }),
    },
  });

  if (firstTechnicalCompletion) {
    await recordOnboardingTransition(db, {
      workspaceId: onboarding.workspace_id,
      onboardingId: onboarding.id,
      companyId: onboarding.company_id,
      projectId: onboarding.project_id,
      taskId: input.technicalTaskId,
      actorId: input.actorId,
      type: "up_zero_configuration_completed",
      previousStatus: onboarding.sequence_status,
      nextStatus: "marketing_b2b_ready",
    });
  }
  if (firstOverride) {
    await recordOnboardingTransition(db, {
      workspaceId: onboarding.workspace_id,
      onboardingId: onboarding.id,
      companyId: onboarding.company_id,
      projectId: onboarding.project_id,
      taskId: input.technicalTaskId,
      actorId: input.actorId,
      type: "marketing_b2b_dependency_overridden",
      previousStatus: onboarding.sequence_status,
      nextStatus: "marketing_b2b_ready",
      metadata: { reason: input.overrideReason! },
    });
  }
  if (firstRelease) {
    await recordOnboardingTransition(db, {
      workspaceId: onboarding.workspace_id,
      onboardingId: onboarding.id,
      companyId: onboarding.company_id,
      projectId: onboarding.project_id,
      taskId: context.form?.task_id ?? null,
      actorId: input.actorId,
      type: "marketing_b2b_released",
      previousStatus: onboarding.sequence_status,
      nextStatus: "marketing_b2b_ready",
      metadata: {
        release_source:
          input.overrideReason || input.existingOverride
            ? "admin_override"
            : "technical_support_completion",
      },
    });
  }

  const notificationTargets: OnboardingAssignmentNotificationTarget[] = [];
  if (firstRelease && context.form?.task.assignee_id) {
    notificationTargets.push({
      userId: context.form.task.assignee_id,
      taskId: context.form.task_id,
      workspaceId: onboarding.workspace_id,
      onboardingId: onboarding.id,
      actorId: input.actorId,
      label: `${onboarding.company.name} is ready for Marketing B2B onboarding`,
      companyId: onboarding.company_id,
    });
  }
  return { notificationTargets, released: firstRelease };
}

async function reconcileUpZeroSequentialWorkflow(
  tx: Db,
  input: {
    onboardingId: string;
    company: CompanySnapshot;
    actorId: string;
    services: string[];
  },
) {
  const onboarding = await tx.clientOnboarding.findUniqueOrThrow({
    where: { id: input.onboardingId },
    select: {
      id: true,
      workspace_id: true,
      company_id: true,
      project_id: true,
      sequence_status: true,
      commercial_completed_at: true,
      technical_support_started_at: true,
      up_zero_configuration_completed_at: true,
      marketing_b2b_released_at: true,
      marketing_b2b_dependency_overridden_at: true,
    },
  });
  const usesUpZero = hasUpZeroService(input.services);
  const existingItem = await tx.onboardingChecklistItem.findUnique({
    where: {
      onboarding_id_automation_key: {
        onboarding_id: onboarding.id,
        automation_key: UP_ZERO_CONFIGURATION_AUTOMATION_KEY,
      },
    },
    select: { id: true, task_id: true, status: true },
  });

  if (!usesUpZero) {
    if (existingItem?.task_id) {
      await tx.taskDependency.deleteMany({
        where: { depends_on_id: existingItem.task_id },
      });
      await tx.onboardingChecklistItem.update({
        where: { id: existingItem.id },
        data: {
          required: false,
          notes: "UP Zero is no longer included in the contracted services.",
        },
      });
    }
    if (
      !onboarding.marketing_b2b_released_at ||
      onboarding.sequence_status !== "marketing_b2b_ready"
    ) {
      const now = new Date();
      await tx.clientOnboarding.update({
        where: { id: onboarding.id },
        data: {
          sequence_status: "marketing_b2b_ready",
          marketing_b2b_released_at:
            onboarding.marketing_b2b_released_at ?? now,
        },
      });
      await recordOnboardingTransition(tx, {
        workspaceId: onboarding.workspace_id,
        onboardingId: onboarding.id,
        companyId: onboarding.company_id,
        projectId: onboarding.project_id,
        actorId: input.actorId,
        type: "marketing_b2b_released",
        previousStatus: onboarding.sequence_status,
        nextStatus: "marketing_b2b_ready",
        metadata: {
          release_source: existingItem
            ? "up_zero_service_removed"
            : "commercial_direct",
        },
      });
    }
    return {
      blockedTaskIds: [] as string[],
      createdTechnicalTask: null as CreatedOnboardingTask | null,
      notificationTargets: [] as OnboardingAssignmentNotificationTarget[],
    };
  }

  if (!onboarding.commercial_completed_at) {
    if (onboarding.sequence_status !== "commercial_pending") {
      await tx.clientOnboarding.update({
        where: { id: onboarding.id },
        data: { sequence_status: "commercial_pending" },
      });
    }
    return {
      blockedTaskIds: [] as string[],
      createdTechnicalTask: null as CreatedOnboardingTask | null,
      notificationTargets: [] as OnboardingAssignmentNotificationTarget[],
    };
  }

  const [mappingRows, adminFallback, technicalDepartment] = await Promise.all([
    tx.serviceLeaderMapping.findMany({
      where: { workspace_id: onboarding.workspace_id, active: true },
      include: {
        department: { select: { id: true, name: true } },
        leader: { select: { id: true, name: true, email: true } },
      },
    }),
    findAdminFallback(tx, onboarding.workspace_id),
    departmentForRoute(tx, onboarding.workspace_id, "support"),
  ]);
  const technicalMapping = mappingRows.find(
    (mapping) =>
      ownerKeyForDepartmentLabel(mapping.service) === "technical_support",
  );
  const technicalOwner =
    technicalMapping?.leader ??
    (await ownerForRoute(
      tx,
      onboarding.workspace_id,
      "support",
      adminFallback,
    ));
  const ownerId = technicalOwner?.id ?? input.company.owner_id;
  const projectId = await resolveOnboardingTaskProjectId(tx, {
    workspaceId: onboarding.workspace_id,
    companyId: onboarding.company_id,
    companyName: input.company.name,
    ownerId: input.actorId,
    route: "support",
  });

  let technicalItem = await tx.onboardingChecklistItem.upsert({
    where: {
      onboarding_id_automation_key: {
        onboarding_id: onboarding.id,
        automation_key: UP_ZERO_CONFIGURATION_AUTOMATION_KEY,
      },
    },
    create: {
      onboarding_id: onboarding.id,
      workspace_id: onboarding.workspace_id,
      automation_key: UP_ZERO_CONFIGURATION_AUTOMATION_KEY,
      department: "Technical Support",
      title: UP_ZERO_CONFIGURATION_TASK_TITLE,
      owner_id: ownerId,
      notes:
        "Configure and validate the UP Zero website before Marketing B2B onboarding begins.",
      sort_order: 65,
    },
    update: {
      required: true,
      department: "Technical Support",
      title: UP_ZERO_CONFIGURATION_TASK_TITLE,
      owner_id: ownerId,
      notes:
        "Configure and validate the UP Zero website before Marketing B2B onboarding begins.",
    },
    select: { id: true, task_id: true, status: true },
  });

  let createdTechnicalTask: CreatedOnboardingTask | null = null;
  if (!technicalItem.task_id) {
    const position = await tx.task.aggregate({
      where: { project_id: projectId },
      _max: { position: true },
    });
    const task = await tx.task.create({
      data: {
        project_id: projectId,
        company_id: onboarding.company_id,
        title: UP_ZERO_CONFIGURATION_TASK_TITLE,
        description:
          "Technical Support must configure and validate the client's UP Zero website. Completing this task automatically releases Marketing B2B onboarding.",
        status: "todo",
        priority: "high",
        assignee_id: ownerId,
        position: (position._max.position ?? -1) + 1,
      },
    });
    technicalItem = await tx.onboardingChecklistItem.update({
      where: { id: technicalItem.id },
      data: { task_id: task.id },
      select: { id: true, task_id: true, status: true },
    });
    createdTechnicalTask = {
      id: task.id,
      title: task.title,
      route: "support",
      project_id: task.project_id,
      assignee_id: task.assignee_id,
    };
  } else {
    await tx.task.update({
      where: { id: technicalItem.task_id },
      data: {
        project_id: projectId,
        company_id: onboarding.company_id,
        assignee_id: ownerId,
      },
    });
  }

  const technicalTaskId = technicalItem.task_id!;
  const context = await marketingB2BTaskContext(
    tx,
    onboarding.id,
    onboarding.company_id,
  );
  if (
    technicalItem.status === "complete" ||
    onboarding.up_zero_configuration_completed_at ||
    onboarding.marketing_b2b_dependency_overridden_at
  ) {
    const released = await releaseUpZeroMarketingB2B(tx, {
      onboardingId: onboarding.id,
      actorId: input.actorId,
      technicalTaskId,
      existingOverride: Boolean(
        onboarding.marketing_b2b_dependency_overridden_at,
      ),
    });
    return {
      blockedTaskIds: [] as string[],
      createdTechnicalTask,
      notificationTargets: released.notificationTargets,
    };
  }

  for (const taskId of context.taskIds) {
    if (taskId === technicalTaskId) continue;
    await tx.taskDependency.upsert({
      where: {
        task_id_depends_on_id: {
          task_id: taskId,
          depends_on_id: technicalTaskId,
        },
      },
      create: { task_id: taskId, depends_on_id: technicalTaskId },
      update: {},
    });
  }
  const nextSequenceStatus =
    technicalItem.status === "in_progress"
      ? "up_zero_configuration_in_progress"
      : "technical_support_pending";
  const firstActivation = !onboarding.technical_support_started_at;
  await tx.clientOnboarding.update({
    where: { id: onboarding.id },
    data: {
      sequence_status: nextSequenceStatus,
      technical_support_started_at:
        onboarding.technical_support_started_at ?? new Date(),
      marketing_b2b_released_at: null,
    },
  });
  if (firstActivation) {
    await recordOnboardingTransition(tx, {
      workspaceId: onboarding.workspace_id,
      onboardingId: onboarding.id,
      companyId: onboarding.company_id,
      projectId: onboarding.project_id,
      taskId: technicalTaskId,
      actorId: input.actorId,
      type: "up_zero_technical_support_activated",
      previousStatus: onboarding.sequence_status,
      nextStatus: nextSequenceStatus,
      metadata: {
        owner_id: ownerId,
        department_id:
          technicalMapping?.department_id ?? technicalDepartment?.id ?? null,
      },
    });
  }

  const notificationTargets: OnboardingAssignmentNotificationTarget[] = [];
  if (firstActivation) {
    notificationTargets.push({
      userId: ownerId,
      taskId: technicalTaskId,
      workspaceId: onboarding.workspace_id,
      onboardingId: onboarding.id,
      actorId: input.actorId,
      label: `${UP_ZERO_CONFIGURATION_TASK_TITLE} for ${input.company.name}`,
      companyId: onboarding.company_id,
    });
  }
  return {
    blockedTaskIds: context.taskIds,
    createdTechnicalTask,
    notificationTargets,
  };
}

export async function getOnboardingTaskStartBlocker(db: Db, taskId: string) {
  const item = await db.onboardingChecklistItem.findFirst({
    where: { task_id: taskId },
    select: { onboarding_id: true, automation_key: true },
  });
  if (!item) return null;
  if (isSharedOnboardingAutomationKey(item.automation_key)) {
    return "Esta tarefa é controlada pelas condições do onboarding e não pode ser iniciada manualmente.";
  }
  const gate = await getUpZeroMarketingB2BGate(db, item.onboarding_id);
  return gate?.blocked && gate.marketing_b2b_task_ids.includes(taskId)
    ? gate.message
    : null;
}

export async function overrideUpZeroMarketingB2BGate(
  db: Db,
  input: { onboardingId: string; actorId: string; reason: string },
) {
  const gate = await getUpZeroMarketingB2BGate(db, input.onboardingId);
  if (!gate?.uses_up_zero) throw new Error("This client does not use UP Zero.");
  if (!gate.blocked)
    throw new Error("Marketing B2B is not waiting on UP Zero configuration.");
  const released = await releaseUpZeroMarketingB2B(db, {
    onboardingId: input.onboardingId,
    actorId: input.actorId,
    technicalTaskId: gate.technical_support_task?.id ?? null,
    overrideReason: input.reason,
  });
  return {
    gate: await getUpZeroMarketingB2BGate(db, input.onboardingId),
    ...released,
  };
}

function onboardingServices(input: {
  explicitServices?: string[];
  includedServices?: Prisma.JsonValue | null;
  serviceType?: string | null;
}) {
  const selectedServices = uniqueStrings([
    ...(input.explicitServices ?? []),
    ...parseContractedServices(input.includedServices),
  ]);
  if (selectedServices.length > 0) return selectedServices;

  const fallbackServices = uniqueStrings([input.serviceType]);
  return fallbackServices.length ? fallbackServices : ["General onboarding"];
}

function cleanNullable(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

type DedicatedWorkflowSyncResult = {
  createdTasks: CreatedOnboardingTask[];
  notificationTargets: OnboardingAssignmentNotificationTarget[];
  missingMappings: string[];
  movedTasks: number;
};

type MarketingB2CFormRepairResult = {
  createdTask: CreatedOnboardingTask | null;
  notificationTarget: OnboardingAssignmentNotificationTarget | null;
  missingMapping: string | null;
};

function isMarketingB2CFormChecklistItem(item: {
  department: string;
  title: string;
  task?: { title: string; description: string | null } | null;
}) {
  const text = [
    item.department,
    item.title,
    item.task?.title,
    item.task?.description,
  ]
    .filter(Boolean)
    .map((value) => normalizedName(value!))
    .join(" ");
  const hasFormSignal =
    text.includes("form") ||
    text.includes("onboarding marketing b2c") ||
    text.includes("marketing b2c onboarding");
  const hasSchedulingSignal =
    text.includes("meeting") ||
    text.includes("reuni") ||
    text.includes("schedule") ||
    text.includes("kickoff") ||
    text.includes("agenda");
  return (
    text.includes("marketing b2c") && hasFormSignal && !hasSchedulingSignal
  );
}

async function ensureMarketingB2COnboardingForm(
  tx: Tx,
  input: {
    onboardingId: string;
    company: CompanySnapshot;
    actorId: string;
    services: string[];
    marketingFormRoute: "marketing_b2b" | "marketing_b2c";
  },
): Promise<MarketingB2CFormRepairResult> {
  const [existingForm, checklistItems, mappingRows, adminFallback] =
    await Promise.all([
      tx.marketingB2COnboardingForm.findFirst({
        where: { onboarding_id: input.onboardingId },
        select: { id: true },
      }),
      tx.onboardingChecklistItem.findMany({
        where: { onboarding_id: input.onboardingId },
        select: {
          id: true,
          workspace_id: true,
          task_id: true,
          department: true,
          title: true,
          status: true,
          owner_id: true,
          completed_at: true,
          completed_by: true,
          notes: true,
          sort_order: true,
          task: {
            select: {
              id: true,
              title: true,
              description: true,
              project_id: true,
            },
          },
        },
      }),
      tx.serviceLeaderMapping.findMany({
        where: { workspace_id: input.company.workspace_id, active: true },
        include: {
          department: { select: { id: true, name: true } },
          leader: { select: { id: true, name: true, email: true } },
        },
      }),
      findAdminFallback(tx, input.company.workspace_id),
    ]);
  const existingItem =
    checklistItems.find(isMarketingB2CFormChecklistItem) ?? null;
  const b2cOnlyService = input.services.some(
    (service) =>
      isMarketingB2CFormService(service) && !isMarketingB2BFormService(service),
  );
  const shouldEnsure = Boolean(
    existingForm ||
    existingItem ||
    input.marketingFormRoute === "marketing_b2c" ||
    b2cOnlyService,
  );
  if (!shouldEnsure || existingForm) {
    return {
      createdTask: null,
      notificationTarget: null,
      missingMapping: null,
    };
  }

  const marketingMapping = mappingRows.find(
    (mapping) =>
      ownerKeyForDepartmentLabel(mapping.service) === "marketing_b2c",
  );
  const fallbackLeader =
    marketingMapping?.leader ??
    (await ownerForRoute(
      tx,
      input.company.workspace_id,
      "marketing_b2c",
      adminFallback,
    ));
  const formOwnerId =
    existingItem?.owner_id ??
    marketingMapping?.leader_id ??
    fallbackLeader?.id ??
    input.company.owner_id;
  const missingMapping = marketingMapping?.leader_id ? null : "Marketing B2C";
  const formNotes = missingMapping
    ? "Marketing B2C department responsible is missing; fallback owner assigned until mapping is completed."
    : null;

  if (existingItem?.task_id && existingItem.task) {
    await tx.marketingB2COnboardingForm.upsert({
      where: { checklist_item_id: existingItem.id },
      create: {
        workspace_id: existingItem.workspace_id,
        onboarding_id: input.onboardingId,
        checklist_item_id: existingItem.id,
        task_id: existingItem.task_id,
        company_id: input.company.id,
        project_id: existingItem.task.project_id,
        values: {},
        status:
          existingItem.status === "complete"
            ? "complete"
            : existingItem.status === "in_progress"
              ? "in_progress"
              : "draft",
        completed_at: existingItem.completed_at,
        completed_by: existingItem.completed_by,
      },
      update: {
        workspace_id: existingItem.workspace_id,
        onboarding_id: input.onboardingId,
        task_id: existingItem.task_id,
        company_id: input.company.id,
        project_id: existingItem.task.project_id,
      },
    });
    return { createdTask: null, notificationTarget: null, missingMapping };
  }

  const projectId = await resolveMarketingB2COnboardingProjectId(tx, {
    workspaceId: input.company.workspace_id,
    companyId: input.company.id,
    companyName: input.company.name,
    ownerId: input.actorId,
  });
  const taskPosition = await tx.task.aggregate({
    where: { project_id: projectId },
    _max: { position: true },
  });
  const sortOrder =
    Math.max(-1, ...checklistItems.map((item) => item.sort_order)) + 1;
  const b2cFormServices = input.services.filter(isMarketingB2CFormService);
  const task = await tx.task.create({
    data: {
      project_id: projectId,
      company_id: input.company.id,
      title: "Marketing B2C onboarding form",
      description: `Marketing B2C queue action: complete the client onboarding form for ${b2cFormServices.join(", ") || "the contracted services"}. Fields are optional and autosaved. Click Finalize onboarding B2C to update the central onboarding progress.`,
      status: "todo",
      priority: "high",
      assignee_id: formOwnerId,
      position: (taskPosition._max.position ?? -1) + 1,
    },
  });
  const checklistItem = existingItem
    ? await tx.onboardingChecklistItem.update({
        where: { id: existingItem.id },
        data: {
          task_id: task.id,
          department: "Marketing B2C",
          title: "Marketing B2C onboarding form completed",
          owner_id: formOwnerId,
          notes: formNotes,
        },
        select: { id: true },
      })
    : await tx.onboardingChecklistItem.create({
        data: {
          onboarding_id: input.onboardingId,
          workspace_id: input.company.workspace_id,
          task_id: task.id,
          department: "Marketing B2C",
          title: "Marketing B2C onboarding form completed",
          owner_id: formOwnerId,
          notes: formNotes,
          sort_order: sortOrder,
        },
        select: { id: true },
      });
  await tx.marketingB2COnboardingForm.upsert({
    where: { checklist_item_id: checklistItem.id },
    create: {
      workspace_id: input.company.workspace_id,
      onboarding_id: input.onboardingId,
      checklist_item_id: checklistItem.id,
      task_id: task.id,
      company_id: input.company.id,
      project_id: projectId,
      values: {},
    },
    update: {
      workspace_id: input.company.workspace_id,
      onboarding_id: input.onboardingId,
      task_id: task.id,
      company_id: input.company.id,
      project_id: projectId,
    },
  });

  return {
    createdTask: {
      id: task.id,
      title: task.title,
      route: "marketing_b2c",
      project_id: task.project_id,
      assignee_id: task.assignee_id,
    },
    notificationTarget: {
      userId: formOwnerId,
      taskId: task.id,
      workspaceId: input.company.workspace_id,
      onboardingId: input.onboardingId,
      actorId: input.actorId,
      label: `Complete Marketing B2C onboarding form for ${input.company.name}`,
      companyId: input.company.id,
    },
    missingMapping,
  };
}

async function syncDedicatedServiceWorkflows(
  tx: Tx,
  input: {
    onboardingId: string;
    company: CompanySnapshot;
    actorId: string;
    services: string[];
    currentServices?: Prisma.JsonValue | null;
  },
): Promise<DedicatedWorkflowSyncResult> {
  const servicesRevealB2C = input.services.some(
    (service) =>
      isMarketingB2CFormService(service) && !isMarketingB2BFormService(service),
  );
  const marketingFormRoute =
    (await persistedMarketingFormRoute(tx, input.onboardingId)) ??
    marketingFormRouteForOnboarding(input.company.service_type, null) ??
    (servicesRevealB2C ? "marketing_b2c" : "marketing_b2b");
  const workflows = new Map<
    string,
    { serviceName: string; steps: readonly ServiceWorkflowStep[] }
  >();
  for (const service of input.services) {
    const workflow = serviceWorkflowFor(service, marketingFormRoute);
    if (workflow) workflows.set(normalizedName(workflow.serviceName), workflow);
  }

  const currentServiceKeys = parseContractedServices(input.currentServices)
    .map(normalizedName)
    .sort();
  const nextServiceKeys = input.services.map(normalizedName).sort();
  if (
    currentServiceKeys.length !== nextServiceKeys.length ||
    currentServiceKeys.some(
      (service, index) => service !== nextServiceKeys[index],
    )
  ) {
    await tx.clientOnboarding.update({
      where: { id: input.onboardingId },
      data: { contracted_services: input.services },
    });
  }

  const result: DedicatedWorkflowSyncResult = {
    createdTasks: [],
    notificationTargets: [],
    missingMappings: [],
    movedTasks: 0,
  };
  const b2cFormRepair = await ensureMarketingB2COnboardingForm(tx, {
    onboardingId: input.onboardingId,
    company: input.company,
    actorId: input.actorId,
    services: input.services,
    marketingFormRoute,
  });
  if (b2cFormRepair.createdTask)
    result.createdTasks.push(b2cFormRepair.createdTask);
  if (b2cFormRepair.notificationTarget)
    result.notificationTargets.push(b2cFormRepair.notificationTarget);
  if (b2cFormRepair.missingMapping)
    result.missingMappings.push(b2cFormRepair.missingMapping);
  if (workflows.size === 0) {
    await recomputeOnboardingProgress(tx, input.onboardingId);
    return result;
  }

  const marketingDepartmentLabel =
    marketingFormRoute === "marketing_b2c" ? "Marketing B2C" : "Marketing B2B";
  const projectId = await resolveOnboardingRouteProjectId(tx, {
    workspaceId: input.company.workspace_id,
    companyId: input.company.id,
    companyName: input.company.name,
    ownerId: input.actorId,
    route: marketingFormRoute,
  });
  const [
    items,
    assignments,
    meetings,
    mappingRows,
    adminFallback,
    positionAggregate,
  ] = await Promise.all([
    tx.onboardingChecklistItem.findMany({
      where: { onboarding_id: input.onboardingId },
      select: {
        id: true,
        title: true,
        department: true,
        task_id: true,
        automation_key: true,
        sort_order: true,
        owner_id: true,
        notes: true,
        task: { select: { id: true, project_id: true } },
      },
    }),
    tx.onboardingServiceAssignment.findMany({
      where: { onboarding_id: input.onboardingId },
      select: {
        id: true,
        service: true,
        leader_id: true,
        department_id: true,
        department_name: true,
        status: true,
      },
    }),
    tx.onboardingMeeting.findMany({
      where: { onboarding_id: input.onboardingId },
      select: { id: true, service: true, checklist_item_id: true },
    }),
    tx.serviceLeaderMapping.findMany({
      where: { workspace_id: input.company.workspace_id, active: true },
      include: {
        department: { select: { id: true, name: true } },
        leader: { select: { id: true, name: true, email: true } },
      },
    }),
    findAdminFallback(tx, input.company.workspace_id),
    tx.task.aggregate({
      where: { project_id: projectId },
      _max: { position: true },
    }),
  ]);
  const marketingMapping = mappingRows.find(
    (mapping) =>
      ownerKeyForDepartmentLabel(mapping.service) ===
      ownerKeyForTaskRoute(marketingFormRoute),
  );
  const fallbackLeader =
    marketingMapping?.leader ??
    (await ownerForRoute(
      tx,
      input.company.workspace_id,
      marketingFormRoute,
      adminFallback,
    ));
  const fallbackDepartment =
    marketingMapping?.department ??
    (await departmentForRoute(
      tx,
      input.company.workspace_id,
      marketingFormRoute,
    ));
  let nextSortOrder = Math.max(-1, ...items.map((item) => item.sort_order)) + 1;
  let nextTaskPosition = (positionAggregate._max.position ?? -1) + 1;

  for (const workflow of workflows.values()) {
    const serviceKey = normalizedName(workflow.serviceName);
    let assignment =
      assignments.find(
        (candidate) => normalizedName(candidate.service) === serviceKey,
      ) ?? null;
    const leaderId =
      assignment?.leader_id ??
      marketingMapping?.leader_id ??
      fallbackLeader?.id ??
      input.company.owner_id;
    const departmentId =
      assignment?.department_id ??
      marketingMapping?.department_id ??
      fallbackDepartment?.id ??
      null;
    const departmentName =
      assignment?.department_name ??
      marketingMapping?.department?.name ??
      fallbackDepartment?.name ??
      marketingDepartmentLabel;
    const needsMapping = assignment
      ? assignment.status === "needs_mapping"
      : !marketingMapping?.leader_id;
    if (!assignment) {
      assignment = await tx.onboardingServiceAssignment.create({
        data: {
          onboarding_id: input.onboardingId,
          workspace_id: input.company.workspace_id,
          service: workflow.serviceName,
          leader_id: leaderId,
          department_id: departmentId,
          department_name: departmentName,
          status: needsMapping ? "needs_mapping" : "assigned",
          notes: needsMapping
            ? `Needs ${marketingDepartmentLabel} department responsible mapping. Fallback owner was assigned for continuity.`
            : null,
        },
        select: {
          id: true,
          service: true,
          leader_id: true,
          department_id: true,
          department_name: true,
          status: true,
        },
      });
      assignments.push(assignment);
    }
    if (needsMapping && !result.missingMappings.includes(departmentName)) {
      result.missingMappings.push(departmentName);
    }

    let firstCreatedTaskId: string | null = null;
    for (const step of workflow.steps) {
      const title = `${workflow.serviceName}: ${step.title}`;
      const titleKey = normalizedName(title);
      let item =
        items.find(
          (candidate) => normalizedName(candidate.title) === titleKey,
        ) ?? null;
      let taskId = item?.task_id ?? null;

      if (item?.task_id) {
        if (item.task?.project_id !== projectId) {
          await tx.task.update({
            where: { id: item.task_id },
            data: { project_id: projectId, company_id: input.company.id },
          });
          result.movedTasks += 1;
        }
        const department = step.meeting
          ? "Service Onboarding"
          : `${workflow.serviceName} Workflow`;
        if (
          item.department !== department ||
          item.owner_id !== leaderId ||
          item.notes !== step.description ||
          item.automation_key !== (step.automationKey ?? null)
        ) {
          await tx.onboardingChecklistItem.update({
            where: { id: item.id },
            data: {
              department,
              owner_id: leaderId,
              notes: step.description,
              automation_key: step.automationKey ?? null,
            },
          });
        }
      } else {
        const task = await tx.task.create({
          data: {
            project_id: projectId,
            company_id: input.company.id,
            title,
            description: `${step.description}\n\nConcluir esta tarefa atualiza automaticamente o checklist e o progresso do onboarding.`,
            status: "todo",
            priority: step.priority ?? "medium",
            assignee_id: leaderId,
            position: nextTaskPosition,
          },
        });
        nextTaskPosition += 1;
        taskId = task.id;
        firstCreatedTaskId ??= task.id;
        result.createdTasks.push({
          id: task.id,
          title: task.title,
          route: marketingFormRoute,
          project_id: projectId,
          assignee_id: task.assignee_id,
        });

        if (item) {
          item = await tx.onboardingChecklistItem.update({
            where: { id: item.id },
            data: {
              task_id: task.id,
              automation_key: step.automationKey ?? null,
              department: step.meeting
                ? "Service Onboarding"
                : `${workflow.serviceName} Workflow`,
              owner_id: leaderId,
              notes: step.description,
            },
            select: {
              id: true,
              title: true,
              department: true,
              task_id: true,
              automation_key: true,
              sort_order: true,
              owner_id: true,
              notes: true,
              task: { select: { id: true, project_id: true } },
            },
          });
        } else {
          item = await tx.onboardingChecklistItem.create({
            data: {
              onboarding_id: input.onboardingId,
              workspace_id: input.company.workspace_id,
              task_id: task.id,
              automation_key: step.automationKey ?? null,
              department: step.meeting
                ? "Service Onboarding"
                : `${workflow.serviceName} Workflow`,
              title,
              owner_id: leaderId,
              notes: step.description,
              sort_order: nextSortOrder,
            },
            select: {
              id: true,
              title: true,
              department: true,
              task_id: true,
              automation_key: true,
              sort_order: true,
              owner_id: true,
              notes: true,
              task: { select: { id: true, project_id: true } },
            },
          });
          nextSortOrder += 1;
          items.push(item);
        }
      }

      if (step.meeting && item && taskId) {
        const existingMeeting =
          meetings.find(
            (candidate) => normalizedName(candidate.service) === serviceKey,
          ) ?? null;
        if (existingMeeting) {
          await tx.onboardingMeeting.update({
            where: { id: existingMeeting.id },
            data: {
              service: workflow.serviceName,
              checklist_item_id: item.id,
              leader_id: leaderId,
            },
          });
        } else {
          const meeting = await tx.onboardingMeeting.create({
            data: {
              onboarding_id: input.onboardingId,
              workspace_id: input.company.workspace_id,
              service: workflow.serviceName,
              checklist_item_id: item.id,
              leader_id: leaderId,
            },
            select: { id: true, service: true, checklist_item_id: true },
          });
          meetings.push(meeting);
        }
      }
    }

    if (firstCreatedTaskId) {
      result.notificationTargets.push({
        userId: leaderId,
        taskId: firstCreatedTaskId,
        workspaceId: input.company.workspace_id,
        onboardingId: input.onboardingId,
        actorId: input.actorId,
        label: `Complete o checklist de onboarding ${workflow.serviceName} para ${input.company.name}`,
        companyId: input.company.id,
      });
    }
  }

  await recomputeOnboardingProgress(tx, input.onboardingId);
  return result;
}

async function createOnboardingRecords(
  tx: Tx,
  input: {
    company: CompanySnapshot;
    sourceProject?: SourceProjectSnapshot | null;
    actorId: string;
    services?: string[];
    closingDate?: Date | null;
    expectedStartDate?: Date | null;
    initialNotes?: string | null;
    responsibleSalespersonId?: string | null;
    responsibleDepartmentId?: string | null;
    responsibleDepartmentName?: string | null;
    source?: string;
  },
): Promise<OnboardingCreationResult> {
  const company = input.company;
  const sourceProject = input.sourceProject ?? null;
  const mirroredProjects = await ensureWorkspaceOnboardingMirrorProjects(tx, {
    workspaceId: company.workspace_id,
    ownerId: input.actorId,
  });
  const contractedServices = onboardingServices({
    explicitServices: input.services,
    includedServices: company.included_services,
    serviceType: company.service_type,
  });

  const existing = sourceProject
    ? await tx.clientOnboarding.findUnique({
        where: { project_id: sourceProject.id },
        select: onboardingSelect(),
      })
    : await tx.clientOnboarding.findFirst({
        where: {
          workspace_id: company.workspace_id,
          company_id: company.id,
          status: { not: "onboarding_complete" },
        },
        orderBy: [{ created_at: "desc" }, { id: "asc" }],
        select: onboardingSelect(),
      });
  let migratedExistingOnboardingId: string | null = null;
  let migratedExistingSharedTaskId: string | null = null;
  const existingSharedTaskItem = existing?.checklist_items.find(
    (item) => item.automation_key === SHARED_ONBOARDING_TASK_AUTOMATION_KEY,
  );
  const existingHasSharedTask = Boolean(existingSharedTaskItem?.task_id);
  const existingHasSequentialSharedFlow = existing?.checklist_items.some(
    (item) => item.automation_key === SHARED_ONBOARDING_SEQUENTIAL_ENTRY_KEY,
  );
  if (
    existing &&
    input.source === "commercial_contract_signed" &&
    !existingHasSharedTask
  ) {
    // Replace the legacy fan-out (one independent task per department) with
    // the canonical shared task. Contracts stay attached to the onboarding;
    // only the superseded execution records are removed.
    const legacyTaskIds = Array.from(
      new Set(
        existing.checklist_items
          .map((item) => item.task_id)
          .filter((taskId): taskId is string => Boolean(taskId)),
      ),
    );
    if (legacyTaskIds.length > 0) {
      await deleteTasksByIds(tx, legacyTaskIds, {
        workspaceIds: [company.workspace_id],
      });
    }
    await Promise.all([
      tx.onboardingMeeting.deleteMany({
        where: { onboarding_id: existing.id },
      }),
      tx.marketingB2BOnboardingForm.deleteMany({
        where: { onboarding_id: existing.id },
      }),
      tx.marketingB2COnboardingForm.deleteMany({
        where: { onboarding_id: existing.id },
      }),
      tx.onboardingServiceAssignment.deleteMany({
        where: { onboarding_id: existing.id },
      }),
      tx.supportGroup.deleteMany({
        where: { onboarding_id: existing.id },
      }),
    ]);
    await tx.onboardingChecklistItem.deleteMany({
      where: { onboarding_id: existing.id },
    });
    migratedExistingOnboardingId = existing.id;
  } else if (
    existing &&
    input.source === "commercial_contract_signed" &&
    existingHasSharedTask &&
    !existingHasSequentialSharedFlow
  ) {
    // Upgrade the first shared implementation (parallel department gates) to
    // the ordered hand-off without replacing the canonical task itself.
    const supersededTaskIds = Array.from(
      new Set(
        existing.checklist_items
          .filter(
            (item) =>
              item.automation_key !== SHARED_ONBOARDING_TASK_AUTOMATION_KEY,
          )
          .map((item) => item.task_id)
          .filter((taskId): taskId is string => Boolean(taskId)),
      ),
    );
    if (supersededTaskIds.length > 0) {
      await deleteTasksByIds(tx, supersededTaskIds, {
        workspaceIds: [company.workspace_id],
      });
    }
    await Promise.all([
      tx.onboardingMeeting.deleteMany({
        where: { onboarding_id: existing.id },
      }),
      tx.marketingB2BOnboardingForm.deleteMany({
        where: { onboarding_id: existing.id },
      }),
      tx.marketingB2COnboardingForm.deleteMany({
        where: { onboarding_id: existing.id },
      }),
      tx.onboardingServiceAssignment.deleteMany({
        where: { onboarding_id: existing.id },
      }),
    ]);
    await tx.onboardingChecklistItem.deleteMany({
      where: {
        onboarding_id: existing.id,
        automation_key: { not: SHARED_ONBOARDING_TASK_AUTOMATION_KEY },
      },
    });
    migratedExistingOnboardingId = existing.id;
    migratedExistingSharedTaskId = existingSharedTaskItem?.task_id ?? null;
  } else if (
    existing &&
    input.source === "commercial_contract_signed" &&
    existingHasSequentialSharedFlow
  ) {
    await syncSharedOnboardingTaskStage(tx, existing.id);
    return {
      onboarding: await recomputeOnboardingProgress(tx, existing.id),
      notificationTargets: [],
      createdTasks: [],
      missingMappings: [],
      reused: true,
    };
  } else if (existing) {
    const existingTaskProjectIds = Array.from(
      new Set(
        existing.checklist_items
          .map((item) => item.task?.project_id)
          .filter((projectId): projectId is string => Boolean(projectId)),
      ),
    );
    for (const projectId of existingTaskProjectIds) {
      await repairOnboardingTaskRouting(tx, {
        workspaceId: company.workspace_id,
        projectId,
        ownerId: input.actorId,
      });
    }
    const onboardingProjectId = sourceProject?.id ?? existing.project_id;
    if (onboardingProjectId) {
      await tx.project.update({
        where: { id: onboardingProjectId },
        data: { onboarding_enabled: true, kind: "onboarding" },
        select: { id: true },
      });
    }
    const synced = await syncDedicatedServiceWorkflows(tx, {
      onboardingId: existing.id,
      company,
      actorId: input.actorId,
      services: contractedServices,
      currentServices: existing.contracted_services,
    });
    const sequence = await reconcileUpZeroSequentialWorkflow(tx, {
      onboardingId: existing.id,
      company,
      actorId: input.actorId,
      services: contractedServices,
    });
    if (sequence.createdTechnicalTask)
      synced.createdTasks.push(sequence.createdTechnicalTask);
    const blockedTaskIds = new Set(sequence.blockedTaskIds);
    synced.notificationTargets = synced.notificationTargets.filter(
      (target) => !blockedTaskIds.has(target.taskId),
    );
    synced.notificationTargets.push(...sequence.notificationTargets);
    return {
      onboarding: await recomputeOnboardingProgress(tx, existing.id),
      notificationTargets: synced.notificationTargets,
      createdTasks: synced.createdTasks,
      missingMappings: synced.missingMappings,
      reused: true,
    };
  }

  const notificationTargets: OnboardingAssignmentNotificationTarget[] = [];
  const createdTasks: CreatedOnboardingTask[] = [];
  const missingMappings: string[] = [];
  const responsibleDepartment = input.responsibleDepartmentName
    ? null
    : input.responsibleDepartmentId
      ? await tx.department.findFirst({
          where: {
            id: input.responsibleDepartmentId,
            workspace_id: company.workspace_id,
          },
          select: { name: true },
        })
      : null;
  const sourceProjectSpaceName = sourceProject?.space?.name ?? null;
  const responsibleDepartmentName =
    input.responsibleDepartmentName ??
    responsibleDepartment?.name ??
    sourceProjectSpaceName ??
    null;
  const marketingFormRoute = marketingFormRouteForOnboarding(
    company.service_type,
    responsibleDepartmentName,
  );

  const mappingRows = await tx.serviceLeaderMapping.findMany({
    where: { workspace_id: company.workspace_id, active: true },
    include: {
      department: { select: { id: true, name: true } },
      leader: { select: { id: true, name: true, email: true } },
    },
  });
  const departmentMappingByKey = new Map<
    string,
    (typeof mappingRows)[number]
  >();
  for (const mapping of mappingRows) {
    const key = ownerKeyForDepartmentLabel(mapping.service);
    if (key) departmentMappingByKey.set(key, mapping);
  }
  const departmentMappingForRoute = (route: OnboardingTaskRoute) =>
    departmentMappingByKey.get(ownerKeyForTaskRoute(route));
  const ownerForDepartmentRoute = async (
    route: OnboardingTaskRoute,
    fallback: UserRef | null,
  ) =>
    departmentMappingForRoute(route)?.leader ??
    ownerForRoute(tx, company.workspace_id, route, fallback);
  const departmentForDepartmentRoute = async (route: OnboardingTaskRoute) =>
    departmentMappingForRoute(route)?.department ??
    departmentForRoute(tx, company.workspace_id, route);

  const adminFallback = await findAdminFallback(tx, company.workspace_id);
  const financeOwner = await ownerForDepartmentRoute("finance", adminFallback);
  const supportOwner = await ownerForDepartmentRoute("support", adminFallback);
  const commercialOwner = await ownerForDepartmentRoute(
    "commercial",
    adminFallback,
  );
  const creativeOwner = await ownerForDepartmentRoute(
    "creative_design",
    adminFallback,
  );
  const selectedMarketingRoute =
    marketingFormRoute ??
    (normalizedName(company.service_type ?? "").includes("b2c")
      ? "marketing_b2c"
      : "marketing_b2b");
  const marketingOwner = await ownerForDepartmentRoute(
    selectedMarketingRoute,
    adminFallback,
  );
  const [
    commercialDepartment,
    supportDepartment,
    marketingDepartment,
    designDepartment,
  ] = await Promise.all([
    departmentForDepartmentRoute("commercial"),
    departmentForDepartmentRoute("support"),
    departmentForDepartmentRoute(selectedMarketingRoute),
    departmentForDepartmentRoute("creative_design"),
  ]);
  const productionOwner =
    departmentMappingByKey.get("production")?.leader ?? null;
  const technicalVisitOwner = productionOwner ?? creativeOwner;
  const salespersonId =
    input.responsibleSalespersonId ??
    sourceProject?.responsible_salesperson_id ??
    commercialOwner?.id ??
    sourceProject?.owner_id ??
    company.owner_id;

  const queueProjectCache = new Map<OnboardingTaskRoute, string>();
  const queueProjectId = async (route: OnboardingTaskRoute) => {
    const cached = queueProjectCache.get(route);
    if (cached) return cached;
    const projectId = await resolveOnboardingMirrorProjectId(tx, {
      workspaceId: company.workspace_id,
      ownerId: input.actorId,
      route,
      mirrors: mirroredProjects,
    });
    queueProjectCache.set(route, projectId);
    return projectId;
  };

  const commercialProjectId = await queueProjectId("commercial");
  const financeProjectId = await queueProjectId("finance");
  const supportProjectId = await queueProjectId("support");
  const creativeProjectId = await queueProjectId("creative_design");
  const productionProjectId =
    mirroredProjects.find((project) =>
      ["production", "producao"].includes(normalizedName(project.spaceName)),
    )?.id ?? creativeProjectId;
  const commercialCompletedAt = new Date();

  const onboardingData = {
    project_id: sourceProject?.id ?? existing?.project_id ?? null,
    status: "pending_finance_registration",
    sequence_status: "commercial_pending",
    progress: 0,
    closing_date: input.closingDate ?? sourceProject?.closing_date ?? null,
    expected_start_date:
      input.expectedStartDate ?? sourceProject?.onboarding_start_date ?? null,
    responsible_salesperson_id: salespersonId,
    initial_notes: input.initialNotes ?? sourceProject?.initial_notes ?? null,
    contracted_services: contractedServices,
    commercial_completed_at: commercialCompletedAt,
    technical_support_started_at: null,
    up_zero_configuration_completed_at: null,
    marketing_b2b_released_at: null,
    completed_at: null,
  } satisfies Prisma.ClientOnboardingUncheckedUpdateInput;
  const onboarding = migratedExistingOnboardingId
    ? await tx.clientOnboarding.update({
        where: { id: migratedExistingOnboardingId },
        data: onboardingData,
        select: ONBOARDING_SAFE_SCALAR_SELECT,
      })
    : await tx.clientOnboarding.create({
        data: {
          workspace_id: company.workspace_id,
          company_id: company.id,
          created_by: input.actorId,
          ...onboardingData,
        },
        select: ONBOARDING_SAFE_SCALAR_SELECT,
      });

  if (sourceProject) {
    await tx.project.update({
      where: { id: sourceProject.id },
      data: {
        onboarding_enabled: true,
        kind: "onboarding",
        responsible_salesperson_id: salespersonId,
        ...(input.closingDate !== undefined && {
          closing_date: input.closingDate,
        }),
        ...(input.expectedStartDate !== undefined && {
          onboarding_start_date: input.expectedStartDate,
        }),
        ...(input.initialNotes !== undefined && {
          initial_notes: input.initialNotes,
        }),
      },
    });
  }

  const createTask = async (data: {
    project_id: string;
    route: OnboardingTaskRoute;
    title: string;
    description: string;
    status: "todo" | "in_progress" | "done";
    priority: "low" | "medium" | "high";
    assignee_id: string | null;
    position: number;
  }) => {
    const task = await tx.task.create({
      data: {
        project_id: data.project_id,
        company_id: company.id,
        title: data.title,
        description: data.description,
        status: data.status,
        priority: data.priority,
        assignee_id: data.assignee_id,
        position: data.position,
      },
    });
    createdTasks.push({
      id: task.id,
      title: task.title,
      route: data.route,
      project_id: data.project_id,
      assignee_id: task.assignee_id,
    });
    return task;
  };

  // Contract signature is the single entry point for the agency-wide
  // onboarding orchestration. One canonical task is exposed in every
  // departmental Onboarding project; the checklist below owns the gates.
  if (input.source === "commercial_contract_signed") {
    const fallbackOwnerId = adminFallback?.id ?? input.actorId;
    const initialOwnerId = supportOwner?.id ?? fallbackOwnerId;
    const sharedTaskData = {
      project_id: commercialProjectId,
      company_id: company.id,
      title: `Onboarding — ${company.name}`,
      description: [
        `Onboarding compartilhado de ${company.name}.`,
        "A tarefa aparece nos projetos Onboarding de todos os departamentos.",
        "Primeiro, Suporte, Performance e Criação agendam suas reuniões em paralelo.",
        "Depois que todas as datas forem confirmadas, as etapas avançam em sequência: Suporte (com Financeiro e Administração), Performance e Criação.",
        "Somente o departamento responsável pode concluir sua etapa.",
      ].join("\n\n"),
      status: "todo" as const,
      priority: "high" as const,
      assignee_id: initialOwnerId,
      position: 0,
    };
    const sharedTask = migratedExistingSharedTaskId
      ? await tx.task.update({
          where: { id: migratedExistingSharedTaskId },
          data: sharedTaskData,
        })
      : await createTask({
          project_id: sharedTaskData.project_id,
          route: "commercial",
          title: sharedTaskData.title,
          description: sharedTaskData.description,
          status: sharedTaskData.status,
          priority: sharedTaskData.priority,
          assignee_id: sharedTaskData.assignee_id,
          position: sharedTaskData.position,
        });

    const sharedTaskItemData = {
      department: supportDepartment?.name ?? "Suporte Técnico",
      title: `Onboarding compartilhado — ${company.name}`,
      status: "in_progress",
      required: false,
      owner_id: initialOwnerId,
      notes: "Registro central da tarefa espelhada em todos os departamentos.",
      sort_order: 0,
    };
    if (migratedExistingSharedTaskId) {
      await tx.onboardingChecklistItem.update({
        where: {
          onboarding_id_automation_key: {
            onboarding_id: onboarding.id,
            automation_key: SHARED_ONBOARDING_TASK_AUTOMATION_KEY,
          },
        },
        data: { ...sharedTaskItemData, task_id: sharedTask.id },
      });
    } else {
      await tx.onboardingChecklistItem.create({
        data: {
          onboarding_id: onboarding.id,
          workspace_id: company.workspace_id,
          task_id: sharedTask.id,
          automation_key: SHARED_ONBOARDING_TASK_AUTOMATION_KEY,
          ...sharedTaskItemData,
        },
      });
    }

    const conditionRows: Prisma.OnboardingChecklistItemCreateManyInput[] = [
      {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        automation_key: SHARED_ONBOARDING_SCHEDULING_KEYS.support,
        department: supportDepartment?.name ?? "Suporte Técnico",
        title: "Agendar Onboarding de Suporte",
        owner_id: initialOwnerId,
        notes:
          "Reunião conjunta conduzida por Suporte, com participação do Financeiro e da Administração.",
        sort_order: 10,
      },
      {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        automation_key: SHARED_ONBOARDING_SCHEDULING_KEYS.performance,
        department:
          marketingDepartment?.name ??
          (selectedMarketingRoute === "marketing_b2c"
            ? "Marketing B2C"
            : "Marketing B2B"),
        title: "Agendar Onboarding de Performance",
        owner_id: marketingOwner?.id ?? fallbackOwnerId,
        notes:
          "A equipe de Performance responsável pelo cliente deve definir a data da reunião.",
        sort_order: 20,
      },
      {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        automation_key: SHARED_ONBOARDING_SCHEDULING_KEYS.creative,
        department: designDepartment?.name ?? "Creative & Design",
        title: "Agendar Onboarding de Criação",
        owner_id: creativeOwner?.id ?? fallbackOwnerId,
        notes:
          "A equipe de Criação deve definir a data da reunião de alinhamento criativo.",
        sort_order: 30,
      },
      {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        automation_key: SHARED_ONBOARDING_EXECUTION_KEYS.support,
        department: supportDepartment?.name ?? "Suporte Técnico",
        title: "Concluir Onboarding de Suporte",
        owner_id: initialOwnerId,
        notes:
          "Suporte conduz esta etapa com participação do Financeiro e da Administração.",
        sort_order: 100,
      },
      {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        automation_key: SHARED_ONBOARDING_EXECUTION_KEYS.performance,
        department:
          marketingDepartment?.name ??
          (selectedMarketingRoute === "marketing_b2c"
            ? "Marketing B2C"
            : "Marketing B2B"),
        title: "Concluir Onboarding de Performance",
        owner_id: marketingOwner?.id ?? fallbackOwnerId,
        notes:
          "A etapa só é liberada depois da conclusão do Onboarding de Suporte.",
        sort_order: 200,
      },
      {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        automation_key: SHARED_ONBOARDING_EXECUTION_KEYS.creative,
        department: designDepartment?.name ?? "Creative & Design",
        title: "Concluir Onboarding de Criação",
        owner_id: creativeOwner?.id ?? fallbackOwnerId,
        notes:
          "A etapa só é liberada depois da conclusão do Onboarding de Performance.",
        sort_order: 300,
      },
    ];
    await tx.onboardingChecklistItem.createMany({ data: conditionRows });
    const meetingConditions = await tx.onboardingChecklistItem.findMany({
      where: {
        onboarding_id: onboarding.id,
        automation_key: {
          in: [
            SHARED_ONBOARDING_SCHEDULING_KEYS.support,
            SHARED_ONBOARDING_SCHEDULING_KEYS.performance,
            SHARED_ONBOARDING_SCHEDULING_KEYS.creative,
          ],
        },
      },
      select: {
        id: true,
        department: true,
        title: true,
        owner_id: true,
      },
    });
    await tx.onboardingMeeting.createMany({
      data: meetingConditions.map((condition) => ({
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        service: `${condition.department} — ${condition.title}`,
        checklist_item_id: condition.id,
        leader_id: condition.owner_id,
      })),
    });
    await tx.supportGroup.upsert({
      where: { onboarding_id: onboarding.id },
      create: {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        created_by: initialOwnerId,
      },
      update: {
        group_created: false,
        group_created_at: null,
        status: "not_created",
        created_by: initialOwnerId,
      },
    });

    const firstPhaseOwnerIds = Array.from(
      new Set(
        [
          initialOwnerId,
          marketingOwner?.id ?? fallbackOwnerId,
          creativeOwner?.id ?? fallbackOwnerId,
        ].filter(Boolean),
      ),
    );
    for (const userId of firstPhaseOwnerIds) {
      notificationTargets.push({
        userId,
        taskId: sharedTask.id,
        workspaceId: company.workspace_id,
        onboardingId: onboarding.id,
        actorId: input.actorId,
        label: `Defina a data do onboarding de ${company.name}`,
        companyId: company.id,
      });
    }

    await syncSharedOnboardingTaskStage(tx, onboarding.id);
    return {
      onboarding: await recomputeOnboardingProgress(tx, onboarding.id),
      notificationTargets,
      createdTasks,
      missingMappings,
      reused: Boolean(migratedExistingSharedTaskId),
    };
  }

  const commercialTask = await createTask({
    project_id: commercialProjectId,
    route: "commercial",
    title: "Onboarding: commercial setup confirmed",
    description:
      "Client created with services, owner, expected start, and initial onboarding notes.",
    status: "done",
    priority: "high",
    assignee_id: salespersonId,
    position: 0,
  });
  const financeTask = await createTask({
    project_id: financeProjectId,
    route: "finance",
    title: "Onboarding: complete finance registration",
    description:
      "Finance queue action: fill legal company name, CNPJ, billing contact, payment terms, contract value, and start date. When this task is marked done, the onboarding checklist and progress update automatically.",
    status: "todo",
    priority: "high",
    assignee_id: financeOwner?.id ?? null,
    position: 1,
  });
  const contractTask = await createTask({
    project_id: financeProjectId,
    route: "finance",
    title: "Onboarding: upload signed contract",
    description:
      "Finance queue action: upload the signed contract inside the finance onboarding form so only Finance/Admin can access the file. When this task is marked done, the onboarding checklist and progress update automatically.",
    status: "todo",
    priority: "high",
    assignee_id: financeOwner?.id ?? null,
    position: 2,
  });
  const supportTask = await createTask({
    project_id: supportProjectId,
    route: "support",
    title: "Onboarding: create client communication group",
    description:
      "Support queue action: create the support/client communication group and record the link, participants, and notes. When this task is marked done, the onboarding checklist and progress update automatically.",
    status: "todo",
    priority: "medium",
    assignee_id: supportOwner?.id ?? null,
    position: 3,
  });
  const creativeBrandMeetingTask = await createTask({
    project_id: creativeProjectId,
    route: "creative_design",
    title: "Onboarding: schedule brand guidelines meeting",
    description:
      "Creative & Design queue action: schedule the first client meeting to discuss brand guidelines, visual direction, references, assets, and creative handoff.",
    status: "todo",
    priority: "medium",
    assignee_id: creativeOwner?.id ?? null,
    position: 4,
  });
  const creativeTechnicalVisitTask = await createTask({
    project_id: productionProjectId,
    route: "creative_design",
    title: "Onboarding: schedule visita tecnica",
    description:
      "Creative & Design queue action: schedule the visita tecnica with the client and link the calendar event back to onboarding.",
    status: "todo",
    priority: "medium",
    assignee_id: technicalVisitOwner?.id ?? null,
    position: 5,
  });

  notificationTargets.push(
    {
      userId: financeOwner?.id,
      taskId: financeTask.id,
      workspaceId: company.workspace_id,
      onboardingId: onboarding.id,
      actorId: input.actorId,
      label: `Finance registration for ${company.name}`,
      companyId: company.id,
    },
    {
      userId: financeOwner?.id,
      taskId: contractTask.id,
      workspaceId: company.workspace_id,
      onboardingId: onboarding.id,
      actorId: input.actorId,
      label: `Upload signed contract for ${company.name}`,
      companyId: company.id,
    },
    {
      userId: supportOwner?.id,
      taskId: supportTask.id,
      workspaceId: company.workspace_id,
      onboardingId: onboarding.id,
      actorId: input.actorId,
      label: `Create support group for ${company.name}`,
      companyId: company.id,
    },
    {
      userId: creativeOwner?.id,
      taskId: creativeBrandMeetingTask.id,
      workspaceId: company.workspace_id,
      onboardingId: onboarding.id,
      actorId: input.actorId,
      label: `Schedule brand guidelines meeting for ${company.name}`,
      companyId: company.id,
    },
    {
      userId: technicalVisitOwner?.id,
      taskId: creativeTechnicalVisitTask.id,
      workspaceId: company.workspace_id,
      onboardingId: onboarding.id,
      actorId: input.actorId,
      label: `Schedule visita tecnica for ${company.name}`,
      companyId: company.id,
    },
  );

  const allMapped = contractedServices.every((service) => {
    const route = routeForService(service);
    return Boolean(departmentMappingForRoute(route)?.leader_id);
  });
  await tx.onboardingChecklistItem.createMany({
    data: [
      {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        task_id: commercialTask.id,
        department: "Commercial",
        title: "Client created and services selected",
        status: "complete",
        owner_id: salespersonId,
        completed_at: commercialCompletedAt,
        completed_by: input.actorId,
        sort_order: 0,
      },
      {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        task_id: financeTask.id,
        department: "Finance",
        title: "Company registration completed",
        owner_id: financeOwner?.id ?? null,
        sort_order: 10,
      },
      {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        task_id: contractTask.id,
        department: "Contract",
        title: "Signed contract uploaded privately",
        owner_id: financeOwner?.id ?? null,
        sort_order: 20,
      },
      {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        department: "Internal Assignment",
        title: "Service leaders assigned",
        status: allMapped ? "complete" : "pending",
        completed_at: allMapped ? new Date() : null,
        completed_by: allMapped ? input.actorId : null,
        notes: allMapped
          ? null
          : "One or more departments are using fallback owners and need department responsible mapping.",
        sort_order: 30,
      },
      {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        task_id: supportTask.id,
        department: "Support",
        title: "Client communication group created",
        owner_id: supportOwner?.id ?? null,
        sort_order: 40,
      },
      {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        task_id: creativeBrandMeetingTask.id,
        department: "Creative & Design",
        title: "Brand guidelines meeting scheduled",
        owner_id: creativeOwner?.id ?? null,
        sort_order: 50,
      },
      {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        task_id: creativeTechnicalVisitTask.id,
        department: "Creative & Design",
        title: "Visita tecnica scheduled",
        owner_id: technicalVisitOwner?.id ?? null,
        sort_order: 60,
      },
    ],
  });

  await tx.supportGroup.create({
    data: {
      onboarding_id: onboarding.id,
      workspace_id: company.workspace_id,
      created_by: supportOwner?.id ?? null,
    },
  });

  let position = 70;
  const b2bFormServices =
    marketingFormRoute === "marketing_b2c"
      ? []
      : contractedServices.filter(isMarketingB2BFormService);
  const shouldCreateB2BForm =
    marketingFormRoute === "marketing_b2b" ||
    (marketingFormRoute === null && b2bFormServices.length > 0);
  const b2bFormServiceKeys = new Set(b2bFormServices.map(serviceKey));
  const b2bAssignments: Array<{
    service: string;
    leaderId: string | null;
    departmentId: string | null;
    departmentName: string | null;
    needsMapping: boolean;
  }> = [];

  for (const service of b2bFormServices) {
    const mapping = departmentMappingForRoute("marketing_b2b");
    const fallbackLeader = await ownerForDepartmentRoute(
      "marketing_b2b",
      adminFallback,
    );
    const fallbackDepartment =
      await departmentForDepartmentRoute("marketing_b2b");
    const leaderId = mapping?.leader_id ?? fallbackLeader?.id ?? null;
    const departmentId =
      mapping?.department_id ?? fallbackDepartment?.id ?? null;
    const departmentName =
      mapping?.department?.name ?? fallbackDepartment?.name ?? "Marketing B2B";
    const needsMapping = !mapping?.leader_id;
    if (needsMapping) missingMappings.push("Marketing B2B");

    await tx.onboardingServiceAssignment.create({
      data: {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        service,
        leader_id: leaderId,
        department_id: departmentId,
        department_name: departmentName,
        status: needsMapping ? "needs_mapping" : "assigned",
        notes: needsMapping
          ? "Needs Marketing B2B department responsible mapping. Fallback owner was assigned for continuity."
          : null,
      },
    });
    b2bAssignments.push({
      service,
      leaderId,
      departmentId,
      departmentName,
      needsMapping,
    });
  }

  let marketingOnboardingProjectId: string | null = null;
  if (shouldCreateB2BForm) {
    const fallbackLeader = await ownerForDepartmentRoute(
      "marketing_b2b",
      adminFallback,
    );
    const formOwnerId =
      b2bAssignments.find((assignment) => assignment.leaderId)?.leaderId ??
      fallbackLeader?.id ??
      null;
    const b2bProjectId = await queueProjectId("marketing_b2b");
    marketingOnboardingProjectId = b2bProjectId;
    const b2bTask = await createTask({
      project_id: b2bProjectId,
      route: "marketing_b2b",
      title: "Marketing B2B onboarding form",
      description: `Marketing B2B queue action: complete the client onboarding form for ${b2bFormServices.join(", ") || "the contracted services"}. Fields are optional and autosaved. Click Finalize onboarding B2B to update the central onboarding progress.`,
      status: "todo",
      priority: "high",
      assignee_id: formOwnerId,
      position,
    });
    const b2bItem = await tx.onboardingChecklistItem.create({
      data: {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        task_id: b2bTask.id,
        department: "Marketing B2B",
        title: "Marketing B2B onboarding form completed",
        owner_id: formOwnerId,
        notes: b2bAssignments.some((assignment) => assignment.needsMapping)
          ? "Marketing B2B department responsible is missing; fallback owner assigned until mapping is completed."
          : null,
        sort_order: position,
      },
    });
    await tx.marketingB2BOnboardingForm.create({
      data: {
        workspace_id: company.workspace_id,
        onboarding_id: onboarding.id,
        checklist_item_id: b2bItem.id,
        task_id: b2bTask.id,
        company_id: company.id,
        project_id: b2bProjectId,
        values: {},
      },
    });
    notificationTargets.push({
      userId: formOwnerId,
      taskId: b2bTask.id,
      workspaceId: company.workspace_id,
      onboardingId: onboarding.id,
      actorId: input.actorId,
      label: `Complete Marketing B2B onboarding form for ${company.name}`,
      companyId: company.id,
    });
    const b2bMeetingTask = await createTask({
      project_id: b2bProjectId,
      route: "marketing_b2b",
      title: "Onboarding: schedule Marketing B2B kickoff meeting",
      description:
        "Marketing B2B queue action: schedule the onboarding kickoff meeting with the client and link the calendar event back to this onboarding workflow.",
      status: "todo",
      priority: "medium",
      assignee_id: formOwnerId,
      position: position + 1,
    });
    const b2bMeetingItem = await tx.onboardingChecklistItem.create({
      data: {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        task_id: b2bMeetingTask.id,
        department: "Marketing B2B",
        title: "Marketing B2B kickoff meeting scheduled",
        owner_id: formOwnerId,
        sort_order: position + 1,
      },
    });
    await tx.onboardingMeeting.create({
      data: {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        service: "Marketing B2B kickoff",
        checklist_item_id: b2bMeetingItem.id,
        leader_id: formOwnerId,
      },
    });
    notificationTargets.push({
      userId: formOwnerId,
      taskId: b2bMeetingTask.id,
      workspaceId: company.workspace_id,
      onboardingId: onboarding.id,
      actorId: input.actorId,
      label: `Schedule Marketing B2B kickoff meeting for ${company.name}`,
      companyId: company.id,
    });
    position += 20;
  }

  const b2cFormServices =
    marketingFormRoute === "marketing_b2b"
      ? []
      : contractedServices.filter(
          (service) =>
            isMarketingB2CFormService(service) &&
            (marketingFormRoute === "marketing_b2c" ||
              !isMarketingB2BFormService(service)),
        );
  const shouldCreateB2CForm =
    marketingFormRoute === "marketing_b2c" ||
    (marketingFormRoute === null && b2cFormServices.length > 0);
  const b2cFormServiceKeys = new Set(b2cFormServices.map(serviceKey));
  const b2cAssignments: Array<{
    service: string;
    leaderId: string | null;
    departmentId: string | null;
    departmentName: string | null;
    needsMapping: boolean;
  }> = [];

  for (const service of b2cFormServices) {
    const mapping = departmentMappingForRoute("marketing_b2c");
    const fallbackLeader = await ownerForDepartmentRoute(
      "marketing_b2c",
      adminFallback,
    );
    const fallbackDepartment =
      await departmentForDepartmentRoute("marketing_b2c");
    const leaderId = mapping?.leader_id ?? fallbackLeader?.id ?? null;
    const departmentId =
      mapping?.department_id ?? fallbackDepartment?.id ?? null;
    const departmentName =
      mapping?.department?.name ?? fallbackDepartment?.name ?? "Marketing B2C";
    const needsMapping = !mapping?.leader_id;
    if (needsMapping) missingMappings.push("Marketing B2C");

    await tx.onboardingServiceAssignment.create({
      data: {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        service,
        leader_id: leaderId,
        department_id: departmentId,
        department_name: departmentName,
        status: needsMapping ? "needs_mapping" : "assigned",
        notes: needsMapping
          ? "Needs Marketing B2C department responsible mapping. Fallback owner was assigned for continuity."
          : null,
      },
    });
    b2cAssignments.push({
      service,
      leaderId,
      departmentId,
      departmentName,
      needsMapping,
    });
  }

  if (shouldCreateB2CForm) {
    const fallbackLeader = await ownerForDepartmentRoute(
      "marketing_b2c",
      adminFallback,
    );
    const formOwnerId =
      b2cAssignments.find((assignment) => assignment.leaderId)?.leaderId ??
      fallbackLeader?.id ??
      null;
    const b2cProjectId = await queueProjectId("marketing_b2c");
    marketingOnboardingProjectId = b2cProjectId;
    const b2cTask = await createTask({
      project_id: b2cProjectId,
      route: "marketing_b2c",
      title: "Marketing B2C onboarding form",
      description: `Marketing B2C queue action: complete the client onboarding form for ${b2cFormServices.join(", ") || "the contracted services"}. Fields are optional and autosaved. Click Finalize onboarding B2C to update the central onboarding progress.`,
      status: "todo",
      priority: "high",
      assignee_id: formOwnerId,
      position,
    });
    const b2cItem = await tx.onboardingChecklistItem.create({
      data: {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        task_id: b2cTask.id,
        department: "Marketing B2C",
        title: "Marketing B2C onboarding form completed",
        owner_id: formOwnerId,
        notes: b2cAssignments.some((assignment) => assignment.needsMapping)
          ? "Marketing B2C department responsible is missing; fallback owner assigned until mapping is completed."
          : null,
        sort_order: position,
      },
    });
    await tx.marketingB2COnboardingForm.create({
      data: {
        workspace_id: company.workspace_id,
        onboarding_id: onboarding.id,
        checklist_item_id: b2cItem.id,
        task_id: b2cTask.id,
        company_id: company.id,
        project_id: b2cProjectId,
        values: {},
      },
    });
    notificationTargets.push({
      userId: formOwnerId,
      taskId: b2cTask.id,
      workspaceId: company.workspace_id,
      onboardingId: onboarding.id,
      actorId: input.actorId,
      label: `Complete Marketing B2C onboarding form for ${company.name}`,
      companyId: company.id,
    });
    const b2cMeetingTask = await createTask({
      project_id: b2cProjectId,
      route: "marketing_b2c",
      title: "Onboarding: schedule Marketing B2C kickoff meeting",
      description:
        "Marketing B2C queue action: schedule the onboarding kickoff meeting with the client and link the calendar event back to this onboarding workflow.",
      status: "todo",
      priority: "medium",
      assignee_id: formOwnerId,
      position: position + 1,
    });
    const b2cMeetingItem = await tx.onboardingChecklistItem.create({
      data: {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        task_id: b2cMeetingTask.id,
        department: "Marketing B2C",
        title: "Marketing B2C kickoff meeting scheduled",
        owner_id: formOwnerId,
        sort_order: position + 1,
      },
    });
    await tx.onboardingMeeting.create({
      data: {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        service: "Marketing B2C kickoff",
        checklist_item_id: b2cMeetingItem.id,
        leader_id: formOwnerId,
      },
    });
    notificationTargets.push({
      userId: formOwnerId,
      taskId: b2cMeetingTask.id,
      workspaceId: company.workspace_id,
      onboardingId: onboarding.id,
      actorId: input.actorId,
      label: `Schedule Marketing B2C kickoff meeting for ${company.name}`,
      companyId: company.id,
    });
    position += 20;
  }

  for (const service of contractedServices) {
    const serviceMapKey = serviceKey(service);
    const existingAssignment =
      b2bAssignments.find(
        (assignment) => serviceKey(assignment.service) === serviceMapKey,
      ) ??
      b2cAssignments.find(
        (assignment) => serviceKey(assignment.service) === serviceMapKey,
      );
    const formServiceAlreadyAssigned =
      b2bFormServiceKeys.has(serviceMapKey) ||
      b2cFormServiceKeys.has(serviceMapKey);
    const dedicatedServiceTask = shouldCreateDedicatedServiceTask(service);
    if (formServiceAlreadyAssigned && !dedicatedServiceTask) continue;

    const route =
      dedicatedServiceTask && marketingFormRoute
        ? marketingFormRoute
        : routeForService(service);
    const assignmentRoute = route;
    const mapping = departmentMappingForRoute(assignmentRoute);
    const fallbackLeader = await ownerForDepartmentRoute(
      assignmentRoute,
      adminFallback,
    );
    const fallbackDepartment =
      await departmentForDepartmentRoute(assignmentRoute);
    const leaderId =
      existingAssignment?.leaderId ??
      mapping?.leader_id ??
      fallbackLeader?.id ??
      null;
    const departmentId =
      existingAssignment?.departmentId ??
      mapping?.department_id ??
      fallbackDepartment?.id ??
      null;
    const departmentName =
      existingAssignment?.departmentName ??
      mapping?.department?.name ??
      fallbackDepartment?.name ??
      null;
    const needsMapping =
      existingAssignment?.needsMapping ?? !mapping?.leader_id;
    if (needsMapping && !existingAssignment)
      missingMappings.push(
        mapping?.department?.name ?? fallbackDepartment?.name ?? service,
      );

    if (!existingAssignment) {
      await tx.onboardingServiceAssignment.create({
        data: {
          onboarding_id: onboarding.id,
          workspace_id: company.workspace_id,
          service,
          leader_id: leaderId,
          department_id: departmentId,
          department_name: departmentName,
          status: needsMapping ? "needs_mapping" : "assigned",
          notes: needsMapping
            ? "Needs department responsible mapping. Fallback owner was assigned for continuity."
            : null,
        },
      });
    }

    const dedicatedWorkflowRoute = marketingFormRoute ?? "marketing_b2b";
    const dedicatedWorkflow = serviceWorkflowFor(
      service,
      dedicatedWorkflowRoute,
    );
    const serviceProjectId = dedicatedWorkflow
      ? (marketingOnboardingProjectId ??
        (await queueProjectId(dedicatedWorkflowRoute)))
      : await queueProjectId(route);
    if (dedicatedWorkflow) {
      let entryTaskId: string | null = null;
      for (const [stepIndex, step] of dedicatedWorkflow.steps.entries()) {
        const stepPosition = position + stepIndex;
        const workflowTask = await createTask({
          project_id: serviceProjectId,
          route: assignmentRoute,
          title: `${dedicatedWorkflow.serviceName}: ${step.title}`,
          description: `${step.description}\n\nConcluir esta tarefa atualiza automaticamente o checklist e o progresso do onboarding.`,
          status: "todo",
          priority: step.priority ?? "medium",
          assignee_id: leaderId,
          position: stepPosition,
        });
        entryTaskId ??= workflowTask.id;
        const workflowItem = await tx.onboardingChecklistItem.create({
          data: {
            onboarding_id: onboarding.id,
            workspace_id: company.workspace_id,
            task_id: workflowTask.id,
            automation_key: step.automationKey ?? null,
            department: step.meeting
              ? "Service Onboarding"
              : `${dedicatedWorkflow.serviceName} Workflow`,
            title: `${dedicatedWorkflow.serviceName}: ${step.title}`,
            owner_id: leaderId,
            notes: needsMapping
              ? `${step.description}\n\nResponsável do departamento não configurado; proprietário alternativo atribuído.`
              : step.description,
            sort_order: stepPosition,
          },
        });
        if (step.meeting) {
          await tx.onboardingMeeting.create({
            data: {
              onboarding_id: onboarding.id,
              workspace_id: company.workspace_id,
              service: dedicatedWorkflow.serviceName,
              checklist_item_id: workflowItem.id,
              leader_id: leaderId,
            },
          });
        }
      }
      if (entryTaskId) {
        notificationTargets.push({
          userId: leaderId,
          taskId: entryTaskId,
          workspaceId: company.workspace_id,
          onboardingId: onboarding.id,
          actorId: input.actorId,
          label: `Complete o checklist de onboarding ${dedicatedWorkflow.serviceName} para ${company.name}`,
          companyId: company.id,
        });
      }
      position += dedicatedWorkflow.steps.length;
      continue;
    }

    const serviceTask = await createTask({
      project_id: serviceProjectId,
      route: assignmentRoute,
      title: `Onboarding: schedule ${service} onboarding meeting`,
      description: `Service queue action: schedule the ${service} onboarding meeting and save the date/link in the onboarding workflow. When this task is marked done, the onboarding checklist and progress update automatically.`,
      status: "todo",
      priority: "medium",
      assignee_id: leaderId,
      position,
    });
    const item = await tx.onboardingChecklistItem.create({
      data: {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        task_id: serviceTask.id,
        department: "Service Onboarding",
        title: `${service} onboarding meeting scheduled`,
        owner_id: leaderId,
        notes: needsMapping
          ? "Department responsible mapping missing; fallback owner assigned."
          : null,
        sort_order: position,
      },
    });
    await tx.onboardingMeeting.create({
      data: {
        onboarding_id: onboarding.id,
        workspace_id: company.workspace_id,
        service,
        checklist_item_id: item.id,
        leader_id: leaderId,
      },
    });
    notificationTargets.push({
      userId: leaderId,
      taskId: serviceTask.id,
      workspaceId: company.workspace_id,
      onboardingId: onboarding.id,
      actorId: input.actorId,
      label: `Schedule ${service} onboarding meeting for ${company.name}`,
      companyId: company.id,
    });
    position += 10;
  }

  await recordOnboardingTransition(tx, {
    workspaceId: company.workspace_id,
    onboardingId: onboarding.id,
    companyId: company.id,
    projectId: onboarding.project_id,
    taskId: commercialTask.id,
    actorId: input.actorId,
    type: "commercial_onboarding_completed",
    previousStatus: "commercial_pending",
    nextStatus: hasUpZeroService(contractedServices)
      ? "technical_support_pending"
      : "marketing_b2b_ready",
  });

  const sequence = await reconcileUpZeroSequentialWorkflow(tx, {
    onboardingId: onboarding.id,
    company,
    actorId: input.actorId,
    services: contractedServices,
  });
  if (sequence.createdTechnicalTask)
    createdTasks.push(sequence.createdTechnicalTask);
  const blockedTaskIds = new Set(sequence.blockedTaskIds);
  const releasedNotificationTargets = notificationTargets.filter(
    (target) => !blockedTaskIds.has(target.taskId),
  );
  releasedNotificationTargets.push(...sequence.notificationTargets);

  const refreshed = await recomputeOnboardingProgress(tx, onboarding.id);
  return {
    onboarding: refreshed,
    notificationTargets: releasedNotificationTargets,
    createdTasks,
    missingMappings,
    reused: false,
  };
}

export async function createClientOnboardingFromWizard(
  input: ClientOnboardingWizardInput,
): Promise<ClientOnboardingWizardResult> {
  const result = await prisma.$transaction(async (tx) => {
    const company = input.companyId
      ? await tx.company.update({
          where: { id: input.companyId },
          data: {
            name: input.name.trim(),
            website: cleanNullable(input.website),
            industry: cleanNullable(input.industry),
            ...(input.salesChannel !== undefined
              ? { sales_channel: input.salesChannel }
              : {}),
            service_type: cleanNullable(input.serviceType),
            plan_name: cleanNullable(input.planName),
            billing_cycle: cleanNullable(input.billingCycle),
            included_services: input.includedServices,
            notes: cleanNullable(input.notes),
            description: cleanNullable(input.notes),
            contract_value: input.contractValue ?? undefined,
            owner_id: input.ownerId ?? input.actorId,
          },
          select: {
            id: true,
            workspace_id: true,
            name: true,
            owner_id: true,
            included_services: true,
            service_type: true,
            plan_name: true,
          },
        })
      : await tx.company.create({
          data: {
            workspace_id: input.workspaceId,
            name: input.name.trim(),
            website: cleanNullable(input.website),
            industry: cleanNullable(input.industry),
            sales_channel: input.salesChannel ?? null,
            service_type: cleanNullable(input.serviceType),
            plan_name: cleanNullable(input.planName),
            billing_cycle: cleanNullable(input.billingCycle),
            included_services: input.includedServices,
            notes: cleanNullable(input.notes),
            description: cleanNullable(input.notes),
            contract_value: input.contractValue ?? null,
            owner_id: input.ownerId ?? input.actorId,
          },
          select: {
            id: true,
            workspace_id: true,
            name: true,
            owner_id: true,
            included_services: true,
            service_type: true,
            plan_name: true,
          },
        });

    if (company.workspace_id !== input.workspaceId) {
      throw new Error("Selected client does not belong to this workspace.");
    }

    if (input.contactName?.trim()) {
      await tx.companyContact.create({
        data: {
          workspace_id: input.workspaceId,
          company_id: company.id,
          name: input.contactName.trim(),
          email: cleanNullable(input.contactEmail),
          phone: cleanNullable(input.contactPhone),
          role: cleanNullable(input.contactRole),
        },
      });
    }

    const onboardingResult = await createOnboardingRecords(tx, {
      company,
      actorId: input.actorId,
      services: input.includedServices,
      closingDate: input.closingDate ?? null,
      expectedStartDate: input.expectedStartDate ?? null,
      initialNotes: input.initialNotes ?? input.notes ?? null,
      responsibleSalespersonId:
        input.responsibleSalespersonId ?? input.ownerId ?? input.actorId,
      responsibleDepartmentId: input.responsibleDepartmentId ?? null,
      responsibleDepartmentName: input.responsibleDepartmentName ?? null,
    });

    return { company, ...onboardingResult };
  });

  const assignedNotificationCount = await sendOnboardingAssignmentNotifications(
    result.notificationTargets,
  );
  const adminNotificationCount = await sendOnboardingAdminSummaryNotifications({
    workspaceId: result.company.workspace_id,
    actorId: input.actorId,
    onboardingId: result.onboarding.id,
    companyId: result.company.id,
    companyName: result.company.name,
    createdTaskCount: result.createdTasks.length,
    missingMappings: result.missingMappings,
  });

  if (!result.reused) {
    await recordActivity({
      workspace_id: result.company.workspace_id,
      actor_id: input.actorId,
      type: "client_onboarding_started",
      entity_type: "client_onboarding",
      entity_id: result.onboarding.id,
      project_id: result.onboarding.project_id,
      company_id: result.company.id,
      metadata: {
        source: "client_wizard",
        status: result.onboarding.status,
        progress: result.onboarding.progress,
        services: result.onboarding.contracted_services,
        created_tasks: result.createdTasks.length,
        missing_mappings: result.missingMappings,
      },
    });
  }

  return {
    company_id: result.company.id,
    onboarding_id: result.onboarding.id,
    redirect_url: `/clients/${result.company.id}`,
    created_tasks: result.createdTasks,
    notifications: assignedNotificationCount + adminNotificationCount,
    missing_mappings: result.missingMappings,
  };
}

export async function syncClientOnboardingServices(input: {
  companyId: string;
  workspaceId: string;
  actorId: string;
  services?: string[];
}) {
  const result = await prisma.$transaction(async (tx) => {
    const company = await tx.company.findFirst({
      where: { id: input.companyId, workspace_id: input.workspaceId },
      select: {
        id: true,
        workspace_id: true,
        name: true,
        owner_id: true,
        included_services: true,
        service_type: true,
        plan_name: true,
      },
    });
    if (!company) throw new Error("Client not found.");

    const onboarding = await tx.clientOnboarding.findFirst({
      where: {
        workspace_id: input.workspaceId,
        company_id: input.companyId,
        status: { not: "onboarding_complete" },
      },
      orderBy: [{ created_at: "desc" }, { id: "asc" }],
      select: { id: true, contracted_services: true },
    });
    if (!onboarding) return null;

    const services = onboardingServices({
      explicitServices: input.services,
      includedServices: company.included_services,
      serviceType: company.service_type,
    });
    const synced = await syncDedicatedServiceWorkflows(tx, {
      onboardingId: onboarding.id,
      company,
      actorId: input.actorId,
      services,
      currentServices: onboarding.contracted_services,
    });
    const sequence = await reconcileUpZeroSequentialWorkflow(tx, {
      onboardingId: onboarding.id,
      company,
      actorId: input.actorId,
      services,
    });
    if (sequence.createdTechnicalTask)
      synced.createdTasks.push(sequence.createdTechnicalTask);
    const blockedTaskIds = new Set(sequence.blockedTaskIds);
    synced.notificationTargets = synced.notificationTargets.filter(
      (target) => !blockedTaskIds.has(target.taskId),
    );
    synced.notificationTargets.push(...sequence.notificationTargets);
    const refreshed = await tx.clientOnboarding.findUniqueOrThrow({
      where: { id: onboarding.id },
      select: onboardingSelect(),
    });
    return { ...synced, onboarding: refreshed };
  });

  if (!result) return null;
  const notifications = await sendOnboardingAssignmentNotifications(
    result.notificationTargets,
  );
  if (result.createdTasks.length > 0 || result.movedTasks > 0) {
    await recordActivity({
      workspace_id: result.onboarding.workspace_id,
      actor_id: input.actorId,
      type: "client_onboarding_services_synced",
      entity_type: "client_onboarding",
      entity_id: result.onboarding.id,
      project_id: result.onboarding.project_id,
      company_id: result.onboarding.company_id,
      metadata: {
        services: result.onboarding.contracted_services,
        created_tasks: result.createdTasks.length,
        moved_tasks: result.movedTasks,
      },
    });
  }
  return { ...result, notifications };
}

export type StartClientOnboardingForCompanyInput = {
  companyId: string;
  workspaceId?: string;
  actorId: string;
  services?: string[];
  expectedStartDate?: Date | null;
  initialNotes?: string | null;
  responsibleSalespersonId?: string | null;
  responsibleDepartmentId?: string | null;
  responsibleDepartmentName?: string | null;
  source?: string;
};

export async function createClientOnboardingRecordsForCompany(
  tx: Tx,
  input: StartClientOnboardingForCompanyInput,
) {
  const company = await tx.company.findFirst({
    where: {
      id: input.companyId,
      ...(input.workspaceId ? { workspace_id: input.workspaceId } : {}),
    },
    select: {
      id: true,
      workspace_id: true,
      name: true,
      owner_id: true,
      included_services: true,
      service_type: true,
      plan_name: true,
    },
  });
  if (!company) {
    throw new Error("Client not found.");
  }

  return createOnboardingRecords(tx, {
    company,
    actorId: input.actorId,
    services: input.services,
    expectedStartDate: input.expectedStartDate ?? null,
    initialNotes: input.initialNotes ?? null,
    responsibleSalespersonId:
      input.responsibleSalespersonId ?? company.owner_id,
    responsibleDepartmentId: input.responsibleDepartmentId ?? null,
    responsibleDepartmentName: input.responsibleDepartmentName ?? null,
    source: input.source,
  });
}

export async function startClientOnboardingForCompany(
  input: StartClientOnboardingForCompanyInput,
) {
  const result = await prisma.$transaction((tx) =>
    createClientOnboardingRecordsForCompany(tx, input),
  );

  const assignedNotificationCount = await sendOnboardingAssignmentNotifications(
    result.notificationTargets,
  );
  const adminNotificationCount = await sendOnboardingAdminSummaryNotifications({
    workspaceId: result.onboarding.workspace_id,
    actorId: input.actorId,
    onboardingId: result.onboarding.id,
    companyId: result.onboarding.company_id,
    companyName: result.onboarding.company?.name ?? "Client",
    createdTaskCount: result.createdTasks.length,
    missingMappings: result.missingMappings,
  });

  if (!result.reused) {
    await recordActivity({
      workspace_id: result.onboarding.workspace_id,
      actor_id: input.actorId,
      type: "client_onboarding_started",
      entity_type: "client_onboarding",
      entity_id: result.onboarding.id,
      project_id: result.onboarding.project_id,
      company_id: result.onboarding.company_id,
      metadata: {
        source: input.source ?? "company_card",
        status: result.onboarding.status,
        progress: result.onboarding.progress,
        services: result.onboarding.contracted_services,
        created_tasks: result.createdTasks.length,
        missing_mappings: result.missingMappings,
      },
    });
  }

  return {
    onboarding: result.onboarding,
    createdTasks: result.createdTasks,
    missingMappings: result.missingMappings,
    reused: result.reused,
    notifications: assignedNotificationCount + adminNotificationCount,
  };
}

export type StartClientOnboardingInput = {
  projectId: string;
  actorId: string;
  services?: string[];
  closingDate?: Date | null;
  expectedStartDate?: Date | null;
  initialNotes?: string | null;
  responsibleSalespersonId?: string | null;
};

export async function createClientOnboardingRecordsForProject(
  tx: Tx,
  input: StartClientOnboardingInput,
) {
  const initialProject = await tx.project.findUnique({
    where: { id: input.projectId },
    select: { company_id: true },
  });
  if (!initialProject?.company_id) {
    throw new Error("Onboarding requires a project linked to a client.");
  }

  // All client/project lifecycle transactions lock Company before Project.
  // This keeps onboarding, client deletion, and project reassignment from
  // deadlocking while still preventing a stale client read.
  await tx.$queryRaw`SELECT "id" FROM "Company" WHERE "id" = ${initialProject.company_id} FOR KEY SHARE`;
  await tx.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${input.projectId} FOR UPDATE`;
  const project = await tx.project.findUnique({
    where: { id: input.projectId },
    select: {
      id: true,
      name: true,
      workspace_id: true,
      space_id: true,
      company_id: true,
      owner_id: true,
      closing_date: true,
      onboarding_start_date: true,
      responsible_salesperson_id: true,
      initial_notes: true,
      space: { select: { id: true, name: true } },
      company: {
        select: {
          id: true,
          workspace_id: true,
          name: true,
          owner_id: true,
          included_services: true,
          service_type: true,
          plan_name: true,
        },
      },
    },
  });
  if (project?.company_id !== initialProject.company_id) {
    throw new Error(
      "The project client changed while onboarding was starting. Please try again.",
    );
  }
  if (!project?.company_id || !project.company) {
    throw new Error("Onboarding requires a project linked to a client.");
  }

  return createOnboardingRecords(tx, {
    company: project.company,
    sourceProject: project,
    actorId: input.actorId,
    services: input.services,
    closingDate: input.closingDate,
    expectedStartDate: input.expectedStartDate,
    initialNotes: input.initialNotes,
    responsibleSalespersonId: input.responsibleSalespersonId,
  });
}

export async function finishClientOnboardingStart(
  result: OnboardingCreationResult,
  actorId: string,
  source = "project_onboarding",
) {
  await sendOnboardingAssignmentNotifications(result.notificationTargets);
  if (!result.reused) {
    await recordActivity({
      workspace_id: result.onboarding.workspace_id,
      actor_id: actorId,
      type: "client_onboarding_started",
      entity_type: "client_onboarding",
      entity_id: result.onboarding.id,
      project_id: result.onboarding.project_id,
      company_id: result.onboarding.company_id,
      metadata: {
        source,
        status: result.onboarding.status,
        progress: result.onboarding.progress,
        services: result.onboarding.contracted_services,
        created_tasks: result.createdTasks.length,
        missing_mappings: result.missingMappings,
      },
    });
  }
  return result.onboarding;
}

export async function startClientOnboarding(input: StartClientOnboardingInput) {
  const result = await prisma.$transaction((tx) =>
    createClientOnboardingRecordsForProject(tx, input),
  );

  return finishClientOnboardingStart(result, input.actorId);
}

export function onboardingSelect() {
  return {
    ...ONBOARDING_SAFE_SCALAR_SELECT,
    company: { select: { id: true, name: true } },
    project: { select: { id: true, name: true } },
    salesperson: { select: { id: true, name: true, email: true } },
    checklist_items: {
      orderBy: [{ sort_order: "asc" as const }, { created_at: "asc" as const }],
      include: {
        owner: { select: { id: true, name: true, email: true } },
        completer: { select: { id: true, name: true, email: true } },
        task: {
          select: { id: true, title: true, status: true, project_id: true },
        },
        marketing_b2b_form: {
          select: {
            id: true,
            status: true,
            completed_at: true,
            updated_at: true,
            values: true,
            task_id: true,
            checklist_item_id: true,
            task: {
              select: {
                id: true,
                title: true,
                status: true,
                project_id: true,
                assignee: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
        marketing_b2c_form: {
          select: {
            id: true,
            status: true,
            completed_at: true,
            updated_at: true,
            values: true,
            task_id: true,
            checklist_item_id: true,
            task: {
              select: {
                id: true,
                title: true,
                status: true,
                project_id: true,
                assignee: { select: { id: true, name: true, email: true } },
              },
            },
          },
        },
      },
    },
    service_assignments: {
      orderBy: [{ service: "asc" as const }],
      include: {
        leader: { select: { id: true, name: true, email: true } },
        department: { select: { id: true, name: true } },
      },
    },
    meetings: {
      orderBy: [{ service: "asc" as const }],
      include: {
        leader: { select: { id: true, name: true, email: true } },
      },
    },
    contracts: {
      orderBy: [{ uploaded_at: "desc" as const }, { id: "asc" as const }],
      include: {
        uploader: { select: { id: true, name: true, email: true } },
      },
    },
    support_group: {
      include: {
        creator: { select: { id: true, name: true, email: true } },
      },
    },
    marketing_b2b_forms: {
      orderBy: [{ created_at: "asc" as const }],
      select: {
        id: true,
        status: true,
        completed_at: true,
        updated_at: true,
        values: true,
        task_id: true,
        checklist_item_id: true,
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            project_id: true,
            assignee: { select: { id: true, name: true, email: true } },
          },
        },
      },
    },
    marketing_b2c_forms: {
      orderBy: [{ created_at: "asc" as const }],
      select: {
        id: true,
        status: true,
        completed_at: true,
        updated_at: true,
        values: true,
        task_id: true,
        checklist_item_id: true,
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            project_id: true,
            assignee: { select: { id: true, name: true, email: true } },
          },
        },
      },
    },
  };
}

export async function recomputeOnboardingProgress(
  db: Db,
  onboardingId: string,
) {
  const onboarding = await db.clientOnboarding.findUnique({
    where: { id: onboardingId },
    select: {
      ...ONBOARDING_SAFE_SCALAR_SELECT,
      checklist_items: true,
      contracts: { select: { id: true } },
      support_group: true,
    },
  });
  if (!onboarding) throw new Error("Onboarding not found");

  const required = onboarding.checklist_items.filter((item) => item.required);
  const complete = required.filter((item) => item.status === "complete");
  const progress =
    required.length > 0
      ? Math.round((complete.length / required.length) * 100)
      : 100;
  const next = required.find((item) => item.status !== "complete");
  const status = !next
    ? "onboarding_complete"
    : complete.length > 1
      ? "onboarding_in_progress"
      : departmentStatus(next.department);

  await db.clientOnboarding.update({
    where: { id: onboardingId },
    data: {
      progress,
      status,
      completed_at: status === "onboarding_complete" ? new Date() : null,
    },
    select: { id: true },
  });

  await syncSharedOnboardingTaskStage(db, onboardingId);

  return db.clientOnboarding.findUniqueOrThrow({
    where: { id: onboardingId },
    select: onboardingSelect(),
  });
}

type CampaignStartedFinanceHandoff = {
  serviceName: "Vesti" | "UP Zero";
  financeAutomationKey: string;
};

function campaignStartedFinanceHandoffFor(
  automationKey: string | null | undefined,
): CampaignStartedFinanceHandoff | null {
  if (automationKey === VESTI_CAMPAIGN_STARTED_AUTOMATION_KEY) {
    return {
      serviceName: "Vesti",
      financeAutomationKey: "finance_campaign_started:vesti",
    };
  }
  if (automationKey === UP_ZERO_CAMPAIGN_STARTED_AUTOMATION_KEY) {
    return {
      serviceName: "UP Zero",
      financeAutomationKey: "finance_campaign_started:up_zero",
    };
  }
  return null;
}

async function createFinanceCampaignStartedHandoff(
  db: Db,
  input: {
    onboardingId: string;
    sourceTaskTitle: string;
    sourceAutomationKey: string | null;
    actorId: string;
    startedAt: Date;
  },
): Promise<OnboardingAssignmentNotificationTarget | null> {
  const handoff = campaignStartedFinanceHandoffFor(input.sourceAutomationKey);
  if (!handoff) return null;

  const onboarding = await db.clientOnboarding.findUniqueOrThrow({
    where: { id: input.onboardingId },
    select: {
      id: true,
      workspace_id: true,
      company_id: true,
      created_by: true,
      company: { select: { name: true, owner_id: true } },
    },
  });
  const [mappingRows, adminFallback] = await Promise.all([
    db.serviceLeaderMapping.findMany({
      where: { workspace_id: onboarding.workspace_id, active: true },
      select: {
        service: true,
        leader: { select: { id: true, name: true, email: true } },
      },
    }),
    findAdminFallback(db, onboarding.workspace_id),
  ]);
  // The Finance leader mapping is the source of truth for this recipient. In
  // the current workspace it points to Pedro, while remaining configurable for
  // every other workspace.
  const financeMapping = mappingRows.find(
    (mapping) => ownerKeyForDepartmentLabel(mapping.service) === "finance",
  );
  const financeOwner =
    financeMapping?.leader ??
    (await ownerForRoute(
      db,
      onboarding.workspace_id,
      "finance",
      adminFallback,
    ));
  const ownerId = financeOwner?.id ?? onboarding.company.owner_id;
  const financeProjectId = await resolveFinanceOnboardingProjectId(db, {
    workspaceId: onboarding.workspace_id,
    companyId: onboarding.company_id,
    companyName: onboarding.company.name,
    ownerId: onboarding.created_by,
  });
  const [taskPosition, checklistPosition] = await Promise.all([
    db.task.aggregate({
      where: { project_id: financeProjectId },
      _max: { position: true },
    }),
    db.onboardingChecklistItem.aggregate({
      where: { onboarding_id: onboarding.id },
      _max: { sort_order: true },
    }),
  ]);
  const startedOn = formatDate(input.startedAt);
  const taskTitle = `Início de serviços — ${onboarding.company.name} — ${handoff.serviceName} (${startedOn})`;
  const taskDescription = [
    `Marketing B2B iniciou os serviços de ${handoff.serviceName} para ${onboarding.company.name}.`,
    `Data de início: ${startedOn}.`,
    `Tarefa de origem: ${input.sourceTaskTitle}.`,
    "Registrar o início para acompanhamento financeiro e faturamento.",
  ].join("\n");

  try {
    const handoffItem = await db.onboardingChecklistItem.create({
      data: {
        onboarding: { connect: { id: onboarding.id } },
        workspace: { connect: { id: onboarding.workspace_id } },
        automation_key: handoff.financeAutomationKey,
        department: "Finance",
        title: taskTitle,
        required: false,
        owner: { connect: { id: ownerId } },
        notes: taskDescription,
        sort_order: (checklistPosition._max.sort_order ?? -1) + 1,
        task: {
          create: {
            project: { connect: { id: financeProjectId } },
            company: { connect: { id: onboarding.company_id } },
            title: taskTitle,
            description: taskDescription,
            status: "todo" as const,
            priority: "medium" as const,
            assignee: { connect: { id: ownerId } },
            position: (taskPosition._max.position ?? -1) + 1,
          },
        },
      },
      include: {
        task: {
          select: { id: true, title: true },
        },
      },
    });
    if (!handoffItem.task) return null;
    return {
      userId: ownerId,
      taskId: handoffItem.task.id,
      workspaceId: onboarding.workspace_id,
      onboardingId: onboarding.id,
      actorId: input.actorId,
      label: handoffItem.task.title,
      companyId: onboarding.company_id,
    };
  } catch (error) {
    // The source task can be retried or completed concurrently. The unique
    // automation key makes the existing Finance handoff authoritative and
    // ensures that only its creator sends the notification.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return null;
    }
    throw error;
  }
}

export async function syncOnboardingChecklistFromTaskStatus(
  db: Db,
  input: {
    taskId: string;
    status: "todo" | "in_progress" | "done";
    actorId: string;
  },
) {
  const item = await db.onboardingChecklistItem.findFirst({
    where: { task_id: input.taskId },
    select: {
      id: true,
      onboarding_id: true,
      workspace_id: true,
      department: true,
      title: true,
      status: true,
      task_id: true,
      automation_key: true,
      completed_at: true,
    },
  });
  if (!item) return { linked: false as const };
  if (isSharedOnboardingAutomationKey(item.automation_key)) {
    return {
      linked: true as const,
      blocked: true as const,
      reason:
        "Esta tarefa avança automaticamente quando as condições departamentais são concluídas.",
    };
  }

  let completedAt = item.completed_at;
  if (input.status === "done") {
    const blocker = await getOnboardingCompletionBlocker(
      db,
      item.onboarding_id,
      item,
    );
    if (blocker)
      return { linked: true as const, blocked: true as const, reason: blocker };
    completedAt ??= new Date();
    await db.onboardingChecklistItem.update({
      where: { id: item.id },
      data: {
        status: "complete",
        completed_at: completedAt,
        completed_by: input.actorId,
      },
    });
  } else if (item.status === "complete") {
    await db.onboardingChecklistItem.update({
      where: { id: item.id },
      data: {
        status: input.status === "in_progress" ? "in_progress" : "pending",
        completed_at: null,
        completed_by: null,
      },
    });
  } else if (
    item.status !== input.status &&
    (input.status === "todo" || input.status === "in_progress")
  ) {
    await db.onboardingChecklistItem.update({
      where: { id: item.id },
      data: {
        status: input.status === "in_progress" ? "in_progress" : "pending",
      },
    });
  }

  let transitionNotificationTargets: OnboardingAssignmentNotificationTarget[] =
    [];
  if (input.status === "done" && completedAt) {
    const campaignHandoff = await createFinanceCampaignStartedHandoff(db, {
      onboardingId: item.onboarding_id,
      sourceTaskTitle: item.title,
      sourceAutomationKey: item.automation_key,
      actorId: input.actorId,
      startedAt: completedAt,
    });
    if (campaignHandoff) transitionNotificationTargets.push(campaignHandoff);
  }

  if (isUpZeroConfigurationChecklistItem(item)) {
    if (input.status === "done") {
      const release = await releaseUpZeroMarketingB2B(db, {
        onboardingId: item.onboarding_id,
        actorId: input.actorId,
        technicalTaskId: input.taskId,
      });
      transitionNotificationTargets = release.notificationTargets;
    } else {
      const sequenceOnboarding = await db.clientOnboarding.findUniqueOrThrow({
        where: { id: item.onboarding_id },
        select: {
          id: true,
          workspace_id: true,
          company_id: true,
          project_id: true,
          sequence_status: true,
          contracted_services: true,
          marketing_b2b_dependency_overridden_at: true,
          company: {
            select: {
              id: true,
              workspace_id: true,
              name: true,
              owner_id: true,
              included_services: true,
              service_type: true,
              plan_name: true,
            },
          },
        },
      });
      const nextSequenceStatus =
        input.status === "in_progress"
          ? "up_zero_configuration_in_progress"
          : "technical_support_pending";
      if (!sequenceOnboarding.marketing_b2b_dependency_overridden_at) {
        await db.clientOnboarding.update({
          where: { id: item.onboarding_id },
          data: {
            sequence_status: nextSequenceStatus,
            up_zero_configuration_completed_at: null,
            marketing_b2b_released_at: null,
          },
        });
        if (sequenceOnboarding.sequence_status !== nextSequenceStatus) {
          await recordOnboardingTransition(db, {
            workspaceId: sequenceOnboarding.workspace_id,
            onboardingId: sequenceOnboarding.id,
            companyId: sequenceOnboarding.company_id,
            projectId: sequenceOnboarding.project_id,
            taskId: input.taskId,
            actorId: input.actorId,
            type:
              input.status === "in_progress"
                ? "up_zero_configuration_started"
                : "up_zero_configuration_reopened",
            previousStatus: sequenceOnboarding.sequence_status,
            nextStatus: nextSequenceStatus,
          });
        }
        const reconciled = await reconcileUpZeroSequentialWorkflow(db, {
          onboardingId: item.onboarding_id,
          company: sequenceOnboarding.company,
          actorId: input.actorId,
          services: parseContractedServices(
            sequenceOnboarding.contracted_services,
          ),
        });
        transitionNotificationTargets.push(...reconciled.notificationTargets);
      }
    }
  } else if (input.status !== "todo") {
    const gate = await getUpZeroMarketingB2BGate(db, item.onboarding_id);
    if (
      gate?.uses_up_zero &&
      !gate.blocked &&
      gate.marketing_b2b_task_ids.includes(input.taskId)
    ) {
      const sequenceOnboarding = await db.clientOnboarding.findUniqueOrThrow({
        where: { id: item.onboarding_id },
        select: {
          workspace_id: true,
          company_id: true,
          project_id: true,
          sequence_status: true,
        },
      });
      if (sequenceOnboarding.sequence_status !== "marketing_b2b_in_progress") {
        await db.clientOnboarding.update({
          where: { id: item.onboarding_id },
          data: { sequence_status: "marketing_b2b_in_progress" },
        });
        await recordOnboardingTransition(db, {
          workspaceId: sequenceOnboarding.workspace_id,
          onboardingId: item.onboarding_id,
          companyId: sequenceOnboarding.company_id,
          projectId: sequenceOnboarding.project_id,
          taskId: input.taskId,
          actorId: input.actorId,
          type: "marketing_b2b_started",
          previousStatus: sequenceOnboarding.sequence_status,
          nextStatus: "marketing_b2b_in_progress",
        });
      }
    }
  }

  const onboarding = await recomputeOnboardingProgress(db, item.onboarding_id);
  await recordActivity({
    workspace_id: item.workspace_id,
    actor_id: input.actorId,
    type: "client_onboarding_item_updated",
    entity_type: "client_onboarding",
    entity_id: item.onboarding_id,
    project_id: onboarding.project_id,
    task_id: input.taskId,
    company_id: onboarding.company_id,
    metadata: {
      source: "task_status_sync",
      item_id: item.id,
      item_title: item.title,
      task_status: input.status,
      item_status:
        input.status === "done"
          ? "complete"
          : input.status === "in_progress"
            ? "in_progress"
            : "pending",
      progress: onboarding.progress,
    },
  });

  if (transitionNotificationTargets.length > 0) {
    await sendOnboardingAssignmentNotifications(transitionNotificationTargets);
  }

  return {
    linked: true as const,
    blocked: false as const,
    onboarding,
    transition_notifications: transitionNotificationTargets.length,
  };
}

export async function loadOnboardingAccess(
  auth: AuthUser,
  onboardingId: string,
) {
  const onboarding = await prisma.clientOnboarding.findUnique({
    where: { id: onboardingId },
    select: {
      ...ONBOARDING_SAFE_SCALAR_SELECT,
      service_assignments: { select: { service: true, leader_id: true } },
      checklist_items: {
        select: {
          id: true,
          department: true,
          owner_id: true,
          automation_key: true,
        },
      },
    },
  });
  if (!onboarding) return null;
  if (!canAccessWorkspace(auth, onboarding.workspace_id)) return null;
  const admin = isWorkspaceAdminFor(auth, onboarding.workspace_id);
  const member = await prisma.workspaceMember.findFirst({
    where: {
      workspace_id: onboarding.workspace_id,
      user_id: auth.prismaUser.id,
      status: "active",
    },
    include: { department: { select: { name: true } } },
  });
  // Guests retain read visibility, but a historic assignment or checklist owner
  // record must never elevate them into a workspace writer.
  const canWork = admin || Boolean(member && member.role !== "guest");
  const departmentName = member?.department?.name ?? "";
  const departmentOwnerKey = ownerKeyForDepartmentLabel(departmentName);
  const normalizedDepartmentName = normalizedName(departmentName);
  const isFinance =
    canWork &&
    (departmentOwnerKey === "finance" ||
      normalizedDepartmentName.includes("finance"));
  const isSupport =
    canWork &&
    (departmentOwnerKey === "technical_support" ||
      normalizedDepartmentName.includes("support") ||
      normalizedDepartmentName.includes("suporte"));
  const isCommercial =
    canWork &&
    (departmentOwnerKey === "commercial" ||
      normalizedDepartmentName.includes("commercial") ||
      normalizedDepartmentName.includes("comercial") ||
      onboarding.responsible_salesperson_id === auth.prismaUser.id);
  const serviceNames = canWork
    ? onboarding.service_assignments
        .filter((assignment) => assignment.leader_id === auth.prismaUser.id)
        .map((assignment) => assignment.service)
    : [];
  const matchesResponsibleDepartment = (item: {
    department: string;
    title?: string | null;
  }) => {
    if (!canWork) return false;
    const department = normalizedName(item.department);
    const itemDepartmentOwnerKey = ownerKeyForDepartmentLabel(
      item.department,
    );
    if (
      itemDepartmentOwnerKey === "finance" ||
      department.includes("finance") ||
      department.includes("contract")
    ) {
      return isFinance;
    }
    if (
      itemDepartmentOwnerKey === "technical_support" ||
      department.includes("support") ||
      department.includes("suporte")
    ) {
      return isSupport;
    }
    if (
      itemDepartmentOwnerKey === "commercial" ||
      department.includes("commercial") ||
      department.includes("comercial")
    ) {
      return isCommercial;
    }
    if (department.includes("service")) {
      const service = item.title?.replace(
        / onboarding meeting scheduled$/i,
        "",
      );
      return Boolean(
        service && serviceNames.map(serviceKey).includes(serviceKey(service)),
      );
    }
    return Boolean(
      normalizedDepartmentName &&
        (department === normalizedDepartmentName ||
          department.includes(normalizedDepartmentName) ||
          normalizedDepartmentName.includes(department)),
    );
  };

  return {
    onboarding,
    admin,
    role: member?.role ?? null,
    canWork,
    isFinance,
    isSupport,
    isCommercial,
    serviceNames,
    canManage: admin,
    canViewPrivateContract: isFinance || isCommercial,
    canUploadContract: isFinance || isCommercial,
    canUpdateFinance: isFinance || isCommercial,
    canUpdateSupport: admin || isSupport,
    canUpdateCommercial: admin || isCommercial,
    canUpdateService(service: string | null | undefined) {
      if (!canWork) return false;
      return (
        admin ||
        Boolean(
          service && serviceNames.map(serviceKey).includes(serviceKey(service)),
        )
      );
    },
    canUpdateChecklistItem(item: {
      department: string;
      owner_id?: string | null;
      title?: string | null;
    }) {
      if (!canWork) return false;
      if (admin || item.owner_id === auth.prismaUser.id) return true;
      return matchesResponsibleDepartment(item);
    },
    canScheduleChecklistItem(item: {
      department: string;
      title?: string | null;
    }) {
      return matchesResponsibleDepartment(item);
    },
  };
}

export function onboardingCapabilities(
  access: NonNullable<Awaited<ReturnType<typeof loadOnboardingAccess>>>,
  checklistItems: Array<{
    id: string;
    department: string;
    owner_id?: string | null;
    title?: string | null;
    automation_key?: string | null;
    status?: string | null;
    sort_order?: number | null;
  }>,
): OnboardingCapabilities {
  return {
    can_manage: access.canManage,
    can_update_finance: access.canUpdateFinance,
    can_update_support: access.canUpdateSupport,
    can_upload_contract: access.canUploadContract,
    editable_checklist_item_ids: checklistItems
      .filter(
        (item) =>
          !isSharedOnboardingAutomationKey(item.automation_key) &&
          sharedOnboardingItemIsUnlocked(checklistItems, item.automation_key) &&
          (isSharedOnboardingSchedulingKey(item.automation_key)
            ? access.canScheduleChecklistItem(item)
            : access.canUpdateChecklistItem(item)),
      )
      .map((item) => item.id),
  };
}

export function redactOnboardingContracts<
  T extends { contracts?: Array<Record<string, unknown>> },
>(onboarding: T, canViewPrivateContract: boolean) {
  if (canViewPrivateContract) return onboarding;
  return {
    ...onboarding,
    contracts: onboarding.contracts?.map((contract) => ({
      id: contract.id,
      onboarding_id: contract.onboarding_id,
      workspace_id: contract.workspace_id,
      company_id: contract.company_id,
      project_id: contract.project_id,
      file_name: contract.file_name,
      status: contract.status,
      visibility: contract.visibility,
      uploaded_by: contract.uploaded_by,
      uploaded_at: contract.uploaded_at,
      created_at: contract.created_at,
      uploader: contract.uploader,
      private: true,
    })),
  };
}
