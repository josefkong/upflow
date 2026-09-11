"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FolderKanban,
  ListTodo,
  Loader2,
  Settings2,
  Shapes,
} from "lucide-react";
import { toast } from "sonner";

import { useLanguage } from "@/components/language-provider";
import CustomFieldInput from "@/components/projects/custom-field-input";
import { PriorityPicker, type TaskPriority } from "@/components/projects/priority-ui";
import TaskAssigneePicker from "@/components/projects/task-assignee-picker";
import TaskTemplateFields from "@/components/projects/task-template-fields";
import BrazilianDateInput from "@/components/ui/brazilian-date-input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { logError } from "@/lib/log-error";
import {
  buildTaskBrief,
  DEFAULT_TASK_TEMPLATE_ID,
  type TaskTemplateId,
} from "@/lib/task-templates";
import {
  resolveTaskBoardStatus,
  taskBoardStatusValue,
  taskStatusForTaskBoardOption,
} from "@/lib/task-board-status";
import type {
  CustomFieldDefinition,
  Project,
  Task,
  TaskAssignee,
  WorkflowStatus,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { isCommercialSystemFlowProject } from "@/lib/commercial-managed-projects";
import { isFinanceContractMirrorProject } from "@/lib/commercial-contract-mirror";

export interface TaskCreateSheetProps {
  open: boolean;
  onClose: () => void;
  onCreated: (task: Task) => void;
  projectId?: string;
  defaultStatus?: Task["status"];
  defaultTemplateId?: TaskTemplateId;
  defaultDueDate?: string;
  initialCustomFieldValues?: Record<string, unknown>;
}

const STATUS_OPTIONS: Task["status"][] = ["todo", "in_progress", "done"];

function statusLabel(
  status: Task["status"],
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  if (status === "todo") return t("status.todo");
  if (status === "in_progress") return t("status.inProgress");
  return t("status.done");
}

export default function TaskCreateSheet({
  open,
  onClose,
  onCreated,
  projectId,
  defaultStatus = "todo",
  defaultTemplateId = DEFAULT_TASK_TEMPLATE_ID,
  defaultDueDate = "",
  initialCustomFieldValues,
}: TaskCreateSheetProps) {
  const { t } = useLanguage();
  const titleRef = useRef<HTMLInputElement | null>(null);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<Task["status"]>(defaultStatus);
  const [templateId, setTemplateId] = useState<TaskTemplateId>(defaultTemplateId);
  const [templateValues, setTemplateValues] = useState<Record<string, string>>({});
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>(
    initialCustomFieldValues ?? {},
  );

  const [selectedProjectId, setSelectedProjectId] = useState(projectId ?? "");
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectContext, setProjectContext] = useState<Project | null>(null);
  const [users, setUsers] = useState<TaskAssignee[]>([]);
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [workflowStatuses, setWorkflowStatuses] = useState<WorkflowStatus[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);

  const [titleError, setTitleError] = useState("");
  const [projectError, setProjectError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const selectedProject = useMemo(
    () => projectContext ?? projects.find((project) => project.id === selectedProjectId) ?? null,
    [projectContext, projects, selectedProjectId],
  );
  const contributorAccessDenied = Boolean(
    selectedProjectId &&
      projectContext?.capabilities &&
      !projectContext.capabilities.canContribute,
  );
  const selectedAssignee = users.find((user) => user.id === assigneeId) ?? null;
  const boardStatus = useMemo(
    () =>
      selectedProjectId
        ? resolveTaskBoardStatus({
            customFields,
            workflowStatuses,
            projectId: selectedProjectId,
            spaceId: selectedProject?.space_id,
          })
        : null,
    [customFields, selectedProject?.space_id, selectedProjectId, workflowStatuses],
  );
  const selectedBoardStatusValue = boardStatus
    ? taskBoardStatusValue(boardStatus, fieldValues[boardStatus.field.id], status)
    : "";
  const visibleCustomFields = boardStatus
    ? customFields.filter((field) => field.id !== boardStatus.field.id)
    : customFields;

  useEffect(() => {
    if (!open) return;
    setTitle("");
    setNotes("");
    setAssigneeId("");
    setDueDate(defaultDueDate);
    setPriority("medium");
    setStatus(defaultStatus);
    setTemplateId(defaultTemplateId);
    setTemplateValues({});
    setFieldValues(initialCustomFieldValues ?? {});
    setSelectedProjectId(projectId ?? "");
    setProjectContext(null);
    setUsers([]);
    setCustomFields([]);
    setWorkflowStatuses([]);
    setTitleError("");
    setProjectError("");
    setProjectsError(null);
    setContextError(null);
    setDirty(false);
    setDiscardOpen(false);
    setAnnouncement("");
  }, [
    open,
    projectId,
    defaultStatus,
    defaultTemplateId,
    defaultDueDate,
    initialCustomFieldValues,
  ]);

  useEffect(() => {
    if (!open || projectId) return;
    const controller = new AbortController();
    setProjectsLoading(true);
    setProjectsError(null);
    fetch("/api/projects", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(t("task.couldNotLoadLists"));
        return response.json() as Promise<{ items?: Project[] }>;
      })
      .then((data) =>
        setProjects(
          (data.items ?? []).filter(
            (project) =>
              !isCommercialSystemFlowProject({
                projectName: project.name,
                spaceName: project.space?.name,
              }) &&
              !isFinanceContractMirrorProject({
                projectName: project.name,
                spaceName: project.space?.name,
              }),
          ),
        ),
      )
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        logError("task-create-sheet:load-projects", error);
        setProjects([]);
        setProjectsError(t("task.listLoadError"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setProjectsLoading(false);
      });
    return () => controller.abort();
  }, [open, projectId, t]);

  useEffect(() => {
    if (!open || !selectedProjectId) {
      setContextLoading(false);
      setProjectContext(null);
      setUsers([]);
      setCustomFields([]);
      setWorkflowStatuses([]);
      setContextError(null);
      return;
    }

    const controller = new AbortController();
    setContextLoading(true);
    setContextError(null);
    setUsers([]);
    setCustomFields([]);
    setWorkflowStatuses([]);
    setAssigneeId("");
    setFieldValues(initialCustomFieldValues ?? {});

    const load = async () => {
      try {
        const projectResponse = await fetch(`/api/projects/${selectedProjectId}`, {
          signal: controller.signal,
        });
        if (!projectResponse.ok) throw new Error(t("task.contextLoadError"));
        const project = (await projectResponse.json()) as Project;
        setProjectContext(project);

        if (
          isCommercialSystemFlowProject({
            projectName: project.name,
            spaceName: project.space?.name,
          }) ||
          isFinanceContractMirrorProject({
            projectName: project.name,
            spaceName: project.space?.name,
          })
        ) {
          setContextError(t("task.commercialFlowCreationBlocked"));
          return;
        }

        if (project.capabilities && !project.capabilities.canContribute) {
          setContextError(t("task.contributorAccessRequired"));
          return;
        }

        const [usersResponse, fieldsResponse, workflowStatusesResponse] = await Promise.all([
          fetch(`/api/users?workspace_id=${project.workspace_id}&status=active&limit=500`, {
            signal: controller.signal,
          }),
          fetch(`/api/projects/${selectedProjectId}/custom-fields`, {
            signal: controller.signal,
          }),
          fetch(`/api/workflow-statuses?project_id=${selectedProjectId}&category=task&limit=100`, {
            signal: controller.signal,
          }),
        ]);
        if (!usersResponse.ok || !fieldsResponse.ok) {
          throw new Error(t("task.contextLoadError"));
        }
        const [usersData, fieldsData, workflowStatusesData] = await Promise.all([
          usersResponse.json() as Promise<{ items?: TaskAssignee[] }>,
          fieldsResponse.json() as Promise<CustomFieldDefinition[]>,
          workflowStatusesResponse.ok
            ? (workflowStatusesResponse.json() as Promise<{ items?: WorkflowStatus[] }>)
            : Promise.resolve({ items: [] as WorkflowStatus[] }),
        ]);
        setUsers(usersData.items ?? []);
        setCustomFields(Array.isArray(fieldsData) ? fieldsData : []);
        setWorkflowStatuses(workflowStatusesData.items ?? []);
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        logError("task-create-sheet:load-context", error, { project_id: selectedProjectId });
        setContextError(
          error instanceof Error ? error.message : t("task.contextLoadError"),
        );
      } finally {
        if (!controller.signal.aborted) setContextLoading(false);
      }
    };
    void load();
    return () => controller.abort();
  }, [open, selectedProjectId, projects, initialCustomFieldValues, t]);

  const markDirty = () => setDirty(true);

  const requestClose = () => {
    if (submitting) return;
    if (dirty) {
      setDiscardOpen(true);
      return;
    }
    onClose();
  };

  const discardAndClose = () => {
    setDiscardOpen(false);
    setDirty(false);
    onClose();
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const cleanTitle = title.trim();
    let invalid = false;
    if (!cleanTitle) {
      setTitleError(t("task.titleRequired"));
      invalid = true;
    }
    if (!selectedProjectId) {
      setProjectError(t("task.projectRequired"));
      invalid = true;
    }
    if (contributorAccessDenied) {
      setContextError(t("task.contributorAccessRequired"));
      setAnnouncement(t("task.contributorAccessRequired"));
      return;
    }
    if (
      selectedProject &&
      (isCommercialSystemFlowProject({
        projectName: selectedProject.name,
        spaceName: selectedProject.space?.name,
      }) ||
        isFinanceContractMirrorProject({
          projectName: selectedProject.name,
          spaceName: selectedProject.space?.name,
        }))
    ) {
      setContextError(t("task.commercialFlowCreationBlocked"));
      setAnnouncement(t("task.commercialFlowCreationBlocked"));
      return;
    }
    if (invalid) {
      setAnnouncement(t("task.fixErrors"));
      if (!cleanTitle) titleRef.current?.focus();
      return;
    }

    setSubmitting(true);
    setAnnouncement(t("common.creating"));
    try {
      const fieldValuesForSubmit =
        boardStatus && selectedBoardStatusValue
          ? {
              ...fieldValues,
              [boardStatus.field.id]: selectedBoardStatusValue,
            }
          : fieldValues;
      const customFieldEntries = Object.entries(fieldValuesForSubmit)
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([definition_id, value]) => ({ definition_id, value }));
      const statusForSubmit = boardStatus
        ? taskStatusForTaskBoardOption(boardStatus, selectedBoardStatusValue) ?? status
        : status;
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cleanTitle,
          description: buildTaskBrief({
            templateId,
            values: templateValues,
            notes,
            translate: t,
          }),
          status: statusForSubmit,
          priority,
          project_id: selectedProjectId,
          assignee_id: assigneeId || null,
          due_date: dueDate || null,
          custom_fields: customFieldEntries,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as Task & { error?: string };
      if (!response.ok) throw new Error(data.error || t("task.failedCreate"));

      const message = [
        selectedProject?.name
          ? t("task.createdInList", {
              title: cleanTitle,
              location: t("common.inLocation", { location: selectedProject.name }),
            })
          : t("task.created", { title: cleanTitle }),
        selectedAssignee
          ? t("task.assigneeNotified", { name: selectedAssignee.name })
          : t("task.noAssigneeSelected"),
      ].join(" ");
      setAnnouncement(message);
      toast.success(message);
      setDirty(false);
      onCreated(data);
      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t("task.failedCreate");
      setAnnouncement(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) requestClose();
        }}
      >
        <DialogContent
          data-task-create-sheet
          data-task-create-dialog
          className="flex h-[min(760px,calc(100dvh-32px))] w-[calc(100vw-32px)] max-w-[680px] flex-col gap-0 overflow-hidden rounded-2xl border-border bg-background p-0 shadow-2xl sm:max-w-[680px] sm:rounded-2xl sm:p-0"
          onPointerDownOutside={(event) => {
            if (submitting) event.preventDefault();
          }}
          onEscapeKeyDown={(event) => {
            if (submitting) event.preventDefault();
          }}
        >
          <DialogHeader className="border-b border-border px-5 py-4 pr-12 text-left sm:px-6">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <ListTodo className="h-4 w-4" />
              {t("task.newTask")}
            </div>
            <DialogTitle>{t("task.createTask")}</DialogTitle>
            <DialogDescription>{t("task.createSheetDescription")}</DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
            <div data-task-create-scroll className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              <div className="space-y-5">
                <Field
                  label={t("task.destinationList")}
                  htmlFor={projectId ? undefined : "task-project"}
                  required
                  error={projectError || projectsError || ""}
                  errorId="task-project-error"
                >
                  {projectId ? (
                    <div className="flex min-h-10 items-center gap-2 rounded-md border border-input bg-muted/30 px-3 text-sm">
                      <FolderKanban className="h-4 w-4 text-muted-foreground" />
                      <span className="min-w-0 truncate">
                        {selectedProject?.name ?? t("task.loadingContext")}
                      </span>
                    </div>
                  ) : (
                    <select
                      id="task-project"
                      value={selectedProjectId}
                      onChange={(event) => {
                        setSelectedProjectId(event.target.value);
                        setProjectContext(null);
                        setProjectError("");
                        markDirty();
                      }}
                      disabled={submitting || projectsLoading}
                      aria-invalid={Boolean(projectError)}
                      aria-describedby={projectError ? "task-project-error" : undefined}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                    >
                      <option value="">
                        {projectsLoading ? t("task.loadingLists") : t("task.chooseDeliverableList")}
                      </option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {!projectsLoading && !projectId && projects.length === 0 && !projectsError ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">{t("task.noListsAvailable")}</p>
                  ) : null}
                </Field>

                <Field
                  label={t("task.taskTitleLabel")}
                  htmlFor="task-title"
                  required
                  error={titleError}
                  errorId="task-title-error"
                >
                  <Input
                    id="task-title"
                    ref={titleRef}
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      setTitleError("");
                      markDirty();
                    }}
                    placeholder={t("task.deliverableActionPlaceholder")}
                    autoFocus
                    aria-required="true"
                    aria-invalid={Boolean(titleError)}
                    aria-describedby={titleError ? "task-title-error" : "task-title-hint"}
                    className="h-11 text-base"
                  />
                  <p id="task-title-hint" className="mt-1.5 text-xs text-muted-foreground">
                    {t("task.explicitTitleHint")}
                  </p>
                </Field>

                <Field label={t("task.optionalNotes")} htmlFor="task-notes">
                  <Textarea
                    id="task-notes"
                    value={notes}
                    onChange={(event) => {
                      setNotes(event.target.value);
                      markDirty();
                    }}
                    rows={3}
                    placeholder={t("task.contextNotesPlaceholder")}
                  />
                </Field>

                <TaskAssigneePicker
                  value={assigneeId}
                  users={users}
                  onChange={(value) => {
                    setAssigneeId(value);
                    markDirty();
                  }}
                  disabled={submitting || !selectedProjectId || contextLoading || contributorAccessDenied}
                  loading={contextLoading}
                  label={t("toolbar.assignee")}
                  emptyLabel={t("common.unassigned")}
                  mode="create"
                />

                <div className="grid grid-cols-1 gap-5">
                  <Field label={t("toolbar.dueDate")} htmlFor="task-due-date">
                    <BrazilianDateInput
                      id="task-due-date"
                      value={dueDate}
                      onChange={(value) => {
                        setDueDate(value);
                        markDirty();
                      }}
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  </Field>
                  <Field label={t("toolbar.priority")}>
                    <div role="group" aria-label={t("toolbar.priority")}>
                      <PriorityPicker
                        value={priority}
                        onChange={(value) => {
                          setPriority(value);
                          markDirty();
                        }}
                        t={t}
                        compact
                      />
                    </div>
                  </Field>
                </div>

                <div className="space-y-2 border-t border-border pt-5">
                  <ProgressiveSection icon={Shapes} title={t("task.detailsTemplate")}>
                    <TaskTemplateFields
                      templateId={templateId}
                      values={templateValues}
                      onTemplateChange={(value) => {
                        setTemplateId(value);
                        markDirty();
                      }}
                      onValuesChange={(value) => {
                        setTemplateValues(value);
                        markDirty();
                      }}
                    />
                  </ProgressiveSection>

                  {visibleCustomFields.length > 0 ? (
                    <ProgressiveSection
                      icon={FolderKanban}
                      title={t("task.detailsCustomFields")}
                      count={visibleCustomFields.length}
                    >
                      <div className="space-y-4">
                        {visibleCustomFields.map((field) => (
                          <Field key={`${selectedProjectId}:${field.id}`} label={field.name}>
                            <CustomFieldInput
                              definition={field}
                              value={fieldValues[field.id]}
                              onChange={(value) => {
                                setFieldValues((previous) => ({
                                  ...previous,
                                  [field.id]: value,
                                }));
                                markDirty();
                              }}
                              users={users}
                            />
                          </Field>
                        ))}
                      </div>
                    </ProgressiveSection>
                  ) : null}

                  <ProgressiveSection icon={Settings2} title={t("task.detailsSettings")}>
                    <Field label={t("task.statusLabel")} htmlFor="task-status">
                      <select
                        id="task-status"
                        value={boardStatus ? selectedBoardStatusValue : status}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (boardStatus) {
                            setFieldValues((previous) => ({
                              ...previous,
                              [boardStatus.field.id]: value,
                            }));
                            const mappedStatus = taskStatusForTaskBoardOption(boardStatus, value);
                            if (mappedStatus) setStatus(mappedStatus);
                          } else {
                            setStatus(value as Task["status"]);
                          }
                          markDirty();
                        }}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        {boardStatus
                          ? boardStatus.options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.value}
                              </option>
                            ))
                          : STATUS_OPTIONS.map((option) => (
                              <option key={option} value={option}>
                                {statusLabel(option, t)}
                              </option>
                            ))}
                      </select>
                    </Field>
                  </ProgressiveSection>

                </div>

                {contextError ? (
                  <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {contextError}
                  </p>
                ) : null}
              </div>
            </div>

            <div data-task-create-footer className="shrink-0 border-t border-border bg-background px-5 py-3 shadow-[0_-8px_20px_rgba(0,0,0,0.04)] sm:px-6">
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="ghost" onClick={requestClose} disabled={submitting}>
                  {t("common.cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={submitting || projectsLoading || contextLoading || contributorAccessDenied}
                  className="min-w-32"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {t("task.createTask")}
                </Button>
              </div>
            </div>

            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {announcement}
            </p>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("task.discardTitle")}</DialogTitle>
            <DialogDescription>{t("task.discardMessage")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button type="button" variant="outline" onClick={() => setDiscardOpen(false)}>
              {t("task.keepEditing")}
            </Button>
            <Button type="button" variant="destructive" onClick={discardAndClose}>
              {t("task.discardConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Field({
  label,
  htmlFor,
  required = false,
  error = "",
  errorId,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  error?: string;
  errorId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-1 text-destructive" aria-hidden="true">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ProgressiveSection({
  icon: Icon,
  title,
  count,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <details className="group rounded-lg border border-border bg-card/40">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="flex-1">{title}</span>
        {typeof count === "number" ? (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {count}
          </span>
        ) : null}
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className={cn("border-t border-border px-3 py-4")}>{children}</div>
    </details>
  );
}
