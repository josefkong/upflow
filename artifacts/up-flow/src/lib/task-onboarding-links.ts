import { prisma } from "@/lib/prisma";
import type { TaskOnboardingAction, TaskOnboardingLink } from "@/lib/types";
import { isFinanceCampaignStartedAutomationKey } from "@/lib/onboarding-routing";
import { onboardingMeetingName } from "@/lib/onboarding-meeting-copy";

type RawOnboardingChecklistLink = {
  id: string;
  task_id?: string | null;
  onboarding_id: string;
  department: string;
  title: string;
  automation_key: string | null;
  status: string;
  onboarding: {
    company_id: string;
    progress: number;
    company: { name: string };
    meetings?: Array<{
      id: string;
      scheduled: boolean;
      scheduled_at: Date | string | null;
      checklist_item: {
        title: string;
        automation_key: string | null;
        sort_order: number;
      } | null;
    }>;
  };
  marketing_b2b_form?: { id: string } | null;
  marketing_b2c_form?: { id: string } | null;
  meetings?: Array<{ id: string; service: string | null }>;
};

function normalized(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function actionForOnboardingLink(link: RawOnboardingChecklistLink): TaskOnboardingAction | null {
  const department = normalized(link.department);
  const title = normalized(link.title);

  if (link.automation_key === "up_zero_website_configuration") {
    return null;
  }

  if (isFinanceCampaignStartedAutomationKey(link.automation_key)) {
    return null;
  }

  if (link.marketing_b2b_form) {
    return {
      kind: "form",
      form_kind: "marketing_b2b",
      label: "Open Marketing B2B form",
    };
  }

  if (link.marketing_b2c_form) {
    return {
      kind: "form",
      form_kind: "marketing_b2c",
      label: "Open Marketing B2C form",
    };
  }

  if (department === "finance" || department === "contract") {
    return {
      kind: "form",
      form_kind: "finance",
      label: department === "contract" ? "Open finance contract form" : "Open finance form",
    };
  }

  if (department === "support") {
    return {
      kind: "form",
      form_kind: "support",
      label: "Open support setup",
    };
  }

  if ((link.meetings?.length ?? 0) > 0) {
    return {
      kind: "calendar",
      label: title.includes("visit") || title.includes("visita")
        ? "Schedule technical visit"
        : "Schedule onboarding meeting",
    };
  }

  return null;
}

export function buildTaskOnboardingLink(link: RawOnboardingChecklistLink): TaskOnboardingLink {
  return {
    id: link.id,
    onboarding_id: link.onboarding_id,
    company_id: link.onboarding.company_id,
    company_name: link.onboarding.company.name,
    department: link.department,
    title: link.title,
    automation_key: link.automation_key,
    status: link.status,
    progress: link.onboarding.progress,
    href: `/clients/${link.onboarding.company_id}`,
    action: actionForOnboardingLink(link),
    scheduling: (link.onboarding.meetings ?? [])
      .filter((meeting) =>
        meeting.checklist_item?.automation_key?.startsWith(
          "shared_onboarding:scheduling:",
        ),
      )
      .sort(
        (left, right) =>
          (left.checklist_item?.sort_order ?? 0) -
          (right.checklist_item?.sort_order ?? 0),
      )
      .map((meeting) => ({
        id: meeting.id,
        title: onboardingMeetingName({
          automationKey: meeting.checklist_item?.automation_key,
        }),
        scheduled: meeting.scheduled,
        scheduled_at: meeting.scheduled_at
          ? new Date(meeting.scheduled_at).toISOString()
          : null,
      })),
  };
}

export async function loadTaskOnboardingLinkMap(taskIds: string[]) {
  const uniqueTaskIds = Array.from(new Set(taskIds.filter(Boolean)));
  const byTaskId = new Map<string, TaskOnboardingLink>();
  if (uniqueTaskIds.length === 0) return byTaskId;

  const links = await prisma.onboardingChecklistItem.findMany({
    where: { task_id: { in: uniqueTaskIds } },
    select: {
      id: true,
      task_id: true,
      onboarding_id: true,
      department: true,
      title: true,
      automation_key: true,
      status: true,
      onboarding: {
        select: {
          company_id: true,
          progress: true,
          company: { select: { name: true } },
          meetings: {
            orderBy: [{ created_at: "asc" }],
            select: {
              id: true,
              scheduled: true,
              scheduled_at: true,
              checklist_item: {
                select: {
                  title: true,
                  automation_key: true,
                  sort_order: true,
                },
              },
            },
          },
        },
      },
      marketing_b2b_form: { select: { id: true } },
      marketing_b2c_form: { select: { id: true } },
      meetings: { select: { id: true, service: true } },
    },
  });

  for (const link of links) {
    if (!link.task_id) continue;
    byTaskId.set(link.task_id, buildTaskOnboardingLink(link));
  }

  return byTaskId;
}

export function attachTaskOnboardingLink<T extends { id: string }>(
  task: T,
  onboardingLinkByTaskId: Map<string, TaskOnboardingLink>,
) {
  return { ...task, onboarding_link: onboardingLinkByTaskId.get(task.id) ?? null };
}
