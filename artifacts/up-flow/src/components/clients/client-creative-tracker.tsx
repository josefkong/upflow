"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock3,
  FolderKanban,
  Image as ImageIcon,
  Palette,
  Sparkles,
  UserRound,
  Video,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import type {
  ClientCreativeWork,
  ClientCreativeWorkItem,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type ClientCreativeTrackerProps = {
  visible: boolean;
  work?: ClientCreativeWork;
};

export default function ClientCreativeTracker({
  visible,
  work,
}: ClientCreativeTrackerProps) {
  const { language, t } = useLanguage();

  if (!visible) return null;

  const summary = work?.summary ?? {
    total: 0,
    open: 0,
    in_progress: 0,
    completed: 0,
    overdue: 0,
  };
  const items = work?.items ?? [];

  return (
    <section
      className="glass rounded-xl p-4 sm:p-5"
      data-testid="client-creative-tracker"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            <Palette className="h-4 w-4" aria-hidden="true" />
            {t("clientCreative.eyebrow")}
          </p>
          <h3 className="mt-2 text-lg font-semibold text-foreground">
            {t("clientCreative.title")}
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t("clientCreative.description")}
          </p>
        </div>
        <span className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
          {t("clientCreative.readOnly")}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <SummaryItem
          label={t("clientCreative.total")}
          value={summary.total}
          icon={<FolderKanban className="h-4 w-4" />}
        />
        <SummaryItem
          label={t("clientCreative.inProgress")}
          value={summary.in_progress}
          icon={<Clock3 className="h-4 w-4" />}
        />
        <SummaryItem
          label={t("clientCreative.overdue")}
          value={summary.overdue}
          icon={<CalendarClock className="h-4 w-4" />}
          danger={summary.overdue > 0}
        />
        <SummaryItem
          label={t("clientCreative.completed")}
          value={summary.completed}
          icon={<CheckCircle2 className="h-4 w-4" />}
          success
        />
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-8 text-center">
          <Sparkles className="mx-auto h-5 w-5 text-primary" aria-hidden="true" />
          <p className="mt-2 text-sm font-semibold text-foreground">
            {t("clientCreative.emptyTitle")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("clientCreative.emptyDescription")}
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {items.map((item) => (
            <CreativeWorkCard
              key={item.id}
              item={item}
              locale={language === "pt-BR" ? "pt-BR" : "en-US"}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SummaryItem({
  label,
  value,
  icon,
  danger,
  success,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  danger?: boolean;
  success?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-3">
      <div
        className={cn(
          "flex items-center gap-2 text-muted-foreground",
          danger && "text-upflow-danger",
          success && "text-upflow-success",
        )}
      >
        {icon}
        <span className="text-xl font-bold text-foreground">{value}</span>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function CreativeWorkCard({
  item,
  locale,
}: {
  item: ClientCreativeWorkItem;
  locale: string;
}) {
  const { t } = useLanguage();
  const dueDate = item.due_date ? new Date(item.due_date) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdue = Boolean(
    dueDate && item.status !== "done" && dueDate.getTime() < today.getTime(),
  );
  const kind = creativeKind(item.kind, t);
  const KindIcon =
    item.kind === "video"
      ? Video
      : item.kind === "static"
        ? ImageIcon
        : Sparkles;

  return (
    <Link
      href={`/projects/${item.project.id}?task=${item.id}`}
      className="group rounded-xl border border-border bg-muted/20 p-4 transition hover:border-primary/35 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      aria-label={t("clientCreative.openTask", { title: item.title })}
    >
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              <KindIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {kind}
            </span>
            <StatusBadge status={item.status} stage={item.stage} />
          </div>
          <h4 className="mt-3 break-words text-sm font-semibold text-foreground">
            {item.title}
          </h4>
          {item.formats ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {item.formats}
            </p>
          ) : null}
        </div>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
      </div>

      <div className="mt-4 grid gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground sm:grid-cols-2">
        <span className="flex min-w-0 items-center gap-2">
          <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {item.assignee?.name || t("clientCreative.unassigned")}
          </span>
        </span>
        <span
          className={cn(
            "flex min-w-0 items-center gap-2 sm:justify-end",
            overdue && "font-semibold text-upflow-danger",
          )}
        >
          <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {dueDate
              ? dueDate.toLocaleDateString(locale)
              : t("clientCreative.noDeadline")}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-2 sm:col-span-2">
          <FolderKanban className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {item.project.space?.name
              ? `${item.project.space.name} · ${item.project.name}`
              : item.project.name}
          </span>
        </span>
        <span className="flex min-w-0 items-center gap-2 sm:col-span-2">
          <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {t("clientCreative.lastUpdate", {
              date: new Date(item.last_updated_at).toLocaleDateString(locale),
            })}
          </span>
        </span>
        {item.requester ? (
          <span className="min-w-0 truncate sm:col-span-2">
            {t("clientCreative.requestedBy", { name: item.requester })}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

function StatusBadge({
  status,
  stage,
}: {
  status: ClientCreativeWorkItem["status"];
  stage: string;
}) {
  const { t } = useLanguage();
  const label =
    stage === "done"
      ? t("status.done")
      : stage === "in_progress"
        ? t("status.inProgress")
        : stage === "todo"
          ? t("status.todo")
          : stage;

  return (
    <span
      className={cn(
        "max-w-full truncate rounded-full px-2.5 py-1 text-[11px] font-semibold",
        status === "done" && "bg-upflow-success/15 text-upflow-success",
        status === "in_progress" && "bg-primary/15 text-primary",
        status === "todo" && "bg-white/5 text-muted-foreground",
      )}
      title={label}
    >
      {label}
    </span>
  );
}

function creativeKind(
  kind: ClientCreativeWorkItem["kind"],
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  if (kind === "video") return t("clientCreative.kind.video");
  if (kind === "static") return t("clientCreative.kind.static");
  return t("clientCreative.kind.creative");
}
