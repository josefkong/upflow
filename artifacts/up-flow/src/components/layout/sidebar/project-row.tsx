"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, Folder, MoreHorizontal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import { logError } from "@/lib/log-error";
import { isProtectedDesignQueue } from "@/lib/system-projects";
import { localizeProjectName } from "@/lib/i18n/project-name-translations";
import { prefetchProjectPage } from "@/lib/project-page-cache";

interface ProjectRowProps {
  project: Project;
  href?: string;
  onMove: () => void;
  onNavigate?: () => void;
  onDeleted: () => void;
  onDuplicated: () => void;
  isActive: boolean;
  canManageWorkspace: boolean;
}

export function ProjectRow({
  project,
  href,
  onMove,
  onNavigate,
  onDeleted,
  onDuplicated,
  isActive,
  canManageWorkspace,
}: ProjectRowProps) {
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const projectDisplayName = localizeProjectName(project.name, language);
  const badgeCount = project.flow_task_count ?? project.pending_todo_count ?? 0;
  const badgeLabel = t(
    project.flow_task_count !== undefined
      ? "sidebar.flowTaskCount"
      : "sidebar.pendingTodoCount",
    { count: badgeCount },
  );
  const protectedDesignQueue = isProtectedDesignQueue({
    projectName: project.name,
    spaceName: project.space?.name,
  });

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target && target.closest('[role="menu"], [data-menu-trigger]'))
        return;
      setOpen(false);
    };
    const t = window.setTimeout(() => {
      document.addEventListener("mousedown", h);
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleDelete = async () => {
    setOpen(false);
    if (!confirm(t("projects.deleteConfirm", { name: projectDisplayName })))
      return;
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? t("projects.couldNotDelete"));
      }
      window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
      toast.success(t("projects.deleted"));
      onDeleted();
    } catch (err) {
      logError("sidebar:project-row:delete", err, { id: project.id });
      toast.error(
        err instanceof Error ? err.message : t("projects.couldNotDelete"),
      );
    }
  };

  const handleDuplicate = async () => {
    setOpen(false);
    try {
      const res = await fetch(`/api/projects/${project.id}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? t("projects.couldNotDuplicate"));
      }
      window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
      toast.success(t("projects.duplicated"));
      onDuplicated();
    } catch (err) {
      logError("sidebar:project-row:duplicate", err, { id: project.id });
      toast.error(
        err instanceof Error ? err.message : t("projects.couldNotDuplicate"),
      );
    }
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-xl border border-transparent px-1 py-0.5 transition-all hover:border-border hover:bg-accent/70 dark:hover:border-blue-300/10 dark:hover:bg-white/[0.15]",
        isActive &&
          "border-primary/25 bg-primary/10 shadow-sm dark:border-blue-300/20 dark:bg-blue-500/[0.15] dark:shadow-[0_0_18px_rgba(59,130,246,0.14)]",
      )}
    >
      <span className="flex h-7 w-5 flex-shrink-0 items-center justify-center">
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            isActive
              ? "bg-blue-300 shadow-[0_0_10px_rgba(96,165,250,0.85)]"
              : "bg-slate-500/80",
          )}
        />
      </span>
      <Link
        href={href ?? `/projects/${project.id}`}
        onClick={onNavigate}
        onPointerEnter={() => void prefetchProjectPage(project.id)}
        onFocus={() => void prefetchProjectPage(project.id)}
        className={cn(
          "flex min-w-0 flex-1 items-center rounded-lg px-1 py-1.5 text-xs truncate outline-none transition-colors",
          isActive
            ? "text-foreground font-medium"
            : "text-foreground/[0.85] hover:text-foreground focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-primary/60 dark:focus-visible:bg-white/10",
        )}
      >
        <span className="truncate">{projectDisplayName}</span>
      </Link>
      <span
        aria-label={badgeLabel}
        title={badgeLabel}
        className={cn(
          "flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
          badgeCount > 0
            ? "bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-300/[0.14] dark:text-amber-100 dark:ring-amber-200/20"
            : "bg-muted text-muted-foreground dark:bg-white/[0.15]",
        )}
      >
        {badgeCount}
      </span>
      {canManageWorkspace && (
        <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={t("projects.actionsFor", { name: projectDisplayName })}
            aria-expanded={open}
            data-menu-trigger
            className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/10"
          >
            <MoreHorizontal className="w-3 h-3" />
          </button>
          {open && (
            <div
              role="menu"
              className="absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-popover/95 text-xs text-popover-foreground shadow-xl backdrop-blur-xl dark:border-blue-300/10 dark:bg-[#080d1d]/95 dark:text-foreground dark:shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
            >
              {!protectedDesignQueue && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    onMove();
                  }}
                  className="w-full flex items-center gap-2 text-left px-3 py-2 hover:bg-accent dark:hover:bg-white/5"
                >
                  <Folder className="w-3 h-3" /> {t("projects.moveToSpace")}
                </button>
              )}
              <button
                role="menuitem"
                onClick={handleDuplicate}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent dark:hover:bg-white/5",
                  !protectedDesignQueue &&
                    "border-t border-border dark:border-white/5",
                )}
              >
                <Copy className="w-3 h-3" /> {t("common.duplicate")}
              </button>
              {!protectedDesignQueue && (
                <button
                  role="menuitem"
                  onClick={handleDelete}
                  className="w-full flex items-center gap-2 border-t border-border px-3 py-2 text-left text-upflow-danger hover:bg-upflow-danger/10 dark:border-white/5"
                >
                  <Trash2 className="w-3 h-3" /> {t("common.delete")}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
