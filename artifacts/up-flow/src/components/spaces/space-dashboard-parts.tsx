"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { KeyboardEvent, ReactNode } from "react";
import { useLanguage } from "@/components/language-provider";
import type { Task } from "@/lib/types";
import { cn, formatDate, priorityColor } from "@/lib/utils";
import {
  toneClasses,
  type DashboardTone,
  type TaskStatus,
} from "@/components/spaces/space-dashboard-utils";

export function TaskRecord({
  task,
  updating,
  onStatusChange,
}: {
  task: Task;
  updating: boolean;
  onStatusChange: (task: Task, status: TaskStatus) => void;
}) {
  const { language, t } = useLanguage();
  const statusLabels: Record<TaskStatus, string> = {
    todo: t("spaceDashboard.statusTodo"),
    in_progress: t("spaceDashboard.statusInProgress"),
    done: t("spaceDashboard.statusDone"),
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-3">
        <Link href={`/projects/${task.project_id}`} className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground hover:text-primary">
            {task.title}
          </p>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {task.project?.name || t("spaceDashboard.project")} -{" "}
            {task.due_date
              ? formatDate(task.due_date, language)
              : t("spaceDashboard.noDueDate")}
          </p>
        </Link>
        <span
          className={cn("text-xs font-medium", priorityColor(task.priority))}
        >
          {task.priority}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["todo", "in_progress", "done"] as TaskStatus[]).map((status) => (
          <button
            key={status}
            disabled
            onClick={() => onStatusChange(task, status)}
            title={t("task.automaticMovementOnly")}
            className={cn(
              "cursor-not-allowed rounded-md border border-white/10 px-2.5 py-1 text-xs opacity-70 transition-colors",
              task.status === status
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground",
            )}
          >
            {statusLabels[status]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function HeroMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

export function PulseRow({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: string | number;
  tone: DashboardTone;
  onClick: () => void;
}) {
  const color = toneClasses(tone);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border bg-white/[0.04] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07]",
        color.border,
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span className={cn("h-2 w-2 rounded-full", color.bar)} />
        {label}
      </span>
      <span className={cn("text-sm font-semibold", color.text)}>{value}</span>
    </button>
  );
}

export function CommandTile({
  title,
  value,
  hint,
  icon,
  tone = "primary",
  onClick,
}: {
  title: string;
  value: string | number;
  hint: string;
  icon: ReactNode;
  tone?: DashboardTone;
  onClick: () => void;
}) {
  const color = toneClasses(tone);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-white/[0.03] p-4 text-left transition-colors hover:bg-white/[0.06]",
        color.border,
      )}
    >
      <span className={cn("absolute inset-x-0 top-0 h-0.5", color.bar)} />
      <div className="flex items-start justify-between gap-3">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            color.icon,
          )}
        >
          {icon}
        </span>
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
      </div>
      <p className="mt-4 text-sm font-medium text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </button>
  );
}

export function StatusCard({
  label,
  value,
  hint,
  icon,
  tone = "primary",
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
  tone?: DashboardTone;
  onClick: () => void;
}) {
  const color = toneClasses(tone);
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-xl border bg-white/[0.03] p-5 text-left transition-colors hover:bg-white/[0.06]",
        color.border,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          {label}
        </p>
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            color.icon,
          )}
        >
          {icon}
        </span>
      </div>
      <p className="mt-4 text-3xl font-bold text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </button>
  );
}

export function TabButton({
  active,
  onClick,
  children,
  id,
  panelId,
  onKeyDown,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  id?: string;
  panelId?: string;
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={panelId}
      tabIndex={active ? 0 : -1}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <button
        onClick={onAction}
        className="text-xs text-primary hover:underline"
      >
        {actionLabel}
      </button>
    </div>
  );
}

export function RecordList({
  children,
  emptyTitle,
  emptyText,
}: {
  children: ReactNode;
  emptyTitle: string;
  emptyText: string;
}) {
  const childArray = Array.isArray(children)
    ? children.filter(Boolean)
    : children
      ? [children]
      : [];
  if (childArray.length === 0) {
    return <DrawerEmpty title={emptyTitle} text={emptyText} />;
  }
  return (
    <div className="space-y-3 divide-y divide-transparent p-4">{children}</div>
  );
}

export function DrawerEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-white/10 p-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

export function QuickCreateButton({
  icon,
  onClick,
  children,
}: {
  icon: ReactNode;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-sm font-medium text-foreground hover:bg-white/[0.06]"
    >
      <span className="inline-flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary">
          {icon}
        </span>
        {children}
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

export function Metric({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] p-2">
      <p className="text-[10px] uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold text-foreground">{value}</p>
    </div>
  );
}
