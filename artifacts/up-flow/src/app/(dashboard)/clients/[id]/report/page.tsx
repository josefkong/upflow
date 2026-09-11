"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Printer,
  RefreshCcw,
  Send,
} from "lucide-react";
import Header from "@/components/layout/header";
import { formatDate } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";

type ReportStatus =
  | "draft"
  | "internal_review"
  | "ready_for_client"
  | "sent_to_client"
  | "approved"
  | "changes_requested"
  | "completed";

interface ClientReportPayload {
  company: {
    id: string;
    name: string;
    owner?: { name: string; email: string } | null;
  };
  period: { from: string; to: string };
  summary: {
    open_tasks: number;
    completed_tasks: number;
    overdue_tasks: number;
    meetings: number;
    tracked_seconds: number;
    risk_reasons: string[];
    next_deadline: string | null;
  };
  markdown: string;
  report_history?: Array<{
    id: string;
    title: string;
    version: number;
    status: string;
    created_at: string;
    approved_at: string | null;
    sent_at: string | null;
    archived_at: string | null;
    author?: { name: string; email: string } | null;
  }>;
}

const STATUS_KEY: Record<ReportStatus, string> = {
  draft: "report.draft",
  internal_review: "report.internalReview",
  ready_for_client: "report.readyForClient",
  sent_to_client: "report.sentToClient",
  approved: "report.approvedStatus",
  changes_requested: "report.changesRequested",
  completed: "report.completed",
};

type Translate = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

function reportStatusLabel(status: ReportStatus, t: Translate) {
  return t(STATUS_KEY[status]);
}

export default function ClientReportWorkflowPage() {
  const { language, t } = useLanguage();
  const locale = language === "pt-BR" ? "pt-BR" : "en-US";
  const params = useParams();
  const searchParams = useSearchParams();
  const id = (params?.id ?? "") as string;
  const contextProjectId = searchParams.get("context_project_id")?.trim() ?? "";
  const [from, setFrom] = useState(() => toInputDate(daysAgo(7)));
  const [to, setTo] = useState(() => toInputDate(new Date()));
  const [report, setReport] = useState<ClientReportPayload | null>(null);
  const [narrative, setNarrative] = useState("");
  const [status, setStatus] = useState<ReportStatus>("draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadReport = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const params = new URLSearchParams({ from, to });
      if (contextProjectId) {
        params.set("context_project_id", contextProjectId);
      }
      const res = await fetch(
        `/api/companies/${id}/report?${params.toString()}`,
        { cache: "no-store" },
      );
      const payload = (await res
        .json()
        .catch(() => ({}))) as ClientReportPayload & { error?: string };
      if (!res.ok)
        throw new Error(
          payload.error ||
            t("report.couldNotLoadWithStatus", { status: res.status }),
        );
      setReport(payload);
      setNarrative(
        (current) => current || defaultNarrative(payload, t, locale),
      );
      setStatus("draft");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("report.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [contextProjectId, from, id, locale, t, to]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const composedMarkdown = useMemo(() => {
    if (!report) return "";
    return [
      report.markdown,
      "",
      `## ${t("report.internalNarrativeHeading")}`,
      narrative.trim() || `- ${t("report.noNarrative")}`,
      "",
      t("report.workflowStatus", { status: reportStatusLabel(status, t) }),
    ].join("\n");
  }, [narrative, report, status, t]);

  const runAction = async (
    action: "approve_internal" | "send_to_client" | "archive_report",
    nextStatus: ReportStatus,
  ) => {
    if (!report) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch(`/api/companies/${id}/report/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          status: nextStatus,
          period: { from: report.period.from, to: report.period.to },
          narrative,
          markdown: composedMarkdown,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok)
        throw new Error(
          payload.error || t("report.actionFailed", { status: res.status }),
        );
      setStatus(nextStatus);
      setMessage(
        action === "approve_internal"
          ? t("report.approved")
          : action === "send_to_client"
            ? t("report.sent")
            : t("report.archived"),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : t("report.couldNotUpdate"));
    } finally {
      setSaving(false);
    }
  };

  const downloadMarkdown = () => {
    if (!report) return;
    const blob = new Blob([composedMarkdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${report.company.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-client-report.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Header title={t("report.title")} />
      <main className="mx-auto max-w-[1400px] space-y-5 p-4 sm:p-6">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm dark:border-blue-400/20 dark:bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.2),transparent_32%),rgba(2,6,23,0.82)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <Link
                href={
                  contextProjectId
                    ? `/clients/${id}?context_project_id=${encodeURIComponent(contextProjectId)}`
                    : `/clients/${id}`
                }
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("report.backToClient")}
              </Link>
              <h1 className="mt-4 text-2xl font-bold text-foreground dark:text-white">
                {t("report.workflow", {
                  client: report?.company.name ?? t("report.clientFallback"),
                })}
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                {t("report.description")}
              </p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-sm font-semibold text-blue-700 dark:border-blue-400/20 dark:text-blue-100">
              <FileText className="h-4 w-4" />
              {reportStatusLabel(status, t)}
            </span>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4 dark:border-white/10 dark:bg-white/[0.15]">
          <div className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t("report.from")}
              <input
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground dark:border-white/10"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {t("report.to")}
              <input
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground dark:border-white/10"
              />
            </label>
            <button
              type="button"
              onClick={loadReport}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              <RefreshCcw className="h-4 w-4" />
              {t("report.previewReport")}
            </button>
            <select
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as ReportStatus)
              }
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground dark:border-white/10"
            >
              {Object.keys(STATUS_KEY).map((value) => (
                <option key={value} value={value}>
                  {reportStatusLabel(value as ReportStatus, t)}
                </option>
              ))}
            </select>
          </div>
        </section>

        {error ? (
          <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-100">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-100">
            {message}
          </div>
        ) : null}

        {loading ? (
          <div className="h-96 animate-pulse rounded-2xl bg-muted dark:bg-white/[0.15]" />
        ) : report ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <article className="rounded-2xl border border-border bg-card p-5 dark:border-white/10 dark:bg-[#07101f]/90">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <ReportMetric
                  label={t("report.open")}
                  value={report.summary.open_tasks}
                />
                <ReportMetric
                  label={t("report.completed")}
                  value={report.summary.completed_tasks}
                />
                <ReportMetric
                  label={t("report.overdue")}
                  value={report.summary.overdue_tasks}
                  danger
                />
                <ReportMetric
                  label={t("report.meetings")}
                  value={report.summary.meetings}
                />
                <ReportMetric
                  label={t("report.tracked")}
                  value={formatSeconds(report.summary.tracked_seconds, t)}
                />
              </div>
              <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4 dark:border-white/10 dark:bg-black/20">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-foreground dark:text-white">
                    {t("report.preview")}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(report.period.from, locale)} -{" "}
                    {formatDate(report.period.to, locale)}
                  </p>
                </div>
                <pre className="max-h-[680px] overflow-auto whitespace-pre-wrap rounded-lg bg-background p-4 text-sm leading-6 text-foreground dark:bg-black/25 dark:text-blue-50/[0.85]">
                  {composedMarkdown}
                </pre>
              </div>
            </article>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-border bg-card p-4 dark:border-white/10 dark:bg-white/[0.15]">
                <h2 className="text-sm font-semibold text-foreground dark:text-white">
                  {t("report.narrativeEditor")}
                </h2>
                <textarea
                  value={narrative}
                  onChange={(event) => setNarrative(event.target.value)}
                  rows={12}
                  className="mt-3 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm leading-6 text-foreground outline-none focus:ring-2 focus:ring-primary/40 dark:border-white/10"
                />
              </section>

              <section className="grid gap-2 rounded-2xl border border-border bg-card p-4 dark:border-white/10 dark:bg-white/[0.15]">
                <button
                  disabled={saving}
                  onClick={() => runAction("approve_internal", "approved")}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {t("report.approveInternally")}
                </button>
                <button
                  disabled={saving}
                  onClick={downloadMarkdown}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.15] dark:text-blue-100"
                >
                  <Download className="h-4 w-4" />
                  {t("report.exportMarkdown")}
                </button>
                <button
                  disabled={saving}
                  onClick={() => window.print()}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.15] dark:text-blue-100"
                >
                  <Printer className="h-4 w-4" />
                  {t("report.exportPdf")}
                </button>
                <button
                  disabled={saving}
                  onClick={() => runAction("send_to_client", "sent_to_client")}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {t("report.markSent")}
                </button>
                <button
                  disabled={saving}
                  onClick={() => runAction("archive_report", "completed")}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold text-blue-700 disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.15] dark:text-blue-100"
                >
                  <Archive className="h-4 w-4" />
                  {t("report.archiveHistory")}
                </button>
              </section>

              <section className="rounded-2xl border border-border bg-card p-4 dark:border-white/10 dark:bg-white/[0.15]">
                <h2 className="text-sm font-semibold text-foreground dark:text-white">
                  {t("report.history")}
                </h2>
                <div className="mt-3 space-y-2">
                  {(report.report_history ?? []).length === 0 ? (
                    <p className="rounded-lg border border-border bg-muted/30 px-3 py-3 text-xs text-muted-foreground dark:border-white/10 dark:bg-white/[0.15]">
                      {t("report.noArchived")}
                    </p>
                  ) : (
                    (report.report_history ?? []).map((item) => (
                      <div
                        key={item.id}
                        className="rounded-lg border border-border bg-muted/30 px-3 py-2 dark:border-white/10 dark:bg-white/[0.15]"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="truncate text-sm font-semibold text-foreground dark:text-white">
                            {item.title}
                          </p>
                          <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-700 dark:text-blue-100">
                            v{item.version}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {STATUS_KEY[item.status as ReportStatus]
                            ? reportStatusLabel(item.status as ReportStatus, t)
                            : item.status}{" "}
                          - {formatDate(item.created_at, locale)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </aside>
          </div>
        ) : null}
      </main>
    </>
  );
}

function ReportMetric({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: string | number;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 dark:border-white/10 dark:bg-white/[0.15]">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p
        className={
          danger
            ? "mt-2 text-2xl font-bold text-rose-700 dark:text-rose-300"
            : "mt-2 text-2xl font-bold text-foreground dark:text-white"
        }
      >
        {value}
      </p>
    </div>
  );
}

function defaultNarrative(
  report: ClientReportPayload,
  t: Translate,
  locale: string,
) {
  const risk = report.summary.risk_reasons.length
    ? t("report.risksToAddress", {
        risks: report.summary.risk_reasons.join(", "),
      })
    : t("report.noMajorRisk");
  return [
    t("report.completedTasks", {
      client: report.company.name,
      completed: report.summary.completed_tasks,
      open: report.summary.open_tasks,
    }),
    risk,
    report.summary.next_deadline
      ? t("report.nextDeadline", {
          date: formatDate(report.summary.next_deadline, locale),
        })
      : t("report.noNextDeadline"),
  ].join("\n\n");
}

function daysAgo(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function toInputDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatSeconds(totalSeconds: number, t: Translate) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return t("report.hoursMinutes", { hours, minutes });
  return t("report.minutes", { minutes });
}
