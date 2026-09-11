import type { DepartmentSpacePreset } from "@/lib/department-spaces";
import type { Task, TimeEntry } from "@/lib/types";
import { timeEntryDurationSeconds } from "@/lib/time-entry-duration";
import { formatDateTime as formatLocalizedDateTime } from "@/lib/utils";

export type TaskStatus = "todo" | "in_progress" | "done";
export type DrawerKind =
  | "urgent_actions"
  | "team_workload"
  | "time_today"
  | "meetings_today"
  | "recent_activity"
  | "projects_at_risk"
  | "quick_create"
  | `status:${TaskStatus}`;

export type TaskTimelineItem = {
  task: Task;
  due: Date;
  start: number;
  end: number;
  overdue: boolean;
};

export type DashboardTone = "primary" | "success" | "warning" | "danger" | "blue" | "violet" | "teal";

type DepartmentDashboardTheme = {
  container: string;
  icon: string;
  badge: string;
  accent: string;
};

const fallbackDepartmentTheme: DepartmentDashboardTheme = {
  container: "border-white/10 bg-card/70",
  icon: "border-white/10 bg-primary/15 text-primary",
  badge: "border-primary/30 bg-primary/10 text-primary",
  accent: "bg-primary",
};

export function getDepartmentDashboardTheme(
  key?: DepartmentSpacePreset["department_key"],
): DepartmentDashboardTheme {
  if (!key) return fallbackDepartmentTheme;

  const themes: Record<DepartmentSpacePreset["department_key"], DepartmentDashboardTheme> = {
    comercial: {
      container: "border-amber-400/25 bg-[linear-gradient(135deg,rgba(245,158,11,0.16),rgba(124,92,255,0.08),rgba(255,255,255,0.03))]",
      icon: "border-amber-300/30 bg-amber-400/15 text-amber-200",
      badge: "border-amber-300/30 bg-amber-400/10 text-amber-200",
      accent: "bg-amber-300",
    },
    marketing_b2b: {
      container: "border-sky-400/25 bg-[linear-gradient(135deg,rgba(56,189,248,0.14),rgba(124,92,255,0.1),rgba(255,255,255,0.03))]",
      icon: "border-sky-300/30 bg-sky-400/15 text-sky-200",
      badge: "border-sky-300/30 bg-sky-400/10 text-sky-200",
      accent: "bg-sky-300",
    },
    marketing_b2c: {
      container: "border-rose-400/25 bg-[linear-gradient(135deg,rgba(251,113,133,0.15),rgba(245,158,11,0.08),rgba(255,255,255,0.03))]",
      icon: "border-rose-300/30 bg-rose-400/15 text-rose-200",
      badge: "border-rose-300/30 bg-rose-400/10 text-rose-200",
      accent: "bg-rose-300",
    },
    creative_design: {
      container: "border-fuchsia-400/25 bg-[linear-gradient(135deg,rgba(217,70,239,0.15),rgba(124,92,255,0.12),rgba(255,255,255,0.03))]",
      icon: "border-fuchsia-300/30 bg-fuchsia-400/15 text-fuchsia-200",
      badge: "border-fuchsia-300/30 bg-fuchsia-400/10 text-fuchsia-200",
      accent: "bg-fuchsia-300",
    },
    finance: {
      container: "border-emerald-400/25 bg-[linear-gradient(135deg,rgba(16,185,129,0.15),rgba(245,158,11,0.07),rgba(255,255,255,0.03))]",
      icon: "border-emerald-300/30 bg-emerald-400/15 text-emerald-200",
      badge: "border-emerald-300/30 bg-emerald-400/10 text-emerald-200",
      accent: "bg-emerald-300",
    },
    production: {
      container: "border-orange-400/25 bg-[linear-gradient(135deg,rgba(251,146,60,0.15),rgba(239,68,68,0.08),rgba(255,255,255,0.03))]",
      icon: "border-orange-300/30 bg-orange-400/15 text-orange-200",
      badge: "border-orange-300/30 bg-orange-400/10 text-orange-200",
      accent: "bg-orange-300",
    },
    technical_support: {
      container: "border-cyan-400/25 bg-[linear-gradient(135deg,rgba(34,211,238,0.15),rgba(59,130,246,0.1),rgba(255,255,255,0.03))]",
      icon: "border-cyan-300/30 bg-cyan-400/15 text-cyan-200",
      badge: "border-cyan-300/30 bg-cyan-400/10 text-cyan-200",
      accent: "bg-cyan-300",
    },
    general_admin: {
      container: "border-slate-300/20 bg-[linear-gradient(135deg,rgba(148,163,184,0.15),rgba(124,92,255,0.08),rgba(255,255,255,0.03))]",
      icon: "border-slate-300/25 bg-slate-300/15 text-slate-200",
      badge: "border-slate-300/25 bg-slate-300/10 text-slate-200",
      accent: "bg-slate-300",
    },
  };
  return themes[key];
}

export function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function taskDueHour(date: Date) {
  const hour = date.getHours();
  const minute = date.getMinutes();
  if (hour === 0 && minute === 0) return 9;
  return hour + minute / 60;
}

export function clampTaskTimelineBlock(start: number, duration = 0.75) {
  const clampedStart = Math.max(8, Math.min(18.75, start));
  const clampedEnd = Math.max(clampedStart + 0.5, Math.min(19, clampedStart + duration));
  return { start: clampedStart, end: clampedEnd };
}

export function taskTimelineClass(task: Task, overdue: boolean) {
  if (overdue) return "bg-upflow-danger/30 border-l-upflow-danger text-upflow-danger";
  if (task.status === "done") return "bg-upflow-success/30 border-l-upflow-success text-upflow-success";
  if (task.status === "in_progress") return "bg-primary/35 border-l-primary text-primary";
  if (task.priority === "high") return "bg-upflow-warning/30 border-l-upflow-warning text-upflow-warning";
  return "bg-white/10 border-l-white/40 text-foreground/80";
}

export function toneClasses(tone: DashboardTone) {
  const tones: Record<DashboardTone, { border: string; icon: string; text: string; bar: string }> = {
    primary: {
      border: "border-primary/35 hover:border-primary/60",
      icon: "bg-primary/15 text-primary",
      text: "text-primary",
      bar: "bg-primary",
    },
    success: {
      border: "border-upflow-success/30 hover:border-upflow-success/55",
      icon: "bg-upflow-success/15 text-upflow-success",
      text: "text-upflow-success",
      bar: "bg-upflow-success",
    },
    warning: {
      border: "border-upflow-warning/30 hover:border-upflow-warning/55",
      icon: "bg-upflow-warning/15 text-upflow-warning",
      text: "text-upflow-warning",
      bar: "bg-upflow-warning",
    },
    danger: {
      border: "border-upflow-danger/30 hover:border-upflow-danger/55",
      icon: "bg-upflow-danger/15 text-upflow-danger",
      text: "text-upflow-danger",
      bar: "bg-upflow-danger",
    },
    blue: {
      border: "border-sky-400/25 hover:border-sky-400/50",
      icon: "bg-sky-400/15 text-sky-300",
      text: "text-sky-300",
      bar: "bg-sky-300",
    },
    violet: {
      border: "border-violet-400/25 hover:border-violet-400/50",
      icon: "bg-violet-400/15 text-violet-300",
      text: "text-violet-300",
      bar: "bg-violet-300",
    },
    teal: {
      border: "border-teal-400/25 hover:border-teal-400/50",
      icon: "bg-teal-400/15 text-teal-300",
      text: "text-teal-300",
      bar: "bg-teal-300",
    },
  };
  return tones[tone];
}

export function drawerTitle(kind: DrawerKind) {
  const titles: Record<Exclude<DrawerKind, `status:${TaskStatus}`>, string> = {
    urgent_actions: "My urgent actions",
    team_workload: "Team workload",
    time_today: "Time today",
    meetings_today: "Meetings today",
    recent_activity: "Recent activity",
    projects_at_risk: "Projects at risk",
    quick_create: "Quick create",
  };
  return titles[kind as Exclude<DrawerKind, `status:${TaskStatus}`>] ?? "Space records";
}

export function statusTitle(status: TaskStatus) {
  if (status === "todo") return "Upcoming Actions";
  if (status === "in_progress") return "In Progress Actions";
  return "Completed Actions";
}

export function statusLabel(status: TaskStatus) {
  if (status === "todo") return "To do";
  if (status === "in_progress") return "In progress";
  return "Done";
}

export function formatSecondsShort(seconds: number) {
  if (seconds <= 0) return "0m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

export function entrySeconds(entry: TimeEntry) {
  return timeEntryDurationSeconds(entry);
}

export function formatDateTime(value: string, locale?: string) {
  return formatLocalizedDateTime(value, locale);
}

export function humanize(value: string) {
  return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
