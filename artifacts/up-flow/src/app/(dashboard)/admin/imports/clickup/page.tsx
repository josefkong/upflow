"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "@/components/language-provider";

type Source = { id: string; name: string };
type Folder = Source & { lists: Source[] };
type Item = { space: Source; folders: Folder[]; lists: Source[] };
type Selection = {
  space_id: string;
  space_name: string;
  folder_id?: string;
  folder_name?: string;
  list_id: string;
  list_name: string;
};
type Preview = {
  lists: number;
  tasks: number;
  assignee_emails: string[];
};
type Job = {
  id: string;
  status: string;
  cursor: number;
  total: number;
  imported: number;
  failed: number;
  selected_source_ids?: unknown[];
  report?: {
    failures?: Array<{ list_id: string; list_name?: string; error: string }>;
    status_sync?: {
      active?: boolean;
      updated?: number;
      failed?: number;
      failures?: Array<{ list_id: string; list_name?: string; error: string }>;
    };
  };
  imported_spaces?: Array<{ id: string; name: string; selected_lists: number }>;
};
type ApiError = { error?: string };
type WorkspacesResponse = { teams?: Source[] };
type HierarchyResponse = { items?: Item[] };
type JobsResponse = { items?: Job[] };
type LoadingAction =
  | "workspaces"
  | "hierarchy"
  | "preview"
  | "start"
  | "resume"
  | "sync"
  | "cancel"
  | null;

function localizedJobStatus(
  status: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  const key = `clickupImport.status.${status}`;
  const translated = t(key);
  return translated === key ? status : translated;
}

async function requestJson<T>(
  input: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as T & ApiError;
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

export default function ClickUpImportPage() {
  const { t } = useLanguage();
  const [workspaces, setWorkspaces] = useState<Source[]>([]);
  const [source, setSource] = useState("");
  const [hierarchy, setHierarchy] = useState<Item[]>([]);
  const [selected, setSelected] = useState<Record<string, Selection>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState<LoadingAction>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const restoreExistingJob = useCallback(
    async (signal?: AbortSignal, showError = false): Promise<boolean> => {
      try {
        const payload = await requestJson<JobsResponse>(
          "/api/admin/imports/clickup/jobs",
          { cache: "no-store", signal },
        );
        if (signal?.aborted) return false;
        const jobs = Array.isArray(payload.items) ? payload.items : [];
        const existing =
          jobs.find((item) =>
            ["queued", "running", "paused", "failed"].includes(item.status),
          ) ?? jobs[0];
        if (!existing) return false;
        setJob(existing);
        return true;
      } catch (cause) {
        if (!signal?.aborted && showError) {
          setError(t("clickupImport.restoreError"));
        }
        return false;
      }
    },
    [t],
  );

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      setLoading("workspaces");
      setError("");
      try {
        const payload = await requestJson<WorkspacesResponse>(
          "/api/admin/imports/clickup/workspaces",
          { cache: "no-store", signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        const teams = Array.isArray(payload.teams) ? payload.teams : [];
        setWorkspaces(teams);
        if (!teams.length) {
          setMessage(t("clickupImport.noWorkspaces"));
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(t("clickupImport.loadWorkspacesError"));
        }
      } finally {
        if (!controller.signal.aborted) setLoading(null);
      }
    })();

    return () => controller.abort();
  }, [t]);

  useEffect(() => {
    const controller = new AbortController();
    void restoreExistingJob(controller.signal);
    return () => controller.abort();
  }, [restoreExistingJob]);

  function selectWorkspace(value: string) {
    setSource(value);
    setHierarchy([]);
    setSelected({});
    setPreview(null);
    setMessage("");
    setError("");
  }

  async function loadHierarchy() {
    if (!source || loading) return;

    setLoading("hierarchy");
    setError("");
    setMessage("");
    setHierarchy([]);
    setSelected({});
    setPreview(null);
    try {
      const payload = await requestJson<HierarchyResponse>(
        "/api/admin/imports/clickup/hierarchy",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ source_workspace_id: source }),
        },
      );
      const items = Array.isArray(payload.items) ? payload.items : [];
      setHierarchy(items);
      setMessage(
        items.length
          ? t("clickupImport.selectListsHint")
          : t("clickupImport.noEligibleSpaces"),
      );
    } catch (cause) {
      setError(t("clickupImport.loadHierarchyError"));
    } finally {
      setLoading(null);
    }
  }

  function toggle(value: Selection) {
    setSelected((current) => {
      const next = { ...current };
      if (next[value.list_id]) delete next[value.list_id];
      else next[value.list_id] = value;
      return next;
    });
    setPreview(null);
  }

  async function runPreview() {
    if (!source || !Object.keys(selected).length || loading) return;

    setLoading("preview");
    setError("");
    setMessage("");
    try {
      const payload = await requestJson<Preview>(
        "/api/admin/imports/clickup/preview",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_workspace_id: source,
            list_ids: Object.keys(selected),
          }),
        },
      );
      setPreview(payload);
      setMessage(t("clickupImport.previewReady"));
    } catch (cause) {
      setError(t("clickupImport.previewError"));
    } finally {
      setLoading(null);
    }
  }

  async function start() {
    if (!preview || loading || (job && !jobFinished)) return;

    setLoading("start");
    setError("");
    setMessage("");
    try {
      const created = await requestJson<Job>(
        "/api/admin/imports/clickup/jobs",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            source_workspace_id: source,
            selected_source_ids: Object.values(selected),
            confirmation: true,
          }),
        },
      );
      setJob(created);
      setMessage(t("clickupImport.queued"));
    } catch (cause) {
      if (
        cause instanceof Error &&
        cause.message === "An import is already running for this workspace" &&
        (await restoreExistingJob(undefined, true))
      ) {
        setMessage(t("clickupImport.existingRestored"));
        return;
      }
      setError(t("clickupImport.queueError"));
    } finally {
      setLoading(null);
    }
  }

  async function resume() {
    if (!job || loading) return;

    setLoading("resume");
    setError("");
    try {
      const updated = await requestJson<Job>(
        `/api/admin/imports/clickup/jobs/${job.id}/resume`,
        { method: "POST" },
      );
      setJob(updated);
      window.dispatchEvent(new Event("upflow:sidebar-refresh"));
      setMessage(
        job.report?.status_sync?.active && updated.status === "completed"
          ? t("clickupImport.statusesSynchronized")
          : job.report?.status_sync?.active
            ? t("clickupImport.statusSyncUpdated")
            : updated.status === "completed"
          ? t("clickupImport.completed")
          : t("clickupImport.progressUpdated"),
      );
    } catch (cause) {
      setError(t("clickupImport.resumeError"));
    } finally {
      setLoading(null);
    }
  }

  async function syncStatuses() {
    if (!job || job.status !== "completed" || loading) return;

    setLoading("sync");
    setError("");
    try {
      const updated = await requestJson<Job>(
        `/api/admin/imports/clickup/jobs/${job.id}/sync-statuses`,
        { method: "POST" },
      );
      setJob(updated);
      setMessage(
        updated.status === "completed"
          ? t("clickupImport.statusCountSynchronized", { count: updated.report?.status_sync?.updated ?? 0 })
          : t("clickupImport.statusSyncStarted"),
      );
    } catch (cause) {
      setError(t("clickupImport.syncError"));
    } finally {
      setLoading(null);
    }
  }

  async function cancel() {
    if (!job || loading) return;

    setLoading("cancel");
    setError("");
    try {
      await requestJson(
        `/api/admin/imports/clickup/jobs/${job.id}/cancel`,
        { method: "POST" },
      );
      setJob({ ...job, status: "cancelled" });
      setMessage(t("clickupImport.cancelled"));
    } catch (cause) {
      setError(t("clickupImport.cancelError"));
    } finally {
      setLoading(null);
    }
  }

  const busy = loading !== null;
  const selectedCount = Object.keys(selected).length;
  const jobListCount = Array.isArray(job?.selected_source_ids)
    ? job.selected_source_ids.length
    : job?.total ?? 0;
  const retryingFailedLists = Boolean(
    job && job.failed > 0 && job.cursor >= jobListCount,
  );
  const statusSyncActive = Boolean(job?.report?.status_sync?.active);
  const jobFinished = job?.status === "completed" || job?.status === "cancelled";
  const jobCancellable = Boolean(
    job && ["queued", "running", "paused"].includes(job.status),
  );

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("clickupImport.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("clickupImport.description")}
        </p>
      </div>

      <section className="space-y-3 rounded-lg border p-4" aria-busy={loading === "hierarchy"}>
        <label className="block text-sm font-medium">
          {t("clickupImport.workspace")}
          <select
            className="mt-1 block w-full rounded border p-2"
            value={source}
            disabled={busy}
            onChange={(event) => selectWorkspace(event.target.value)}
          >
            <option value="">{t("clickupImport.selectWorkspace")}</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
          disabled={!source || busy}
          onClick={loadHierarchy}
        >
          {loading === "hierarchy" ? t("clickupImport.loadingSpaces") : t("clickupImport.loadSpaces")}
        </button>
      </section>

      {error && (
        <p role="alert" className="rounded border border-destructive/50 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm" aria-live="polite">
          {message}
        </p>
      )}

      {hierarchy.length > 0 && (
        <section className="space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold">{t("clickupImport.selectLists")}</h2>
          {hierarchy.map((item) => (
            <div key={item.space.id}>
              <h3 className="font-medium">{item.space.name}</h3>
              <div className="grid gap-2 pl-4 sm:grid-cols-2">
                {item.lists.map((list) => (
                  <label key={list.id} className="flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(selected[list.id])}
                      disabled={busy}
                      onChange={() =>
                        toggle({
                          space_id: item.space.id,
                          space_name: item.space.name,
                          list_id: list.id,
                          list_name: list.name,
                        })
                      }
                    />
                    {list.name}
                  </label>
                ))}
                {item.folders.map((folder) => (
                  <div key={folder.id} className="col-span-full">
                    <p className="text-sm font-medium text-muted-foreground">
                      {folder.name}
                    </p>
                    {folder.lists.map((list) => (
                      <label key={list.id} className="ml-4 flex gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={Boolean(selected[list.id])}
                          disabled={busy}
                          onChange={() =>
                            toggle({
                              space_id: item.space.id,
                              space_name: item.space.name,
                              folder_id: folder.id,
                              folder_name: folder.name,
                              list_id: list.id,
                              list_name: list.name,
                            })
                          }
                        />
                        {list.name}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border px-3 py-2 disabled:opacity-50"
              disabled={!selectedCount || busy}
              onClick={runPreview}
            >
              {loading === "preview" ? t("clickupImport.buildingPreview") : t("clickupImport.preview")}
            </button>
            {preview && (
              <button
                type="button"
                className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
                disabled={busy || Boolean(job && !jobFinished)}
                onClick={start}
              >
                {loading === "start" ? t("clickupImport.queueing") : t("clickupImport.confirmQueue")}
              </button>
            )}
          </div>
          {preview && (
            <p className="text-sm">
              {t("clickupImport.previewSummary", {
                lists: preview.lists,
                tasks: preview.tasks,
                matches: preview.assignee_emails.length,
              })}
            </p>
          )}
        </section>
      )}

      {job && (
        <section className="space-y-3 rounded-lg border p-4">
          <h2 className="font-semibold">{t("clickupImport.job")}</h2>
          <p className="text-sm">
            {t("clickupImport.jobSummary", {
              status: localizedJobStatus(job.status, t),
              imported: job.imported,
              failed: job.failed,
              processed: job.cursor,
              total: jobListCount,
            })}
          </p>
          {job.status === "completed" && (
            <div className="space-y-2 text-sm">
              <p className="font-medium">{t("clickupImport.importedSpaces")}</p>
              {job.imported_spaces?.length ? (
                <ul className="space-y-1">
                  {job.imported_spaces.map((space) => (
                    <li key={space.id}>
                      <Link
                        href={`/spaces/${space.id}`}
                        className="text-primary underline-offset-4 hover:underline"
                        onClick={() =>
                          window.dispatchEvent(new Event("upflow:sidebar-refresh"))
                        }
                      >
                        {t("clickupImport.openSpace", { name: space.name })}
                      </Link>{" "}
                      <span className="text-muted-foreground">
                        ({t("clickupImport.selectedListsCount", { count: space.selected_lists })})
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  {t("clickupImport.spaceAvailable")}
                </p>
              )}
            </div>
          )}
          {job.report?.status_sync && !job.report.status_sync.active && (
            <p className="text-sm text-muted-foreground">
              {t("clickupImport.statusSyncSummary", { count: job.report.status_sync.updated ?? 0 })}
            </p>
          )}
          {job.failed > 0 && (
            <p role="alert" className="text-sm text-destructive">
              {job.report?.failures?.[0]?.list_name
                ? `${job.report.failures[0].list_name}: ${job.report.failures[0].error}`
                : t("clickupImport.someListsFailed")}
            </p>
          )}
          {job.report?.status_sync?.failed ? (
            <p role="alert" className="text-sm text-destructive">
              {job.report.status_sync.failures?.[0]?.list_name
                ? `${job.report.status_sync.failures[0].list_name}: ${job.report.status_sync.failures[0].error}`
                : t("clickupImport.someStatusesFailed")}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
              disabled={jobFinished || busy}
              onClick={resume}
            >
              {loading === "resume"
                ? t("clickupImport.resuming")
                : statusSyncActive
                  ? t("clickupImport.continueStatusSync")
                  : retryingFailedLists
                  ? t("clickupImport.retryFailedLists")
                  : t("clickupImport.resumeNextBatch")}
            </button>
            {job.status === "completed" && (
              <button
                type="button"
                className="rounded border px-3 py-2 disabled:opacity-50"
                disabled={busy}
                onClick={syncStatuses}
              >
                {loading === "sync" ? t("clickupImport.syncingStatuses") : t("clickupImport.syncStatuses")}
              </button>
            )}
            <button
              type="button"
              className="rounded border px-3 py-2 disabled:opacity-50"
              disabled={!jobCancellable || busy}
              onClick={cancel}
            >
              {loading === "cancel" ? t("clickupImport.cancelling") : t("common.cancel")}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
