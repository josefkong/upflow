"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Loader2,
  RefreshCcw,
  Send,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import StartClientOnboardingDialog from "@/components/onboarding/start-client-onboarding-dialog";
import type {
  ClientOnboarding,
  Company,
  Department,
  OnboardingChecklistItem,
  OnboardingServiceAssignment,
  TeamMember,
} from "@/lib/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import {
  isSharedOnboardingSchedulingKey,
  sharedOnboardingStageLabel,
} from "@/lib/onboarding-stages";
import {
  onboardingMeetingName,
  onboardingMeetingTitle,
} from "@/lib/onboarding-meeting-copy";

type Props = {
  companyId?: string | null;
  projectId?: string | null;
  company?: Partial<Company> | null;
  onChanged?: () => void | Promise<void>;
};

type OnboardingResponse = { items?: ClientOnboarding[] };
type TeamOverviewResponse = {
  current_role?: "owner" | "admin" | "member" | "guest" | null;
  is_super_admin?: boolean;
  members?: TeamMember[];
  departments?: Department[];
};

const SHARED_ONBOARDING_WHATSAPP_GROUP_KEY =
  "shared_onboarding:internal:01:commercial-whatsapp-group";

function statusLabel(status: string, t: (key: string) => string) {
  const key = `onboardingWorkflow.status.${status}`;
  const value = t(key);
  return value === key ? status.replaceAll("_", " ") : value;
}

function statusClass(status: string) {
  if (status === "onboarding_complete" || status === "complete")
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
  if (status === "onboarding_in_progress" || status === "in_progress")
    return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-100";
  return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-100";
}

const MARKETING_B2B_SUMMARY_SECTIONS = [
  {
    key: "brand",
    fields: [
      "brandName",
      "officialSite",
      "instagram",
      "marketYears",
      "brandDescription",
    ],
  },
  {
    key: "commercialRules",
    fields: [
      "minimumOrder",
      "paymentMethods",
      "discountPolicy",
      "commercialRestrictions",
      "allowedAudience",
    ],
  },
  {
    key: "contacts",
    fields: [
      "trafficResponsibleName",
      "trafficResponsibleRole",
      "whatsapp",
      "email",
      "creativeApprovalResponsible",
    ],
  },
  {
    key: "access",
    fields: [
      "metaAdsAccess",
      "ga4Access",
      "ecommercePlatformAccess",
      "ecommercePlatformUser",
      "domainAccess",
      "domainAccessType",
      "dashboardAccess",
    ],
  },
];

const MARKETING_B2B_PROGRESS_FIELDS = [
  ...MARKETING_B2B_SUMMARY_SECTIONS.flatMap((section) => section.fields),
  "targetAudience",
  "purchaseChannels",
  "physicalStore",
  "physicalStoreAddress",
];

const MARKETING_B2C_SUMMARY_SECTIONS = [
  {
    key: "brand",
    fields: [
      "brandName",
      "officialSite",
      "instagram",
      "brandSince",
      "digitalSince",
      "brandDescription",
    ],
  },
  {
    key: "currentMoment",
    fields: [
      "currentMoment",
      "topProducts",
      "averageTicket",
      "monthlyRevenue",
      "monthlyBudget",
    ],
  },
  {
    key: "audience",
    fields: ["targetAudience", "ageRange", "regions", "purchaseMotivation"],
  },
  {
    key: "ecommerce",
    fields: [
      "ecommercePlatform",
      "storeUrl",
      "catalogStatus",
      "feedStockStatus",
      "checkoutPaymentNotes",
    ],
  },
  {
    key: "traffic",
    fields: [
      "metaPixelStatus",
      "googleAdsStatus",
      "mediaBudgetMeta",
      "mediaBudgetGoogle",
      "campaignGoals",
    ],
  },
  {
    key: "people",
    fields: [
      "marketingResponsible",
      "ecommerceResponsible",
      "creativeApprover",
      "whatsapp",
      "email",
    ],
  },
];

const MARKETING_B2C_PROGRESS_FIELDS = MARKETING_B2C_SUMMARY_SECTIONS.flatMap(
  (section) => section.fields,
);

function countFilled(
  values: Record<string, string> | null | undefined,
  fields: string[],
) {
  return fields.filter((field) => String(values?.[field] ?? "").trim()).length;
}

function checklistSearchText(item: OnboardingChecklistItem) {
  return [item.department, item.title, item.task?.title, item.task?.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isFinanceChecklistItem(item: OnboardingChecklistItem) {
  const text = checklistSearchText(item);
  return (
    text.includes("finance") ||
    text.includes("financeiro") ||
    text.includes("cadastro") ||
    text.includes("billing") ||
    text.includes("faturamento") ||
    text.includes("cnpj")
  );
}

function isContractChecklistItem(item: OnboardingChecklistItem) {
  const text = checklistSearchText(item);
  return text.includes("contract") || text.includes("contrato");
}

function isSchedulingChecklistItem(item: OnboardingChecklistItem) {
  const text = checklistSearchText(item);
  return (
    text.includes("schedule") ||
    text.includes("meeting") ||
    text.includes("reuni") ||
    text.includes("visita") ||
    text.includes("agenda")
  );
}

function taskFormHref(item: OnboardingChecklistItem) {
  const task = item.task;
  const taskId = item.task_id ?? task?.id;
  return task?.project_id && taskId
    ? `/projects/${task.project_id}?view=form&task=${taskId}`
    : null;
}

function scheduleTaskHref(
  item: OnboardingChecklistItem,
  onboarding: ClientOnboarding,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  const sharedTask = onboarding.checklist_items?.find(
    (candidate) =>
      candidate.automation_key === "shared_onboarding:task" && candidate.task,
  )?.task;
  const task = item.task ?? sharedTask;
  const taskId = item.task_id ?? task?.id;
  if (!task?.project_id || !taskId) return null;
  const companyName = onboarding.company?.name ?? t("socialCalendar.client");
  const title = encodeURIComponent(
    onboardingMeetingTitle({
      companyName,
      automationKey: item.automation_key,
      department: item.department,
    }),
  );
  const description = encodeURIComponent(
    t("onboardingWorkflow.meetingDescription", {
      client: companyName,
      department: item.department,
    }),
  );
  const attendees = item.owner_id
    ? `&attendees=${encodeURIComponent(item.owner_id)}`
    : "";
  return `/calendar?create=meeting&task=${taskId}&project=${task.project_id}&onboarding_item=${item.id}&title=${title}&description=${description}${attendees}`;
}
const SUPPORT_STATUS_OPTIONS = [
  {
    value: "not_created",
    labelKey: "onboardingWorkflow.supportStatusNotCreated",
  },
  { value: "created", labelKey: "onboardingWorkflow.supportStatusCreated" },
  {
    value: "waiting_for_client",
    labelKey: "onboardingWorkflow.supportStatusWaiting",
  },
  {
    value: "not_necessary",
    labelKey: "onboardingWorkflow.supportStatusNotNecessary",
  },
] as const;

type SupportStatus = (typeof SUPPORT_STATUS_OPTIONS)[number]["value"];

function supportStatusValue(value: string | null | undefined): SupportStatus {
  return SUPPORT_STATUS_OPTIONS.some((option) => option.value === value)
    ? (value as SupportStatus)
    : "not_created";
}

function listToInput(value: string[] | null | undefined) {
  return Array.isArray(value) ? value.join(", ") : "";
}

function inputToList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function nullableList(value: string[]) {
  return value.length > 0 ? value : null;
}
export default function ClientOnboardingPanel({
  companyId,
  projectId,
  company,
  onChanged,
}: Props) {
  const { language, t } = useLanguage();
  const [onboarding, setOnboarding] = useState<ClientOnboarding | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [canStartClientOnboarding, setCanStartClientOnboarding] =
    useState(false);
  const [showStartClientOnboardingDialog, setShowStartClientOnboardingDialog] =
    useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [teamOptions, setTeamOptions] = useState<{
    members: TeamMember[];
    departments: Department[];
    isAdmin: boolean;
  }>({ members: [], departments: [], isAdmin: false });
  const [support, setSupport] = useState({
    group_name: "",
    group_link: "",
    main_client_contact: "",
    client_participants: "",
    internal_participants: "",
    commercial_responsible: "",
    account_responsible: "",
    status: "not_created" as SupportStatus,
    notes: "",
  });
  const [assignmentDrafts, setAssignmentDrafts] = useState<
    Record<string, { leader_id: string; department_id: string; notes: string }>
  >({});
  const [overrideReason, setOverrideReason] = useState("");

  const canManageOnboarding = Boolean(onboarding?.capabilities?.can_manage);
  const canUpdateSupport = Boolean(
    onboarding?.capabilities?.can_update_support,
  );
  const editableChecklistItemIds = useMemo(
    () => onboarding?.capabilities?.editable_checklist_item_ids ?? [],
    [onboarding?.capabilities?.editable_checklist_item_ids],
  );

  const load = async (options?: { silent?: boolean }) => {
    if (!companyId && !projectId) return;
    if (!options?.silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (companyId) params.set("company_id", companyId);
      if (projectId) params.set("project_id", projectId);
      const res = await fetch(`/api/onboarding?${params.toString()}`);
      if (!res.ok) throw new Error(t("onboardingWorkflow.loadFailed"));
      const payload = (await res.json()) as OnboardingResponse;
      const first = payload.items?.[0] ?? null;
      setOnboarding(first);
      const supportGroup = first?.support_group;
      const companyName = first?.company?.name ?? "";
      const internalParticipantNames = Array.from(
        new Set(
          (first?.checklist_items ?? [])
            .filter(
              (item) =>
                item.automation_key?.startsWith("shared_onboarding:") &&
                item.automation_key !== "shared_onboarding:task",
            )
            .map((item) => item.owner?.name?.trim())
            .filter((name): name is string => Boolean(name)),
        ),
      );
      const savedInternalParticipants = listToInput(
        supportGroup?.internal_participants,
      );
      setSupport({
        group_name:
          supportGroup?.group_name ??
          (companyName ? `${companyName} - WhatsApp` : ""),
        group_link: supportGroup?.group_link ?? "",
        main_client_contact: supportGroup?.main_client_contact ?? "",
        client_participants: listToInput(supportGroup?.client_participants),
        internal_participants:
          savedInternalParticipants || internalParticipantNames.join(", "),
        commercial_responsible:
          supportGroup?.commercial_responsible ??
          first?.salesperson?.name ??
          "",
        account_responsible: supportGroup?.account_responsible ?? "",
        status: supportStatusValue(
          supportGroup?.status ??
            (supportGroup?.group_created ? "created" : "not_created"),
        ),
        notes: supportGroup?.notes ?? "",
      });
      setAssignmentDrafts(
        Object.fromEntries(
          (first?.service_assignments ?? []).map((assignment) => [
            assignment.service,
            {
              leader_id: assignment.leader_id ?? "",
              department_id: assignment.department_id ?? "",
              notes: assignment.notes ?? "",
            },
          ]),
        ),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("onboardingWorkflow.loadFailed"),
      );
    } finally {
      if (!options?.silent) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, projectId]);

  useEffect(() => {
    let ignore = false;
    const loadTeamOptions = async () => {
      try {
        const res = await fetch("/api/team/overview");
        if (!res.ok) return;
        const data = (await res.json()) as TeamOverviewResponse;
        if (ignore) return;
        const currentRole = data.current_role ?? null;
        setTeamOptions({
          members: (data.members ?? []).filter(
            (member) =>
              member.workspace_status === "active" &&
              member.workspace_role !== "guest",
          ),
          departments: data.departments ?? [],
          isAdmin: Boolean(
            data.is_super_admin ||
            currentRole === "owner" ||
            currentRole === "admin",
          ),
        });
      } catch {
        if (!ignore)
          setTeamOptions({ members: [], departments: [], isAdmin: false });
      }
    };
    void loadTeamOptions();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    const loadCompanyAccess = async () => {
      try {
        const res = await fetch("/api/companies/access", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { can_start_onboarding?: boolean };
        if (!ignore)
          setCanStartClientOnboarding(data.can_start_onboarding === true);
      } catch {
        if (!ignore) setCanStartClientOnboarding(false);
      }
    };
    void loadCompanyAccess();
    return () => {
      ignore = true;
    };
  }, []);

  const groupedItems = useMemo(() => {
    const sharedItems = (onboarding?.checklist_items ?? [])
      .filter(
        (item) =>
          item.automation_key !== "shared_onboarding:task" &&
          sharedOnboardingStageLabel(item.automation_key),
      )
      .sort((left, right) => left.sort_order - right.sort_order);
    if (sharedItems.length > 0) {
      return sharedItems.map((item, index) => [
        `${sharedOnboardingStageLabel(item.automation_key)} · Passo ${index + 1}`,
        [item],
      ]) as Array<[string, OnboardingChecklistItem[]]>;
    }

    const groups = new Map<string, OnboardingChecklistItem[]>();
    for (const item of onboarding?.checklist_items ?? []) {
      if (item.automation_key === "shared_onboarding:task") continue;
      const current = groups.get(item.department) ?? [];
      current.push(item);
      groups.set(item.department, current);
    }
    return Array.from(groups.entries());
  }, [onboarding]);

  const missingMappings = useMemo(
    () =>
      (onboarding?.service_assignments ?? []).filter(
        (assignment) =>
          assignment.status === "needs_mapping" || !assignment.leader_id,
      ),
    [onboarding],
  );

  const marketingB2BSummary = useMemo(() => {
    const item =
      onboarding?.checklist_items?.find(
        (checklistItem) => checklistItem.marketing_b2b_form,
      ) ?? null;
    const form =
      item?.marketing_b2b_form ?? onboarding?.marketing_b2b_forms?.[0] ?? null;
    if (!form) return null;
    const values = form.values ?? {};
    const filled = countFilled(values, MARKETING_B2B_PROGRESS_FIELDS);
    const progress =
      MARKETING_B2B_PROGRESS_FIELDS.length > 0
        ? Math.round((filled / MARKETING_B2B_PROGRESS_FIELDS.length) * 100)
        : 0;
    const missingSections = MARKETING_B2B_SUMMARY_SECTIONS.filter(
      (section) => countFilled(values, section.fields) < section.fields.length,
    ).map((section) => t(`marketingB2BForm.section.${section.key}`));
    const task = form.task ?? item?.task ?? null;
    const formTaskId = form.task_id ?? task?.id ?? item?.task_id ?? null;
    const formProjectId = form.task?.project_id ?? task?.project_id ?? null;
    return {
      form,
      item,
      href:
        formProjectId && formTaskId
          ? `/projects/${formProjectId}?view=form&task=${formTaskId}`
          : null,
      owner:
        task?.assignee?.name ??
        item?.owner?.name ??
        t("companyDialog.notAssigned"),
      progress: form.status === "complete" ? 100 : progress,
      updatedAt: form.updated_at ?? form.completed_at ?? null,
      missingSections,
    };
  }, [onboarding, t]);

  const marketingB2CSummary = useMemo(() => {
    const item =
      onboarding?.checklist_items?.find(
        (checklistItem) => checklistItem.marketing_b2c_form,
      ) ?? null;
    const form =
      item?.marketing_b2c_form ?? onboarding?.marketing_b2c_forms?.[0] ?? null;
    if (!form) return null;
    const values = form.values ?? {};
    const filled = countFilled(values, MARKETING_B2C_PROGRESS_FIELDS);
    const progress =
      MARKETING_B2C_PROGRESS_FIELDS.length > 0
        ? Math.round((filled / MARKETING_B2C_PROGRESS_FIELDS.length) * 100)
        : 0;
    const missingSections = MARKETING_B2C_SUMMARY_SECTIONS.filter(
      (section) => countFilled(values, section.fields) < section.fields.length,
    ).map((section) => t(`marketingB2CForm.section.${section.key}`));
    const task = form.task ?? item?.task ?? null;
    const formTaskId = form.task_id ?? task?.id ?? item?.task_id ?? null;
    const formProjectId = form.task?.project_id ?? task?.project_id ?? null;
    return {
      form,
      item,
      href:
        formProjectId && formTaskId
          ? `/projects/${formProjectId}?view=form&task=${formTaskId}`
          : null,
      owner:
        task?.assignee?.name ??
        item?.owner?.name ??
        t("companyDialog.notAssigned"),
      progress: form.status === "complete" ? 100 : progress,
      updatedAt: form.updated_at ?? form.completed_at ?? null,
      missingSections,
    };
  }, [onboarding, t]);

  const schedulingItems = useMemo(
    () =>
      (onboarding?.checklist_items ?? []).filter(
        (item) =>
          isSchedulingChecklistItem(item) &&
          (!sharedOnboardingStageLabel(item.automation_key) ||
            isSharedOnboardingSchedulingKey(item.automation_key)),
      ),
    [onboarding],
  );

  const financeRoutingItems = useMemo(
    () =>
      (onboarding?.checklist_items ?? []).filter(
        (item) => isFinanceChecklistItem(item) || isContractChecklistItem(item),
      ),
    [onboarding],
  );

  const refresh = async () => {
    await load({ silent: true });
    await onChanged?.();
  };

  const start = async () => {
    if (!projectId) return;
    setStarting(true);
    try {
      const res = await fetch("/api/onboarding/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t("onboardingWorkflow.startFailed"));
      }
      toast.success(t("onboardingWorkflow.started"));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
      }
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("onboardingWorkflow.startFailed"),
      );
    } finally {
      setStarting(false);
    }
  };

  const updateItem = async (
    item: OnboardingChecklistItem,
    status: "pending" | "in_progress" | "complete",
  ) => {
    if (!onboarding || !editableChecklistItemIds.includes(item.id)) return;
    setSaving(item.id);
    try {
      const res = await fetch(
        `/api/onboarding/${onboarding.id}/items/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t("onboardingWorkflow.updateFailed"));
      }
      toast.success(t("onboardingWorkflow.updated"));
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("onboardingWorkflow.updateFailed"),
      );
    } finally {
      setSaving(null);
    }
  };

  const saveSupport = async () => {
    if (!onboarding || !canUpdateSupport) return;
    const clientParticipants = inputToList(support.client_participants);
    const internalParticipants = inputToList(support.internal_participants);
    const mainContact = support.main_client_contact.trim();
    if (mainContact && !clientParticipants.includes(mainContact)) {
      clientParticipants.unshift(mainContact);
    }
    if (
      support.status === "created" &&
      (!support.group_name.trim() ||
        !support.group_link.trim() ||
        internalParticipants.length === 0 ||
        clientParticipants.length === 0)
    ) {
      toast.error(t("onboardingWorkflow.groupRequiredFields"));
      return;
    }
    setSaving("support");
    try {
      const res = await fetch(`/api/onboarding/${onboarding.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          support_group: {
            group_created: support.status === "created",
            status: support.status,
            group_name: support.group_name || null,
            group_link: support.group_link || null,
            main_client_contact: mainContact || null,
            internal_participants: nullableList(internalParticipants),
            client_participants: nullableList(clientParticipants),
            commercial_responsible: support.commercial_responsible || null,
            account_responsible: support.account_responsible || null,
            notes: support.notes || null,
          },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t("onboardingWorkflow.supportFailed"));
      }
      toast.success(t("onboardingWorkflow.supportSaved"));
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("onboardingWorkflow.supportFailed"),
      );
    } finally {
      setSaving(null);
    }
  };

  const saveServiceAssignment = async (
    assignment: OnboardingServiceAssignment,
  ) => {
    if (!onboarding || !canManageOnboarding) return;
    const draft = assignmentDrafts[assignment.service] ?? {
      leader_id: "",
      department_id: "",
      notes: "",
    };
    setSaving(`assignment:${assignment.id}`);
    try {
      const res = await fetch(`/api/onboarding/${onboarding.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_assignment: {
            service: assignment.service,
            leader_id: draft.leader_id || null,
            department_id: draft.department_id || null,
            notes: draft.notes || null,
          },
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t("onboardingWorkflow.assignmentFailed"));
      }
      toast.success(t("onboardingWorkflow.assignmentSaved"));
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("onboardingWorkflow.assignmentFailed"),
      );
    } finally {
      setSaving(null);
    }
  };

  const overrideCompletion = async () => {
    if (!onboarding || !canManageOnboarding) return;
    const reason = overrideReason.trim();
    if (reason.length < 8) {
      toast.error(t("onboardingWorkflow.overrideReasonRequired"));
      return;
    }
    setSaving("completion-override");
    try {
      const res = await fetch(`/api/onboarding/${onboarding.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completion_override: { reason } }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t("onboardingWorkflow.overrideFailed"));
      }
      toast.success(t("onboardingWorkflow.overrideSaved"));
      setOverrideReason("");
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t("onboardingWorkflow.overrideFailed"),
      );
    } finally {
      setSaving(null);
    }
  };

  const renderServiceAssignmentControls = (compact = false) => (
    <div
      className={cn(
        "space-y-2",
        compact &&
          "mt-3 rounded-lg border border-blue-300/10 bg-blue-500/[0.15] p-3",
      )}
    >
      <p className="text-xs text-muted-foreground">
        {canManageOnboarding
          ? t("onboardingWorkflow.assignmentsHint")
          : t("onboardingWorkflow.adminOnlyAssignments")}
      </p>
      {(onboarding?.service_assignments ?? []).length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground dark:border-white/10 dark:bg-white/[0.15]">
          {t("onboardingWorkflow.noServiceAssignments")}
        </div>
      )}
      {(onboarding?.service_assignments ?? []).map((assignment) => {
        const draft = assignmentDrafts[assignment.service] ?? {
          leader_id: assignment.leader_id ?? "",
          department_id: assignment.department_id ?? "",
          notes: assignment.notes ?? "",
        };
        return (
          <div
            key={assignment.id}
            className="grid min-w-0 gap-2 rounded-lg border border-border bg-muted/30 p-2 dark:border-white/[0.15] dark:bg-[#050a18]/75 lg:grid-cols-[minmax(120px,0.9fr)_minmax(120px,1fr)_minmax(120px,1fr)_auto]"
          >
            <div className="min-w-0">
              <p
                className="truncate text-sm font-semibold text-foreground"
                title={assignment.service}
              >
                {assignment.service}
              </p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="truncate text-xs text-muted-foreground">
                  {assignment.leader?.name ?? t("companyDialog.notAssigned")}
                  {assignment.department?.name || assignment.department_name
                    ? ` - ${assignment.department?.name ?? assignment.department_name}`
                    : ""}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    statusClass(assignment.status),
                  )}
                >
                  {statusLabel(assignment.status, t)}
                </span>
              </div>
            </div>
            <select
              value={draft.department_id}
              disabled={!canManageOnboarding}
              title={t("companyDialog.responsibleDepartment")}
              onChange={(event) =>
                setAssignmentDrafts((current) => ({
                  ...current,
                  [assignment.service]: {
                    ...draft,
                    department_id: event.target.value,
                  },
                }))
              }
              className="h-10 min-w-0 rounded-lg border border-border bg-background px-2 text-sm font-semibold text-foreground outline-none focus:border-blue-400 disabled:opacity-60 dark:border-white/10 dark:bg-[#0b1223]"
            >
              <option value="">
                {t("onboardingWorkflow.departmentShort")}
              </option>
              {teamOptions.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <select
              value={draft.leader_id}
              disabled={!canManageOnboarding}
              title={t("companyDialog.assigneeOwner")}
              onChange={(event) =>
                setAssignmentDrafts((current) => ({
                  ...current,
                  [assignment.service]: {
                    ...draft,
                    leader_id: event.target.value,
                  },
                }))
              }
              className="h-10 min-w-0 rounded-lg border border-border bg-background px-2 text-sm font-semibold text-foreground outline-none focus:border-blue-400 disabled:opacity-60 dark:border-white/10 dark:bg-[#0b1223]"
            >
              <option value="">{t("onboardingWorkflow.leaderShort")}</option>
              {teamOptions.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => saveServiceAssignment(assignment)}
              disabled={
                !canManageOnboarding || saving === `assignment:${assignment.id}`
              }
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-500 px-3 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-60"
            >
              {saving === `assignment:${assignment.id}` ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t("common.save")}
            </button>
          </div>
        );
      })}
    </div>
  );

  if (loading) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5 dark:border-blue-300/10 dark:bg-[#050a18]/50">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> {t("common.loading")}
        </div>
      </section>
    );
  }

  if (!onboarding) {
    return (
      <>
        <section className="rounded-2xl border border-border bg-card p-5 shadow-lg dark:border-blue-300/10 dark:bg-[#050a18]/50 dark:shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
                {t("onboardingWorkflow.eyebrow")}
              </p>
              <h3 className="mt-2 text-xl font-bold text-foreground">
                {t("onboardingWorkflow.emptyTitle")}
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                {companyId && !projectId
                  ? t("onboardingWorkflow.deferredEmptyBody")
                  : t("onboardingWorkflow.emptyBody")}
              </p>
            </div>
            {projectId && teamOptions.isAdmin && (
              <button
                onClick={start}
                disabled={starting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
              >
                {starting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ClipboardCheck className="h-4 w-4" />
                )}
                {t("onboardingWorkflow.start")}
              </button>
            )}
            {canStartClientOnboarding && companyId && !projectId && (
              <button
                onClick={() => setShowStartClientOnboardingDialog(true)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                <ClipboardCheck className="h-4 w-4" />
                {t("onboardingWorkflow.start")}
              </button>
            )}
          </div>
        </section>
        {companyId && (
          <StartClientOnboardingDialog
            open={showStartClientOnboardingDialog}
            companyId={companyId}
            company={company}
            onClose={() => setShowStartClientOnboardingDialog(false)}
            onStarted={refresh}
          />
        )}
      </>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-lg dark:border-blue-300/10 dark:bg-[#050a18]/50 dark:shadow-[0_24px_70px_rgba(0,0,0,0.24)] sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-300">
            {t("onboardingWorkflow.eyebrow")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h3 className="text-2xl font-bold text-foreground">
              {t("onboardingWorkflow.title")}
            </h3>
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-semibold capitalize",
                statusClass(onboarding.status),
              )}
            >
              {statusLabel(onboarding.status, t)}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {onboarding.company?.name}{" "}
            {onboarding.project?.name ? `- ${onboarding.project.name}` : ""}
          </p>
        </div>
        <button
          onClick={refresh}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted dark:border-blue-300/[0.15] dark:bg-white/5 dark:hover:bg-white/10"
        >
          <RefreshCcw className="h-4 w-4" /> {t("common.refresh")}
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric
          icon={<ClipboardCheck className="h-4 w-4" />}
          label={t("onboardingWorkflow.progress")}
          value={`${onboarding.progress}%`}
        />
        <Metric
          icon={<BriefcaseBusiness className="h-4 w-4" />}
          label={t("onboardingWorkflow.salesperson")}
          value={onboarding.salesperson?.name ?? t("companyDialog.notAssigned")}
        />
        <Metric
          icon={<CalendarClock className="h-4 w-4" />}
          label={t("onboardingWorkflow.expectedStart")}
          value={
            onboarding.expected_start_date
              ? formatDate(onboarding.expected_start_date, language)
              : t("clients.nextDeadlineNotSet")
          }
        />
        <Metric
          icon={<ShieldCheck className="h-4 w-4" />}
          label={t("onboardingWorkflow.contracts")}
          value={String(onboarding.contracts?.length ?? 0)}
        />
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted dark:bg-white/[0.15]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all"
          style={{ width: `${onboarding.progress}%` }}
        />
      </div>

      {missingMappings.length > 0 && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 p-3 text-sm text-amber-100">
          <p className="font-semibold">
            {t("onboardingWorkflow.missingMappingTitle")}
          </p>
          <p className="mt-1 text-amber-100/[0.65]">
            {t("onboardingWorkflow.missingMappingBody", {
              services: missingMappings
                .map((assignment) => assignment.service)
                .join(", "),
            })}
          </p>
        </div>
      )}

      {marketingB2BSummary && (
        <a
          href={marketingB2BSummary.href ?? undefined}
          className={cn(
            "group block rounded-2xl border border-border bg-gradient-to-br from-blue-500/[0.55] via-card to-cyan-500/[0.35] p-4 shadow-sm transition dark:border-blue-300/[0.15] dark:via-[#0b1325] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
            marketingB2BSummary.href &&
              "hover:border-sky-300/[0.35] hover:bg-blue-400/10",
          )}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">
                {t("marketingB2BForm.summaryEyebrow")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-bold text-foreground">
                  {t("marketingB2BForm.summaryTitle")}
                </h3>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    statusClass(marketingB2BSummary.form.status),
                  )}
                >
                  {marketingB2BSummary.form.status === "complete"
                    ? t("marketingB2BForm.status.complete")
                    : t("marketingB2BForm.status.draft")}
                </span>
              </div>
            </div>
            {marketingB2BSummary.href && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-700 group-hover:bg-blue-500/[0.15] dark:border-blue-300/20 dark:text-blue-100">
                <ExternalLink className="h-3.5 w-3.5" />
                {t("marketingB2BForm.openShort")}
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Metric
              icon={<ClipboardCheck className="h-4 w-4" />}
              label={t("marketingB2BForm.summaryProgress")}
              value={`${marketingB2BSummary.progress}%`}
            />
            <Metric
              icon={<Users className="h-4 w-4" />}
              label={t("marketingB2BForm.summaryOwner")}
              value={marketingB2BSummary.owner}
            />
            <Metric
              icon={<CalendarClock className="h-4 w-4" />}
              label={t("marketingB2BForm.summaryLastUpdated")}
              value={
                marketingB2BSummary.updatedAt
                  ? formatDate(marketingB2BSummary.updatedAt, language)
                  : "-"
              }
            />
            <Metric
              icon={<ShieldCheck className="h-4 w-4" />}
              label={t("marketingB2BForm.summaryMissing")}
              value={
                marketingB2BSummary.missingSections.length > 0
                  ? marketingB2BSummary.missingSections.join(", ")
                  : t("marketingB2BForm.missingNone")
              }
            />
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted dark:bg-white/[0.15]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all"
              style={{ width: `${marketingB2BSummary.progress}%` }}
            />
          </div>
        </a>
      )}

      {marketingB2CSummary && (
        <a
          href={marketingB2CSummary.href ?? undefined}
          className={cn(
            "group block rounded-2xl border border-border bg-gradient-to-br from-blue-500/[0.55] via-card to-cyan-500/[0.35] p-4 shadow-sm transition dark:border-blue-300/[0.15] dark:via-[#0b1325] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
            marketingB2CSummary.href &&
              "hover:border-sky-300/[0.35] hover:bg-blue-400/10",
          )}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-blue-300">
                {t("marketingB2CForm.summaryEyebrow")}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-bold text-foreground">
                  {t("marketingB2CForm.summaryTitle")}
                </h3>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                    statusClass(marketingB2CSummary.form.status),
                  )}
                >
                  {marketingB2CSummary.form.status === "complete"
                    ? t("marketingB2CForm.status.complete")
                    : t("marketingB2CForm.status.draft")}
                </span>
              </div>
            </div>
            {marketingB2CSummary.href && (
              <span className="inline-flex items-center gap-1 rounded-lg border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-700 group-hover:bg-blue-500/[0.15] dark:border-blue-300/20 dark:text-blue-100">
                <ExternalLink className="h-3.5 w-3.5" />
                {t("marketingB2CForm.openShort")}
              </span>
            )}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Metric
              icon={<ClipboardCheck className="h-4 w-4" />}
              label={t("marketingB2CForm.summaryProgress")}
              value={`${marketingB2CSummary.progress}%`}
            />
            <Metric
              icon={<Users className="h-4 w-4" />}
              label={t("marketingB2CForm.summaryOwner")}
              value={marketingB2CSummary.owner}
            />
            <Metric
              icon={<CalendarClock className="h-4 w-4" />}
              label={t("marketingB2CForm.summaryLastUpdated")}
              value={
                marketingB2CSummary.updatedAt
                  ? formatDate(marketingB2CSummary.updatedAt, language)
                  : "-"
              }
            />
            <Metric
              icon={<ShieldCheck className="h-4 w-4" />}
              label={t("marketingB2CForm.summaryMissing")}
              value={
                marketingB2CSummary.missingSections.length > 0
                  ? marketingB2CSummary.missingSections.join(", ")
                  : t("marketingB2CForm.missingNone")
              }
            />
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted dark:bg-white/[0.15]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all"
              style={{ width: `${marketingB2CSummary.progress}%` }}
            />
          </div>
        </a>
      )}

      {onboarding.status !== "onboarding_complete" && (
        <div className="grid gap-3 rounded-xl border border-border bg-muted/30 p-3 dark:border-blue-300/[0.15] dark:bg-white/[0.15] md:grid-cols-[1fr_auto] md:items-end">
          {!canManageOnboarding && (
            <p className="text-xs text-muted-foreground md:col-span-2">
              {t("onboardingWorkflow.readOnlyOverride")}
            </p>
          )}
          <label className="space-y-1">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700/75 dark:text-blue-100/[0.55]">
              {t("onboardingWorkflow.overrideTitle")}
            </span>
            <input
              disabled={
                !canManageOnboarding || saving === "completion-override"
              }
              value={overrideReason}
              onChange={(event) => setOverrideReason(event.target.value)}
              placeholder={t("onboardingWorkflow.overridePlaceholder")}
              className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#0b1223]"
            />
          </label>
          <button
            onClick={overrideCompletion}
            disabled={!canManageOnboarding || saving === "completion-override"}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-3 text-sm font-semibold text-emerald-100 hover:bg-emerald-400/[0.15] disabled:opacity-60"
          >
            {saving === "completion-override" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {t("onboardingWorkflow.overrideAction")}
          </button>
        </div>
      )}

      {onboarding.completion_override_reason && (
        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
          <p className="font-semibold">
            {t("onboardingWorkflow.overrideRecorded")}
          </p>
          <p className="mt-1 text-emerald-100/[0.65]">
            {onboarding.completion_override_reason}
          </p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <Panel
            title={t("onboardingWorkflow.checklist")}
            icon={<CheckCircle2 className="h-4 w-4" />}
          >
            <div className="space-y-4">
              {groupedItems.map(([department, items]) => (
                <div
                  key={department}
                  className="rounded-xl border border-border bg-muted/30 p-3 dark:border-blue-300/10 dark:bg-white/[0.15]"
                >
                  <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-blue-700/75 dark:text-blue-100/[0.55]">
                    {department}
                  </p>
                  <div className="space-y-2">
                    {items.map((item) => {
                      const normalizedTitle = item.title.toLowerCase();
                      const isMarketingB2BFormItem = Boolean(
                        item.marketing_b2b_form,
                      );
                      const isMarketingB2CFormItem = Boolean(
                        item.marketing_b2c_form,
                      );
                      const isMarketingFormItem =
                        isMarketingB2BFormItem || isMarketingB2CFormItem;
                      const marketingFormOpenLabel = isMarketingB2CFormItem
                        ? t("marketingB2CForm.openShort")
                        : t("marketingB2BForm.openShort");
                      const marketingFormHint = isMarketingB2CFormItem
                        ? t("marketingB2CForm.centralHint")
                        : t("marketingB2BForm.centralHint");
                      const financeOrContractItem =
                        isFinanceChecklistItem(item) ||
                        isContractChecklistItem(item);
                      const formHref =
                        isMarketingFormItem || financeOrContractItem
                          ? taskFormHref(item)
                          : null;
                      const scheduleHref =
                        !formHref && isSchedulingChecklistItem(item)
                          ? scheduleTaskHref(item, onboarding, t)
                          : null;
                      const supportGroupHref =
                        item.automation_key ===
                        SHARED_ONBOARDING_WHATSAPP_GROUP_KEY
                          ? "#support-group"
                          : null;
                      const routedHref =
                        formHref ?? scheduleHref ?? supportGroupHref;
                      const isRoutedTaskItem = Boolean(routedHref);
                      const routedOpenLabel = isMarketingFormItem
                        ? marketingFormOpenLabel
                        : scheduleHref
                          ? t("calendar.quickMeeting")
                          : supportGroupHref
                            ? t("onboardingWorkflow.supportGroup")
                            : t("onboardingWorkflow.openRoutedTask");
                      const routedHint = isMarketingFormItem
                        ? marketingFormHint
                        : scheduleHref
                          ? t("onboardingWorkflow.schedulingRoutedHint")
                          : supportGroupHref
                            ? (item.notes ?? "")
                            : t("onboardingWorkflow.financeRoutedHint");
                      const showAssignmentControls =
                        department.toLowerCase().includes("internal") &&
                        (normalizedTitle.includes("service leaders") ||
                          normalizedTitle.includes("lider") ||
                          normalizedTitle.includes("líder"));
                      const canUpdateItem = editableChecklistItemIds.includes(item.id);
                      return (
                        <div
                          key={item.id}
                          className="rounded-lg border border-border bg-background p-3 dark:border-white/[0.15] dark:bg-[#070d1c]/70"
                        >
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground">
                                {item.title}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {item.owner?.name ??
                                  t("companyDialog.notAssigned")}{" "}
                                {item.task ? `- ${item.task.title}` : ""}
                              </p>
                              {item.notes && (
                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                  {item.notes}
                                </p>
                              )}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span
                                className={cn(
                                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                                  statusClass(item.status),
                                )}
                              >
                                {statusLabel(item.status, t)}
                              </span>
                              {routedHref && canUpdateItem && (
                                <a
                                  href={routedHref}
                                  className="inline-flex items-center gap-1 rounded-lg border border-blue-400/30 bg-blue-500/10 px-2.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-500/[0.15] dark:border-blue-300/20 dark:text-blue-100"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  {routedOpenLabel}
                                </a>
                              )}
                              {item.status !== "complete" &&
                                !showAssignmentControls &&
                                !isRoutedTaskItem && (
                                  <button
                                    onClick={() => updateItem(item, "complete")}
                                    disabled={!canUpdateItem || saving === item.id}
                                    className="rounded-lg border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/[0.15] disabled:opacity-60"
                                  >
                                    {saving === item.id
                                      ? t("common.saving")
                                      : t("onboardingWorkflow.markDone")}
                                  </button>
                                )}
                            </div>
                          </div>
                          {item.status !== "complete" &&
                            !showAssignmentControls &&
                            !canUpdateItem && (
                              <p
                                className="mt-2 text-xs text-muted-foreground"
                                role="status"
                              >
                                {t("onboardingWorkflow.readOnlyStep")}
                              </p>
                            )}
                          {isRoutedTaskItem && canUpdateItem && (
                            <p className="mt-2 rounded-lg border border-blue-400/20 bg-blue-500/5 px-3 py-2 text-xs text-blue-700/80 dark:border-blue-300/10 dark:text-blue-100/[0.55]">
                              {routedHint}
                            </p>
                          )}
                          {showAssignmentControls &&
                            renderServiceAssignmentControls(true)}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title={t("onboardingWorkflow.serviceMeetings")}
            icon={<CalendarClock className="h-4 w-4" />}
          >
            <div className="space-y-3">
              {schedulingItems.map((item) => {
                const meeting = onboarding.meetings?.find(
                  (candidate) => candidate.checklist_item_id === item.id,
                );
                const href =
                  editableChecklistItemIds.includes(item.id) &&
                  item.status !== "complete"
                    ? scheduleTaskHref(item, onboarding, t)
                    : null;
                return (
                  <a
                    key={item.id}
                    href={href ?? undefined}
                    className={cn(
                      "block rounded-xl border border-border bg-muted/30 p-3 transition dark:border-blue-300/10 dark:bg-white/[0.15]",
                      href &&
                        "hover:border-blue-300/25 hover:bg-blue-400/[0.15]",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {isSharedOnboardingSchedulingKey(item.automation_key)
                            ? onboardingMeetingName({
                                automationKey: item.automation_key,
                                department: item.department,
                              })
                            : (item.task?.title ?? item.title)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.department} -{" "}
                          {item.owner?.name ??
                            item.task?.assignee?.name ??
                            t("companyDialog.notAssigned")}
                        </p>
                        <p
                          className={cn(
                            "mt-1 text-xs font-semibold",
                            meeting?.scheduled_at
                              ? "text-emerald-700 dark:text-emerald-200"
                              : "text-amber-700 dark:text-amber-200",
                          )}
                        >
                          {meeting?.scheduled_at
                            ? formatDateTime(meeting.scheduled_at, language)
                            : t("task.onboardingAwaitingDepartment")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            statusClass(item.status),
                          )}
                        >
                          {statusLabel(item.status, t)}
                        </span>
                        {href && (
                          <ExternalLink className="h-4 w-4 text-blue-700/70 dark:text-blue-200/70" />
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-blue-700/75 dark:text-blue-100/70">
                      {t("onboardingWorkflow.schedulingRoutedHint")}
                    </p>
                  </a>
                );
              })}
              {schedulingItems.length === 0 && (
                <p className="rounded-xl border border-border bg-background px-3 py-4 text-sm text-muted-foreground dark:border-white/[0.15] dark:bg-[#070d1c]/70">
                  {t("onboardingWorkflow.noSchedulingTasks")}
                </p>
              )}
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel
            title={t("onboardingWorkflow.finance")}
            icon={<BriefcaseBusiness className="h-4 w-4" />}
          >
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t("onboardingWorkflow.financeRoutedBody")}
              </p>
              {financeRoutingItems.map((item) => {
                const href = taskFormHref(item);
                return (
                  <a
                    key={item.id}
                    href={href ?? undefined}
                    className={cn(
                      "block rounded-xl border border-border bg-muted/30 p-3 transition dark:border-blue-300/10 dark:bg-white/[0.15]",
                      href &&
                        "hover:border-blue-300/25 hover:bg-blue-400/[0.15]",
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">
                          {item.task?.title ?? item.title}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {item.owner?.name ??
                            item.task?.assignee?.name ??
                            t("companyDialog.notAssigned")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            statusClass(item.status),
                          )}
                        >
                          {statusLabel(item.status, t)}
                        </span>
                        {href && (
                          <ExternalLink className="h-4 w-4 text-blue-700/70 dark:text-blue-200/70" />
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-xs text-blue-700/75 dark:text-blue-100/70">
                      {t("onboardingWorkflow.financeRoutedHint")}
                    </p>
                  </a>
                );
              })}
              {financeRoutingItems.length === 0 && (
                <p className="rounded-xl border border-border bg-background px-3 py-4 text-sm text-muted-foreground dark:border-white/[0.15] dark:bg-[#070d1c]/70">
                  {t("onboardingWorkflow.noRoutedFinanceTasks")}
                </p>
              )}
              <div className="rounded-xl border border-border bg-background px-3 py-3 text-sm text-blue-700/80 dark:border-white/[0.15] dark:bg-[#070d1c]/70 dark:text-blue-100/75">
                {t("onboardingWorkflow.contractCount", {
                  count: onboarding.contracts?.length ?? 0,
                })}
              </div>
            </div>
          </Panel>

          <div id="support-group" className="scroll-mt-24">
            <Panel
              title={t("onboardingWorkflow.supportGroup")}
              icon={<Users className="h-4 w-4" />}
            >
              {!canUpdateSupport && (
                <p className="mb-3 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-100">
                  {t("onboardingWorkflow.readOnlySupport")}
                </p>
              )}
              <fieldset disabled={!canUpdateSupport || saving === "support"} className="space-y-3 disabled:opacity-60">
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label={`${t("onboardingWorkflow.groupName")} *`}>
                    <input
                      value={support.group_name}
                      onChange={(e) =>
                        setSupport((current) => ({
                          ...current,
                          group_name: e.target.value,
                        }))
                      }
                      placeholder={t("onboardingWorkflow.groupName")}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#0b1223]"
                    />
                  </Field>
                  <Field label={t("onboardingWorkflow.supportStatus")}>
                    <select
                      value={support.status}
                      onChange={(e) =>
                        setSupport((current) => ({
                          ...current,
                          status: supportStatusValue(e.target.value),
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#0b1223]"
                    >
                      {SUPPORT_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {t(option.labelKey)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label={`${t("onboardingWorkflow.groupLink")} *`}>
                  <input
                    value={support.group_link}
                    onChange={(e) =>
                      setSupport((current) => ({
                        ...current,
                        group_link: e.target.value,
                      }))
                    }
                    placeholder="https://chat.whatsapp.com/..."
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#0b1223]"
                  />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label={t("onboardingWorkflow.mainClientContact")}>
                    <input
                      value={support.main_client_contact}
                      onChange={(e) =>
                        setSupport((current) => ({
                          ...current,
                          main_client_contact: e.target.value,
                        }))
                      }
                      placeholder={t("onboardingWorkflow.mainClientContact")}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#0b1223]"
                    />
                  </Field>
                  <Field
                    label={`${t("onboardingWorkflow.internalParticipants")} *`}
                  >
                    <input
                      value={support.internal_participants}
                      onChange={(e) =>
                        setSupport((current) => ({
                          ...current,
                          internal_participants: e.target.value,
                        }))
                      }
                      placeholder={t(
                        "onboardingWorkflow.participantPlaceholder",
                      )}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#0b1223]"
                    />
                  </Field>
                </div>
                <Field
                  label={`${t("onboardingWorkflow.clientParticipants")} *`}
                >
                  <input
                    value={support.client_participants}
                    onChange={(e) =>
                      setSupport((current) => ({
                        ...current,
                        client_participants: e.target.value,
                      }))
                    }
                    placeholder={t("onboardingWorkflow.participantPlaceholder")}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#0b1223]"
                  />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label={t("onboardingWorkflow.commercialResponsible")}>
                    <input
                      value={support.commercial_responsible}
                      onChange={(e) =>
                        setSupport((current) => ({
                          ...current,
                          commercial_responsible: e.target.value,
                        }))
                      }
                      placeholder={t(
                        "onboardingWorkflow.commercialResponsible",
                      )}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#0b1223]"
                    />
                  </Field>
                  <Field label={t("onboardingWorkflow.accountResponsible")}>
                    <input
                      value={support.account_responsible}
                      onChange={(e) =>
                        setSupport((current) => ({
                          ...current,
                          account_responsible: e.target.value,
                        }))
                      }
                      placeholder={t("onboardingWorkflow.accountResponsible")}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#0b1223]"
                    />
                  </Field>
                </div>
                <Field label={t("onboardingWorkflow.supportNotes")}>
                  <textarea
                    value={support.notes}
                    onChange={(e) =>
                      setSupport((current) => ({
                        ...current,
                        notes: e.target.value,
                      }))
                    }
                    placeholder={t("onboardingWorkflow.supportNotes")}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-blue-400 dark:border-white/10 dark:bg-[#0b1223]"
                  />
                </Field>
                <button
                  onClick={saveSupport}
                  disabled={!canUpdateSupport || saving === "support"}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-400 disabled:opacity-60"
                >
                  {saving === "support" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {support.status === "created"
                    ? t("onboardingWorkflow.markGroupCreated")
                    : t("onboardingWorkflow.saveSupportGroup")}
                </button>
              </fieldset>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 dark:border-blue-300/10 dark:bg-white/[0.15]">
      <div className="mb-2 flex items-center gap-2 text-blue-700/75 dark:text-blue-200/70">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-[0.14em]">
          {label}
        </span>
      </div>
      <p className="truncate text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-blue-700/75 dark:text-blue-100/[0.55]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-4 dark:border-blue-300/10 dark:bg-[#071024]/70">
      <div className="mb-3 flex items-center gap-2 text-sm font-bold text-foreground">
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}
