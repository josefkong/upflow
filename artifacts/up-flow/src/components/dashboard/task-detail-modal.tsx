"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Task } from "@/lib/types";
import { cn, formatDate, isOverdue, priorityColor } from "@/lib/utils";
import { priorityLabel } from "@/components/projects/priority-ui";
import { useLanguage } from "@/components/language-provider";

function statusLabel(
  status: Task["status"],
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  if (status === "in_progress") return t("status.inProgress");
  if (status === "done") return t("status.done");
  return t("status.todo");
}

export function TaskDetailModal({
  task,
  updating,
  onClose,
  onStatusChange,
  onDelete,
}: {
  task: Task;
  updating: boolean;
  onClose: () => void;
  onStatusChange: (task: Task, status: Task["status"]) => void;
  onDelete: (task: Task) => void;
}) {
  const { language, t } = useLanguage();
  const locale = language === "pt-BR" ? "pt-BR" : "en-US";
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const titleId = `task-modal-title-${task.id}`;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("keydown", handleKey);
      previouslyFocused?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-md overflow-y-auto rounded-2xl p-4 glass-strong sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {task.project?.name || t("task.newTask")}
            </p>
            <h3 id={titleId} className="mt-1 text-lg font-bold text-foreground">
              {task.title}
            </h3>
          </div>
          <button
            ref={closeBtnRef}
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-md text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span
            className={cn(
              "rounded-full px-2 py-1 font-medium",
              priorityColor(task.priority),
            )}
          >
            {priorityLabel(task.priority, t)}
          </span>
          <span className="rounded-full bg-white/5 px-2 py-1 capitalize text-foreground/80">
            {statusLabel(task.status, t)}
          </span>
          {task.due_date && (
            <span
              className={cn(
                "rounded-full bg-white/5 px-2 py-1",
                isOverdue(task.due_date) && task.status !== "done"
                  ? "text-upflow-danger"
                  : "text-foreground/80",
              )}
            >
              {t("task.due", { date: formatDate(task.due_date, locale) })}
            </span>
          )}
        </div>

        {task.description && (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
            {task.description}
          </p>
        )}

        <div className="mt-6 grid gap-2 sm:grid-cols-3">
          <button
            onClick={() => onStatusChange(task, "todo")}
            disabled
            title={t("task.automaticMovementOnly")}
            className="cursor-not-allowed rounded-xl bg-white/5 py-2 text-xs font-medium opacity-60"
          >
            {t("status.todo")}
          </button>
          <button
            onClick={() => onStatusChange(task, "in_progress")}
            disabled
            title={t("task.automaticMovementOnly")}
            className="cursor-not-allowed rounded-xl bg-upflow-warning/20 py-2 text-xs font-medium text-upflow-warning opacity-60"
          >
            {t("status.inProgress")}
          </button>
          <button
            onClick={() => onStatusChange(task, "done")}
            disabled
            title={t("task.automaticMovementOnly")}
            className="cursor-not-allowed rounded-xl bg-upflow-success/20 py-2 text-xs font-medium text-upflow-success opacity-60"
          >
            {t("task.markDone")}
          </button>
        </div>

        <button
          onClick={() => {
            if (confirm(t("task.deleteNamed", { title: task.title })))
              onDelete(task);
          }}
          disabled={updating}
          className="mt-3 w-full rounded-xl py-2 text-xs font-medium text-upflow-danger transition-colors hover:bg-upflow-danger/10 disabled:opacity-40"
        >
          {t("task.deleteTask")}
        </button>
      </div>
    </div>
  );
}
