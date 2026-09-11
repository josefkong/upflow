"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Calendar as CalendarIcon,
  MoreHorizontal,
  Plus,
  X,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { CreateActionButton } from "@/components/ui/create-action-button";
import type { TaskDrawerStatus } from "@/components/dashboard/dashboard-page-types";
import { priorityLabel } from "@/components/dashboard/dashboard-utils";
import type { CalendarEvent, Task } from "@/lib/types";
import {
  cn,
  formatDate,
  formatTime,
  isOverdue,
  priorityColor,
} from "@/lib/utils";

export function TodayFocusPanel({
  loading,
  tasks,
  meetings,
  onOpenTask,
  onMarkDone,
  onCreateTask,
  onOpenMeetings,
  updating,
}: {
  loading: boolean;
  tasks: Task[];
  meetings: CalendarEvent[];
  onOpenTask: (task: Task) => void;
  onMarkDone: (task: Task) => void;
  onCreateTask: () => void;
  onOpenMeetings: () => void;
  updating: boolean;
}) {
  const { language, t } = useLanguage();
  const visibleMeetings = meetings.slice(0, 3);
  const hasFocusItems = tasks.length > 0 || visibleMeetings.length > 0;

  return (
    <section className="command-section-panel overflow-hidden rounded-[1.4rem]">
      <div className="flex items-start justify-between gap-3 border-b border-white/5 bg-white/[0.03] px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-upflow-danger/15 text-upflow-danger shadow-[0_0_20px_rgba(251,113,133,0.18)]">
              <AlertCircle className="h-4 w-4" />
            </span>
            <h3 className="text-sm font-semibold text-foreground">
              {t("dashboard.todayFocus")}
            </h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("dashboard.todayFocusHint")}
          </p>
        </div>
        <button
          type="button"
          onClick={onCreateTask}
          className="text-xs font-medium text-primary hover:underline"
        >
          + {t("dashboard.newTask")}
        </button>
      </div>
      <div className="divide-y divide-white/5">
        {loading ? (
          [1, 2, 3].map((item) => (
            <div key={item} className="px-5 py-4">
              <div className="h-4 w-1/2 animate-pulse rounded bg-white/5" />
            </div>
          ))
        ) : !hasFocusItems ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              {t("dashboard.noFocus")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("dashboard.todayFocusHint")}
            </p>
            <CreateActionButton
              onClick={onCreateTask}
              className="mt-4"
            >
              <Plus className="h-4 w-4" />
              {t("dashboard.newTask")}
            </CreateActionButton>
          </div>
        ) : (
          <>
            {visibleMeetings.length > 0 && (
              <div className="space-y-2 px-5 py-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">
                    {t("dashboard.meetingsToday")}
                  </p>
                  <button
                    type="button"
                    onClick={onOpenMeetings}
                    className="text-xs text-primary hover:underline"
                  >
                    {t("common.open")}
                  </button>
                </div>
                {visibleMeetings.map((meeting) => (
                  <button
                    key={meeting.id}
                    type="button"
                    onClick={onOpenMeetings}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-sky-400/25 bg-sky-400/10 px-3 py-2 text-left shadow-[0_0_18px_rgba(56,189,248,0.08)] hover:border-sky-300/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {meeting.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatTime(meeting.starts_at, language)}
                      </span>
                    </span>
                    <CalendarIcon className="h-4 w-4 shrink-0 text-primary" />
                  </button>
                ))}
              </div>
            )}
            {tasks.length > 0 && (
              <div>
                {tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onOpen={() => onOpenTask(task)}
                    onMarkDone={() => onMarkDone(task)}
                    onDelete={() => onOpenTask(task)}
                    disabled={updating}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export function TaskRow({
  task,
  onOpen,
  onMarkDone,
  onDelete,
  disabled,
}: {
  task: Task;
  onOpen: () => void;
  onMarkDone: () => void;
  onDelete: () => void;
  disabled: boolean;
}) {
  const { language, t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  return (
    <div className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-white/5">
      <div
        className={cn(
          "h-8 w-1.5 flex-shrink-0 rounded-full",
          task.priority === "high"
            ? "bg-upflow-danger"
            : task.priority === "medium"
              ? "bg-upflow-warning"
              : "bg-muted-foreground/40",
        )}
      />
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
      >
        <p className="truncate text-sm font-medium text-foreground">
          {task.title}
        </p>
        {task.project?.name && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {task.project.name}
          </p>
        )}
      </button>
      <span
        className={cn(
          "rounded-full px-2 py-1 text-xs font-medium",
          priorityColor(task.priority),
        )}
      >
        {priorityLabel(task.priority, t)}
      </span>
      {task.due_date && (
        <span
          className={cn(
            "hidden text-xs text-muted-foreground sm:block",
            isOverdue(task.due_date) &&
              task.status !== "done" &&
              "font-medium text-upflow-danger",
          )}
        >
          {formatDate(task.due_date, language)}
        </span>
      )}
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={t("task.actionsFor", { title: task.title })}
          aria-expanded={menuOpen}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="glass-strong absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-lg text-xs"
          >
            <button
              role="menuitem"
              type="button"
              disabled
              title={t("task.automaticMovementOnly")}
              onClick={() => {
                setMenuOpen(false);
                onMarkDone();
              }}
              className="w-full cursor-not-allowed px-3 py-2 text-left focus:outline-none disabled:opacity-40"
            >
              {t("status.done")}
            </button>
            <button
              role="menuitem"
              type="button"
              onClick={() => {
                setMenuOpen(false);
                onOpen();
              }}
              className="w-full border-t border-white/5 px-3 py-2 text-left hover:bg-white/5 focus:outline-none focus-visible:bg-white/10"
            >
              {t("common.open")}
            </button>
            <button
              role="menuitem"
              type="button"
              disabled={disabled}
              onClick={() => {
                setMenuOpen(false);
                onDelete();
              }}
              className="w-full border-t border-white/5 px-3 py-2 text-left text-upflow-danger hover:bg-upflow-danger/10 focus:outline-none focus-visible:bg-upflow-danger/15 disabled:opacity-40"
            >
              {t("common.delete")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function TaskStatusDrawer({
  status,
  tasks,
  updating,
  onClose,
  onOpenTask,
  onStatusChange,
  onDelete,
}: {
  status: TaskDrawerStatus;
  tasks: Task[];
  updating: boolean;
  onClose: () => void;
  onOpenTask: (task: Task) => void;
  onStatusChange: (task: Task, status: Task["status"]) => void;
  onDelete: (task: Task) => void;
}) {
  const { t } = useLanguage();
  const label =
    status === "todo"
      ? t("dashboard.upcoming")
      : status === "in_progress"
        ? t("dashboard.inProgress")
        : t("dashboard.completed");

  return (
    <div
      className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        aria-label={t("dashboard.tasksForStatus", { status: label })}
        className="glass-strong absolute right-0 top-0 h-dvh w-full max-w-md overflow-y-auto border-l border-white/10 p-4 sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("dashboard.tasks")}
            </p>
            <h2 className="mt-1 text-lg font-semibold text-foreground">
              {label}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("dashboard.tasksCount", { count: tasks.length })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-white/10 hover:text-foreground"
            aria-label={t("dashboard.closeTaskDrawer")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 divide-y divide-white/5 overflow-hidden rounded-xl border border-white/5">
          {tasks.length === 0 ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-foreground">
                {t("dashboard.noFocus")}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("dashboard.statusHint")}
              </p>
            </div>
          ) : (
            tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onOpen={() => onOpenTask(task)}
                onMarkDone={() => onStatusChange(task, "done")}
                onDelete={() => {
                  if (
                    confirm(t("task.deleteNamedConfirm", { title: task.title }))
                  )
                    onDelete(task);
                }}
                disabled={updating}
              />
            ))
          )}
        </div>
      </aside>
    </div>
  );
}
