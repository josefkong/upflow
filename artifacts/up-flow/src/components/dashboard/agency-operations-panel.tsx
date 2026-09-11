"use client";

import Link from "next/link";
import { AlertCircle, TrendingDown, Users2 } from "lucide-react";
import type { Project, Task } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import { localizeAgencyRiskSignal } from "@/components/dashboard/dashboard-utils";

type AgencyDrawer =
  | "client_health"
  | "delivery_overview"
  | "creative_queue"
  | "department_workload"
  | "agency_risk_signals";

type CreativeStage =
  | "waiting_for_briefing"
  | "ready_to_start"
  | "in_production"
  | "waiting_for_approval"
  | "revision_requested";

interface AgencyOperationsData {
  client_health?: {
    counts: {
      healthy: number;
      attention_needed: number;
      at_risk: number;
      not_enough_data: number;
    };
  };
  delivery_overview?: {
    items: Array<{
      project: Pick<Project, "id" | "name"> & {
        company?: { id: string; name: string } | null;
        space?: { id: string; name: string; icon: string | null } | null;
      };
      progress: number;
      next_deadline: string | null;
    }>;
  };
  creative_queue?: {
    items: Array<{ task: Task; stage: CreativeStage }>;
  };
  agency_risk_signals?: {
    items: Array<{
      key: string;
      label: string;
      count: number;
      trace: string;
      trace_values?: {
        member_name?: string;
        member_open_tasks?: number;
        total_open_tasks?: number;
      };
    }>;
  };
}

export default function AgencyOperationsPanel({
  data,
  onOpenDrawer,
  onOpenTask,
}: {
  data: AgencyOperationsData;
  onOpenDrawer: (drawer: AgencyDrawer) => void;
  onOpenTask: (task: Task) => void;
}) {
  const { language, t } = useLanguage();
  const clientHealth = data.client_health;
  const deliveryItems = data.delivery_overview?.items ?? [];
  const creativeQueue = data.creative_queue;
  const riskSignals = data.agency_risk_signals?.items ?? [];
  const topRisks = riskSignals.filter((signal) => signal.count > 0).slice(0, 3);

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.55fr)]">
      <div className="upflow-panel rounded-2xl p-5">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-upflow-success via-primary to-upflow-warning" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              {t("dashboard.agencyOperations")}
            </p>
            <h3 className="mt-2 text-lg font-semibold text-foreground">
              {t("dashboard.agencyOperationsTitle")}
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("dashboard.agencyOperationsHint")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenDrawer("agency_risk_signals")}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] transition-all hover:-translate-y-0.5 hover:border-sky-400/50 hover:bg-sky-400/10"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {t("dashboard.traceRisks")}
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <AgencyMiniCard
            title={t("dashboard.clientHealth")}
            value={clientHealth ? t("dashboard.healthyCount", { count: clientHealth.counts.healthy }) : t("clients.health.notEnough")}
            hint={
              clientHealth
                ? t("dashboard.needAttentionCount", { count: clientHealth.counts.attention_needed + clientHealth.counts.at_risk })
                : t("dashboard.addClientDataHint")
            }
            onClick={() => onOpenDrawer("client_health")}
          />
          <AgencyMiniCard
            title={t("dashboard.campaignDelivery")}
            value={t("dashboard.activeCount", { count: deliveryItems.length })}
            hint={deliveryItems.length ? t("dashboard.progressAndDeadlines") : t("dashboard.noActiveClientWork")}
            onClick={() => onOpenDrawer("delivery_overview")}
          />
          <AgencyMiniCard
            title={t("dashboard.creativeQueue")}
            value={t("dashboard.deliverablesCount", { count: creativeQueue?.items.length ?? 0 })}
            hint={creativeQueue?.items.length ? t("dashboard.creativeSignalsHint") : t("dashboard.noCreativeMatched")}
            onClick={() => onOpenDrawer("creative_queue")}
          />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="upflow-card rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-foreground">{t("dashboard.closestDeliveryDeadlines")}</h4>
              <button
                type="button"
                onClick={() => onOpenDrawer("delivery_overview")}
                className="text-xs text-primary hover:text-primary/80"
              >
                {t("dashboard.viewAll")}
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {deliveryItems.length === 0 ? (
                <p className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3 text-xs text-muted-foreground">
                  {t("dashboard.applyAgencyTemplateHint")}
                </p>
              ) : (
                deliveryItems.slice(0, 4).map((item) => (
                  <Link
                    key={item.project.id}
                    href={`/projects/${item.project.id}`}
                    className="block rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 transition-all hover:-translate-y-0.5 hover:border-sky-400/30 hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium text-foreground">{item.project.name}</p>
                      <span className="text-xs font-semibold text-foreground">{item.progress}%</span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {item.project.company?.name ?? item.project.space?.name ?? t("dashboard.internalOperation")}
                      {item.next_deadline ? ` - ${formatDate(item.next_deadline, language)}` : ` - ${t("dashboard.noDeadline")}`}
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="upflow-card rounded-xl p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-foreground">{t("dashboard.creativeProductionQueue")}</h4>
              <button
                type="button"
                onClick={() => onOpenDrawer("creative_queue")}
                className="text-xs text-primary hover:text-primary/80"
              >
                {t("dashboard.viewQueue")}
              </button>
            </div>
            <div className="mt-3 space-y-2">
              {!creativeQueue?.items.length ? (
                <p className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-3 text-xs text-muted-foreground">
                  {t("dashboard.noCreativeQueueLong")}
                </p>
              ) : (
                creativeQueue.items.slice(0, 4).map(({ task, stage }) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => onOpenTask(task)}
                    className="w-full rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-left transition-all hover:-translate-y-0.5 hover:border-sky-400/30 hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium text-foreground">{task.title}</p>
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary">
                        {creativeStageLabel(stage, t)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {task.project?.name ?? t("dashboard.noProject")}{task.due_date ? ` - ${formatDate(task.due_date, language)}` : ""}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <aside className="upflow-panel rounded-2xl p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">{t("dashboard.agencyRiskSignals")}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("dashboard.agencyRiskOnlyTraceable")}
            </p>
          </div>
          <TrendingDown className="h-5 w-5 text-upflow-warning" />
        </div>
        <div className="mt-4 space-y-2">
          {topRisks.length === 0 ? (
            <p className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-3 text-xs text-muted-foreground">
              {t("dashboard.notEnoughRiskData")}
            </p>
          ) : (
            topRisks.map((signal) => {
              const copy = localizeAgencyRiskSignal(signal, t);
              return (
              <button
                key={signal.key}
                type="button"
                onClick={() => onOpenDrawer("agency_risk_signals")}
                className="w-full rounded-xl border border-white/5 bg-white/[0.03] px-3 py-3 text-left transition-all hover:-translate-y-0.5 hover:border-upflow-warning/35 hover:bg-white/[0.06]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-foreground">{copy.label}</span>
                  <span className="text-lg font-bold text-upflow-warning">{signal.count}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{copy.trace}</p>
              </button>
              );
            })
          )}
        </div>
        <button
          type="button"
          onClick={() => onOpenDrawer("department_workload")}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-foreground transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:bg-primary/10"
        >
          <Users2 className="h-3.5 w-3.5" />
          {t("dashboard.workloadByDepartment")}
        </button>
      </aside>
    </section>
  );
}

function AgencyMiniCard({
  title,
  value,
  hint,
  onClick,
}: {
  title: string;
  value: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[114px] rounded-xl px-4 py-3 text-left upflow-card upflow-card-hover upflow-focus-glow"
    >
      <p className="line-clamp-1 h-4 text-xs font-semibold uppercase leading-4 text-muted-foreground">{title}</p>
      <p className="mt-2 flex h-7 items-center text-xl font-bold leading-7 text-foreground">{value}</p>
      <p className="mt-1 line-clamp-2 h-8 text-xs leading-4 text-muted-foreground">{hint}</p>
    </button>
  );
}

function creativeStageLabel(
  stage: CreativeStage,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  const labels: Record<CreativeStage, string> = {
    waiting_for_briefing: t("dashboard.stageBriefing"),
    ready_to_start: t("dashboard.stageReady"),
    in_production: t("dashboard.stageProduction"),
    waiting_for_approval: t("dashboard.stageApproval"),
    revision_requested: t("dashboard.stageRevision"),
  };
  return labels[stage];
}
