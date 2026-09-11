"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Eye,
  FolderKanban,
  LockKeyhole,
  Search,
  UserRound,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { Task } from "@/lib/types";
import { cn, formatDateTime, getInitials } from "@/lib/utils";

type TaskFilter = "all" | "open" | "done";

export function DepartmentTaskDirectory({
  tasks,
  canOperate,
}: {
  tasks: Task[];
  canOperate: boolean;
}) {
  const { language, t } = useLanguage();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("all");

  const groupedTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase(language);
    const filtered = tasks.filter((task) => {
      const matchesStatus =
        filter === "all" ||
        (filter === "open" && task.status !== "done") ||
        (filter === "done" && task.status === "done");
      if (!matchesStatus) return false;
      if (!normalizedQuery) return true;

      return [task.title, task.project?.name, task.assignee?.name]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase(language).includes(normalizedQuery),
        );
    });

    const groups = new Map<
      string,
      { projectId: string; projectName: string; tasks: Task[] }
    >();
    for (const task of filtered) {
      const projectId = task.project_id;
      const current = groups.get(projectId) ?? {
        projectId,
        projectName: task.project?.name || t("spaceDashboard.noProject"),
        tasks: [],
      };
      current.tasks.push(task);
      groups.set(projectId, current);
    }

    return [...groups.values()].sort((left, right) =>
      left.projectName.localeCompare(right.projectName, language),
    );
  }, [filter, language, query, t, tasks]);

  const visibleTaskCount = groupedTasks.reduce(
    (total, group) => total + group.tasks.length,
    0,
  );

  return (
    <section
      data-testid="department-task-directory"
      className="overflow-hidden rounded-xl border border-border bg-card/80 shadow-sm dark:border-white/10 dark:bg-card/70"
    >
      <div className="border-b border-border p-4 sm:p-5 dark:border-white/10">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                <Eye className="h-4 w-4" />
                {t("spaceDashboard.departmentTasksTitle")}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  canOperate
                    ? "bg-emerald-500/10 text-emerald-500"
                    : "bg-sky-500/10 text-sky-500",
                )}
              >
                {canOperate ? (
                  <FolderKanban className="h-3.5 w-3.5" />
                ) : (
                  <LockKeyhole className="h-3.5 w-3.5" />
                )}
                {canOperate
                  ? t("spaceDashboard.operationalAccess")
                  : t("spaceDashboard.readOnlyAccess")}
              </span>
            </div>
            <h3 className="mt-2 text-xl font-bold text-foreground sm:text-2xl">
              {t("spaceDashboard.departmentTasksHeading")}
            </h3>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t("spaceDashboard.departmentTasksDescription")}
            </p>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row xl:w-auto">
            <label className="relative min-w-0 flex-1 sm:min-w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <span className="sr-only">
                {t("spaceDashboard.searchDepartmentTasks")}
              </span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("spaceDashboard.searchDepartmentTasks")}
                className="h-10 w-full rounded-lg border border-border bg-background/70 pl-9 pr-3 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-black/20"
              />
            </label>
            <div className="inline-flex h-10 rounded-lg border border-border bg-background/70 p-1 dark:border-white/10 dark:bg-black/20">
              {(["all", "open", "done"] as TaskFilter[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  className={cn(
                    "rounded-md px-3 text-xs font-semibold transition-colors",
                    filter === option
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {option === "all"
                    ? t("spaceDashboard.allTasks")
                    : option === "open"
                      ? t("spaceDashboard.openTasks")
                      : t("spaceDashboard.doneTasks")}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            {t("spaceDashboard.visibleTaskCount", {
              count: visibleTaskCount,
            })}
          </span>
          {!canOperate ? (
            <span>{t("spaceDashboard.crossDepartmentVisibility")}</span>
          ) : null}
        </div>

        {groupedTasks.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-10 text-center dark:border-white/10">
            <FolderKanban className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold text-foreground">
              {t("spaceDashboard.noDepartmentTasks")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("spaceDashboard.noDepartmentTasksHint")}
            </p>
          </div>
        ) : (
          <div className="grid items-start gap-4 xl:grid-cols-2">
            {groupedTasks.map((group) => (
              <article
                key={group.projectId}
                className="overflow-hidden rounded-xl border border-border bg-background/35 dark:border-white/10 dark:bg-black/10"
              >
                <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 dark:border-white/10">
                  <div className="flex min-w-0 items-center gap-2">
                    <FolderKanban className="h-4 w-4 shrink-0 text-primary" />
                    <h4 className="truncate text-sm font-semibold text-foreground">
                      {group.projectName}
                    </h4>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                    {group.tasks.length}
                  </span>
                </header>
                <div className="divide-y divide-border dark:divide-white/10">
                  {group.tasks.map((task) => (
                    <DepartmentTaskRow
                      key={task.id}
                      task={task}
                      canOperate={canOperate}
                      language={language}
                    />
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DepartmentTaskRow({
  task,
  canOperate,
  language,
}: {
  task: Task;
  canOperate: boolean;
  language: string;
}) {
  const { t } = useLanguage();
  const content = (
    <div className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-muted/35 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {task.title}
          </p>
          <TaskStatusBadge status={task.status} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <UserRound className="h-3.5 w-3.5" />
            {task.assignee?.name ?? t("spaceDashboard.unassigned")}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            {task.due_date
              ? formatDateTime(task.due_date, language)
              : t("spaceDashboard.noDueDate")}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {task.assignee ? (
          <span
            title={task.assignee.name}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary"
          >
            {getInitials(task.assignee.name)}
          </span>
        ) : null}
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold",
            task.priority === "high"
              ? "bg-rose-500/10 text-rose-500"
              : task.priority === "medium"
                ? "bg-amber-500/10 text-amber-500"
                : "bg-sky-500/10 text-sky-500",
          )}
        >
          {t(`priority.${task.priority}`)}
        </span>
      </div>
    </div>
  );

  return canOperate ? (
    <Link
      href={`/projects/${task.project_id}?task=${task.id}`}
      aria-label={t("spaceDashboard.openTask", { task: task.title })}
      className="block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
    >
      {content}
    </Link>
  ) : (
    <div title={t("spaceDashboard.readOnlyTaskHint")}>{content}</div>
  );
}

function TaskStatusBadge({ status }: { status: Task["status"] }) {
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
        status === "done"
          ? "bg-emerald-500/10 text-emerald-500"
          : status === "in_progress"
            ? "bg-blue-500/10 text-blue-500"
            : "bg-muted text-muted-foreground",
      )}
    >
      {status === "done"
        ? t("spaceDashboard.statusDone")
        : status === "in_progress"
          ? t("spaceDashboard.statusInProgress")
          : t("spaceDashboard.statusTodo")}
    </span>
  );
}
