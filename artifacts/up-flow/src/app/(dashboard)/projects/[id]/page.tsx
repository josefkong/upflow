"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Plus,
  FileText,
  Trash2,
  X,
  CheckSquare2,
  Loader2,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import Header from "@/components/layout/header";
import { CreateActionButton } from "@/components/ui/create-action-button";
import {
  PAGE_CONTENT_CLASS,
  PAGE_HEADER_CARD_CLASS,
} from "@/components/layout/page-content";
import ProjectPathBreadcrumbs from "@/components/projects/project-path-breadcrumbs";
import { useLanguage } from "@/components/language-provider";
import KanbanBoard, {
  type ColumnKey,
} from "@/components/projects/kanban-board";
import ListView from "@/components/projects/list-view";
import TaskCreateSheet from "@/components/projects/task-create-sheet";
import CommercialLeadCreateSheet from "@/components/commercial/commercial-lead-create-sheet";
import CommercialProposalArchive from "@/components/commercial/commercial-proposal-archive";
import CommercialContractsRegistry from "@/components/commercial/commercial-contracts-registry";
import ClientSpaceRegistry from "@/components/clients/client-space-registry";
import CustomFieldsManager from "@/components/projects/custom-fields-manager";
import ProjectMembersDialog from "@/components/projects/project-members-dialog";
import ProjectToolbar, {
  type ToolbarState,
} from "@/components/projects/project-toolbar";
import TaskDetailSheet from "@/components/projects/task-detail-sheet";
import CreativeBriefingForm from "@/components/projects/creative-briefing-form";
import SocialMediaCalendar from "@/components/projects/social-media-calendar";
import { SpaceWorkflowStatusManager } from "@/components/spaces/space-workflow-status-manager";
import { cn, formatDate, statusColor, statusLabel } from "@/lib/utils";
import {
  getOnboardingTaskAction,
  workflowFormKind,
} from "@/lib/onboarding-task-routing";
import { isFinanceOnboardingSpace } from "@/lib/onboarding-routing";
import { isSocialMediaCalendarListName } from "@/lib/social-media";
import {
  localizeProjectDescription,
  localizeProjectName,
  localizeSpaceName,
} from "@/lib/i18n/project-name-translations";
import { getCachedJson, peekCachedJson } from "@/lib/client-cache";
import { ApiResponseError } from "@/lib/client-auth-recovery";
import { projectPageCacheKeys } from "@/lib/project-page-cache";
import { isCommercialProposalArchiveProject } from "@/lib/commercial-proposal-archive";
import { isFinanceContractMirrorProject } from "@/lib/commercial-contract-mirror";
import {
  isCommercialContractsRegistryProject,
  isCommercialFlowEntryProject,
  isCommercialManagedDownstreamProject,
} from "@/lib/commercial-managed-projects";
import { isClientsRegistryProject } from "@/lib/client-space-structure";
import { isEquipmentControlProject } from "@/lib/equipment-control-shared";
import type {
  AppUser,
  CustomFieldDefinition,
  Project,
  Task,
  TaskAssignee,
  WorkflowStatus,
} from "@/lib/types";

const DEFAULT_TOOLBAR: ToolbarState = {
  view: "board",
  search: "",
  groupBy: "status",
  sortBy: "position",
  sortDir: "asc",
  showClosed: true,
  visibleColumns: {},
  filterPriority: "all",
  filterAssignee: "all",
};

interface CreateTaskDefaults {
  status: ColumnKey;
  fieldValues?: Record<string, unknown>;
}

function OnboardingFormLoader() {
  const { t } = useLanguage();
  return (
    <div
      className="flex min-h-[360px] items-center justify-center rounded-2xl border border-border bg-card p-6"
      aria-label={t("common.loading")}
    >
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
    </div>
  );
}

const FinanceOnboardingForm = dynamic(
  () => import("@/components/onboarding/finance-onboarding-form"),
  {
    ssr: false,
    loading: OnboardingFormLoader,
  },
);

const MarketingB2BOnboardingForm = dynamic(
  () => import("@/components/onboarding/marketing-b2b-onboarding-form"),
  {
    ssr: false,
    loading: OnboardingFormLoader,
  },
);

const MarketingB2COnboardingForm = dynamic(
  () => import("@/components/onboarding/marketing-b2c-onboarding-form"),
  {
    ssr: false,
    loading: OnboardingFormLoader,
  },
);

const SupportOnboardingForm = dynamic(
  () => import("@/components/onboarding/support-onboarding-form"),
  {
    ssr: false,
    loading: OnboardingFormLoader,
  },
);

const EquipmentControlBoard = dynamic(
  () => import("@/components/equipment/equipment-control-board"),
  {
    ssr: false,
    loading: OnboardingFormLoader,
  },
);

function isDesignQueueProject(project: Project | null) {
  if (!project) return false;
  const projectName = project.name.trim().toLocaleLowerCase();
  const spaceName = project.space?.name.trim().toLocaleLowerCase();
  return (
    projectName === "design queue" &&
    (spaceName === "creative & design" || spaceName === "criativos & design")
  );
}

function isSocialMediaProject(project: Project | null) {
  return isSocialMediaCalendarListName(project?.name);
}

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, language } = useLanguage();
  const id = (params?.id ?? "") as string;
  const focusedTaskId = searchParams?.get("task") ?? "";
  const viewParam = searchParams?.get("view") ?? "";
  const [project, setProject] = useState<Project | null>(() =>
    peekCachedJson<Project>(projectPageCacheKeys.project(id)),
  );
  const [tasks, setTasks] = useState<Task[]>(
    () =>
      peekCachedJson<{ items: Task[] }>(projectPageCacheKeys.tasks(id))
        ?.items ?? [],
  );
  const [users, setUsers] = useState<TaskAssignee[]>(() => {
    const workspaceId = peekCachedJson<Project>(
      projectPageCacheKeys.project(id),
    )?.workspace_id;
    return workspaceId
      ? (peekCachedJson<{ items: TaskAssignee[] }>(
          projectPageCacheKeys.users(workspaceId),
        )?.items ?? [])
      : [];
  });
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>(
    () =>
      peekCachedJson<CustomFieldDefinition[]>(
        projectPageCacheKeys.fields(id),
      ) ?? [],
  );
  const [workflowStatuses, setWorkflowStatuses] = useState<WorkflowStatus[]>(
    () =>
      peekCachedJson<{ items: WorkflowStatus[] }>(
        projectPageCacheKeys.workflows(id),
      )?.items ?? [],
  );
  const [me, setMe] = useState<AppUser | null>(() =>
    peekCachedJson<AppUser>(projectPageCacheKeys.me),
  );
  const [loading, setLoading] = useState(
    () =>
      !peekCachedJson<Project>(projectPageCacheKeys.project(id)) ||
      peekCachedJson<CustomFieldDefinition[]>(
        projectPageCacheKeys.fields(id),
      ) === null ||
      peekCachedJson<{ items: WorkflowStatus[] }>(
        projectPageCacheKeys.workflows(id),
      ) === null,
  );
  const [createOpen, setCreateOpen] = useState<CreateTaskDefaults | null>(null);
  const [commercialLeadCreateOpen, setCommercialLeadCreateOpen] =
    useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [manageMembersOpen, setManageMembersOpen] = useState(false);
  const [manageSpaceStatusesOpen, setManageSpaceStatusesOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [deletingSelectedTasks, setDeletingSelectedTasks] = useState(false);
  const [toolbar, setToolbar] = useState<ToolbarState>(DEFAULT_TOOLBAR);
  const canCreateTasks = Boolean(project?.capabilities?.canContribute);

  const loadData = async (force = false) => {
    try {
      const supportingRequests = Promise.all([
        getCachedJson<CustomFieldDefinition[]>(
          projectPageCacheKeys.fields(id),
          `/api/projects/${id}/custom-fields`,
          { ttlMs: 30_000, force },
        ).catch(() => [] as CustomFieldDefinition[]),
        getCachedJson<AppUser>(projectPageCacheKeys.me, "/api/auth/me", {
          ttlMs: 30_000,
          force,
        }).catch(() => null as AppUser | null),
        getCachedJson<{ items: WorkflowStatus[] }>(
          projectPageCacheKeys.workflows(id),
          `/api/workflow-statuses?project_id=${id}&category=task&limit=100`,
          { ttlMs: 30_000, force },
        ).catch(() => ({ items: [] as WorkflowStatus[] })),
      ]);
      const [[f, m, w], p, t] = await Promise.all([
        supportingRequests,
        getCachedJson<Project>(
          projectPageCacheKeys.project(id),
          `/api/projects/${id}`,
          { ttlMs: 10_000, force },
        ),
        getCachedJson<{ items: Task[] }>(
          projectPageCacheKeys.tasks(id),
          `/api/tasks?project_id=${id}`,
          { ttlMs: 5_000, force },
        ),
      ]);
      setProject(p);
      setTasks(t.items ?? []);
      setCustomFields(f);
      setWorkflowStatuses(w.items ?? []);
      setMe(m);
      setLoading(false);
      const u = await getCachedJson<{ items: TaskAssignee[] }>(
        projectPageCacheKeys.users(p.workspace_id),
        `/api/users?workspace_id=${p.workspace_id}&status=active`,
        { ttlMs: 30_000, force },
      ).catch(() => ({ items: [] as TaskAssignee[] }));
      setUsers(u.items ?? []);
    } catch (error) {
      if (error instanceof ApiResponseError && error.status === 404) {
        router.push("/projects");
        return;
      }
      toast.error(t("projects.failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const nextCachedProject = peekCachedJson<Project>(
      projectPageCacheKeys.project(id),
    );
    const nextCachedTasks = peekCachedJson<{ items: Task[] }>(
      projectPageCacheKeys.tasks(id),
    );
    const nextCachedFields = peekCachedJson<CustomFieldDefinition[]>(
      projectPageCacheKeys.fields(id),
    );
    const nextCachedWorkflows = peekCachedJson<{ items: WorkflowStatus[] }>(
      projectPageCacheKeys.workflows(id),
    );
    setProject(nextCachedProject);
    setTasks(nextCachedTasks?.items ?? []);
    setUsers(
      nextCachedProject
        ? (peekCachedJson<{ items: TaskAssignee[] }>(
            projectPageCacheKeys.users(nextCachedProject.workspace_id),
          )?.items ?? [])
        : [],
    );
    setCustomFields(nextCachedFields ?? []);
    setWorkflowStatuses(nextCachedWorkflows?.items ?? []);
    setLoading(
      !nextCachedProject ||
        nextCachedFields === null ||
        nextCachedWorkflows === null,
    );
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!focusedTaskId || loading) return;
    const task = tasks.find((item) => item.id === focusedTaskId);
    if (!task) return;
    const action = getOnboardingTaskAction(task, id);
    if (action?.kind === "form" && canCreateTasks) {
      setSelectedTask(null);
      if (viewParam !== "form") {
        router.replace(action.href, { scroll: false });
      }
      return;
    }
    if (action && action.kind !== "form") {
      setSelectedTask(null);
      router.replace(action.href, { scroll: false });
      return;
    }
    setSelectedTask(task);
  }, [canCreateTasks, focusedTaskId, id, loading, router, tasks, viewParam]);

  useEffect(() => {
    const liveTaskIds = new Set(tasks.map((task) => task.id));
    setSelectedTaskIds((current) => {
      const next = current.filter((taskId) => liveTaskIds.has(taskId));
      return next.length === current.length ? current : next;
    });
  }, [tasks]);

  const workflowFormTask = useMemo(() => {
    const formTaskForProject = (task: Task) => {
      const kind = workflowFormKind(task);
      if (!kind) return false;
      return (
        kind !== "finance" || isFinanceOnboardingSpace(project?.space?.name)
      );
    };
    const focused = focusedTaskId
      ? tasks.find((task) => task.id === focusedTaskId)
      : null;
    if (focused && formTaskForProject(focused)) return focused;
    return tasks.find(formTaskForProject) ?? null;
  }, [focusedTaskId, project?.space?.name, tasks]);
  const currentWorkflowKind = workflowFormTask
    ? workflowFormKind(workflowFormTask)
    : null;
  const workflowFormTaskId = workflowFormTask?.id ?? null;
  const workflowView =
    viewParam === "list"
      ? "list"
      : viewParam === "kanban" || viewParam === "board"
        ? "board"
        : "form";
  const showWorkflowFormFirst = Boolean(
    canCreateTasks &&
    workflowFormTask &&
    currentWorkflowKind &&
    workflowView === "form",
  );
  const isDesignQueue = isDesignQueueProject(project);
  const isSocialMedia = isSocialMediaProject(project);
  const selectedTaskIdSet = useMemo(
    () => new Set(selectedTaskIds),
    [selectedTaskIds],
  );
  const visibleTaskIds = useMemo(() => {
    const query = toolbar.search.trim().toLowerCase();
    return tasks
      .filter((task) => {
        if (
          query &&
          !task.title.toLowerCase().includes(query) &&
          !(task.description ?? "").toLowerCase().includes(query)
        ) {
          return false;
        }
        if (!toolbar.showClosed && task.status === "done") return false;
        if (
          toolbar.filterPriority !== "all" &&
          task.priority !== toolbar.filterPriority
        ) {
          return false;
        }
        if (toolbar.filterAssignee === "unassigned") return !task.assignee;
        if (toolbar.filterAssignee !== "all") {
          return task.assignee?.id === toolbar.filterAssignee;
        }
        return true;
      })
      .map((task) => task.id);
  }, [tasks, toolbar]);
  const allVisibleTasksSelected =
    visibleTaskIds.length > 0 &&
    visibleTaskIds.every((taskId) => selectedTaskIdSet.has(taskId));

  const canManageFields = useMemo(() => {
    if (!me) return false;
    return Boolean(
      me.isSuperAdmin ||
      me.currentRole === "owner" ||
      me.currentRole === "admin",
    );
  }, [me]);

  useEffect(() => {
    if (canCreateTasks && workflowFormTaskId && currentWorkflowKind) {
      setToolbar((current) =>
        current.view === workflowView
          ? current
          : { ...current, view: workflowView },
      );
      return;
    }
    if (!isDesignQueue) {
      setToolbar((current) =>
        current.view === "form" ? { ...current, view: "board" } : current,
      );
      return;
    }
    const requestedView =
      viewParam === "briefing"
        ? "form"
        : viewParam === "list"
          ? "list"
          : "board";
    setToolbar((current) =>
      current.view === requestedView
        ? current
        : { ...current, view: requestedView },
    );
  }, [
    canCreateTasks,
    currentWorkflowKind,
    isDesignQueue,
    viewParam,
    workflowFormTaskId,
    workflowView,
  ]);

  if (loading) {
    return (
      <>
        <Header title={t("projects.project")} />
        <div className={cn(PAGE_CONTENT_CLASS, "space-y-4")}>
          <div className="h-8 bg-muted rounded w-48 animate-pulse" />
          <div className="h-4 bg-muted rounded w-96 animate-pulse" />
        </div>
      </>
    );
  }

  if (!project) return null;

  const projectDisplayName = localizeProjectName(project.name, language);
  const projectDisplayDescription = localizeProjectDescription(
    project.name,
    project.description,
    language,
  );
  const spaceDisplayName = project.space
    ? localizeSpaceName(project.space.name, language)
    : null;
  const isCommercialLeadsProject = isCommercialFlowEntryProject({
    projectName: project.name,
    spaceName: project.space?.name,
  });
  const isCommercialProposalArchive = isCommercialProposalArchiveProject({
    name: project.name,
    spaceName: project.space?.name,
  });
  const isCommercialContractsRegistry = isCommercialContractsRegistryProject({
    projectName: project.name,
    spaceName: project.space?.name,
  });
  const isClientsRegistry = isClientsRegistryProject({
    projectName: project.name,
  });
  const isFinanceContractMirror = isFinanceContractMirrorProject({
    projectName: project.name,
    spaceName: project.space?.name,
  });
  const isEquipmentControl = isEquipmentControlProject({
    projectName: project.name,
    spaceName: project.space?.name,
  });
  const isCommercialManagedDownstream = isCommercialManagedDownstreamProject({
    projectName: project.name,
    spaceName: project.space?.name,
  });
  const isSharedOnboardingProject =
    project.name.trim().toLocaleLowerCase() === "onboarding" &&
    project.onboarding_enabled &&
    !project.company_id;
  const canAddTasks =
    canCreateTasks &&
    !isCommercialManagedDownstream &&
    !isCommercialContractsRegistry &&
    !isClientsRegistry &&
    !isFinanceContractMirror &&
    !isEquipmentControl &&
    !isSharedOnboardingProject;
  const doneTasks = tasks.filter((t) => t.status === "done").length;
  const progress =
    tasks.length > 0 ? Math.round((doneTasks / tasks.length) * 100) : 0;

  const handleAddTask = (status?: string) => {
    if (!canAddTasks) return;
    if (isCommercialLeadsProject) {
      setCommercialLeadCreateOpen(true);
      return;
    }
    const s = (
      status === "in_progress" || status === "done" ? status : "todo"
    ) as ColumnKey;
    setCreateOpen({ status: s });
  };

  const handleOpenTask = (task: Task) => {
    const action = getOnboardingTaskAction(task, id);
    if (action && (action.kind !== "form" || canCreateTasks)) {
      setSelectedTask(null);
      router.replace(action.href, { scroll: false });
      return;
    }
    setSelectedTask(task);
  };

  const handleToolbarChange = (next: ToolbarState) => {
    setToolbar(next);
    if (
      canCreateTasks &&
      workflowFormTask &&
      currentWorkflowKind &&
      next.view !== toolbar.view
    ) {
      const view = next.view === "board" ? "kanban" : next.view;
      const task = next.view === "form" ? `&task=${workflowFormTask.id}` : "";
      router.replace(`/projects/${id}?view=${view}${task}`, { scroll: false });
      return;
    }
    if (!isDesignQueue || next.view === toolbar.view) return;
    const view = next.view === "form" ? "briefing" : next.view;
    router.replace(`/projects/${id}?view=${view}`, { scroll: false });
  };

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((current) =>
      current.includes(taskId)
        ? current.filter((id) => id !== taskId)
        : [...current, taskId],
    );
  };

  const toggleSelectionMode = () => {
    if (selectionMode) setSelectedTaskIds([]);
    setSelectionMode(!selectionMode);
  };

  const toggleVisibleTaskSelection = () => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (allVisibleTasksSelected) {
        visibleTaskIds.forEach((taskId) => next.delete(taskId));
      } else {
        visibleTaskIds.forEach((taskId) => next.add(taskId));
      }
      return Array.from(next);
    });
  };

  const handleDeleteSelectedTasks = async () => {
    if (
      !canCreateTasks ||
      selectedTaskIds.length === 0 ||
      deletingSelectedTasks
    )
      return;
    if (
      !confirm(t("task.bulkDeleteConfirm", { count: selectedTaskIds.length }))
    )
      return;
    const idsToDelete = [...selectedTaskIds];
    setDeletingSelectedTasks(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsToDelete }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? t("task.failedDelete"));
      }
      const deletedCount = idsToDelete.length;
      setSelectedTaskIds([]);
      setSelectionMode(false);
      setSelectedTask((current) =>
        current && idsToDelete.includes(current.id) ? null : current,
      );
      await loadData(true);
      toast.success(t("task.bulkDeleteSuccess", { count: deletedCount }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("task.failedDelete"));
    } finally {
      setDeletingSelectedTasks(false);
    }
  };

  const workflowFormTabLabel =
    currentWorkflowKind === "finance"
      ? "Cadastro financeiro"
      : currentWorkflowKind === "support"
        ? "Setup de suporte"
        : currentWorkflowKind === "marketing_b2c"
          ? t("marketingB2CForm.formTab")
          : t("marketingB2BForm.formTab");
  const projectReturnHref = project.folder_id
    ? `/projects?scope=folder:${project.folder_id}`
    : project.space_id
      ? `/projects?scope=space:${project.space_id}`
      : "/projects";

  return (
    <>
      <Header title={projectDisplayName} />
      <div className={cn(PAGE_CONTENT_CLASS, "overflow-x-clip")}>
        <section>
          <Link
            href={projectReturnHref}
            className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ArrowLeft className="w-4 h-4" /> {t("projects.backToProjects")}
          </Link>

          <div className="mb-4">
            <ProjectPathBreadcrumbs
              ariaLabel={t("projects.drilldown.breadcrumbs")}
              items={[
                {
                  label: t("projects.drilldown.spaces"),
                  href: "/projects",
                },
                ...(project.space
                  ? [
                      {
                        label: spaceDisplayName ?? project.space.name,
                        href: `/projects?scope=space:${project.space.id}`,
                      },
                    ]
                  : []),
                ...(project.folder
                  ? [
                      {
                        label: project.folder.name,
                        href: `/projects?scope=folder:${project.folder.id}`,
                      },
                    ]
                  : []),
                { label: projectDisplayName, current: true },
              ]}
            />
          </div>

          <header className={PAGE_HEADER_CARD_CLASS}>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              {t("projects.drilldown.eyebrow")}
            </p>
            <div className="mt-1 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex min-w-0 flex-wrap items-center gap-3">
                  <h1 className="min-w-0 break-words text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                    {projectDisplayName}
                  </h1>
                  <span
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-semibold shadow-[0_0_18px_rgba(16,185,129,0.18)]",
                      statusColor(project.status),
                    )}
                  >
                    {statusLabel(project.status, t)}
                  </span>
                </div>
                {projectDisplayDescription && (
                  <p className="text-muted-foreground text-sm mb-3">
                    {projectDisplayDescription}
                  </p>
                )}
                {!isCommercialProposalArchive &&
                !isCommercialContractsRegistry &&
                !isClientsRegistry &&
                !isEquipmentControl ? (
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground sm:gap-4">
                    <span>
                      {t("projects.tasksLabel", { count: tasks.length })}
                    </span>
                    {project.due_date && (
                      <span>
                        {t("projects.due", {
                          date: formatDate(project.due_date, language),
                        })}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      {t("projects.doneProgress", { progress })}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                <Link
                  href={`/docs?project=${id}`}
                  className="inline-flex h-9 min-h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
                >
                  <FileText className="w-4 h-4" /> {t("projects.docs")}
                </Link>
                {project.capabilities?.canManageMembers && (
                  <button
                    type="button"
                    onClick={() => setManageMembersOpen(true)}
                    className="inline-flex h-9 min-h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground"
                  >
                    <UsersRound className="w-4 h-4" />{" "}
                    {t("projects.manageContributors")}
                  </button>
                )}
                {canAddTasks && (
                  <CreateActionButton onClick={() => handleAddTask("todo")}>
                    <Plus className="w-4 h-4" />
                    {isCommercialLeadsProject
                      ? t("commercialLead.addLead")
                      : t("projects.addTask")}
                  </CreateActionButton>
                )}
              </div>
            </div>
          </header>
        </section>

        {!canCreateTasks && !isEquipmentControl && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
          >
            {t("projects.contributorAccessRequired")}
          </div>
        )}

        {(isCommercialManagedDownstream || isCommercialContractsRegistry) && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-foreground"
          >
            {t(
              isCommercialContractsRegistry
                ? "projects.commercialContractsRegistryOnly"
                : "projects.commercialAutomaticFlowOnly",
            )}
          </div>
        )}

        {isClientsRegistry && (
          <div
            role="status"
            className="mb-4 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-foreground"
          >
            {t("projects.clientsRegistryOnly")}
          </div>
        )}

        {canCreateTasks && workflowFormTask && currentWorkflowKind && (
          <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-border/70">
            <button
              type="button"
              onClick={() =>
                router.replace(
                  `/projects/${id}?view=form&task=${workflowFormTask.id}`,
                  { scroll: false },
                )
              }
              aria-pressed={workflowView === "form"}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition",
                workflowView === "form"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {workflowFormTabLabel}
            </button>
            <button
              type="button"
              onClick={() =>
                router.replace(`/projects/${id}?view=kanban`, { scroll: false })
              }
              aria-pressed={workflowView === "board"}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition",
                workflowView === "board"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t("toolbar.board")}
            </button>
            <button
              type="button"
              onClick={() =>
                router.replace(`/projects/${id}?view=list`, { scroll: false })
              }
              aria-pressed={workflowView === "list"}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition",
                workflowView === "list"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t("toolbar.list")}
            </button>
          </div>
        )}

        {isEquipmentControl ? (
          <EquipmentControlBoard projectId={id} />
        ) : isClientsRegistry ? (
          <ClientSpaceRegistry projectId={id} />
        ) : isCommercialContractsRegistry ? (
          <CommercialContractsRegistry projectId={id} />
        ) : isCommercialProposalArchive ? (
          <CommercialProposalArchive projectId={id} />
        ) : isSocialMedia ? (
          <SocialMediaCalendar
            projectId={id}
            workspaceId={project.workspace_id}
            tasks={tasks}
            customFields={customFields}
            users={users}
            onOpenTask={handleOpenTask}
            onRefresh={() => loadData(true)}
            canContribute={canCreateTasks}
          />
        ) : showWorkflowFormFirst && workflowFormTask && currentWorkflowKind ? (
          currentWorkflowKind === "finance" ? (
            <FinanceOnboardingForm
              taskId={workflowFormTask.id}
              embedded
              onUpdate={() => loadData(true)}
            />
          ) : currentWorkflowKind === "support" ? (
            <SupportOnboardingForm
              taskId={workflowFormTask.id}
              embedded
              onUpdate={() => loadData(true)}
            />
          ) : currentWorkflowKind === "marketing_b2c" ? (
            <MarketingB2COnboardingForm
              taskId={workflowFormTask.id}
              embedded
              onUpdate={() => loadData(true)}
            />
          ) : (
            <MarketingB2BOnboardingForm
              taskId={workflowFormTask.id}
              embedded
              onClose={() =>
                router.replace(`/projects/${id}?view=kanban`, { scroll: false })
              }
              onAddTask={() =>
                canCreateTasks && setCreateOpen({ status: "todo" })
              }
              onUpdate={() => loadData(true)}
            />
          )
        ) : (
          <>
            <ProjectToolbar
              state={toolbar}
              onChange={handleToolbarChange}
              customFields={customFields}
              onManageFields={() => setManageOpen(true)}
              onManageSpaceStatuses={
                canManageFields && project.space_id
                  ? () => setManageSpaceStatusesOpen(true)
                  : undefined
              }
              canManage={canManageFields}
              canContribute={canCreateTasks}
              users={users}
              selectionMode={selectionMode}
              selectedCount={selectedTaskIds.length}
              onToggleSelectionMode={toggleSelectionMode}
              enableForms={isDesignQueue}
            />

            {toolbar.view !== "form" && selectionMode && canCreateTasks && (
              <div className="mb-3 flex flex-col gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-semibold text-foreground">
                  {t("task.bulkSelected", { count: selectedTaskIds.length })}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleVisibleTaskSelection}
                    disabled={
                      visibleTaskIds.length === 0 || deletingSelectedTasks
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                  >
                    <CheckSquare2 className="h-4 w-4" />
                    {allVisibleTasksSelected
                      ? t("task.deselectAllVisible")
                      : t("task.selectAllVisible", {
                          count: visibleTaskIds.length,
                        })}
                  </button>
                  <button
                    type="button"
                    onClick={toggleSelectionMode}
                    disabled={deletingSelectedTasks}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-accent-foreground"
                  >
                    <X className="h-4 w-4" />
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteSelectedTasks}
                    disabled={
                      selectedTaskIds.length === 0 || deletingSelectedTasks
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/[0.15] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {deletingSelectedTasks ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    {t("task.deleteSelected")}
                  </button>
                </div>
              </div>
            )}

            {toolbar.view === "form" && isDesignQueue ? (
              <CreativeBriefingForm
                projectId={id}
                workspaceId={project.workspace_id}
                users={users}
                me={me}
                onCreated={() => loadData(true)}
                onDesignerRosterConfigured={() => loadData(true)}
              />
            ) : toolbar.view === "board" ? (
              <KanbanBoard
                projectId={id}
                spaceId={project?.space_id}
                spaceName={project?.space?.name}
                tasks={tasks}
                customFields={customFields}
                workflowStatuses={workflowStatuses}
                users={users}
                toolbar={toolbar}
                onUpdate={() => loadData(true)}
                onAddTask={(status, fieldValues) => {
                  if (!canAddTasks) return;
                  if (isCommercialLeadsProject) {
                    setCommercialLeadCreateOpen(true);
                  } else {
                    setCreateOpen({ status, fieldValues });
                  }
                }}
                canCreate={canCreateTasks}
                canAddTasks={canAddTasks}
                onOpenTask={handleOpenTask}
                selectedTaskIds={selectedTaskIdSet}
                onToggleTaskSelection={toggleTaskSelection}
                selectionMode={selectionMode}
                showBriefingDetails={isDesignQueue}
              />
            ) : (
              <ListView
                projectId={id}
                tasks={tasks}
                customFields={customFields}
                users={users}
                toolbar={toolbar}
                onTaskClick={handleOpenTask}
                onAddTask={handleAddTask}
                addItemLabel={
                  isCommercialLeadsProject
                    ? t("commercialLead.addLead")
                    : undefined
                }
                canCreate={canCreateTasks}
                canAddTasks={canAddTasks}
                onUpdate={() => loadData(true)}
                selectedTaskIds={selectedTaskIdSet}
                onToggleTaskSelection={toggleTaskSelection}
                selectionMode={selectionMode}
              />
            )}
          </>
        )}
      </div>

      {createOpen && (
        <TaskCreateSheet
          open={!!createOpen}
          onClose={() => setCreateOpen(null)}
          projectId={id}
          defaultStatus={createOpen.status}
          initialCustomFieldValues={createOpen.fieldValues}
          onCreated={() => {
            setCreateOpen(null);
            loadData(true);
          }}
        />
      )}

      {isCommercialLeadsProject && (
        <CommercialLeadCreateSheet
          open={commercialLeadCreateOpen}
          projectId={id}
          workspaceId={project.workspace_id}
          onClose={() => setCommercialLeadCreateOpen(false)}
          onCreated={() => {
            setCommercialLeadCreateOpen(false);
            loadData(true);
          }}
        />
      )}

      {manageOpen && (
        <CustomFieldsManager
          open={manageOpen}
          onClose={() => setManageOpen(false)}
          projectId={id}
          fields={customFields}
          onChanged={() => loadData(true)}
        />
      )}

      {manageMembersOpen && (
        <ProjectMembersDialog
          open={manageMembersOpen}
          projectId={id}
          onClose={() => setManageMembersOpen(false)}
          onChanged={() => loadData(true)}
        />
      )}

      {project.space_id && canManageFields && (
        <SpaceWorkflowStatusManager
          open={manageSpaceStatusesOpen}
          spaceId={project.space_id}
          onClose={() => setManageSpaceStatusesOpen(false)}
          onSaved={() => loadData(true)}
        />
      )}

      {selectedTask && canCreateTasks && workflowFormKind(selectedTask) ? (
        workflowFormKind(selectedTask) === "finance" ? (
          <FinanceOnboardingForm
            taskId={selectedTask.id}
            onClose={() => {
              setSelectedTask(null);
              if (focusedTaskId)
                router.replace(`/projects/${id}`, { scroll: false });
            }}
            onUpdate={() => {
              setSelectedTask(null);
              if (focusedTaskId)
                router.replace(`/projects/${id}`, { scroll: false });
              loadData(true);
            }}
          />
        ) : workflowFormKind(selectedTask) === "support" ? (
          <SupportOnboardingForm
            taskId={selectedTask.id}
            onClose={() => {
              setSelectedTask(null);
              if (focusedTaskId)
                router.replace(`/projects/${id}`, { scroll: false });
            }}
            onUpdate={() => {
              setSelectedTask(null);
              if (focusedTaskId)
                router.replace(`/projects/${id}`, { scroll: false });
              loadData(true);
            }}
          />
        ) : workflowFormKind(selectedTask) === "marketing_b2c" ? (
          <MarketingB2COnboardingForm
            taskId={selectedTask.id}
            onClose={() => {
              setSelectedTask(null);
              if (focusedTaskId)
                router.replace(`/projects/${id}`, { scroll: false });
            }}
            onUpdate={() => {
              setSelectedTask(null);
              if (focusedTaskId)
                router.replace(`/projects/${id}`, { scroll: false });
              loadData(true);
            }}
          />
        ) : (
          <MarketingB2BOnboardingForm
            taskId={selectedTask.id}
            onClose={() => {
              setSelectedTask(null);
              if (focusedTaskId)
                router.replace(`/projects/${id}`, { scroll: false });
            }}
            onAddTask={() => {
              setSelectedTask(null);
              setCreateOpen({ status: "todo" });
            }}
            onUpdate={() => {
              setSelectedTask(null);
              if (focusedTaskId)
                router.replace(`/projects/${id}`, { scroll: false });
              loadData(true);
            }}
          />
        )
      ) : selectedTask ? (
        <TaskDetailSheet
          task={selectedTask}
          users={users}
          customFields={customFields}
          workflowStatuses={workflowStatuses}
          spaceId={project.space_id}
          spaceName={project.space?.name}
          canContribute={canCreateTasks}
          onChanged={() => loadData(true)}
          onClose={() => {
            setSelectedTask(null);
            if (focusedTaskId)
              router.replace(`/projects/${id}`, { scroll: false });
          }}
          onUpdate={() => {
            setSelectedTask(null);
            if (focusedTaskId)
              router.replace(`/projects/${id}`, { scroll: false });
            loadData(true);
          }}
        />
      ) : null}
    </>
  );
}
