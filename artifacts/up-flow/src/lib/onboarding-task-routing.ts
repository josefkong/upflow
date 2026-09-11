import type { Task, TaskOnboardingFormKind } from "@/lib/types";
import {
  isFinanceCampaignStartedAutomationKey,
  routeForOnboardingChecklistItem,
} from "@/lib/onboarding-routing";
import {
  onboardingMeetingName,
  onboardingMeetingTitle,
} from "@/lib/onboarding-meeting-copy";

const UP_ZERO_CONFIGURATION_AUTOMATION_KEY = "up_zero_website_configuration";
const UP_ZERO_CONFIGURATION_TASK_TITLE = "configure up zero website";
const SHARED_ONBOARDING_TASK_AUTOMATION_KEY = "shared_onboarding:task";

export type WorkflowFormKind = TaskOnboardingFormKind;

export type OnboardingTaskAction =
  | { kind: "form"; href: string; formKind: WorkflowFormKind }
  | { kind: "calendar"; href: string };

function taskSearchText(task: Task) {
  return [
    task.title,
    task.description,
    task.onboarding_link?.department,
    task.onboarding_link?.title,
    task.onboarding_link?.company_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isFinanceOnboardingTask(task: Task) {
  if (isFinanceCampaignStartedAutomationKey(task.onboarding_link?.automation_key)) {
    return false;
  }

  if (task.onboarding_link) {
    return routeForOnboardingChecklistItem({
      department: task.onboarding_link.department,
    }) === "finance";
  }

  const text = taskSearchText(task);
  return (
    text.includes("finance") ||
    text.includes("financial") ||
    text.includes("cadastro financeiro") ||
    text.includes("billing") ||
    text.includes("faturamento") ||
    text.includes("company registration")
  );
}

function isSchedulingOnboardingTask(task: Task) {
  const text = taskSearchText(task);
  return (
    text.includes("schedule") ||
    text.includes("scheduled") ||
    text.includes("meeting") ||
    text.includes("kickoff") ||
    text.includes("reuni") ||
    text.includes("visita") ||
    text.includes("agenda")
  );
}

function isUpZeroConfigurationTask(task: Task) {
  return Boolean(
    task.onboarding_link?.automation_key === UP_ZERO_CONFIGURATION_AUTOMATION_KEY ||
      task.title.trim().toLowerCase() === UP_ZERO_CONFIGURATION_TASK_TITLE,
  );
}

function isSupportGroupOnboardingTask(task: Task) {
  if (isUpZeroConfigurationTask(task)) return false;
  const text = taskSearchText(task);
  const hasGroupSignal =
    text.includes("client channels") ||
    text.includes("client communication") ||
    text.includes("communication group") ||
    text.includes("support group") ||
    text.includes("whatsapp") ||
    text.includes("grupo");
  return Boolean(
    hasGroupSignal ||
      (text.includes("technical support") &&
        text.includes("onboarding") &&
        !isSchedulingOnboardingTask(task)),
  );
}

function isMarketingB2BFormTask(task: Task) {
  const text = taskSearchText(task);
  const hasFormSignal =
    text.includes("form") ||
    text.includes("formulario") ||
    text.includes("formulário") ||
    text.includes("onboarding marketing b2b") ||
    text.includes("marketing b2b onboarding");
  return text.includes("marketing b2b") && hasFormSignal && !isSchedulingOnboardingTask(task);
}

function isMarketingB2CFormTask(task: Task) {
  const text = taskSearchText(task);
  const hasFormSignal =
    text.includes("form") ||
    text.includes("formulario") ||
    text.includes("formulÃ¡rio") ||
    text.includes("onboarding marketing b2c") ||
    text.includes("marketing b2c onboarding");
  return text.includes("marketing b2c") && hasFormSignal && !isSchedulingOnboardingTask(task);
}

export function workflowFormKind(task: Task): WorkflowFormKind | null {
  if (
    task.commercial_lead ||
    task.commercial_follow_up ||
    task.commercial_contract_handoff ||
    task.commercial_finance_contract
  ) {
    return null;
  }
  if (isUpZeroConfigurationTask(task)) return null;
  const explicitAction = task.onboarding_link?.action;
  if (explicitAction?.kind === "form") return explicitAction.form_kind;

  if (task.marketing_b2b_onboarding_form) return "marketing_b2b";
  if (isMarketingB2BFormTask(task)) return "marketing_b2b";
  if (task.marketing_b2c_onboarding_form) return "marketing_b2c";
  if (isMarketingB2CFormTask(task)) return "marketing_b2c";
  if (isFinanceOnboardingTask(task)) return "finance";
  if (isSupportGroupOnboardingTask(task)) return "support";
  return null;
}

function workflowFormHref(task: Task, fallbackProjectId?: string | null) {
  const projectId = task.project_id ?? fallbackProjectId;
  return projectId ? `/projects/${projectId}?view=form&task=${task.id}` : null;
}

function meetingKind(task: Task) {
  return onboardingMeetingName({
    automationKey: task.onboarding_link?.automation_key,
    department: task.onboarding_link?.department,
  });
}

function meetingTitle(task: Task) {
  const company = task.onboarding_link?.company_name?.trim();
  if (company) {
    return onboardingMeetingTitle({
      companyName: company,
      automationKey: task.onboarding_link?.automation_key,
      department: task.onboarding_link?.department,
    });
  }
  return meetingKind(task);
}

function meetingDescription(task: Task) {
  const company = task.onboarding_link?.company_name?.trim();
  const department = task.onboarding_link?.department?.trim();
  const responsible = [task.assignee?.name, task.assignee?.email]
    .filter(Boolean)
    .join(" ");
  return [
    company ? `Client: ${company}` : null,
    department ? `Department: ${department}` : null,
    `Meeting type: ${meetingKind(task)}`,
    responsible ? `Responsible: ${responsible}` : null,
    "Agenda: align goals, accesses, communication rhythm, blockers, and next steps.",
    task.description ? `Task notes: ${task.description}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function calendarHrefForTask(task: Task, fallbackProjectId?: string | null) {
  const params = new URLSearchParams({
    create: "meeting",
    task: task.id,
    title: meetingTitle(task),
  });
  const projectId = task.project_id ?? fallbackProjectId;
  if (projectId) params.set("project", projectId);
  params.set("description", meetingDescription(task));
  if (task.assignee_id) params.set("attendees", task.assignee_id);
  return `/calendar?${params.toString()}`;
}

export function getOnboardingTaskAction(
  task: Task,
  fallbackProjectId?: string | null,
): OnboardingTaskAction | null {
  if (task.commercial_lead || task.commercial_follow_up) return null;
  if (isUpZeroConfigurationTask(task)) return null;
  if (
    task.onboarding_link?.automation_key ===
    SHARED_ONBOARDING_TASK_AUTOMATION_KEY
  ) {
    return null;
  }

  const explicitAction = task.onboarding_link?.action;
  if (explicitAction?.kind === "form") {
    const href = workflowFormHref(task, fallbackProjectId);
    return href ? { kind: "form", href, formKind: explicitAction.form_kind } : null;
  }
  if (explicitAction?.kind === "calendar") {
    return { kind: "calendar", href: calendarHrefForTask(task, fallbackProjectId) };
  }

  const formKind = workflowFormKind(task);
  if (formKind) {
    const href = workflowFormHref(task, fallbackProjectId);
    return href ? { kind: "form", href, formKind } : null;
  }
  if (isSchedulingOnboardingTask(task)) {
    return { kind: "calendar", href: calendarHrefForTask(task, fallbackProjectId) };
  }
  return null;
}
