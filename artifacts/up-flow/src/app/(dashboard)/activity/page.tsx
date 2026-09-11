"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Building2,
  Clock3,
  Database,
  Filter,
  RefreshCcw,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import Header from "@/components/layout/header";
import {
  activityEntityLabel,
  activityEventLabel,
  formatActivityDateTime,
} from "@/lib/activity-labels";
import type { ActivityEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";

const ENTITY_OPTIONS = [
  ["", "activity.allRecords"],
  ["workspace", "activity.workspace"],
  ["workspace_member", "activity.rolesAndAccess"],
  ["invite", "activity.invites"],
  ["space", "activity.spaces"],
  ["folder", "activity.folders"],
  ["list", "activity.lists"],
  ["project", "activity.projects"],
  ["task", "activity.tasks"],
  ["company", "activity.clients"],
  ["contact", "activity.contacts"],
  ["note", "activity.notes"],
  ["time_entry", "activity.time"],
] as const;

export default function ActivityAuditPage() {
  const { language, t } = useLanguage();
  const locale = language === "pt-BR" ? "pt-BR" : "en-US";
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState("");
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const loadActivity = useCallback(async (cursor?: string | null) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "75" });
      if (query.trim()) params.set("q", query.trim());
      if (entityType) params.set("entity_type", entityType);
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`/api/activity?${params.toString()}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as {
        items?: ActivityEvent[];
        nextCursor?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || t("activity.couldNotLoadWithStatus", { status: res.status }));
      setEvents((current) => (cursor ? [...current, ...(data.items ?? [])] : data.items ?? []));
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("activity.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [entityType, query, t]);

  useEffect(() => {
    loadActivity(null);
  }, [loadActivity]);

  const summary = useMemo(() => {
    const accessEvents = events.filter((event) =>
      /invite|member|role|permission|workspace/i.test(`${event.entity_type} ${event.type}`),
    ).length;
    const destructiveEvents = events.filter((event) => /delete|remove|deactivate/i.test(event.type)).length;
    const clientEvents = events.filter((event) => event.company_id || event.entity_type === "company").length;
    return { accessEvents, destructiveEvents, clientEvents };
  }, [events]);

  return (
    <>
      <Header title={t("activity.title")} />
      <main className="space-y-5 p-4 sm:p-6">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-lg dark:border-blue-400/20 dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_34%),rgba(2,6,23,0.74)] dark:shadow-[0_20px_80px_rgba(2,6,23,0.35)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-blue-700 dark:border-blue-400/20 dark:text-blue-100">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t("activity.auditCenter")}
              </div>
              <h1 className="mt-4 text-2xl font-bold text-foreground dark:text-white">{t("activity.auditLog")}</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("activity.description")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadActivity(null)}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-accent dark:border-white/10 dark:bg-white/[0.15] dark:text-blue-100 dark:hover:bg-white/[0.15]"
            >
              <RefreshCcw className="h-4 w-4" />
              {t("common.refresh")}
            </button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <AuditStat icon={<ShieldCheck className="h-4 w-4" />} label={t("activity.accessChanges")} value={summary.accessEvents} tone="info" />
            <AuditStat icon={<AlertTriangle className="h-4 w-4" />} label={t("activity.deletedOrRemoved")} value={summary.destructiveEvents} tone="danger" />
            <AuditStat icon={<Building2 className="h-4 w-4" />} label={t("activity.clientHistory")} value={summary.clientEvents} tone="success" />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 dark:border-white/10 dark:bg-white/[0.15]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground dark:border-white/10 dark:bg-background/60">
              <Search className="h-4 w-4" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") loadActivity(null);
                }}
                placeholder={t("activity.searchPlaceholder")}
                className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
              />
            </label>
            <label className="flex h-11 items-center gap-2 rounded-xl border border-border bg-background px-3 text-sm text-muted-foreground dark:border-white/10 dark:bg-background/60">
              <Filter className="h-4 w-4" />
              <select
                value={entityType}
                onChange={(event) => setEntityType(event.target.value)}
                className="bg-transparent text-foreground outline-none"
              >
                {ENTITY_OPTIONS.map(([value, label]) => (
                  <option key={value || "all"} value={value} className="bg-popover text-popover-foreground">
                    {t(label)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => loadActivity(null)}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {t("activity.apply")}
            </button>
          </div>
        </section>

        {error ? (
          <section className="rounded-2xl border border-rose-400/20 bg-rose-500/10 p-5 text-sm text-rose-700 dark:text-rose-100">{error}</section>
        ) : (
          <section className="overflow-hidden rounded-2xl border border-border bg-card dark:border-white/10 dark:bg-[#07101f]/[0.86]">
            <div className="grid grid-cols-[1.1fr_0.9fr_0.9fr_1fr_1.4fr] gap-4 border-b border-border px-4 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground dark:border-white/10 dark:text-blue-100/50 max-xl:hidden">
              <span>{t("activity.event")}</span>
              <span>{t("activity.actor")}</span>
              <span>{t("activity.client")}</span>
              <span>{t("activity.when")}</span>
              <span>{t("activity.metadata")}</span>
            </div>
            <div className="divide-y divide-border dark:divide-white/10">
              {loading && events.length === 0 ? (
                [1, 2, 3, 4].map((item) => <div key={item} className="h-20 animate-pulse bg-muted/50 dark:bg-white/[0.15]" />)
              ) : events.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">{t("activity.noMatchingAuditEvents")}</div>
              ) : (
                events.map((event) => <AuditRow key={event.id} event={event} t={t} locale={locale} />)
              )}
            </div>
            {nextCursor ? (
              <div className="border-t border-border p-3 text-center dark:border-white/10">
                <button
                  type="button"
                  onClick={() => loadActivity(nextCursor)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-accent dark:border-white/10 dark:bg-white/[0.15] dark:text-blue-100 dark:hover:bg-white/[0.15]"
                >
                  {t("activity.loadMore")}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            ) : null}
          </section>
        )}
      </main>
    </>
  );
}
function AuditRow({
  event,
  t,
  locale,
}: {
  event: ActivityEvent;
  t: (key: string, vars?: Record<string, string | number>) => string;
  locale: string;
}) {
  const actor = event.actor?.name || event.actor?.email || t("activity.system");
  const metadata = event.metadata ? JSON.stringify(event.metadata) : t("activity.noMetadata");
  return (
    <article className="grid gap-3 px-4 py-4 text-sm text-foreground dark:text-blue-50/[0.85] xl:grid-cols-[1.1fr_0.9fr_0.9fr_1fr_1.4fr] xl:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-500/10 text-blue-700 dark:border-blue-400/20 dark:text-blue-200">
            <Activity className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground dark:text-white">{activityEventLabel(event.type, t)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {activityEntityLabel(event.entity_type, t)}
              {event.entity_id ? ` · ${event.entity_id}` : ""}
            </p>
          </div>
        </div>
      </div>
      <InlineField icon={<UserRound className="h-4 w-4" />} label={t("activity.actor")} value={actor} />
      <div className="min-w-0">
        {event.company ? (
          <Link href={`/clients/${event.company.id}`} className="inline-flex min-w-0 items-center gap-2 text-blue-700 hover:text-foreground dark:text-blue-100 dark:hover:text-white">
            <Building2 className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-300" />
            <span className="truncate">{event.company.name}</span>
          </Link>
        ) : (
          <InlineField icon={<Building2 className="h-4 w-4" />} label={t("activity.client")} value={t("activity.notLinked")} />
        )}
      </div>
      <InlineField
        icon={<Clock3 className="h-4 w-4" />}
        label={t("activity.when")}
        value={formatActivityDateTime(event.created_at, locale)}
      />
      <InlineField icon={<Database className="h-4 w-4" />} label={t("activity.metadata")} value={metadata} mono />
    </article>
  );
}
function AuditStat({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: "info" | "danger" | "success" }) {
  const toneClass = {
    info: "border-blue-400/30 bg-blue-500/10 text-blue-700 dark:border-blue-400/20 dark:text-blue-200",
    danger: "border-rose-400/30 bg-rose-500/10 text-rose-700 dark:border-rose-400/20 dark:text-rose-200",
    success: "border-emerald-400/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  }[tone];
  return (
    <div className={cn("rounded-xl border p-3", toneClass)}>
      <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.12em] opacity-80">
        <span>{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground dark:text-white">{value}</p>
    </div>
  );
}

function InlineField({ icon, label, value, mono = false }: { icon: ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground dark:text-blue-100/[0.55] xl:hidden">
        {icon}
        {label}
      </p>
      <p className={cn("truncate text-sm text-foreground dark:text-blue-50/80", mono && "font-mono text-xs")}>{value}</p>
    </div>
  );
}
