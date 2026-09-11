"use client";

import {
  Activity,
  ArrowRight,
  Calendar,
  CheckCircle2,
  DollarSign,
  Filter,
  Plus,
  Target,
  Trophy,
  Users2,
} from "lucide-react";
import type { ReactNode } from "react";
import { useLanguage } from "@/components/language-provider";
import type { ActivityEvent, Project, Task, TeamMember } from "@/lib/types";
import { cn, formatDate, priorityColor } from "@/lib/utils";
import type { SpaceDashboardData } from "@/components/spaces/space-page-types";
import {
  formatDateTime,
  formatSecondsShort,
  humanize,
  type DrawerKind,
  type TaskStatus,
} from "@/components/spaces/space-dashboard-utils";

type CommercialOperationsHubProps = {
  data: SpaceDashboardData;
  updatingTask: boolean;
  onOpenDrawer: (kind: DrawerKind) => void;
  onCreateTask?: () => void;
  onTaskStatusChange: (task: Task, status: TaskStatus) => void;
};

type MetricTone = "violet" | "blue" | "green" | "amber" | "cyan" | "rose";

const metricToneStyles: Record<
  MetricTone,
  {
    border: string;
    glow: string;
    icon: string;
    text: string;
    line: string;
  }
> = {
  violet: {
    border: "border-violet-400/25",
    glow: "from-violet-500/20",
    icon: "bg-violet-500/[0.15] text-violet-700 dark:bg-violet-500/20 dark:text-violet-200",
    text: "text-violet-700 dark:text-violet-200",
    line: "stroke-violet-400",
  },
  blue: {
    border: "border-blue-400/25",
    glow: "from-blue-500/20",
    icon: "bg-blue-500/[0.15] text-blue-700 dark:bg-blue-500/20 dark:text-blue-200",
    text: "text-blue-700 dark:text-blue-200",
    line: "stroke-blue-400",
  },
  green: {
    border: "border-emerald-400/25",
    glow: "from-emerald-500/20",
    icon: "bg-emerald-500/[0.15] text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200",
    text: "text-emerald-700 dark:text-emerald-200",
    line: "stroke-emerald-400",
  },
  amber: {
    border: "border-amber-400/25",
    glow: "from-amber-500/20",
    icon: "bg-amber-500/[0.15] text-amber-700 dark:bg-amber-500/20 dark:text-amber-200",
    text: "text-amber-700 dark:text-amber-200",
    line: "stroke-amber-400",
  },
  cyan: {
    border: "border-cyan-400/25",
    glow: "from-cyan-500/20",
    icon: "bg-cyan-500/[0.15] text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-200",
    text: "text-cyan-700 dark:text-cyan-200",
    line: "stroke-cyan-400",
  },
  rose: {
    border: "border-rose-400/25",
    glow: "from-rose-500/20",
    icon: "bg-rose-500/[0.15] text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
    text: "text-rose-700 dark:text-rose-200",
    line: "stroke-rose-400",
  },
};

const stageTones: MetricTone[] = ["violet", "blue", "green", "amber", "rose"];

export function CommercialOperationsHub({
  data,
  updatingTask,
  onOpenDrawer,
  onCreateTask,
  onTaskStatusChange,
}: CommercialOperationsHubProps) {
  const { language, t } = useLanguage();
  const tasks = data.tasks.items;
  const projects = data.projects.items;
  const command = data.command_center;

  const openTasks = tasks.filter((task) => task.status !== "done");
  const todoTasks = tasks.filter((task) => task.status === "todo");
  const inProgressTasks = tasks.filter((task) => task.status === "in_progress");
  const doneTasks = tasks.filter((task) => task.status === "done");
  const todayTasks = openTasks.filter((task) => isToday(task.due_date));
  const overdueTasks = openTasks.filter((task) => isOverdue(task.due_date));
  const highPriorityOpen = openTasks.filter((task) => task.priority === "high");
  const pipelineValue = projects.reduce((sum, project) => sum + projectValue(project), 0);
  const avgDealSize = projects.length ? pipelineValue / projects.length : 0;
  const winRate = tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0;
  const completionRate = tasks.length ? Math.round((doneTasks.length / tasks.length) * 100) : 0;
  const hasAttention = command.projects_at_risk.count > 0 || command.urgent_actions.count > 0;
  const status = hasAttention
    ? t("commercialDashboard.needsAttention")
    : t("commercialDashboard.operational");
  const stages = buildStages(projects, tasks, t);
  const topProjects = [...projects]
    .sort((a, b) => {
      const valueDiff = projectValue(b) - projectValue(a);
      if (valueDiff !== 0) return valueDiff;
      return (b._count?.tasks ?? 0) - (a._count?.tasks ?? 0);
    })
    .slice(0, 5);
  const upcomingTasks = [...openTasks]
    .sort((a, b) => {
      const aTime = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    })
    .slice(0, 5);
  const workload = [...command.team_workload.items]
    .sort((a, b) => {
      const riskDiff = b.overdue_tasks - a.overdue_tasks;
      if (riskDiff !== 0) return riskDiff;
      const taskDiff = b.open_tasks - a.open_tasks;
      if (taskDiff !== 0) return taskDiff;
      return b.tracked_seconds_today - a.tracked_seconds_today;
    })
    .slice(0, 5);

  return (
    <div className="space-y-3 rounded-[1.5rem] border border-border bg-card p-3 shadow-lg dark:border-white/10 dark:bg-[#050816] dark:shadow-[0_24px_80px_rgba(0,0,0,0.45)] sm:p-4">
      <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm dark:border-white/10 dark:bg-[radial-gradient(circle_at_top_right,rgba(124,58,237,0.26),transparent_34%),linear-gradient(135deg,rgba(15,23,42,0.92),rgba(4,8,20,0.98))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] sm:p-5">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(15,23,42,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.03)_1px,transparent_1px)] [background-size:44px_44px] dark:[background-image:linear-gradient(rgba(255,255,255,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)]" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-700 dark:text-violet-200">
                {t("commercialDashboard.badge")}
              </span>
              <span
                className={cn(
                  "rounded-full border px-3 py-1 text-[11px] font-semibold",
                  !hasAttention
                    ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200"
                    : "border-amber-400/25 bg-amber-500/10 text-amber-700 dark:text-amber-200",
                )}
              >
                {status}
              </span>
            </div>
            <h3 className="mt-4 text-2xl font-bold tracking-tight text-foreground dark:text-white sm:text-3xl">
              {t("commercialDashboard.title")}
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground dark:text-slate-400">
              {t("commercialDashboard.subtitle")}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <CommercialToolbarButton icon={<Calendar className="h-4 w-4" />}>
              {t("commercialDashboard.last7Days")}
            </CommercialToolbarButton>
            <CommercialToolbarButton
              icon={<Filter className="h-4 w-4" />}
              onClick={() => onOpenDrawer("projects_at_risk")}
            >
              {t("commercialDashboard.filters")}
            </CommercialToolbarButton>
            {onCreateTask && (
              <button
                type="button"
                onClick={onCreateTask}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(79,70,229,0.35)] transition hover:scale-[1.01] hover:shadow-[0_14px_36px_rgba(79,70,229,0.48)]"
              >
                <Plus className="h-4 w-4" />
                {t("commercialLead.addLead")}
              </button>
            )}
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-[repeat(5,minmax(0,1fr))]">
          <CommercialMetricCard
            title={t("commercialDashboard.pipelineValue")}
            value={pipelineValue > 0 ? formatMoney(pipelineValue, language) : t("commercialDashboard.notSet")}
            detail={t("commercialDashboard.contractValueDetail")}
            tone="violet"
            icon={<DollarSign className="h-4 w-4" />}
            sparkSeed={Math.max(1, pipelineValue)}
          />
          <CommercialMetricCard
            title={t("commercialDashboard.activeProjects")}
            value={projects.length}
            detail={t("commercialDashboard.projectsInComercial")}
            tone="blue"
            icon={<Target className="h-4 w-4" />}
            sparkSeed={projects.length}
            onClick={() => onOpenDrawer("projects_at_risk")}
          />
          <CommercialMetricCard
            title={t("commercialDashboard.completedWork")}
            value={doneTasks.length}
            detail={t("commercialDashboard.doneTasksInComercial")}
            tone="green"
            icon={<Trophy className="h-4 w-4" />}
            sparkSeed={doneTasks.length}
            onClick={() => onOpenDrawer("status:done")}
          />
          <CommercialMetricCard
            title={t("commercialDashboard.completionRate")}
            value={`${completionRate}%`}
            detail={t("commercialDashboard.tasksDone", { done: doneTasks.length, total: tasks.length })}
            tone="amber"
            icon={<CheckCircle2 className="h-4 w-4" />}
            sparkSeed={completionRate}
            onClick={() => onOpenDrawer("status:done")}
          />
          <CommercialMetricCard
            title={t("commercialDashboard.avgProjectValue")}
            value={avgDealSize > 0 ? formatMoney(avgDealSize, language) : t("commercialDashboard.notSet")}
            detail={t("commercialDashboard.valueDividedByProjects")}
            tone="cyan"
            icon={<Activity className="h-4 w-4" />}
            sparkSeed={Math.max(1, avgDealSize)}
          />
        </div>
      </section>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
          <Panel
            title={t("commercialDashboard.pipelineStage")}
            action={t("commercialDashboard.viewSource")}
            onAction={() => onOpenDrawer("status:todo")}
          >
            <div className="grid gap-5 md:grid-cols-[0.9fr_1fr]">
              <div className="space-y-2">
                {stages.map((stage, index) => {
                  const width = `${Math.max(52, 100 - index * 11)}%`;
                  const tone = metricToneStyles[stageTones[index] ?? "violet"];
                  return (
                    <button
                      key={stage.name}
                      type="button"
                      onClick={() =>
                        onOpenDrawer(stage.status === "done" ? "status:done" : "status:todo")
                      }
                      className={cn(
                        "flex h-11 items-center justify-between rounded-md border px-3 text-left text-sm font-semibold text-foreground shadow-inner transition hover:translate-x-1 dark:text-white",
                        tone.border,
                        `bg-gradient-to-r ${tone.glow} to-transparent`,
                      )}
                      style={{ width }}
                    >
                      <span>{stage.name}</span>
                      <span>{stage.count}</span>
                    </button>
                  );
                })}
              </div>
              <div className="overflow-hidden rounded-xl border border-border dark:border-white/10">
                <div className="grid grid-cols-[1fr_64px_86px] border-b border-border bg-muted/30 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground dark:border-white/10 dark:bg-white/[0.15]">
                  <span>{t("commercialDashboard.stage")}</span>
                  <span className="text-right">{t("commercialDashboard.items")}</span>
                  <span className="text-right">{t("commercialDashboard.value")}</span>
                </div>
                {stages.map((stage) => (
                  <div
                    key={stage.name}
                    className="grid grid-cols-[1fr_64px_86px] items-center border-b border-border/60 px-3 py-3 text-sm last:border-0 dark:border-white/5"
                  >
                    <span className="font-medium text-foreground">{stage.name}</span>
                    <span className="text-right text-muted-foreground">{stage.count}</span>
                    <span className="text-right text-foreground dark:text-slate-300">
                      {stage.value > 0 ? formatMoney(stage.value, language) : "-"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel
            title={t("commercialDashboard.valueSources")}
            action={t("commercialDashboard.viewProjects")}
            onAction={() => onOpenDrawer("projects_at_risk")}
          >
            <div className="flex h-full min-h-[220px] flex-col justify-between">
              <div className="rounded-xl border border-border bg-muted/30 p-4 dark:border-white/10 dark:bg-black/20">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      {t("commercialDashboard.contractValue")}
                    </p>
                    <p className="mt-2 text-3xl font-bold text-foreground dark:text-white">
                      {pipelineValue > 0 ? formatMoney(pipelineValue, language) : t("commercialDashboard.notSet")}
                    </p>
                  </div>
                  <DollarSign className="h-8 w-8 text-violet-600 dark:text-violet-300" />
                </div>
                <SparkLine tone="violet" seed={Math.max(1, pipelineValue)} height={76} />
              </div>
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                {t("commercialDashboard.valueSourcesHint")}
              </p>
            </div>
          </Panel>
        </div>

        <Panel title={t("commercialDashboard.todaysPulse")} icon={<Activity className="h-4 w-4 text-violet-600 dark:text-violet-300" />}>
          <div className="space-y-2">
            <PulseButton
              label={t("commercialDashboard.urgentActions")}
              value={command.urgent_actions.count}
              tone="rose"
              onClick={() => onOpenDrawer("urgent_actions")}
            />
            <PulseButton
              label={t("commercialDashboard.meetingsToday")}
              value={command.meetings_today.count}
              tone="blue"
              onClick={() => onOpenDrawer("meetings_today")}
            />
            <PulseButton
              label={t("commercialDashboard.tasksDueToday")}
              value={todayTasks.length}
              tone="amber"
              onClick={() => onOpenDrawer("status:todo")}
            />
            <PulseButton
              label={t("commercialDashboard.timeTracked")}
              value={formatSecondsShort(command.time_today.total_seconds)}
              tone="green"
              onClick={() => onOpenDrawer("time_today")}
            />
          </div>
          <button
            type="button"
            onClick={() => onOpenDrawer("urgent_actions")}
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-violet-700 hover:text-foreground dark:text-violet-200 dark:hover:text-white"
          >
            {t("commercialDashboard.viewMyDay")}
            <ArrowRight className="h-4 w-4" />
          </button>
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_410px]">
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title={t("commercialDashboard.recentActivity")} action={t("commercialDashboard.viewAll")} onAction={() => onOpenDrawer("recent_activity")}>
            <ActivityList
              items={command.recent_activity.items.slice(0, 5)}
              emptyText={t("commercialDashboard.noActivity")}
              systemLabel={t("commercialDashboard.system")}
            />
          </Panel>
          <Panel title={t("commercialDashboard.upcomingTasks")} action={t("commercialDashboard.viewAll")} onAction={() => onOpenDrawer("urgent_actions")}>
            <TaskList
              tasks={upcomingTasks}
              updatingTask={updatingTask}
              onTaskStatusChange={onTaskStatusChange}
              emptyText={t("commercialDashboard.noUpcomingTasks")}
              markDoneLabel={(task) => t("commercialDashboard.markDone", { task })}
              projectLabel={t("commercialDashboard.project")}
              noDueDateLabel={t("commercialDashboard.noDueDate")}
            />
          </Panel>
        </div>

        <div className="grid gap-3">
          <Panel title={t("commercialDashboard.topProjects")} action={t("commercialDashboard.viewAll")} onAction={() => onOpenDrawer("projects_at_risk")}>
            <TopProjects
              projects={topProjects}
              maxValue={Math.max(...topProjects.map(projectValue), 1)}
              emptyText={t("commercialDashboard.noProjects")}
              tasksLabel={(count) => t("commercialDashboard.tasks", { count })}
              noValueLabel={t("commercialDashboard.noValue")}
            />
          </Panel>
          <Panel title={t("commercialDashboard.teamPerformance")} action={t("commercialDashboard.viewWorkload")} onAction={() => onOpenDrawer("team_workload")}>
            <TeamPerformance
              items={workload}
              emptyText={t("commercialDashboard.noWorkload")}
              lateLabel={(count) => t("commercialDashboard.late", { count })}
            />
          </Panel>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <MiniStatusCard
          label={t("commercialDashboard.openWork")}
          value={openTasks.length}
          detail={t("commercialDashboard.inProgressCount", { count: inProgressTasks.length })}
          tone="blue"
          onClick={() => onOpenDrawer("status:in_progress")}
        />
        <MiniStatusCard
          label={t("commercialDashboard.overdue")}
          value={overdueTasks.length}
          detail={t("commercialDashboard.openTasksPastDue")}
          tone="rose"
          onClick={() => onOpenDrawer("urgent_actions")}
        />
        <MiniStatusCard
          label={t("commercialDashboard.highPriority")}
          value={highPriorityOpen.length}
          detail={t("commercialDashboard.requiresAttention")}
          tone="amber"
          onClick={() => onOpenDrawer("urgent_actions")}
        />
        <MiniStatusCard
          label={t("commercialDashboard.todo")}
          value={todoTasks.length}
          detail={t("commercialDashboard.tasksWaitingToStart")}
          tone="violet"
          onClick={() => onOpenDrawer("status:todo")}
        />
      </div>
    </div>
  );
}

function CommercialToolbarButton({
  icon,
  children,
  onClick,
}: {
  icon: ReactNode;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:border-violet-400/40 hover:bg-violet-500/10 hover:text-foreground dark:border-white/10 dark:bg-black/25 dark:text-slate-300 dark:hover:text-white"
    >
      {icon}
      {children}
    </button>
  );
}

function CommercialMetricCard({
  title,
  value,
  detail,
  tone,
  icon,
  sparkSeed,
  onClick,
}: {
  title: string;
  value: string | number;
  detail: string;
  tone: MetricTone;
  icon: ReactNode;
  sparkSeed: number;
  onClick?: () => void;
}) {
  const color = metricToneStyles[tone];
  const className = cn(
    "group min-h-[158px] overflow-hidden rounded-xl border bg-card p-4 text-left shadow-sm transition dark:bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.018))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
    color.border,
    onClick && "hover:-translate-y-0.5 hover:bg-accent dark:hover:bg-white/[0.15]",
  );
  const content = (
    <>
      <div className="flex items-start gap-3">
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", color.icon)}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground dark:text-slate-400">
            {title}
          </p>
          <p className="mt-3 truncate text-2xl font-bold text-foreground dark:text-white">{value}</p>
          <p className={cn("mt-2 truncate text-xs", color.text)}>{detail}</p>
        </div>
      </div>
      <SparkLine tone={tone} seed={sparkSeed} />
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function SparkLine({
  tone,
  seed,
  height = 42,
}: {
  tone: MetricTone;
  seed: number;
  height?: number;
}) {
  const color = metricToneStyles[tone];
  const values = buildSparkValues(seed);
  const max = Math.max(...values, 1);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 100;
      const y = 42 - (value / max) * 34;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <svg className="mt-4 w-full" height={height} viewBox="0 0 100 44" preserveAspectRatio="none">
      <polyline
        points={points}
        fill="none"
        strokeWidth="1.7"
        className={cn(color.line, "drop-shadow-[0_0_8px_currentColor]")}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Panel({
  title,
  children,
  action,
  onAction,
  icon,
}: {
  title: string;
  children: ReactNode;
  action?: string;
  onAction?: () => void;
  icon?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm dark:border-white/10 dark:bg-[linear-gradient(145deg,rgba(15,23,42,0.82),rgba(5,8,18,0.94))] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-2">
          {icon}
          <h4 className="truncate text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground dark:text-slate-300">
            {title}
          </h4>
        </div>
        {action && onAction && (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 text-xs font-medium text-violet-700 hover:text-foreground dark:text-violet-200 dark:hover:text-white"
          >
            {action}
          </button>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function PulseButton({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: string | number;
  tone: MetricTone;
  onClick: () => void;
}) {
  const color = metricToneStyles[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl border bg-muted/30 px-3 py-2.5 text-left transition hover:bg-accent dark:bg-white/[0.15] dark:hover:bg-white/[0.15]",
        color.border,
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span className={cn("h-2 w-2 rounded-full", color.icon)} />
        {label}
      </span>
      <span className={cn("rounded-full bg-black/[0.15] px-2 py-1 text-xs font-bold dark:bg-black/25", color.text)}>
        {value}
      </span>
    </button>
  );
}

function ActivityList({
  items,
  emptyText,
  systemLabel,
}: {
  items: ActivityEvent[];
  emptyText: string;
  systemLabel: string;
}) {
  const { language } = useLanguage();
  if (items.length === 0) {
    return <EmptyPanelText>{emptyText}</EmptyPanelText>;
  }
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.id} className="flex items-start gap-3">
          <AvatarLabel label={item.actor?.name ?? "UP"} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {item.actor?.name ?? systemLabel} {humanize(item.type)}
            </p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {humanize(item.entity_type)} - {formatRelative(item.created_at, language)}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskList({
  tasks,
  updatingTask,
  onTaskStatusChange,
  emptyText,
  markDoneLabel,
  projectLabel,
  noDueDateLabel,
}: {
  tasks: Task[];
  updatingTask: boolean;
  onTaskStatusChange: (task: Task, status: TaskStatus) => void;
  emptyText: string;
  markDoneLabel: (task: string) => string;
  projectLabel: string;
  noDueDateLabel: string;
}) {
  const { language } = useLanguage();
  if (tasks.length === 0) {
    return <EmptyPanelText>{emptyText}</EmptyPanelText>;
  }
  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-3 dark:border-white/10 dark:bg-white/[0.15]"
        >
          <button
            type="button"
            disabled={updatingTask || task.status === "done"}
            onClick={() => onTaskStatusChange(task, "done")}
            className="flex h-5 w-5 items-center justify-center rounded-md border border-border text-muted-foreground hover:border-emerald-500 hover:text-emerald-600 disabled:opacity-50 dark:border-white/20 dark:hover:text-emerald-300"
            aria-label={markDoneLabel(task.title)}
          >
            {task.status === "done" ? <CheckCircle2 className="h-4 w-4" /> : null}
          </button>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {task.project?.name ?? projectLabel} -{" "}
              {task.due_date ? formatDate(task.due_date, language) : noDueDateLabel}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
              priorityColor(task.priority),
              "bg-muted dark:bg-white/[0.15]",
            )}
          >
            {task.priority}
          </span>
        </div>
      ))}
    </div>
  );
}

function TopProjects({
  projects,
  maxValue,
  emptyText,
  tasksLabel,
  noValueLabel,
}: {
  projects: Project[];
  maxValue: number;
  emptyText: string;
  tasksLabel: (count: number) => string;
  noValueLabel: string;
}) {
  const { language } = useLanguage();
  if (projects.length === 0) {
    return <EmptyPanelText>{emptyText}</EmptyPanelText>;
  }
  return (
    <div className="space-y-3">
      {projects.map((project, index) => {
        const value = projectValue(project);
        const width = `${Math.max(12, value > 0 ? (value / maxValue) * 100 : Math.min(100, (project._count?.tasks ?? 0) * 16))}%`;
        const tone = metricToneStyles[stageTones[index % stageTones.length]];
        return (
          <div key={project.id} className="grid grid-cols-[minmax(0,1fr)_76px] gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{project.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {project.company?.name ?? tasksLabel(project._count?.tasks ?? 0)}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted dark:bg-white/10">
                <div
                  className={cn("h-full rounded-full", tone.icon)}
                  style={{ width }}
                />
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-foreground">
                {value > 0 ? formatMoney(value, language) : noValueLabel}
              </p>
              <p className="text-xs text-muted-foreground">{project.status}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamPerformance({
  items,
  emptyText,
  lateLabel,
}: {
  items: Array<{
    user: TeamMember;
    open_tasks: number;
    overdue_tasks: number;
    due_today_tasks: number;
    tracked_seconds_today: number;
  }>;
  emptyText: string;
  lateLabel: (count: number) => string;
}) {
  if (items.length === 0) {
    return <EmptyPanelText>{emptyText}</EmptyPanelText>;
  }
  const maxOpenTasks = Math.max(...items.map((item) => item.open_tasks), 1);
  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const tone = metricToneStyles[stageTones[index % stageTones.length]];
        const width = `${Math.max(8, (item.open_tasks / maxOpenTasks) * 100)}%`;
        return (
          <div key={item.user.id} className="grid grid-cols-[32px_minmax(0,1fr)_72px] items-center gap-3">
            <AvatarLabel label={item.user.name} />
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-medium text-foreground">{item.user.name}</p>
                {item.overdue_tasks > 0 && (
                  <span className="rounded-full bg-rose-500/[0.15] px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-200">
                    {lateLabel(item.overdue_tasks)}
                  </span>
                )}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted dark:bg-white/10">
                <div className={cn("h-full rounded-full", tone.icon)} style={{ width }} />
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-foreground">{item.open_tasks}</p>
              <p className="text-xs text-muted-foreground">
                {formatSecondsShort(item.tracked_seconds_today)}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MiniStatusCard({
  label,
  value,
  detail,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  tone: MetricTone;
  onClick: () => void;
}) {
  const color = metricToneStyles[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border bg-card p-4 text-left transition hover:-translate-y-0.5 hover:bg-accent dark:bg-[linear-gradient(145deg,rgba(255,255,255,0.05),rgba(255,255,255,0.015))] dark:hover:bg-white/[0.15]",
        color.border,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-3 text-3xl font-bold text-foreground dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </button>
  );
}

function EmptyPanelText({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground dark:border-white/10 dark:bg-white/[0.15]">
      {children}
    </div>
  );
}

function AvatarLabel({ label }: { label: string }) {
  const initials = label
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/[0.15] text-xs font-bold text-violet-700 dark:bg-violet-500/20 dark:text-violet-100">
      {initials || "UP"}
    </span>
  );
}

function buildStages(
  projects: Project[],
  tasks: Task[],
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  const definitions: Array<{
    name: string;
    status: TaskStatus;
    keywords: string[];
    fallback: Task[];
  }> = [
    { name: t("commercialDashboard.stageLeads"), status: "todo", keywords: ["lead"], fallback: tasks.filter((task) => task.status === "todo") },
    {
      name: t("commercialDashboard.stageProposals"),
      status: "todo",
      keywords: ["proposal", "proposta"],
      fallback: tasks.filter((task) => task.priority === "high" && task.status !== "done"),
    },
    {
      name: t("commercialDashboard.stageFollowUps"),
      status: "in_progress",
      keywords: ["follow", "follow-up", "retorno"],
      fallback: tasks.filter((task) => task.status === "in_progress"),
    },
    {
      name: t("commercialDashboard.stageContracts"),
      status: "in_progress",
      keywords: ["contract", "contrato"],
      fallback: tasks.filter((task) => task.status !== "done" && task.due_date),
    },
    { name: t("commercialDashboard.stageWon"), status: "done", keywords: ["won", "closed", "fechado"], fallback: tasks.filter((task) => task.status === "done") },
  ];

  return definitions.map((definition) => {
    const matchingProjects = projects.filter((project) =>
      definition.keywords.some((keyword) => project.name.toLowerCase().includes(keyword)),
    );
    const count = matchingProjects.length > 0 ? matchingProjects.length : definition.fallback.length;
    const value = matchingProjects.reduce((sum, project) => sum + projectValue(project), 0);
    return { ...definition, count, value };
  });
}

function projectValue(project: Project) {
  return Number(project.company?.contract_value ?? 0);
}

function buildSparkValues(seed: number) {
  const base = Math.max(1, Math.round(seed));
  return Array.from({ length: 10 }, (_, index) => {
    const wave = Math.sin((base + index * 11) * 0.37) + 1;
    return Math.round(20 + wave * 22 + index * 2);
  });
}

function isToday(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function isOverdue(value: string | null) {
  if (!value) return false;
  const date = new Date(value);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date.getTime() < today.getTime();
}

function formatMoney(value: number, language: "en" | "pt-BR") {
  return new Intl.NumberFormat(language, {
    style: "currency",
    currency: "BRL",
    notation: value >= 100000 ? "compact" : "standard",
    maximumFractionDigits: value >= 100000 ? 1 : 0,
  }).format(value);
}

function formatRelative(value: string, language: "en" | "pt-BR") {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 1) return language === "pt-BR" ? "Agora" : "Just now";
  if (minutes < 60) return language === "pt-BR" ? `${minutes} min atrás` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return language === "pt-BR" ? `${hours}h atrás` : `${hours}h ago`;
  return formatDateTime(value, language);
}
