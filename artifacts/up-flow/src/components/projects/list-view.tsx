"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { cn, formatDate, getInitials, isOverdue } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import CustomFieldInput from "@/components/projects/custom-field-input";
import BrazilianDateInput from "@/components/ui/brazilian-date-input";
import {
  priorityToneClass,
  TASK_PRIORITIES,
} from "@/components/projects/priority-ui";
import type { CustomFieldDefinition, Task, TaskAssignee } from "@/lib/types";
import type {
  GroupBy,
  ToolbarState,
} from "@/components/projects/project-toolbar";

interface Props {
  projectId: string;
  tasks: Task[];
  customFields: CustomFieldDefinition[];
  users: TaskAssignee[];
  toolbar: ToolbarState;
  onTaskClick: (task: Task) => void;
  onAddTask: (groupKey?: string) => void;
  addItemLabel?: string;
  canCreate: boolean;
  canAddTasks?: boolean;
  /**
   * Explicit project contribution capability. `canCreate` is retained for
   * callers that only know whether task work is available, but an explicit
   * false value must always make inline controls read-only.
   */
  canContribute?: boolean;
  onUpdate: () => void;
  selectedTaskIds?: Set<string>;
  onToggleTaskSelection?: (taskId: string) => void;
  selectionMode?: boolean;
}

const STATUS_META: Record<string, { label: string; dot: string }> = {
  todo: { label: "To Do", dot: "bg-muted-foreground/60" },
  in_progress: { label: "In Progress", dot: "bg-primary" },
  done: { label: "Done", dot: "bg-upflow-success" },
};
const PRIORITY_META: Record<string, { label: string; dot: string }> = {
  high: { label: "High", dot: "bg-upflow-danger" },
  medium: { label: "Medium", dot: "bg-upflow-warning" },
  low: { label: "Low", dot: "bg-muted-foreground/50" },
};

export default function ListView({
  projectId,
  tasks,
  customFields,
  users,
  toolbar,
  onTaskClick,
  onAddTask,
  addItemLabel,
  canCreate,
  canAddTasks = canCreate,
  canContribute,
  onUpdate,
  selectedTaskIds,
  onToggleTaskSelection,
  selectionMode = false,
}: Props) {
  const { t } = useLanguage();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const canMutateTasks = canContribute ?? canCreate;

  const cols = useMemo(
    () => buildColumns(customFields, toolbar.visibleColumns, t),
    [customFields, toolbar.visibleColumns, t],
  );

  const groups = useMemo(
    () => groupTasks(tasks, toolbar, users, t),
    [tasks, toolbar, users, t],
  );

  const updateField = async (
    taskId: string,
    definitionId: string,
    value: unknown,
  ) => {
    if (!canMutateTasks) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}/custom-fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition_id: definitionId, value }),
      });
      if (!res.ok) throw new Error();
      onUpdate();
    } catch {
      toast.error(t("common.failedToUpdate"));
    }
  };

  const updateTask = async (taskId: string, patch: Record<string, unknown>) => {
    if (!canMutateTasks) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok)
        throw new Error(
          await readTaskApiError(res, t("common.failedToUpdate")),
        );
      onUpdate();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("common.failedToUpdate"),
      );
    }
  };

  return (
    <div className="relative max-h-[calc(100dvh-300px)] max-w-full overflow-auto rounded-lg border border-border bg-card sm:max-h-[calc(100dvh-280px)]">
      <div
        className="grid items-center px-3 py-1.5 border-b border-border bg-card text-[11px] font-semibold uppercase tracking-wider text-muted-foreground sticky top-0 z-20"
        style={{ gridTemplateColumns: cols.gridTemplate }}
      >
        <div className="px-2 sticky left-0 bg-card">{t("toolbar.title")}</div>
        {cols.cols.map((c) => (
          <div key={c.key} className="px-2 truncate">
            {c.label}
          </div>
        ))}
      </div>

      {groups.map((g) => {
        const isCollapsed = collapsed[g.key];
        return (
          <div key={g.key} className="border-b border-border last:border-b-0">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/40 sticky top-[30px] z-10">
              <button
                type="button"
                onClick={() =>
                  setCollapsed((p) => ({ ...p, [g.key]: !p[g.key] }))
                }
                aria-label={`${isCollapsed ? t("common.expand") : t("common.collapse")} ${g.label}`}
                aria-expanded={!isCollapsed}
                className="text-muted-foreground hover:text-foreground p-0.5"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
              <span
                className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded",
                  g.colorClass,
                )}
              >
                {g.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {g.tasks.length}
              </span>
              {canMutateTasks && canAddTasks && (
                <button
                  onClick={() => onAddTask(g.key)}
                  className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-0.5 rounded hover:bg-muted"
                >
                  <Plus className="w-3 h-3" />{" "}
                  {addItemLabel ?? t("projects.addTask")}
                </button>
              )}
            </div>

            {!isCollapsed && (
              <div>
                {g.tasks.map((task) => {
                  const valueMap = new Map(
                    (task.custom_field_values ?? []).map((v) => [
                      v.definition_id,
                      v.value,
                    ]),
                  );
                  const isSelected = selectedTaskIds?.has(task.id) ?? false;
                  return (
                    <div
                      key={task.id}
                      className={cn(
                        "grid items-center border-t border-border/60 px-3 py-1.5 hover:bg-muted/30 group",
                        isSelected &&
                          "bg-blue-500/10 ring-1 ring-inset ring-blue-400/60",
                      )}
                      style={{ gridTemplateColumns: cols.gridTemplate }}
                    >
                      <div
                        className={cn(
                          "sticky left-0 flex min-w-0 cursor-pointer items-center gap-2 px-2 group-hover:bg-muted/30",
                          isSelected ? "bg-primary/10" : "bg-card",
                        )}
                        onClick={() => {
                          if (
                            selectionMode &&
                            onToggleTaskSelection &&
                            canMutateTasks
                          ) {
                            onToggleTaskSelection(task.id);
                            return;
                          }
                          onTaskClick(task);
                        }}
                      >
                        {selectionMode &&
                          onToggleTaskSelection &&
                          canMutateTasks && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => onToggleTaskSelection(task.id)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={t("task.selectTask", {
                                title: task.title,
                              })}
                              className="h-4 w-4 flex-shrink-0 rounded border-border bg-background text-blue-500 focus:ring-2 focus:ring-blue-400"
                            />
                          )}
                        {!selectionMode && (
                          <button
                            onClick={(e) => e.stopPropagation()}
                            disabled
                            className={cn(
                              "flex h-4 w-4 flex-shrink-0 cursor-not-allowed items-center justify-center rounded-full border-2 opacity-70",
                              task.status === "done"
                                ? "bg-upflow-success border-upflow-success"
                                : "border-border",
                            )}
                            title={t("task.automaticMovementOnly")}
                            aria-label={t("task.automaticMovementOnly")}
                          >
                            {task.status === "done" && (
                              <span className="text-[8px] text-white">✓</span>
                            )}
                          </button>
                        )}
                        <span
                          className={cn(
                            "min-w-0 truncate text-sm text-foreground",
                            task.status === "done" &&
                              "line-through text-muted-foreground",
                          )}
                        >
                          {task.title}
                        </span>
                        {isOverdue(task.due_date) && task.status !== "done" && (
                          <AlertCircle className="w-3.5 h-3.5 text-upflow-danger flex-shrink-0" />
                        )}
                        {(task._count?.subtasks ?? 0) > 0 && (
                          <span className="text-[10px] text-muted-foreground">
                            {t("task.subtasksCount", {
                              count: task._count?.subtasks ?? 0,
                            })}
                          </span>
                        )}
                      </div>
                      {cols.cols.map((c) => (
                        <div
                          key={c.key}
                          className="px-2 min-w-0 text-xs text-muted-foreground"
                        >
                          {c.kind === "standard" ? (
                            renderStandardCell(
                              c.key,
                              task,
                              users,
                              updateTask,
                              canMutateTasks,
                              t,
                            )
                          ) : (
                            <fieldset
                              disabled={!canMutateTasks}
                              aria-readonly={!canMutateTasks}
                              className={cn(
                                "min-w-0 border-0 p-0",
                                !canMutateTasks && "opacity-70",
                              )}
                            >
                              <CustomFieldInput
                                definition={c.field!}
                                value={valueMap.get(c.field!.id)}
                                users={users}
                                onChange={(v) =>
                                  updateField(task.id, c.field!.id, v)
                                }
                                compact
                              />
                            </fieldset>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })}
                {canMutateTasks && canAddTasks && (
                  <button
                    onClick={() => onAddTask(g.key)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-5 py-2 w-full text-left border-t border-border/60"
                  >
                    <Plus className="w-3 h-3" />{" "}
                    {addItemLabel ?? t("projects.addTask")}
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {groups.length === 0 && (
        <div className="text-center py-12 text-sm text-muted-foreground">
          {t("dashboard.noFocus")}
        </div>
      )}
    </div>
  );
}

function renderStandardCell(
  key: string,
  t: Task,
  users: TaskAssignee[],
  updateTask: (id: string, patch: Record<string, unknown>) => void,
  canMutateTasks: boolean,
  translate: (key: string, vars?: Record<string, string | number>) => string,
) {
  if (key === "assignee") {
    return (
      <select
        value={t.assignee?.id ?? ""}
        onChange={(e) =>
          updateTask(t.id, { assignee_id: e.target.value || null })
        }
        onClick={(e) => e.stopPropagation()}
        disabled={!canMutateTasks}
        className={cn(
          "bg-transparent text-xs text-foreground hover:bg-muted/50 px-1.5 py-0.5 rounded border border-transparent hover:border-border focus:outline-none focus:ring-2 focus:ring-ring max-w-full",
          !canMutateTasks && "cursor-not-allowed opacity-70",
        )}
      >
        <option value="">—</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name}
          </option>
        ))}
      </select>
    );
  }
  if (key === "due_date") {
    return (
      <div className="flex items-center gap-1">
        <Calendar className="h-3 w-3 flex-shrink-0" />
        <BrazilianDateInput
          value={t.due_date ? t.due_date.slice(0, 10) : ""}
          onChange={() => {}}
          onCommit={(value) => updateTask(t.id, { due_date: value || null })}
          onClick={(e) => e.stopPropagation()}
          disabled={!canMutateTasks}
          className={cn(
            "w-[82px] max-w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs hover:border-border focus:outline-none focus:ring-2 focus:ring-ring",
            isOverdue(t.due_date) &&
              t.status !== "done" &&
              "text-upflow-danger",
            !canMutateTasks && "cursor-not-allowed opacity-70",
          )}
        />
      </div>
    );
  }
  if (key === "priority") {
    return (
      <select
        value={t.priority}
        onChange={(e) => updateTask(t.id, { priority: e.target.value })}
        onClick={(e) => e.stopPropagation()}
        disabled={!canMutateTasks}
        title={`${translate("toolbar.priority")}: ${priorityMetaLabel(t.priority, translate)}`}
        className={cn(
          "max-w-full rounded-md border px-2 py-1 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-ring",
          priorityToneClass(t.priority),
          !canMutateTasks && "cursor-not-allowed opacity-70",
        )}
      >
        {TASK_PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {priorityMetaLabel(p, translate)}
          </option>
        ))}
      </select>
    );
  }
  if (key === "status") {
    return (
      <select
        value={t.status}
        onChange={() => {}}
        onClick={(e) => e.stopPropagation()}
        disabled
        title={translate("task.automaticMovementOnly")}
        className={cn(
          "bg-transparent text-xs text-foreground hover:bg-muted/50 px-1.5 py-0.5 rounded border border-transparent hover:border-border focus:outline-none focus:ring-2 focus:ring-ring",
          "cursor-not-allowed opacity-70",
        )}
      >
        {Object.entries(STATUS_META).map(([k]) => (
          <option key={k} value={k}>
            {statusMetaLabel(k as "todo" | "in_progress" | "done", translate)}
          </option>
        ))}
      </select>
    );
  }
  return null;
}

interface BuiltCol {
  key: string;
  label: string;
  kind: "standard" | "custom";
  width: string;
  field?: CustomFieldDefinition;
}

function buildColumns(
  customFields: CustomFieldDefinition[],
  visible: Record<string, boolean>,
  t: (key: string, vars?: Record<string, string | number>) => string,
): { cols: BuiltCol[]; gridTemplate: string } {
  const standards: BuiltCol[] = [
    {
      key: "assignee",
      label: t("toolbar.assignee"),
      kind: "standard",
      width: "minmax(140px, 0.8fr)",
    },
    {
      key: "due_date",
      label: t("toolbar.dueDate"),
      kind: "standard",
      width: "minmax(140px, 0.8fr)",
    },
    {
      key: "priority",
      label: t("toolbar.priority"),
      kind: "standard",
      width: "minmax(130px, 0.7fr)",
    },
    {
      key: "status",
      label: t("toolbar.status"),
      kind: "standard",
      width: "minmax(120px, 0.6fr)",
    },
  ];
  const customs: BuiltCol[] = customFields.map((f) => ({
    key: f.id,
    label: f.name,
    kind: "custom",
    width: "minmax(140px, 1fr)",
    field: f,
  }));
  const all = [...standards, ...customs].filter((c) => visible[c.key] ?? true);
  const gridTemplate = ["minmax(280px, 2fr)", ...all.map((c) => c.width)].join(
    " ",
  );
  return { cols: all, gridTemplate };
}

interface Group {
  key: string;
  label: string;
  colorClass: string;
  tasks: Task[];
}

function groupTasks(
  tasks: Task[],
  toolbar: ToolbarState,
  users: TaskAssignee[],
  t: (key: string, vars?: Record<string, string | number>) => string,
): Group[] {
  let filtered = tasks;
  if (toolbar.search.trim()) {
    const q = toolbar.search.toLowerCase();
    filtered = filtered.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q),
    );
  }
  if (!toolbar.showClosed) {
    filtered = filtered.filter((t) => t.status !== "done");
  }
  if (toolbar.filterPriority !== "all") {
    filtered = filtered.filter((t) => t.priority === toolbar.filterPriority);
  }
  if (toolbar.filterAssignee !== "all") {
    const allowed = new Set(users.map((u) => u.id));
    if (toolbar.filterAssignee === "unassigned") {
      filtered = filtered.filter((t) => !t.assignee);
    } else if (allowed.has(toolbar.filterAssignee)) {
      filtered = filtered.filter(
        (t) => t.assignee?.id === toolbar.filterAssignee,
      );
    } else {
      filtered = filtered.filter(
        (t) => t.assignee?.id === toolbar.filterAssignee,
      );
    }
  }

  const sorted = [...filtered].sort((a, b) => compareTasks(a, b, toolbar));

  const buckets: Group[] = [];
  const push = (key: string, label: string, colorClass: string, t: Task) => {
    let g = buckets.find((x) => x.key === key);
    if (!g) {
      g = { key, label, colorClass, tasks: [] };
      buckets.push(g);
    }
    g.tasks.push(t);
  };

  if (toolbar.groupBy === "status") {
    (["todo", "in_progress", "done"] as const).forEach((s) => {
      buckets.push({
        key: s,
        label: statusMetaLabel(s, t),
        colorClass: pillFor("status", s),
        tasks: [],
      });
    });
    sorted.forEach((t) => {
      const g = buckets.find((b) => b.key === t.status);
      if (g) g.tasks.push(t);
    });
  } else if (toolbar.groupBy === "priority") {
    (["high", "medium", "low"] as const).forEach((p) => {
      buckets.push({
        key: p,
        label: priorityMetaLabel(p, t),
        colorClass: pillFor("priority", p),
        tasks: [],
      });
    });
    sorted.forEach((t) => {
      const g = buckets.find((b) => b.key === t.priority);
      if (g) g.tasks.push(t);
    });
  } else if (toolbar.groupBy === "assignee") {
    sorted.forEach((task) => {
      const key = task.assignee?.id ?? "_unassigned";
      const label = task.assignee?.name ?? t("common.unassigned");
      push(key, label, "bg-muted text-muted-foreground", task);
    });
  } else {
    buckets.push({
      key: "all",
      label: t("dashboard.tasks"),
      colorClass: "bg-muted text-muted-foreground",
      tasks: sorted,
    });
  }

  return buckets.filter(
    (b) => b.tasks.length > 0 || toolbar.groupBy === "status",
  );
}

function pillFor(kind: "status" | "priority", key: string) {
  if (kind === "status") {
    if (key === "todo") return "bg-muted text-foreground";
    if (key === "in_progress") return "bg-primary/[0.15] text-primary";
    if (key === "done") return "bg-upflow-success/[0.15] text-upflow-success";
  }
  if (kind === "priority") {
    if (key === "high") return "bg-upflow-danger/[0.15] text-upflow-danger";
    if (key === "medium") return "bg-upflow-warning/[0.15] text-upflow-warning";
    if (key === "low") return "bg-muted text-muted-foreground";
  }
  return "bg-muted text-muted-foreground";
}

function statusMetaLabel(
  status: "todo" | "in_progress" | "done",
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  if (status === "todo") return t("status.todo");
  if (status === "in_progress") return t("status.inProgress");
  return t("status.done");
}

async function readTaskApiError(res: Response, fallback: string) {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function priorityMetaLabel(
  priority: "high" | "medium" | "low",
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  if (priority === "high") return t("priority.high");
  if (priority === "medium") return t("priority.medium");
  return t("priority.low");
}

function compareTasks(a: Task, b: Task, toolbar: ToolbarState): number {
  const dir = toolbar.sortDir === "asc" ? 1 : -1;
  const PRIO_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
  switch (toolbar.sortBy) {
    case "title":
      return a.title.localeCompare(b.title) * dir;
    case "due_date": {
      const av = a.due_date ? Date.parse(a.due_date) : Infinity;
      const bv = b.due_date ? Date.parse(b.due_date) : Infinity;
      return (av - bv) * dir;
    }
    case "priority":
      return (PRIO_RANK[a.priority] - PRIO_RANK[b.priority]) * dir;
    case "created_at":
      return (Date.parse(a.created_at) - Date.parse(b.created_at)) * dir;
    case "position":
    default:
      return (a.position - b.position) * dir;
  }
}
