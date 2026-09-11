"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAppUser } from "@/components/user-provider";
import {
  AlertCircle,
  CheckCircle2,
  FolderKanban,
  Plus,
  Play,
  Pause,
  Square,
  Calendar as CalendarIcon,
  MoreHorizontal,
  Video,
  RotateCcw,
  Repeat,
  X,
  FolderPlus,
  CheckSquare,
  UserPlus,
  Building2,
  ArrowRight,
  Timer,
  Activity,
  TrendingDown,
  Command,
  Pencil,
  Trash2,
  DollarSign,
} from "lucide-react";
import { toast } from "sonner";
import Header from "@/components/layout/header";
import { CreateActionButton } from "@/components/ui/create-action-button";
import { useLanguage } from "@/components/language-provider";
import {
  cn,
  appTimeInputValue,
  formatDate,
  formatTime,
  getInitials,
  mergeAppDateAndTime,
} from "@/lib/utils";
import TaskCreateSheet from "@/components/projects/task-create-sheet";
import NewProjectDialog from "@/components/projects/new-project-dialog";
import InviteDialog from "@/components/dashboard/invite-dialog";
import ScheduleMeetingDialog from "@/components/dashboard/schedule-meeting-dialog";
import CreateCompanyDialog from "@/components/dashboard/create-company-dialog";
import AgencyOperationsPanel from "@/components/dashboard/agency-operations-panel";
import { FirstRunOnboarding } from "@/components/dashboard/first-run-onboarding";
import { TeamTimeline } from "@/components/dashboard/team-timeline";
import { TaskDetailModal } from "@/components/dashboard/task-detail-modal";
import {
  TaskStatusDrawer,
  TodayFocusPanel,
} from "@/components/dashboard/task-focus-panels";
import type {
  ActionFilter,
  CommandCenterPayload,
  CommandDrawer,
  DashboardResponse,
  TaskDrawerStatus,
} from "@/components/dashboard/dashboard-page-types";
import type {
  ActivityEvent,
  CalendarEvent,
  Project,
  Task,
  TeamMember,
  TimeEntry,
} from "@/lib/types";
import {
  buildDashboardRecent,
  buildDashboardWeekActivity,
  dashboardActivityText,
  entrySeconds,
  formatSecondsShort,
  greetingTime,
  moneyCompact,
  localizeAgencyRiskSignal,
  localizeDashboardReason,
  sameLocalDate,
} from "@/components/dashboard/dashboard-utils";
import { getOnboardingTaskAction } from "@/lib/onboarding-task-routing";

export default function DashboardPage() {
  const user = useAppUser();
  const router = useRouter();
  const { language, t } = useLanguage();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTask, setShowNewTask] = useState(false);
  const [showNewProject, setShowNewProject] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showCompany, setShowCompany] = useState(false);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [runningEntry, setRunningEntry] = useState<TimeEntry | null>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [commandCenter, setCommandCenter] =
    useState<CommandCenterPayload | null>(null);
  const [commandDrawer, setCommandDrawer] = useState<CommandDrawer | null>(
    null,
  );
  const [drawerStatus, setDrawerStatus] = useState<TaskDrawerStatus | null>(
    null,
  );
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [updating, setUpdating] = useState(false);
  const [greeting, setGreeting] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const canManageWorkspace = Boolean(
    user?.isSuperAdmin ||
      user?.currentRole === "owner" ||
      user?.currentRole === "admin",
  );

  useEffect(() => {
    setGreeting(greetingTime());
  }, []);

  const loadData = useCallback(() => {
    setLoadError(null);
    fetch("/api/dashboard/summary")
      .then(async (r) => {
        const data = (await r.json().catch(() => ({}))) as DashboardResponse & {
          error?: string;
        };
        if (!r.ok) {
          throw new Error(
            data.error ||
              t("dashboard.unavailableWithStatus", { status: r.status }),
          );
        }
        return data;
      })
      .then((data) => {
        if (!data.command_center) {
          throw new Error("Dashboard summary is missing command center data");
        }
        setTasks(data.tasks.items ?? []);
        setProjects(data.projects.items ?? []);
        setUsers(data.users.items ?? []);
        setCalendarEvents(data.calendar_events?.items ?? []);
        setActivity(data.activity?.items ?? []);
        setRunningEntry(data.time?.running ?? null);

        setTimeEntries(data.time?.week_entries ?? []);
        setCommandCenter(data.command_center ?? null);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setLoadError(
          err instanceof Error ? err.message : t("dashboard.unavailable"),
        );
        setLoading(false);
      });
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);
  const handleOpenTask = (task: Task) => {
    const action = getOnboardingTaskAction(task, task.project_id);
    if (action) {
      setActiveTask(null);
      router.push(action.href);
      return;
    }
    setActiveTask(task);
  };

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const inProgressCount = tasks.filter(
    (t) => t.status === "in_progress",
  ).length;
  const todoCount = tasks.filter((t) => t.status === "todo").length;
  const progress = tasks.length
    ? Math.round((doneCount / tasks.length) * 100)
    : 0;

  const drawerTasks = useMemo(
    () =>
      drawerStatus
        ? tasks
            .filter((task) => task.status === drawerStatus)
            .sort((a, b) => {
              if (!a.due_date) return 1;
              if (!b.due_date) return -1;
              return (
                new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
              );
            })
        : [],
    [drawerStatus, tasks],
  );

  const firstName = user?.name?.split(" ")[0] || "there";
  const commandCenterData = useMemo<CommandCenterPayload>(() => {
    if (commandCenter) return commandCenter;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const urgent = tasks.filter((task) => {
      const due = task.due_date ? new Date(task.due_date) : null;
      return (
        task.status !== "done" &&
        (task.priority === "high" || (due !== null && due < tomorrow))
      );
    });
    const todayEntries = timeEntries.filter((entry) =>
      sameLocalDate(new Date(entry.started_at), today),
    );
    const totalSeconds = todayEntries.reduce(
      (sum, entry) => sum + entrySeconds(entry),
      0,
    );
    return {
      financials_visible: false,
      urgent_actions: { items: urgent, count: urgent.length },
      team_workload: {
        items: users.map((member) => ({
          user: member,
          open_tasks: member._count.tasks,
          overdue_tasks: 0,
          due_today_tasks: 0,
          tracked_seconds_today: 0,
          tasks: [],
          state:
            member._count.tasks >= 8
              ? "overloaded"
              : member._count.tasks === 0
                ? "idle"
                : "active",
        })),
        count: users.length,
      },
      time_today: {
        total_seconds: totalSeconds,
        running: runningEntry,
        entries: todayEntries,
      },
      meetings_today: { items: calendarEvents, count: calendarEvents.length },
      recent_activity: { items: activity, count: activity.length },
      projects_at_risk: { items: [], count: 0, rules: [] },
      client_risk: { items: [], count: 0 },
      client_health: {
        counts: {
          healthy: 0,
          attention_needed: 0,
          at_risk: 0,
          not_enough_data: 0,
        },
        items: [],
      },
      delivery_overview: { items: [] },
      creative_queue: {
        source_note: "Creative queue appears when matching deliverables exist.",
        counts: {
          waiting_for_briefing: 0,
          ready_to_start: 0,
          in_production: 0,
          waiting_for_approval: 0,
          revision_requested: 0,
        },
        items: [],
      },
      department_workload: { items: [] },
      agency_risk_signals: { items: [] },
      revenue_snapshot: {
        active_clients: 0,
        total_contract_value: 0,
        total_commission: 0,
        clients_without_contract_value: 0,
        top_clients: [],
      },
      quick_create: {
        items: ["task", "meeting", "company", "project", "note"],
      },
      workspace_setup: {
        spaces: 0,
        projects: projects.length,
        clients: 0,
        members: users.length,
        role: user?.currentRole ?? null,
      },
    };
  }, [
    activity,
    calendarEvents,
    commandCenter,
    projects.length,
    runningEntry,
    tasks,
    timeEntries,
    user?.currentRole,
    users,
  ]);

  const todayFocusTasks = useMemo(() => {
    const seen = new Set<string>();
    const priorityRank = { high: 0, medium: 1, low: 2 };
    return [
      ...commandCenterData.urgent_actions.items,
      ...tasks.filter((task) => task.status === "in_progress"),
      ...tasks.filter((task) => task.status === "todo"),
    ]
      .filter((task) => {
        if (seen.has(task.id) || task.status === "done") return false;
        seen.add(task.id);
        return true;
      })
      .sort((a, b) => {
        if (a.priority !== b.priority)
          return priorityRank[a.priority] - priorityRank[b.priority];
        if (!a.due_date) return 1;
        if (!b.due_date) return -1;
        return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
      })
      .slice(0, 5);
  }, [commandCenterData.urgent_actions.items, tasks]);

  const workloadFlags = useMemo(
    () =>
      commandCenterData.team_workload.items.filter(
        (item) => item.state === "late" || item.state === "overloaded",
      ),
    [commandCenterData.team_workload.items],
  );
  const riskTotal =
    commandCenterData.projects_at_risk.count +
    commandCenterData.client_risk.count;
  const nextMeeting = commandCenterData.meetings_today.items[0] ?? null;
  const liveTimerLabel = commandCenterData.time_today.running
    ? t("dashboard.timerRunning")
    : t("dashboard.noActiveTimer");

  const handleStatusChange = (_task: Task, _status: Task["status"]) => {
    toast.error(t("task.automaticMovementOnly"));
  };

  const handleDeleteTask = async (task: Task) => {
    setUpdating(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? t("dashboard.couldNotDeleteTask"));
      }
      toast.success(t("dashboard.taskDeleted"));
      setActiveTask(null);
      loadData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("dashboard.couldNotDeleteTask"),
      );
    } finally {
      setUpdating(false);
    }
  };

  if (loadError && !commandCenter) {
    return (
      <>
        <Header title={t("dashboard.title")} />
        <main className="mx-auto w-full max-w-3xl p-4 sm:p-6">
          <section className="rounded-2xl border border-upflow-danger/30 bg-upflow-danger/10 p-5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-1 h-5 w-5 flex-shrink-0 text-upflow-danger" />
              <div>
                <h1 className="text-lg font-semibold text-foreground">
                  {t("dashboard.loadFailedTitle")}
                </h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t("dashboard.loadFailedBody", { error: loadError })}
                </p>
                <button
                  type="button"
                  onClick={loadData}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <RotateCcw className="h-4 w-4" />
                  {t("common.retry")}
                </button>
              </div>
            </div>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <Header title={t("dashboard.title")} />
      <main
        className="command-dashboard-shell mx-auto w-full max-w-[1540px] space-y-5 overflow-x-hidden p-4 sm:p-6"
        data-dashboard-ready={loading ? "false" : "true"}
      >
        <section className="command-hero rounded-[1.4rem] p-5 sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/60 to-transparent" />
          <div className="relative flex flex-col gap-6 xl:flex-row xl:items-stretch xl:justify-between">
            <div className="min-w-0 xl:max-w-[760px]">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-primary drop-shadow-[0_0_14px_rgba(59,130,246,0.55)]">
                {t("dashboard.commandCenter")}
              </p>
              <h2 className="mt-3 max-w-3xl text-3xl font-bold leading-tight text-foreground sm:text-4xl lg:text-5xl">
                {greeting
                  ? t("dashboard.good", {
                      greeting: t(`dashboard.greeting.${greeting}`),
                      name: firstName,
                    })
                  : t("dashboard.hi", { name: firstName })}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                {t("dashboard.summary")}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <SignalBadge
                  tone="danger"
                  label={t("dashboard.risks", { count: riskTotal })}
                />
                <SignalBadge
                  tone="success"
                  label={t("dashboard.tasksComplete", { progress })}
                />
                <SignalBadge tone="info" label={liveTimerLabel} />
              </div>
            </div>
            <div className="flex min-w-0 flex-col gap-4 xl:w-[410px] xl:items-end">
              <QuickCreateMenu
                onCreateTask={() => setShowNewTask(true)}
                onCreateProject={
                  canManageWorkspace ? () => setShowNewProject(true) : undefined
                }
                onCreateMeeting={() => setShowSchedule(true)}
                onCreateCompany={() => setShowCompany(true)}
                onInvite={() => setShowInvite(true)}
              />
              <div className="command-pulse-card w-full rounded-2xl p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    {t("dashboard.operationalPulse")}
                  </p>
                  <Activity className="h-4 w-4 text-upflow-success drop-shadow-[0_0_10px_rgba(52,211,153,0.55)]" />
                </div>
                <div className="mt-4 grid gap-3 text-sm">
                  <PulseLine
                    label={t("dashboard.nextMeeting")}
                    value={
                      nextMeeting
                        ? formatTime(nextMeeting.starts_at, language)
                        : t("dashboard.noneToday")
                    }
                  />
                  <PulseLine
                    label={t("dashboard.focusQueue")}
                    value={t("dashboard.items", {
                      count: todayFocusTasks.length,
                    })}
                  />
                  <PulseLine
                    label={t("dashboard.openWork")}
                    value={t("dashboard.tasksCount", {
                      count: todoCount + inProgressCount,
                    })}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="relative mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryPill
              label={t("dashboard.tasks")}
              value={tasks.length}
              hint={t("dashboard.tasksComplete", { progress })}
              tone="success"
              onClick={() => setDrawerStatus("todo")}
            />
            <SummaryPill
              label={t("dashboard.teamFlags")}
              value={workloadFlags.length}
              hint={t("dashboard.lateOrOverloaded")}
              tone="warning"
              onClick={() => setCommandDrawer("team_workload")}
            />
            <SummaryPill
              label={t("dashboard.activity")}
              value={commandCenterData.recent_activity.count}
              hint={t("dashboard.workspaceTrail")}
              tone="info"
              onClick={() => setCommandDrawer("recent_activity")}
            />
            <SummaryPill
              label={t("dashboard.teamWorkload")}
              value={users.length}
              hint={t("dashboard.membersWithSignals", {
                count: commandCenterData.team_workload.count,
              })}
              tone="violet"
              onClick={() => setCommandDrawer("team_workload")}
            />
          </div>
        </section>

        <FirstRunOnboarding
          setup={commandCenterData.workspace_setup}
          onCreateProject={() => {
            if (canManageWorkspace) setShowNewProject(true);
          }}
          onInviteTeam={() => setShowInvite(true)}
          onCreateClient={() => setShowCompany(true)}
        />

        <TeamTimeline
          users={users}
          loading={loading}
          timeEntries={timeEntries}
          events={calendarEvents}
        />

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <CommandTile
            title={t("dashboard.myUrgentActions")}
            value={commandCenterData.urgent_actions.count}
            hint={t("dashboard.urgentHint")}
            icon={<AlertCircle className="w-4 h-4" />}
            tone="danger"
            active={commandDrawer === "urgent_actions"}
            onClick={() => setCommandDrawer("urgent_actions")}
          />
          <CommandTile
            title={t("dashboard.meetingsToday")}
            value={commandCenterData.meetings_today.count}
            hint={t("dashboard.meetingsHint")}
            icon={<CalendarIcon className="w-4 h-4" />}
            tone="info"
            active={commandDrawer === "meetings_today"}
            onClick={() => setCommandDrawer("meetings_today")}
          />
          <CommandTile
            title={t("dashboard.timeToday")}
            value={formatSecondsShort(
              commandCenterData.time_today.total_seconds,
            )}
            hint={
              commandCenterData.time_today.running
                ? t("dashboard.timerRunning")
                : t("dashboard.trackedToday")
            }
            icon={<Timer className="w-4 h-4" />}
            tone="success"
            active={commandDrawer === "time_today"}
            onClick={() => setCommandDrawer("time_today")}
          />
          <CommandTile
            title={t("dashboard.projectsAtRisk")}
            value={commandCenterData.projects_at_risk.count}
            hint={t("dashboard.projectsRiskHint")}
            icon={<TrendingDown className="w-4 h-4" />}
            tone="warning"
            active={commandDrawer === "projects_at_risk"}
            onClick={() => setCommandDrawer("projects_at_risk")}
          />
          <CommandTile
            title={t("dashboard.clientRisk")}
            value={commandCenterData.client_risk.count}
            hint={t("dashboard.clientRiskHint")}
            icon={<Building2 className="w-4 h-4" />}
            tone="rose"
            active={commandDrawer === "client_risk"}
            onClick={() => setCommandDrawer("client_risk")}
          />
          {commandCenterData.financials_visible && (
            <CommandTile
              title={t("dashboard.revenueSnapshot")}
              value={moneyCompact(
                commandCenterData.revenue_snapshot.total_contract_value,
              )}
              hint={t("dashboard.activeClients", {
                count: commandCenterData.revenue_snapshot.active_clients,
              })}
              icon={<DollarSign className="w-4 h-4" />}
              tone="violet"
              active={commandDrawer === "revenue_snapshot"}
              onClick={() => setCommandDrawer("revenue_snapshot")}
            />
          )}
        </section>

        <AgencyOperationsPanel
          data={commandCenterData}
          onOpenDrawer={setCommandDrawer}
          onOpenTask={handleOpenTask}
        />

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.85fr)]">
          <TodayFocusPanel
            loading={loading}
            tasks={todayFocusTasks}
            meetings={commandCenterData.meetings_today.items}
            onOpenTask={handleOpenTask}
            onMarkDone={(task) => handleStatusChange(task, "done")}
            onCreateTask={() => setShowNewTask(true)}
            onOpenMeetings={() => setCommandDrawer("meetings_today")}
            updating={updating}
          />

          <section className="command-section-panel rounded-[1.4rem] p-5">
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-upflow-warning via-primary to-upflow-success" />
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  {t("dashboard.tasks")}
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("dashboard.statusHint")}
                </p>
              </div>
              <CreateActionButton
                onClick={() => setShowNewTask(true)}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("dashboard.newTask")}
              </CreateActionButton>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {t("dashboard.completion")}
                </span>
                <span className="font-semibold text-foreground">
                  {progress}%
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-upflow-success to-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <div className="mt-4 grid gap-2">
              <StatusCountButton
                label={t("dashboard.upcoming")}
                value={todoCount}
                hint={t("dashboard.upcomingHint")}
                tone="warning"
                status="todo"
                active={drawerStatus === "todo"}
                onClick={() => setDrawerStatus("todo")}
              />
              <StatusCountButton
                label={t("dashboard.inProgress")}
                value={inProgressCount}
                hint={t("dashboard.inProgressHint")}
                tone="info"
                status="in_progress"
                active={drawerStatus === "in_progress"}
                onClick={() => setDrawerStatus("in_progress")}
              />
              <StatusCountButton
                label={t("dashboard.completed")}
                value={doneCount}
                hint={t("dashboard.ofTotal", { progress })}
                tone="success"
                status="done"
                active={drawerStatus === "done"}
                onClick={() => setDrawerStatus("done")}
              />
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <button
                onClick={() => setCommandDrawer("team_workload")}
                className="command-metric-card rounded-xl border border-white/10 px-3 py-3 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <span className="block font-semibold text-foreground">
                  {t("dashboard.teamWorkload")}
                </span>
                {t("dashboard.membersWithSignals", {
                  count: commandCenterData.team_workload.count,
                })}
              </button>
              <button
                onClick={() => setCommandDrawer("recent_activity")}
                className="command-metric-card rounded-xl border border-white/10 px-3 py-3 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                <span className="block font-semibold text-foreground">
                  {t("dashboard.recentActivity")}
                </span>
                {t("dashboard.traceableRecords", {
                  count: commandCenterData.recent_activity.count,
                })}
              </button>
            </div>
          </section>
        </section>
      </main>

      {showNewTask && (
        <TaskCreateSheet
          open={showNewTask}
          onClose={() => setShowNewTask(false)}
          onCreated={() => {
            setShowNewTask(false);
            loadData();
          }}
        />
      )}

      {canManageWorkspace && showNewProject && (
        <NewProjectDialog
          open={showNewProject}
          onClose={() => setShowNewProject(false)}
          onCreated={() => {
            setShowNewProject(false);
            loadData();
            toast.success(t("dashboard.projectCreated"));
          }}
        />
      )}

      <InviteDialog open={showInvite} onClose={() => setShowInvite(false)} />

      <ScheduleMeetingDialog
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
        onScheduled={(meeting) => {
          setCalendarEvents((prev) =>
            [...prev, meeting].sort(
              (a, b) =>
                new Date(a.starts_at).getTime() -
                new Date(b.starts_at).getTime(),
            ),
          );
          loadData();
        }}
      />

      <CreateCompanyDialog
        open={showCompany}
        onClose={() => setShowCompany(false)}
        onCreated={(company) => {
          setShowCompany(false);
          router.push(`/clients/${company.id}`);
        }}
      />

      {activeTask && (
        <TaskDetailModal
          task={activeTask}
          updating={updating}
          onClose={() => setActiveTask(null)}
          onStatusChange={handleStatusChange}
          onDelete={handleDeleteTask}
        />
      )}

      {drawerStatus && (
        <TaskStatusDrawer
          status={drawerStatus}
          tasks={drawerTasks}
          updating={updating}
          onClose={() => {
            setDrawerStatus(null);
          }}
          onOpenTask={handleOpenTask}
          onStatusChange={handleStatusChange}
          onDelete={handleDeleteTask}
        />
      )}

      {commandDrawer && (
        <CommandCenterDrawer
          kind={commandDrawer}
          data={commandCenterData}
          onClose={() => setCommandDrawer(null)}
          onOpenTask={handleOpenTask}
          onCreateTask={() => setShowNewTask(true)}
          onCreateMeeting={() => setShowSchedule(true)}
          onCreateCompany={() => setShowCompany(true)}
          onCreateProject={
            canManageWorkspace ? () => setShowNewProject(true) : undefined
          }
          onCalendarChanged={loadData}
        />
      )}
    </>
  );
}
function QuickCreateMenu({
  onCreateTask,
  onCreateProject,
  onCreateMeeting,
  onCreateCompany,
  onInvite,
}: {
  onCreateTask: () => void;
  onCreateProject?: () => void;
  onCreateMeeting: () => void;
  onCreateCompany: () => void;
  onInvite: () => void;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  const items = [
    {
      label: t("dashboard.createTask"),
      icon: CheckSquare,
      action: onCreateTask,
    },
    ...(onCreateProject
      ? [{
          label: t("dashboard.createProject"),
          icon: FolderPlus,
          action: onCreateProject,
        }]
      : []),
    {
      label: t("dashboard.createMeeting"),
      icon: Video,
      action: onCreateMeeting,
    },
    {
      label: t("dashboard.createCompany"),
      icon: Building2,
      action: onCreateCompany,
    },
    { label: t("dashboard.createInvite"), icon: UserPlus, action: onInvite },
  ];

  return (
    <div ref={menuRef} className="relative w-full sm:w-auto xl:self-end">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 text-sm font-semibold text-white shadow-[0_14px_36px_rgba(59,130,246,0.28)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_46px_rgba(139,92,246,0.34)] sm:w-auto"
      >
        <Plus className="h-4 w-4" />
        {t("dashboard.quickCreate")}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border border-white/10 bg-popover/95 p-1 shadow-[0_22px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl"
        >
          {items.map(({ label, icon: Icon, action }) => (
            <button
              key={label}
              type="button"
              role="menuitem"
              onClick={() => choose(action)}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-popover-foreground transition-all hover:bg-sky-400/10 hover:text-white"
            >
              <Icon className="h-4 w-4 text-primary" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
type DashboardTone =
  | "danger"
  | "warning"
  | "success"
  | "info"
  | "rose"
  | "violet";

const toneStyles: Record<
  DashboardTone,
  {
    dot: string;
    surface: string;
    border: string;
    icon: string;
    text: string;
    bar: string;
  }
> = {
  danger: {
    dot: "bg-upflow-danger",
    surface: "bg-upflow-danger/10",
    border: "border-upflow-danger/25",
    icon: "bg-upflow-danger/15 text-upflow-danger",
    text: "text-upflow-danger",
    bar: "bg-upflow-danger",
  },
  warning: {
    dot: "bg-upflow-warning",
    surface: "bg-upflow-warning/10",
    border: "border-upflow-warning/25",
    icon: "bg-upflow-warning/15 text-upflow-warning",
    text: "text-upflow-warning",
    bar: "bg-upflow-warning",
  },
  success: {
    dot: "bg-upflow-success",
    surface: "bg-upflow-success/10",
    border: "border-upflow-success/25",
    icon: "bg-upflow-success/15 text-upflow-success",
    text: "text-upflow-success",
    bar: "bg-upflow-success",
  },
  info: {
    dot: "bg-sky-400",
    surface: "bg-sky-400/10",
    border: "border-sky-400/25",
    icon: "bg-sky-400/15 text-sky-300",
    text: "text-sky-300",
    bar: "bg-sky-400",
  },
  rose: {
    dot: "bg-pink-400",
    surface: "bg-pink-400/10",
    border: "border-pink-400/25",
    icon: "bg-pink-400/15 text-pink-300",
    text: "text-pink-300",
    bar: "bg-pink-400",
  },
  violet: {
    dot: "bg-primary",
    surface: "bg-primary/10",
    border: "border-primary/25",
    icon: "bg-primary/15 text-primary",
    text: "text-primary",
    bar: "bg-primary",
  },
};

function SignalBadge({ tone, label }: { tone: DashboardTone; label: string }) {
  const styles = toneStyles[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_18px_rgba(59,130,246,0.08)]",
        styles.surface,
        styles.border,
        styles.text,
        tone === "danger" && "upflow-pulse-badge",
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", styles.dot)} />
      {label}
    </span>
  );
}

function PulseLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-semibold text-foreground">
        {value}
      </span>
    </div>
  );
}

function SummaryPill({
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  label: string;
  value: string | number;
  hint: string;
  tone: DashboardTone;
  onClick: () => void;
}) {
  const styles = toneStyles[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "command-metric-card group flex min-h-[112px] items-center justify-between gap-4 rounded-2xl px-5 py-4 text-left upflow-focus-glow",
        styles.border,
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span
          className={cn(
            "h-12 w-1 rounded-full shadow-[0_0_18px_currentColor]",
            styles.bar,
          )}
        />
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {hint}
          </span>
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-3xl font-bold tracking-tight drop-shadow-[0_0_14px_currentColor]",
          styles.text,
        )}
      >
        {value}
      </span>
    </button>
  );
}

async function readDashboardApiError(res: Response, fallback: string) {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function StatusCountButton({
  label,
  value,
  hint,
  tone,
  status,
  active,
  onClick,
}: {
  label: string;
  value: number;
  hint: string;
  tone: DashboardTone;
  status: TaskDrawerStatus;
  active: boolean;
  onClick: () => void;
}) {
  const styles = toneStyles[tone];
  return (
    <button
      type="button"
      data-task-status={status}
      aria-expanded={active}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "command-metric-card flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-left upflow-focus-glow",
        styles.border,
      )}
    >
      <span className="min-w-0">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className={cn("h-2 w-2 rounded-full", styles.dot)} />
          {label}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {hint}
        </span>
      </span>
      <span className={cn("text-lg font-bold", styles.text)}>{value}</span>
    </button>
  );
}

function CommandTile({
  title,
  value,
  hint,
  icon,
  tone,
  active,
  onClick,
}: {
  title: string;
  value: number | string;
  hint: string;
  icon: React.ReactNode;
  tone: DashboardTone;
  active: boolean;
  onClick: () => void;
}) {
  const styles = toneStyles[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "command-metric-card group relative min-h-[142px] rounded-2xl p-4 text-left upflow-focus-glow sm:p-5",
        styles.border,
        active && "border-primary/70 shadow-[0_0_44px_rgba(139,92,246,0.26)]",
      )}
    >
      <span
        className={cn(
          "absolute inset-x-0 top-0 h-0.5 opacity-90 shadow-[0_0_18px_currentColor] transition-opacity group-hover:opacity-100",
          styles.bar,
        )}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </span>
        <span
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-xl shadow-[0_0_20px_rgba(59,130,246,0.12)]",
            styles.icon,
          )}
        >
          {icon}
        </span>
      </div>
      <div className="mt-4 flex items-end justify-between gap-3">
        <div
          className={cn(
            "text-3xl font-bold tracking-tight drop-shadow-[0_0_14px_currentColor]",
            styles.text,
          )}
        >
          {value}
        </div>
        <ArrowRight
          className={cn(
            "mb-1 h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100",
            styles.text,
          )}
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </button>
  );
}

function creativeStageLabel(
  stage: NonNullable<
    CommandCenterPayload["creative_queue"]
  >["items"][number]["stage"],
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  const labels: Record<typeof stage, string> = {
    waiting_for_briefing: t("dashboard.stageBriefing"),
    ready_to_start: t("dashboard.stageReady"),
    in_production: t("dashboard.stageProduction"),
    waiting_for_approval: t("dashboard.stageApproval"),
    revision_requested: t("dashboard.stageRevision"),
  };
  return labels[stage];
}

function healthLabel(
  status: NonNullable<
    CommandCenterPayload["client_health"]
  >["items"][number]["health_status"],
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  const labels: Record<typeof status, string> = {
    healthy: t("clients.health.healthy"),
    attention_needed: t("clients.health.attention"),
    at_risk: t("clients.health.risk"),
    not_enough_data: t("clients.health.notEnough"),
  };
  return labels[status];
}

function CommandCenterDrawer({
  kind,
  data,
  onClose,
  onOpenTask,
  onCreateTask,
  onCreateMeeting,
  onCreateCompany,
  onCreateProject,
  onCalendarChanged,
}: {
  kind: CommandDrawer;
  data: CommandCenterPayload;
  onClose: () => void;
  onOpenTask: (task: Task) => void;
  onCreateTask: () => void;
  onCreateMeeting: () => void;
  onCreateCompany: () => void;
  onCreateProject?: () => void;
  onCalendarChanged: () => void;
}) {
  const { language, t } = useLanguage();
  const [manageMeetings, setManageMeetings] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<CalendarEvent | null>(
    null,
  );
  const titleMap: Record<CommandDrawer, string> = {
    urgent_actions: t("dashboard.myUrgentActions"),
    team_workload: t("dashboard.teamWorkload"),
    time_today: t("dashboard.timeToday"),
    meetings_today: t("dashboard.meetingsToday"),
    recent_activity: t("dashboard.recentActivity"),
    projects_at_risk: t("dashboard.projectsAtRisk"),
    client_risk: t("dashboard.clientRisk"),
    client_health: t("dashboard.clientHealthOverview"),
    delivery_overview: t("dashboard.deliveryOverview"),
    creative_queue: t("dashboard.creativeProductionQueue"),
    department_workload: t("dashboard.workloadByDepartment"),
    agency_risk_signals: t("dashboard.agencyRiskSignals"),
    revenue_snapshot: t("dashboard.revenueSnapshot"),
    quick_create: t("dashboard.quickCreate"),
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <aside
        className="absolute right-0 top-0 h-dvh w-full max-w-lg overflow-y-auto border-l border-white/10 p-4 glass-strong sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              {t("dashboard.commandCenter")}
            </p>
            <h2 className="text-lg font-semibold text-foreground mt-1">
              {titleMap[kind]}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/10"
            aria-label={t("dashboard.closeCommandDrawer")}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 space-y-3">
          {kind === "urgent_actions" &&
            (data.urgent_actions.items.length === 0 ? (
              <DrawerEmpty
                title={t("dashboard.noUrgentActions")}
                text={t("dashboard.noUrgentActionsHint")}
              />
            ) : (
              data.urgent_actions.items.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => onOpenTask(task)}
                  className="w-full rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left hover:bg-white/[0.06]"
                >
                  <p className="text-sm font-medium text-foreground">
                    {task.title}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {task.project?.name ?? t("dashboard.noProject")}{" "}
                    {task.due_date
                      ? `- ${formatDate(task.due_date, language)}`
                      : ""}
                  </p>
                </button>
              ))
            ))}

          {kind === "team_workload" &&
            data.team_workload.items.map((item) => (
              <div
                key={item.user.id}
                className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {item.user.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {item.user.email}
                    </p>
                  </div>
                  <span className="rounded-full bg-white/5 px-2 py-1 text-xs capitalize text-foreground">
                    {item.state}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("dashboard.workloadSummary", {
                    open: item.open_tasks,
                    overdue: item.overdue_tasks,
                    time: formatSecondsShort(item.tracked_seconds_today),
                  })}
                </p>
                {item.tasks.length > 0 ? (
                  <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
                    {item.tasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        onClick={() => onOpenTask(task)}
                        className="block w-full rounded-lg bg-black/10 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-white/[0.06] hover:text-foreground"
                      >
                        <span className="block truncate font-medium text-foreground">
                          {task.title}
                        </span>
                        <span className="mt-0.5 block truncate">
                          {task.project?.name ?? t("dashboard.noProject")}
                          {task.due_date
                            ? ` - ${t("dashboard.due", { date: formatDate(task.due_date, language) })}`
                            : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 rounded-lg bg-black/10 px-3 py-2 text-xs text-muted-foreground">
                    {t("dashboard.noWorkloadTasks")}
                  </p>
                )}
              </div>
            ))}

          {kind === "time_today" &&
            (data.time_today.entries.length === 0 &&
            !data.time_today.running ? (
              <DrawerEmpty
                title={t("dashboard.noTrackedTime")}
                text={t("dashboard.noTrackedTimeHint")}
              />
            ) : (
              <>
                <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {t("dashboard.totalToday")}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-foreground">
                    {formatSecondsShort(data.time_today.total_seconds)}
                  </p>
                </div>
                {data.time_today.entries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {entry.task?.title ??
                        entry.project?.name ??
                        entry.description ??
                        t("dashboard.trackedTimeFallback")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatSecondsShort(entrySeconds(entry))}{" "}
                      {entry.status === "running"
                        ? t("dashboard.running")
                        : entry.status === "paused"
                          ? t("dashboard.paused")
                          : t("dashboard.logged")}
                    </p>
                  </div>
                ))}
              </>
            ))}

          {kind === "meetings_today" &&
            (data.meetings_today.items.length === 0 ? (
              <div className="space-y-3">
                <MeetingsManageHeader
                  manage={manageMeetings}
                  onManageChange={setManageMeetings}
                  onAdd={onCreateMeeting}
                />
                <DrawerEmpty
                  title={t("dashboard.noMeetings")}
                  text={t("dashboard.noMeetingsHint")}
                />
                {manageMeetings && (
                  <button
                    type="button"
                    onClick={onCreateMeeting}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    <Plus className="h-4 w-4" />
                    {t("dashboard.addMeeting")}
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <MeetingsManageHeader
                  manage={manageMeetings}
                  onManageChange={setManageMeetings}
                  onAdd={onCreateMeeting}
                />
                {data.meetings_today.items.map((event) => (
                  <div
                    key={event.id}
                    className="flex items-center gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 hover:bg-white/[0.06]"
                  >
                    <Link href="/calendar" className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {event.title}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDate(event.starts_at, language)}
                      </p>
                    </Link>
                    {manageMeetings && (
                      <div className="flex flex-shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingMeeting(event)}
                          aria-label={t("dashboard.editMeeting", {
                            title: event.title,
                          })}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-white/10 hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void deleteDashboardMeeting(
                              event,
                              onCalendarChanged,
                              t,
                            )
                          }
                          aria-label={t("dashboard.deleteMeeting")}
                          className="flex h-8 w-8 items-center justify-center rounded-md text-upflow-danger hover:bg-upflow-danger/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}

          {kind === "recent_activity" &&
            (data.recent_activity.items.length === 0 ? (
              <DrawerEmpty
                title={t("dashboard.noRecentActivity")}
                text={t("dashboard.noRecentActivityHint")}
              />
            ) : (
              data.recent_activity.items.map((event) => (
                <div
                  key={event.id}
                  className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3"
                >
                  <p className="text-sm font-medium text-foreground">
                    {dashboardActivityText(event, t).what}{" "}
                    {dashboardActivityText(event, t).target}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(event.created_at, language)}
                  </p>
                </div>
              ))
            ))}

          {kind === "projects_at_risk" &&
            (data.projects_at_risk.items.length === 0 ? (
              <DrawerEmpty
                title={t("dashboard.noProjectsAtRisk")}
                text={t("dashboard.noProjectsAtRiskHint")}
              />
            ) : (
              data.projects_at_risk.items.map(({ project, reasons }) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="block rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 hover:bg-white/[0.06]"
                >
                  <p className="text-sm font-medium text-foreground">
                    {project.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {reasons
                      .map((reason) => localizeDashboardReason(reason, t))
                      .join(" - ")}
                  </p>
                </Link>
              ))
            ))}

          {kind === "client_risk" &&
            (data.client_risk.items.length === 0 ? (
              <DrawerEmpty
                title={t("dashboard.noClientsAtRisk")}
                text={t("dashboard.noClientsAtRiskHint")}
              />
            ) : (
              data.client_risk.items.map(
                ({ company, reasons, open_tasks, overdue_tasks }) => (
                  <Link
                    key={company.id}
                    href={`/clients/${company.id}`}
                    className="block rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 hover:bg-white/[0.06]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {company.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {reasons
                            .map((reason) => localizeDashboardReason(reason, t))
                            .join(" - ")}
                        </p>
                      </div>
                      <span className="rounded-full bg-upflow-danger/15 px-2 py-1 text-xs text-upflow-danger">
                        {t("dashboard.overdueCount", { count: overdue_tasks })}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("dashboard.openTasksCount", { count: open_tasks })}
                      {data.financials_visible
                        ? ` - ${moneyCompact(company.contract_value)}`
                        : ""}
                    </p>
                  </Link>
                ),
              )
            ))}

          {kind === "client_health" &&
            (!data.client_health?.items.length ? (
              <DrawerEmpty
                title={t("dashboard.notEnoughClientData")}
                text={t("dashboard.notEnoughClientDataHint")}
              />
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <HealthCount
                    label={t("clients.health.healthy")}
                    value={data.client_health.counts.healthy}
                  />
                  <HealthCount
                    label={t("clients.health.attention")}
                    value={data.client_health.counts.attention_needed}
                  />
                  <HealthCount
                    label={t("clients.health.risk")}
                    value={data.client_health.counts.at_risk}
                  />
                  <HealthCount
                    label={t("clients.health.notEnough")}
                    value={data.client_health.counts.not_enough_data}
                  />
                </div>
                {data.client_health.items.map((item) => (
                  <Link
                    key={item.company.id}
                    href={`/clients/${item.company.id}`}
                    className="block rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 hover:bg-white/[0.06]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.company.name}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {item.company.plan_name ??
                            item.company.service_type ??
                            t("dashboard.planNotSet")}
                        </p>
                      </div>
                      <span className="rounded-full bg-white/10 px-2 py-1 text-xs text-foreground">
                        {healthLabel(item.health_status, t)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {t("dashboard.activeProjectsCount", {
                        count: item.active_projects,
                      })}{" "}
                      -{" "}
                      {t("dashboard.openTasksCount", {
                        count: item.open_tasks,
                      })}
                      {item.next_deadline
                        ? ` - ${t("dashboard.nextDeadline", { date: formatDate(item.next_deadline, language) })}`
                        : ` - ${t("dashboard.noDeadline")}`}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.reasons.length
                        ? item.reasons
                            .map((reason) => localizeDashboardReason(reason, t))
                            .join(" - ")
                        : t("dashboard.noTraceableClientHealthIssues")}
                    </p>
                  </Link>
                ))}
              </div>
            ))}

          {kind === "delivery_overview" &&
            (!data.delivery_overview?.items.length ? (
              <DrawerEmpty
                title={t("dashboard.noActiveClientWork")}
                text={t("dashboard.noActiveClientWorkHint")}
              />
            ) : (
              data.delivery_overview.items.map((item) => (
                <Link
                  key={item.project.id}
                  href={`/projects/${item.project.id}`}
                  className="block rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 hover:bg-white/[0.06]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {item.project.name}
                      </p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {item.project.company?.name ??
                          item.project.space?.name ??
                          t("dashboard.internalOperation")}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-foreground">
                      {item.progress}%
                    </span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-upflow-success"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("dashboard.openTasksCount", { count: item.open_tasks })}{" "}
                    -{" "}
                    {t("dashboard.overdueCount", { count: item.overdue_tasks })}
                    {item.next_deadline
                      ? ` - ${t("dashboard.nextDeadline", { date: formatDate(item.next_deadline, language) })}`
                      : ` - ${t("dashboard.noDeadline")}`}
                  </p>
                </Link>
              ))
            ))}

          {kind === "creative_queue" &&
            (!data.creative_queue?.items.length ? (
              <DrawerEmpty
                title={t("dashboard.noCreativeQueue")}
                text={t("dashboard.noCreativeQueueHint")}
              />
            ) : (
              <div className="space-y-3">
                <p className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-xs text-muted-foreground">
                  {t("dashboard.creativeQueueSourceNote")}
                </p>
                {data.creative_queue.items.map(({ task, stage }) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task)}
                    className="w-full rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left hover:bg-white/[0.06]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {task.title}
                        </p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          {task.project?.name ?? t("dashboard.noProject")}
                          {task.due_date
                            ? ` - ${formatDate(task.due_date, language)}`
                            : ""}
                        </p>
                      </div>
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary">
                        {creativeStageLabel(stage, t)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ))}

          {kind === "department_workload" &&
            (!data.department_workload?.items.length ? (
              <DrawerEmpty
                title={t("dashboard.noDepartmentWorkload")}
                text={t("dashboard.noDepartmentWorkloadHint")}
              />
            ) : (
              data.department_workload.items.map((item) => (
                <div
                  key={item.department.id}
                  className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">
                      {item.department.id === "unassigned"
                        ? t("dashboard.unassigned")
                        : item.department.name}
                    </p>
                    <span className="text-lg font-bold text-foreground">
                      {item.active_tasks}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("dashboard.membersCount", {
                      count: item.assigned_members,
                    })}{" "}
                    -{" "}
                    {t("dashboard.dueSoonCount", {
                      count: item.upcoming_tasks,
                    })}{" "}
                    -{" "}
                    {t("dashboard.overdueCount", { count: item.overdue_tasks })}
                  </p>
                </div>
              ))
            ))}

          {kind === "agency_risk_signals" &&
            (!data.agency_risk_signals?.items.length ? (
              <DrawerEmpty
                title={t("dashboard.noAgencyRiskSignals")}
                text={t("dashboard.noAgencyRiskSignalsHint")}
              />
            ) : (
              data.agency_risk_signals.items.map((signal) => {
                const copy = localizeAgencyRiskSignal(signal, t);
                return (
                  <div
                    key={signal.key}
                    className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        {copy.label}
                      </p>
                      <span className="text-xl font-bold text-foreground">
                        {signal.count}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {copy.trace}
                    </p>
                  </div>
                );
              })
            ))}

          {kind === "revenue_snapshot" && data.financials_visible && (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {t("clientDetail.contractValue")}
                  </p>
                  <p className="mt-1 text-xl font-bold text-foreground">
                    {moneyCompact(data.revenue_snapshot.total_contract_value)}
                  </p>
                </div>
                <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {t("dashboard.commission")}
                  </p>
                  <p className="mt-1 text-xl font-bold text-foreground">
                    {moneyCompact(data.revenue_snapshot.total_commission)}
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3">
                <p className="text-sm font-medium text-foreground">
                  {t("dashboard.activeClients", {
                    count: data.revenue_snapshot.active_clients,
                  })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("dashboard.missingContractValue", {
                    count: data.revenue_snapshot.clients_without_contract_value,
                  })}
                </p>
              </div>
              {data.revenue_snapshot.top_clients.length === 0 ? (
                <DrawerEmpty
                  title={t("dashboard.noContractValues")}
                  text={t("dashboard.noContractValuesHint")}
                />
              ) : (
                data.revenue_snapshot.top_clients.map((company) => (
                  <Link
                    key={company.id}
                    href={`/clients/${company.id}`}
                    className="block rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 hover:bg-white/[0.06]"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {company.name}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("dashboard.contractCommission", {
                        contract: moneyCompact(company.contract_value),
                        commission: moneyCompact(company.commission),
                      })}
                    </p>
                  </Link>
                ))
              )}
            </div>
          )}

          {kind === "quick_create" && (
            <div className="grid gap-2">
              <button
                type="button"
                onClick={onCreateTask}
                className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left text-sm text-foreground hover:bg-white/[0.06]"
              >
                {t("task.createTask")}
              </button>
              <button
                type="button"
                onClick={onCreateMeeting}
                className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left text-sm text-foreground hover:bg-white/[0.06]"
              >
                {t("calendar.scheduleMeeting")}
              </button>
              <button
                type="button"
                onClick={onCreateCompany}
                className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left text-sm text-foreground hover:bg-white/[0.06]"
              >
                {t("companyDialog.title")}
              </button>
              {onCreateProject ? (
                <button
                  type="button"
                  onClick={onCreateProject}
                  className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-left text-sm text-foreground hover:bg-white/[0.06]"
                >
                  {t("projects.createProject")}
                </button>
              ) : null}
              <Link
                href="/docs"
                className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-3 text-sm text-foreground hover:bg-white/[0.06]"
              >
                {t("dashboard.createNote")}
              </Link>
            </div>
          )}
        </div>
        {editingMeeting && (
          <DashboardMeetingEditor
            event={editingMeeting}
            onClose={() => setEditingMeeting(null)}
            onSaved={() => {
              setEditingMeeting(null);
              onCalendarChanged();
            }}
          />
        )}
      </aside>
    </div>
  );
}

function MeetingsManageHeader({
  manage,
  onManageChange,
  onAdd,
}: {
  manage: boolean;
  onManageChange: (next: boolean) => void;
  onAdd: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
        <button
          type="button"
          onClick={() => onManageChange(false)}
          className={cn(
            "rounded-md px-3 py-1 text-xs transition-colors",
            !manage
              ? "bg-white/10 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("dashboard.view")}
        </button>
        <button
          type="button"
          onClick={() => onManageChange(true)}
          className={cn(
            "rounded-md px-3 py-1 text-xs transition-colors",
            manage
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t("dashboard.manage")}
        </button>
      </div>
      {manage && (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("dashboard.addMeeting")}
        </button>
      )}
    </div>
  );
}

async function deleteDashboardMeeting(
  event: CalendarEvent,
  onDeleted: () => void,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  if (!confirm(t("dashboard.deleteEventConfirm", { title: event.title })))
    return;
  try {
    const res = await fetch(`/api/calendar/events/${event.id}`, {
      method: "DELETE",
    });
    if (res.status === 403) {
      toast.error(t("dashboard.noEventPermission"));
      return;
    }
    if (!res.ok) throw new Error(t("dashboard.meetingDeleteFailed"));
    toast.success(t("dashboard.meetingDeleted"));
    onDeleted();
  } catch {
    toast.error(t("dashboard.couldNotDeleteMeeting"));
  }
}

function dashboardTimeInput(value: string) {
  return appTimeInputValue(value);
}

function mergeDashboardEventDate(event: CalendarEvent, time: string) {
  return mergeAppDateAndTime(new Date(event.starts_at), time);
}

function DashboardMeetingEditor({
  event,
  onClose,
  onSaved,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState(event.title);
  const [time, setTime] = useState(dashboardTimeInput(event.starts_at));
  const [location, setLocation] = useState(event.location ?? "");
  const [submitting, setSubmitting] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error(t("dashboard.titleRequired"));
      return;
    }
    const startsAt = mergeDashboardEventDate(event, time);
    const endsAt = new Date(startsAt.getTime() + 30 * 60 * 1000);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/calendar/events/${event.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          location: location.trim() || null,
        }),
      });
      if (res.status === 403) {
        toast.error(t("dashboard.noEventPermission"));
        return;
      }
      if (!res.ok) throw new Error(t("dashboard.meetingUpdateFailed"));
      toast.success(t("dashboard.meetingUpdated"));
      onSaved();
    } catch {
      toast.error(t("dashboard.couldNotUpdateMeeting"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={save}
        className="max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-md overflow-y-auto rounded-2xl p-4 glass-strong sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">
            {event.type === "meeting"
              ? t("dashboard.manageMeeting")
              : t("dashboard.manageEvent")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <label className="mb-1.5 block text-xs font-medium text-foreground">
          {t("dashboard.titleField")}
        </label>
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              {t("dashboard.timeField")}
            </label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              {t("dashboard.locationField")}
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={() => void deleteDashboardMeeting(event, onSaved, t)}
            disabled={submitting}
            className="flex w-10 items-center justify-center rounded-lg border border-upflow-danger/30 text-upflow-danger hover:bg-upflow-danger/10 disabled:opacity-40"
            aria-label={t("dashboard.deleteMeeting")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-white/10 py-2 text-sm text-foreground hover:bg-white/10 disabled:opacity-40"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

function DrawerEmpty({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-5 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{text}</p>
    </div>
  );
}

function HealthCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
      <p className="text-lg font-bold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function StatCard({
  tone,
  label,
  value,
  accent,
  icon,
  hint,
  active,
  onClick,
}: {
  tone: "stat-1" | "stat-2" | "stat-3";
  label: string;
  value: number;
  accent: string;
  icon: React.ReactNode;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useLanguage();
  const wash =
    tone === "stat-1"
      ? "bg-gradient-to-br from-upflow-stat-1-from/35 via-upflow-stat-1-to/60 to-upflow-stat-1-to/40"
      : tone === "stat-2"
        ? "bg-gradient-to-br from-upflow-stat-2-from/35 via-upflow-stat-2-to/60 to-upflow-stat-2-to/40"
        : "bg-gradient-to-br from-upflow-stat-3-from/35 via-upflow-stat-3-to/60 to-upflow-stat-3-to/40";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "relative overflow-hidden rounded-2xl p-5 text-left glass transition-all hover:-translate-y-0.5 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-primary/60",
        active && "ring-2 ring-primary/70",
      )}
    >
      <div className={cn("pointer-events-none absolute inset-0", wash)} />
      <div className="pointer-events-none absolute -top-12 -right-10 w-36 h-36 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex items-center justify-between">
        <p className="text-xs font-medium text-foreground/80 uppercase tracking-wide">
          {label}
        </p>
        <div
          className={cn(
            "flex items-center justify-center w-9 h-9 rounded-xl bg-background/40 backdrop-blur",
            accent,
          )}
        >
          {icon}
        </div>
      </div>
      <h3 className="relative mt-3 text-3xl font-bold text-foreground">
        {value}
      </h3>
      <p className="relative mt-1 text-xs text-foreground/60">{hint}</p>
      {active && (
        <span className="relative mt-2 inline-block text-[10px] font-medium uppercase tracking-wider text-primary">
          {t("dashboard.filtering")}
        </span>
      )}
    </button>
  );
}

type TimerState = "stopped" | "running" | "paused";

function RightPanel({
  projects,
  meetings,
  activity,
  runningEntry,
  timeEntries,
  onTimerChanged,
  onCreateMeeting,
}: {
  projects: Project[];
  meetings: CalendarEvent[];
  activity: ActivityEvent[];
  runningEntry: TimeEntry | null;
  timeEntries: TimeEntry[];
  onTimerChanged: () => void;
  onCreateMeeting: () => void;
}) {
  const { language, t } = useLanguage();
  const [timerState, setTimerState] = useState<TimerState>("stopped");
  const [seconds, setSeconds] = useState(0);
  const [activeProjectIdx, setActiveProjectIdx] = useState(0);
  const [splits, setSplits] = useState<{ project: string; duration: string }[]>(
    [],
  );
  const [timerMenuOpen, setTimerMenuOpen] = useState(false);
  const [manageMeetings, setManageMeetings] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<CalendarEvent | null>(
    null,
  );
  const timerMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        timerMenuRef.current &&
        !timerMenuRef.current.contains(e.target as Node)
      ) {
        setTimerMenuOpen(false);
      }
    }
    if (timerMenuOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [timerMenuOpen]);

  useEffect(() => {
    if (timerState !== "running") return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [timerState]);

  useEffect(() => {
    if (!runningEntry) {
      setTimerState("stopped");
      setSeconds(0);
      return;
    }
    setTimerState(runningEntry.status === "paused" ? "paused" : "running");
    setSeconds(entrySeconds(runningEntry));
  }, [runningEntry]);

  const fmt = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const todayMeetings = useMemo(
    () =>
      meetings
        .filter((meeting) =>
          sameLocalDate(new Date(meeting.starts_at), new Date()),
        )
        .map((meeting) => ({
          id: meeting.id,
          time: formatTime(meeting.starts_at, language),
          title: meeting.title,
          event: meeting,
        }))
        .sort((a, b) => a.time.localeCompare(b.time)),
    [language, meetings],
  );
  const extraMeetings = useMemo<typeof todayMeetings>(() => [], []);

  const allMeetings = useMemo(
    () =>
      [...todayMeetings, ...extraMeetings].sort((a, b) =>
        a.time.localeCompare(b.time),
      ),
    [todayMeetings, extraMeetings],
  );
  const am = allMeetings.filter((m) => parseInt(m.time) < 12);
  const pm = allMeetings.filter((m) => parseInt(m.time) >= 12);

  const [meetingsOpen, setMeetingsOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(todayMeetings.map((m) => [m.id, true])),
  );

  useEffect(() => {
    setMeetingsOpen((prev) => {
      const next = { ...prev };
      for (const m of allMeetings) {
        if (!(m.id in next)) next[m.id] = true;
      }
      return next;
    });
  }, [allMeetings]);

  const todayIdx = (() => {
    const d = new Date().getDay();
    return d === 0 ? 6 : d - 1;
  })();
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const weekActivity = useMemo(
    () => buildDashboardWeekActivity(activity, timeEntries, language),
    [activity, language, timeEntries],
  );
  const recent = useMemo(
    () => buildDashboardRecent(activity, language, t),
    [activity, language, t],
  );

  const filteredRecent = useMemo(() => {
    let list = recent;
    if (actionFilter !== "all") {
      list = list.filter((r) => r.status === actionFilter);
    }
    if (activeDay !== null) {
      list = list.filter((r) => r.dayIndex === activeDay);
    }
    return list;
  }, [recent, actionFilter, activeDay]);

  const activeProject =
    runningEntry?.project?.name ||
    projects[activeProjectIdx]?.name ||
    t("dashboard.noActiveTimer");
  const activeProjectId = projects[activeProjectIdx]?.id;

  const handleStart = async () => {
    try {
      const res = await fetch("/api/time/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          activeProjectId ? { project_id: activeProjectId } : {},
        ),
      });
      if (!res.ok) throw new Error(t("dashboard.couldNotStartTimer"));
      setTimerState("running");
      toast.success(t("dashboard.timerStarted"));
      onTimerChanged();
    } catch {
      toast.error(t("dashboard.couldNotStartTimer"));
    }
  };
  const handlePause = async () => {
    if (!runningEntry) return;
    try {
      const res = await fetch("/api/time/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: runningEntry.id }),
      });
      if (!res.ok) throw new Error(t("dashboard.couldNotPauseTimer"));
      const entry = (await res.json()) as TimeEntry;
      setSeconds(entrySeconds(entry));
      setTimerState("paused");
      toast.success(t("dashboard.timerPaused"));
      onTimerChanged();
    } catch {
      toast.error(t("dashboard.couldNotPauseTimer"));
    }
  };
  const handleResume = async () => {
    if (!runningEntry) return;
    try {
      const res = await fetch("/api/time/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: runningEntry.id }),
      });
      if (!res.ok) throw new Error(t("dashboard.couldNotResumeTimer"));
      const entry = (await res.json()) as TimeEntry;
      setSeconds(entrySeconds(entry));
      setTimerState("running");
      toast.success(t("dashboard.timerResumed"));
      onTimerChanged();
    } catch {
      toast.error(t("dashboard.couldNotResumeTimer"));
    }
  };
  const handleStop = async () => {
    if (!runningEntry) return;
    try {
      const res = await fetch("/api/time/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: runningEntry.id }),
      });
      if (!res.ok) throw new Error(t("dashboard.couldNotStopTimer"));
      setSplits((prev) =>
        [{ project: activeProject, duration: `${h}h ${m}m` }, ...prev].slice(
          0,
          4,
        ),
      );
      setTimerState("stopped");
      setSeconds(0);
      toast.success(t("dashboard.timerStopped"));
      onTimerChanged();
    } catch {
      toast.error(t("dashboard.couldNotStopTimer"));
    }
  };

  const handleReset = () => {
    if (runningEntry) {
      void handleStop();
    } else {
      setTimerState("stopped");
      setSeconds(0);
    }
    setTimerMenuOpen(false);
  };

  const handleSwitchProject = () => {
    if (projects.length <= 1) {
      toast(t("dashboard.noProject"));
      setTimerMenuOpen(false);
      return;
    }
    setActiveProjectIdx((i) => (i + 1) % projects.length);
    setTimerMenuOpen(false);
    toast.success(
      t("dashboard.switchedProject", {
        project: projects[(activeProjectIdx + 1) % projects.length].name,
      }),
    );
  };

  return (
    <aside className="hidden lg:flex w-[280px] flex-shrink-0 flex-col gap-4 p-6 border-l border-white/5">
      {/* Time tracking */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("nav.timeTracking")}
          </p>
          <div className="relative" ref={timerMenuRef}>
            <button
              onClick={() => setTimerMenuOpen((v) => !v)}
              aria-label={t("dashboard.timeTrackingOptions")}
              aria-expanded={timerMenuOpen}
              className="text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {timerMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-44 glass-strong rounded-xl z-50 overflow-hidden text-xs">
                <button
                  onClick={handleReset}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 text-left"
                >
                  <RotateCcw className="w-3.5 h-3.5" />{" "}
                  {t("dashboard.resetTimer")}
                </button>
                <button
                  onClick={handleSwitchProject}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-white/5 text-left border-t border-white/5"
                >
                  <Repeat className="w-3.5 h-3.5" />{" "}
                  {t("dashboard.switchProject")}
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="font-mono text-3xl font-bold text-foreground tabular-nums">
          {fmt(h)}:{fmt(m)}:{fmt(s)}
        </div>
        <p className="text-xs text-muted-foreground mt-1 truncate">
          {activeProject}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-3">
          <button
            onClick={timerState === "paused" ? handleResume : handleStart}
            disabled={timerState === "running"}
            aria-label={
              timerState === "paused"
                ? t("dashboard.resumeTimer")
                : t("dashboard.startTimer")
            }
            className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            {timerState === "paused"
              ? t("dashboard.resume")
              : t("dashboard.start")}
          </button>
          <button
            onClick={handleStop}
            disabled={timerState === "stopped"}
            aria-label={t("dashboard.stopTimer")}
            className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium bg-upflow-danger text-white hover:bg-upflow-danger/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm shadow-upflow-danger/30"
          >
            <Square className="w-3.5 h-3.5" />
            {t("dashboard.stop")}
          </button>
          <button
            onClick={handlePause}
            disabled={timerState !== "running"}
            aria-label={t("dashboard.pauseTimer")}
            className="flex items-center justify-center gap-1 py-2 rounded-xl text-xs font-medium bg-white/5 text-foreground hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <Pause className="w-3.5 h-3.5" />
            {t("dashboard.pause")}
          </button>
        </div>
        {splits.length > 0 && (
          <div className="mt-4 pt-3 border-t border-white/5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
              {t("dashboard.recentSplits")}
            </p>
            <ul className="space-y-1">
              {splits.map((sp, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-foreground/80 truncate pr-2">
                    {sp.project}
                  </span>
                  <span className="font-mono text-muted-foreground tabular-nums">
                    {sp.duration}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Today's meetings */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("dashboard.todayMeetings")}
          </p>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg border border-white/10 bg-white/5 p-0.5">
              <button
                type="button"
                onClick={() => setManageMeetings(false)}
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] transition-colors",
                  !manageMeetings
                    ? "bg-white/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("dashboard.view")}
              </button>
              <button
                type="button"
                onClick={() => setManageMeetings(true)}
                className={cn(
                  "rounded-md px-2 py-1 text-[10px] transition-colors",
                  manageMeetings
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t("dashboard.manage")}
              </button>
            </div>
            <CalendarIcon className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
        {manageMeetings && (
          <button
            type="button"
            onClick={onCreateMeeting}
            className="mb-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("dashboard.addMeeting")}
          </button>
        )}

        {[
          { label: "AM", items: am },
          { label: "PM", items: pm },
        ].map(
          (group) =>
            group.items.length > 0 && (
              <div key={group.label} className="mb-3 last:mb-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                  {group.label}
                </p>
                <div className="space-y-1">
                  {group.items.map((mt) => {
                    const open = meetingsOpen[mt.id];
                    return (
                      <div
                        key={mt.id}
                        className="flex items-center gap-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors -mx-2 px-2"
                      >
                        <button
                          onClick={() =>
                            toast(
                              t("dashboard.joiningMeeting", {
                                title: mt.title,
                              }),
                              { icon: "📹" },
                            )
                          }
                          className="flex items-center gap-3 flex-1 min-w-0 text-left rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                        >
                          <span className="font-mono text-xs font-semibold text-foreground/90 tabular-nums w-12 flex-shrink-0">
                            {mt.time}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground truncate">
                              {mt.title}
                            </p>
                          </div>
                          <Video className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        </button>
                        <button
                          onClick={() =>
                            setMeetingsOpen((s) => ({
                              ...s,
                              [mt.id]: !s[mt.id],
                            }))
                          }
                          aria-pressed={open}
                          aria-label={t("dashboard.toggleMeeting", {
                            title: mt.title,
                          })}
                          className={cn(
                            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0",
                            open ? "bg-primary" : "bg-white/10",
                          )}
                        >
                          <span
                            className={cn(
                              "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                              open ? "translate-x-[18px]" : "translate-x-[3px]",
                            )}
                          />
                        </button>
                        {manageMeetings && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingMeeting(mt.event)}
                              aria-label={t("dashboard.editMeeting", {
                                title: mt.title,
                              })}
                              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void deleteDashboardMeeting(
                                  mt.event,
                                  onTimerChanged,
                                  t,
                                )
                              }
                              aria-label={t("dashboard.deleteMeeting")}
                              className="flex h-6 w-6 items-center justify-center rounded text-upflow-danger hover:bg-upflow-danger/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ),
        )}
        <Link
          href="/calendar"
          className="inline-block text-xs text-primary hover:text-primary/80 mt-1"
        >
          {t("dashboard.viewAll")} →
        </Link>
        {editingMeeting && (
          <DashboardMeetingEditor
            event={editingMeeting}
            onClose={() => setEditingMeeting(null)}
            onSaved={() => {
              setEditingMeeting(null);
              onTimerChanged();
            }}
          />
        )}
      </div>

      {/* Activity */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("dashboard.activity")}
          </p>
          {activeDay !== null ? (
            <button
              onClick={() => setActiveDay(null)}
              className="text-[10px] text-primary hover:underline"
            >
              {t("dashboard.clear")}
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">
              {t("dashboard.lastWeek")}
            </span>
          )}
        </div>
        <div className="flex items-end justify-between gap-1.5">
          {weekActivity.map((d, i) => {
            const isToday = i === todayIdx;
            const isActive = activeDay === i;
            return (
              <div
                key={d.day}
                className="flex flex-col items-center gap-1.5 flex-1 min-w-0"
              >
                <button
                  type="button"
                  onClick={() => setActiveDay((c) => (c === i ? null : i))}
                  aria-pressed={isActive}
                  title={t("dashboard.hoursTasks", {
                    hours: d.hours,
                    tasks: d.tasks,
                  })}
                  className={cn(
                    "group relative w-full flex flex-col items-center justify-end gap-1 py-2 rounded-full min-h-[96px] transition-all hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-primary/50",
                    isActive
                      ? "bg-primary/25 ring-2 ring-primary/60"
                      : isToday
                        ? "bg-primary/15 ring-1 ring-primary/30"
                        : "bg-white/5",
                  )}
                >
                  {d.items.map((dot, di) => (
                    <span
                      key={di}
                      className={cn("rounded-full block", dot.color)}
                      style={{
                        width: `${dot.size}px`,
                        height: `${dot.size}px`,
                        opacity: 0.85,
                      }}
                    />
                  ))}
                  <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 px-2 py-1 rounded-md text-[10px] font-medium glass-strong opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {t("dashboard.hoursTasks", {
                      hours: d.hours,
                      tasks: d.tasks,
                    })}
                  </span>
                </button>
                <span
                  className={cn(
                    "text-[10px] font-medium",
                    isActive
                      ? "text-primary"
                      : isToday
                        ? "text-primary"
                        : "text-muted-foreground",
                  )}
                >
                  {d.day}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Last actions */}
      <div className="glass rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {t("dashboard.lastActions")}
          </p>
        </div>
        <div className="flex items-center gap-1 mb-3">
          {(["all", "completed", "in_progress"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setActionFilter(f)}
              aria-pressed={actionFilter === f}
              className={cn(
                "text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full transition-colors",
                actionFilter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10",
              )}
            >
              {f === "all"
                ? t("dashboard.all")
                : f === "completed"
                  ? t("dashboard.done")
                  : t("dashboard.active")}
            </button>
          ))}
        </div>
        <div className="space-y-3">
          {filteredRecent.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              {t("dashboard.noMatchingActivity")}
            </p>
          ) : (
            filteredRecent.map((r, i) => (
              <button
                key={i}
                onClick={() => toast(`${r.who} — ${r.what} ${r.target}`)}
                className="w-full flex items-start gap-3 -mx-2 px-2 py-1 rounded-lg hover:bg-white/5 transition-colors text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <div className="w-7 h-7 rounded-full bg-primary/20 text-primary text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                  {getInitials(r.who)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium text-foreground truncate">
                      {r.who}
                    </p>
                    <span
                      className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded flex-shrink-0",
                        r.status === "completed"
                          ? "bg-upflow-success/20 text-upflow-success"
                          : "bg-upflow-warning/20 text-upflow-warning",
                      )}
                    >
                      {r.status === "completed"
                        ? t("dashboard.completedStatus")
                        : t("dashboard.inProgressStatus")}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-snug truncate">
                    {r.what} {r.target}
                  </p>
                  <p className="text-[11px] text-muted-foreground/90 mt-0.5">
                    {r.when}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
        <Link
          href="/activity"
          className="text-xs text-primary hover:text-primary/80 mt-3"
        >
          {t("dashboard.viewAll")} →
        </Link>
      </div>
    </aside>
  );
}
