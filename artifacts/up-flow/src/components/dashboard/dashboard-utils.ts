import type { ActivityEvent, Task, TimeEntry } from "@/lib/types";
import { timeEntryDurationSeconds } from "@/lib/time-entry-duration";

export type DashboardRecent = {
  who: string;
  what: string;
  target: string;
  status: "completed" | "in_progress";
  when: string;
  dayIndex: number;
};

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export type AgencyRiskSignalCopy = {
  key: string;
  label: string;
  trace: string;
  trace_values?: {
    member_name?: string;
    member_open_tasks?: number;
    total_open_tasks?: number;
  };
};

export function localizeAgencyRiskSignal(signal: AgencyRiskSignalCopy, t: Translate) {
  const copyByKey: Record<string, { label: string; trace: string }> = {
    overdue_deliverables: {
      label: "dashboard.risk.overdueDeliverables",
      trace: "dashboard.risk.overdueDeliverablesTrace",
    },
    unassigned_deliverables: {
      label: "dashboard.risk.tasksWithoutOwners",
      trace: "dashboard.risk.tasksWithoutOwnersTrace",
    },
    projects_without_deadlines: {
      label: "dashboard.risk.projectsWithoutDeadlines",
      trace: "dashboard.risk.projectsWithoutDeadlinesTrace",
    },
    clients_needing_attention: {
      label: "dashboard.risk.clientsNeedingAttention",
      trace: "dashboard.risk.clientsNeedingAttentionTrace",
    },
    workload_concentration: {
      label: "dashboard.risk.workloadConcentration",
      trace: signal.trace_values?.member_name
        ? "dashboard.risk.workloadConcentrationTrace"
        : "dashboard.risk.noAssignedOpenTasks",
    },
  };
  const copy = copyByKey[signal.key];
  if (!copy) return { label: signal.label, trace: signal.trace };
  return {
    label: t(copy.label),
    trace: t(copy.trace, {
      name: signal.trace_values?.member_name ?? "",
      owned: signal.trace_values?.member_open_tasks ?? 0,
      total: signal.trace_values?.total_open_tasks ?? 0,
    }),
  };
}

export function localizeDashboardReason(reason: string, t: Translate) {
  const exact: Record<string, string> = {
    "No owner": "dashboard.reason.noOwner",
    "No activity in 7 days": "dashboard.reason.noActivitySevenDays",
    "No active client work": "dashboard.reason.noActiveClientWork",
    "No contacts": "dashboard.reason.noContacts",
    "No contract value or plan": "dashboard.reason.noContractValueOrPlan",
  };
  if (exact[reason]) return t(exact[reason]);
  const overdueTasks = reason.match(/^(\d+) overdue open tasks?$/);
  if (overdueTasks) return t("dashboard.reason.overdueOpenTasks", { count: overdueTasks[1] });
  const overdueDeliverables = reason.match(/^(\d+) overdue deliverables?$/);
  if (overdueDeliverables) {
    return t("dashboard.reason.overdueDeliverables", { count: overdueDeliverables[1] });
  }
  return reason;
}

export function greetingTime() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

export function formatSecondsShort(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function taskStatusLabel(
  status: Task["status"],
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  if (status === "todo") return t("status.todo");
  if (status === "in_progress") return t("status.inProgress");
  return t("status.done");
}

export function priorityLabel(
  priority: Task["priority"],
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  if (priority === "high") return t("priority.high");
  if (priority === "medium") return t("priority.medium");
  return t("priority.low");
}

export function moneyCompact(value: number | null | undefined) {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(amount);
  const compact =
    absolute >= 1_000_000_000
      ? { divisor: 1_000_000_000, suffix: "B" }
      : absolute >= 1_000_000
        ? { divisor: 1_000_000, suffix: "M" }
        : absolute >= 1_000
          ? { divisor: 1_000, suffix: "K" }
          : { divisor: 1, suffix: "" };
  const rounded = Math.round((absolute / compact.divisor) * 10) / 10;
  const digits = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  return `${amount < 0 ? "-" : ""}$${digits}${compact.suffix}`;
}

export function entrySeconds(entry: TimeEntry) {
  return timeEntryDurationSeconds(entry);
}

export function sameLocalDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function dashboardDayIndex(value: string | Date) {
  const date = new Date(value);
  const day = date.getDay();
  return day === 0 ? 6 : day - 1;
}

export function dashboardWhen(value: string, language: "en" | "pt-BR") {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return language === "pt-BR" ? "Agora" : "Just now";
  if (minutes < 60) return language === "pt-BR" ? `${minutes} min atrás` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return language === "pt-BR" ? `${hours}h atrás` : `${hours}h ago`;
  return new Intl.DateTimeFormat(language, {
    day: "2-digit",
    month: "2-digit",
  }).format(new Date(value));
}

export function dashboardActivityText(event: ActivityEvent, t?: Translate) {
  const rawName = event.metadata?.title ?? event.metadata?.name ?? event.entity_type;
  const target = typeof rawName === "string" ? rawName : event.entity_type;
  const key = `activity.event.${event.type}`;
  const localized = t?.(key);
  const what = localized && localized !== key
    ? localized
    : event.type
      .replace(/_/g, " ")
      .replace("task status changed", "changed")
      .replace("calendar event", "event")
      .replace("time entry", "timer");
  return { what, target };
}

export function dashboardActivityStatus(event: ActivityEvent): "completed" | "in_progress" {
  return event.type.includes("deleted") || event.type.includes("stopped") || event.type.includes("done")
    ? "completed"
    : "in_progress";
}

export function buildDashboardWeekActivity(
  activity: ActivityEvent[],
  timeEntries: TimeEntry[],
  language: "en" | "pt-BR",
) {
  const labels = language === "pt-BR"
    ? ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return labels.map((day, index) => {
    const actions = activity.filter((event) => dashboardDayIndex(event.created_at) === index).length;
    const trackedSeconds = timeEntries
      .filter((entry) => dashboardDayIndex(entry.started_at) === index)
      .reduce((sum, entry) => sum + entrySeconds(entry), 0);
    const dots = Math.min(5, Math.max(actions, trackedSeconds > 0 ? 1 : 0));
    return {
      day,
      hours: Math.round((trackedSeconds / 3600) * 10) / 10,
      tasks: actions,
      items: Array.from({ length: dots }, (_, dotIndex) => ({
        size: Math.min(18, 8 + dotIndex * 2 + actions),
        color:
          dotIndex % 3 === 0
            ? "bg-primary"
            : dotIndex % 3 === 1
              ? "bg-upflow-success"
              : "bg-upflow-warning",
      })),
    };
  });
}

export function buildDashboardRecent(
  activity: ActivityEvent[],
  language: "en" | "pt-BR",
  t: Translate,
): DashboardRecent[] {
  return activity.map((event) => {
    const label = dashboardActivityText(event, t);
    return {
      who: event.actor?.name ?? t("invite.someone"),
      what: label.what,
      target: label.target,
      status: dashboardActivityStatus(event),
      when: dashboardWhen(event.created_at, language),
      dayIndex: dashboardDayIndex(event.created_at),
    };
  });
}
