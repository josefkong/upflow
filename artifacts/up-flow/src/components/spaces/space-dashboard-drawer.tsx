"use client";

import Link from "next/link";
import { Calendar as CalendarIcon, CheckSquare, FolderPlus, X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type { Task } from "@/lib/types";
import {
  entrySeconds,
  formatDateTime,
  formatSecondsShort,
  humanize,
  type DrawerKind,
  type TaskStatus,
} from "@/components/spaces/space-dashboard-utils";
import type { SpaceDashboardData } from "@/components/spaces/space-page-types";
import {
  Metric,
  QuickCreateButton,
  RecordList,
  TaskRecord,
} from "@/components/spaces/space-dashboard-parts";

export function SpaceDashboardDrawer({
  kind,
  data,
  updatingTask,
  onClose,
  onCreateTask,
  onCreateMeeting,
  onCreateProject,
  onTaskStatusChange,
}: {
  kind: DrawerKind;
  data: SpaceDashboardData;
  updatingTask: boolean;
  onClose: () => void;
  onCreateTask?: () => void;
  onCreateMeeting?: () => void;
  onCreateProject?: () => void;
  onTaskStatusChange: (task: Task, status: TaskStatus) => void;
}) {
  const { language, t } = useLanguage();
  const status = kind.startsWith("status:") ? (kind.split(":")[1] as TaskStatus) : null;
  const statusTasks = status
    ? data.tasks.items.filter((task) => task.status === status)
    : [];
  const statusLabels: Record<TaskStatus, string> = {
    todo: t("spaceDashboard.statusTodo"),
    in_progress: t("spaceDashboard.statusInProgress"),
    done: t("spaceDashboard.statusDone"),
  };
  const statusTitles: Record<TaskStatus, string> = {
    todo: t("spaceDashboard.upcomingActions"),
    in_progress: t("spaceDashboard.inProgressActions"),
    done: t("spaceDashboard.completedActions"),
  };
  const drawerTitles: Partial<Record<DrawerKind, string>> = {
    urgent_actions: t("spaceDashboard.myUrgentActions"),
    team_workload: t("spaceDashboard.teamWorkload"),
    time_today: t("spaceDashboard.timeToday"),
    meetings_today: t("spaceDashboard.meetingsToday"),
    recent_activity: t("spaceDashboard.recentActivity"),
    projects_at_risk: t("spaceDashboard.projectsAtRisk"),
    quick_create: t("spaceDashboard.quickCreate"),
  };
  const title = status ? statusTitles[status] : drawerTitles[kind] ?? t("spaceDashboard.spaceRecords");

  return (
    <div className="fixed inset-0 z-50">
      <button
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-label={t("spaceDashboard.closeDrawer")}
      />
      <aside className="glass-strong absolute right-0 top-0 flex h-dvh w-full max-w-xl flex-col border-l border-white/10 shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <p className="text-xs uppercase text-muted-foreground">{t("spaceDashboard.dashboardSuffix")}</p>
            <h3 className="text-lg font-semibold text-foreground">{title}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {kind === "urgent_actions" && (
            <RecordList
              emptyTitle={t("spaceDashboard.noUrgentActions")}
              emptyText={t("spaceDashboard.noUrgentActionsHint")}
            >
              {data.command_center.urgent_actions.items.map((task) => (
                <TaskRecord
                  key={task.id}
                  task={task}
                  updating={updatingTask}
                  onStatusChange={onTaskStatusChange}
                />
              ))}
            </RecordList>
          )}

          {status && (
            <RecordList
              emptyTitle={t("spaceDashboard.noStatusTasks", {
                status: statusLabels[status].toLowerCase(),
              })}
              emptyText={t("spaceDashboard.tasksWithStatusAppear")}
            >
              {statusTasks.map((task) => (
                <TaskRecord
                  key={task.id}
                  task={task}
                  updating={updatingTask}
                  onStatusChange={onTaskStatusChange}
                />
              ))}
            </RecordList>
          )}

          {kind === "team_workload" && (
            <RecordList
              emptyTitle={t("spaceDashboard.noTeamWorkload")}
              emptyText={t("spaceDashboard.assignedSpaceTasksAppear")}
            >
              {data.command_center.team_workload.items.map((item) => (
                <div key={item.user.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.user.name}</p>
                      <p className="text-xs text-muted-foreground">{item.user.email}</p>
                    </div>
                    <span className="rounded-full border border-white/10 px-2 py-1 text-xs capitalize text-muted-foreground">
                      {item.state}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                    <Metric label={t("spaceDashboard.openMetric")} value={item.open_tasks} />
                    <Metric label={t("spaceDashboard.overdueMetric")} value={item.overdue_tasks} />
                    <Metric label={t("spaceDashboard.todayMetric")} value={formatSecondsShort(item.tracked_seconds_today)} />
                  </div>
                  {item.tasks.length > 0 ? (
                    <div className="mt-3 space-y-2 border-t border-white/5 pt-3">
                      {item.tasks.map((task) => (
                        <TaskRecord
                          key={task.id}
                          task={task}
                          updating={updatingTask}
                          onStatusChange={onTaskStatusChange}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-lg bg-black/10 px-3 py-2 text-xs text-muted-foreground">
                      {t("spaceDashboard.noOpenAssignedTasks")}
                    </p>
                  )}
                </div>
              ))}
            </RecordList>
          )}

          {kind === "time_today" && (
            <RecordList
              emptyTitle={t("spaceDashboard.noTimeToday")}
              emptyText={t("spaceDashboard.spaceTimeEntriesAppear")}
            >
              {data.command_center.time_today.entries.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {entry.description || entry.task?.title || entry.project?.name || t("spaceDashboard.timeEntry")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.project?.name || t("spaceDashboard.noProject")} - {formatDateTime(entry.started_at, language)}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground">
                      {formatSecondsShort(entrySeconds(entry))}
                    </span>
                  </div>
                </div>
              ))}
            </RecordList>
          )}

          {kind === "meetings_today" && (
            <RecordList
              emptyTitle={t("spaceDashboard.noMeetingsToday")}
              emptyText={t("spaceDashboard.spaceCalendarEventsAppear")}
            >
              {data.command_center.meetings_today.items.map((event) => (
                <div key={event.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-foreground">{event.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDateTime(event.starts_at, language)}
                    {event.location ? ` - ${event.location}` : ""}
                  </p>
                </div>
              ))}
            </RecordList>
          )}

          {kind === "recent_activity" && (
            <RecordList
              emptyTitle={t("spaceDashboard.noRecentActivity")}
              emptyText={t("spaceDashboard.spaceActivityAppears")}
            >
              {data.command_center.recent_activity.items.map((event) => (
                <div key={event.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-sm font-medium text-foreground">{humanize(event.type)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.actor?.name || t("spaceDashboard.system")} - {formatDateTime(event.created_at, language)}
                  </p>
                </div>
              ))}
            </RecordList>
          )}

          {kind === "projects_at_risk" && (
            <RecordList
              emptyTitle={t("spaceDashboard.noProjectsAtRisk")}
              emptyText={t("spaceDashboard.projectsAtRiskHint")}
            >
              {data.command_center.projects_at_risk.items.map(({ project, reasons }) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="block rounded-lg border border-white/10 bg-white/[0.03] p-4 hover:bg-white/[0.06]"
                >
                  <p className="text-sm font-medium text-foreground">{project.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{reasons.join(" - ")}</p>
                </Link>
              ))}
            </RecordList>
          )}

          {kind === "quick_create" && (onCreateTask || onCreateMeeting || onCreateProject) && (
            <div className="grid gap-2">
              {onCreateTask && (
                <QuickCreateButton icon={<CheckSquare className="h-4 w-4" />} onClick={onCreateTask}>
                  {t("spaceDashboard.newTask")}
                </QuickCreateButton>
              )}
              {onCreateMeeting && (
                <QuickCreateButton icon={<CalendarIcon className="h-4 w-4" />} onClick={onCreateMeeting}>
                  {t("spaceDashboard.newMeeting")}
                </QuickCreateButton>
              )}
              {onCreateProject && (
                <QuickCreateButton icon={<FolderPlus className="h-4 w-4" />} onClick={onCreateProject}>
                  {t("spaceDashboard.newProject")}
                </QuickCreateButton>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
