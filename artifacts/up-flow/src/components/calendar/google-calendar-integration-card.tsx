"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck2,
  CheckCircle2,
  CircleAlert,
  Cloud,
  Loader2,
  RefreshCw,
  Unplug,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";

type GoogleCalendarConnection = {
  email?: string | null;
  calendar_id: string | null;
  calendar_name?: string | null;
  sync_enabled: boolean;
  share_agenda?: boolean;
  last_synced_at?: string | null;
  last_error?: string | null;
  agenda_last_synced_at?: string | null;
  agenda_last_error?: string | null;
};

type GoogleCalendarStatus = {
  ready: boolean;
  connected: boolean;
  connection?: GoogleCalendarConnection | null;
  checks?: Record<string, boolean>;
};

type GoogleCalendarItem = {
  id: string;
  name: string;
  primary: boolean;
  access_role?: string | null;
};

type GoogleCalendarSyncResult = {
  synced?: number;
  failed?: number;
  skipped?: number;
  agenda_synced?: number;
  agenda_failed?: number;
};

type GoogleCalendarIntegrationCardProps = {
  className?: string;
};

function apiError(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== "object") return fallback;
  const { error } = payload as { error?: unknown };
  return typeof error === "string" && error.trim() ? error : fallback;
}

async function readJson(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new Error(apiError(payload, fallback));
  return payload;
}

function updatedConnection(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const candidate = "connection" in payload
    ? (payload as { connection?: unknown }).connection
    : payload;
  if (!candidate || typeof candidate !== "object") return null;
  if (!("calendar_id" in candidate) || !("sync_enabled" in candidate)) return null;
  return candidate as GoogleCalendarConnection;
}

function formatSyncedAt(value: string | null | undefined, language: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(language, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function GoogleCalendarIntegrationCard({
  className,
}: GoogleCalendarIntegrationCardProps) {
  const { language, t } = useLanguage();
  const [status, setStatus] = useState<GoogleCalendarStatus | null>(null);
  const [calendars, setCalendars] = useState<GoogleCalendarItem[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState("");
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [shareAgenda, setShareAgenda] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  const applyStatus = useCallback((nextStatus: GoogleCalendarStatus) => {
    setStatus(nextStatus);
    const connection = nextStatus.connection;
    setSelectedCalendarId(connection?.calendar_id ?? "");
    setSyncEnabled(connection?.sync_enabled ?? true);
    setShareAgenda(connection?.share_agenda ?? true);
  }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);
    try {
      const statusResponse = await fetch("/api/integrations/google-calendar/status", {
        cache: "no-store",
        signal,
      });
      const statusPayload = (await readJson(
        statusResponse,
        t("googleCalendar.loadFailed"),
      )) as GoogleCalendarStatus;

      if (signal?.aborted) return;
      applyStatus(statusPayload);

      if (!statusPayload.ready || !statusPayload.connected) {
        setCalendars([]);
        return;
      }

      const calendarsResponse = await fetch("/api/integrations/google-calendar/calendars", {
        cache: "no-store",
        signal,
      });
      const calendarsPayload = (await readJson(
        calendarsResponse,
        t("googleCalendar.loadFailed"),
      )) as { items?: GoogleCalendarItem[] };

      if (signal?.aborted) return;
      const items = calendarsPayload.items ?? [];
      setCalendars(items);
      if (!statusPayload.connection?.calendar_id) {
        const preferred = items.find((item) => item.primary) ?? items[0];
        setSelectedCalendarId(preferred?.id ?? "");
      }
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) return;
      setLoadError(error instanceof Error ? error.message : t("googleCalendar.loadFailed"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [applyStatus, t]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const selectedCalendar = useMemo(
    () => calendars.find((calendar) => calendar.id === selectedCalendarId) ?? null,
    [calendars, selectedCalendarId],
  );
  const connected = Boolean(status?.connected && status.ready);
  const connection = status?.connection ?? null;
  const lastSynced = formatSyncedAt(connection?.last_synced_at, language);
  const agendaLastSynced = formatSyncedAt(connection?.agenda_last_synced_at, language);

  const saveConnection = async () => {
    if (!selectedCalendarId) {
      toast.error(t("googleCalendar.chooseCalendar"));
      return false;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/integrations/google-calendar/connection", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendar_id: selectedCalendarId,
          calendar_name: selectedCalendar?.name ?? connection?.calendar_name ?? undefined,
          sync_enabled: syncEnabled,
          share_agenda: shareAgenda,
        }),
      });
      const payload = await readJson(
        response,
        t("googleCalendar.saveFailed"),
      );
      const nextConnection = updatedConnection(payload);
      if (nextConnection) {
        setStatus((current) =>
          current ? { ...current, connected: true, connection: nextConnection } : current,
        );
      }
      toast.success(t("googleCalendar.settingsSaved"));
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("googleCalendar.saveFailed"));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    if (!selectedCalendarId) {
      toast.error(t("googleCalendar.chooseCalendar"));
      return;
    }

    const settingsChanged =
      connection?.calendar_id !== selectedCalendarId ||
      connection?.sync_enabled !== syncEnabled ||
      (connection?.share_agenda ?? true) !== shareAgenda;
    if (settingsChanged && !(await saveConnection())) return;

    setSyncing(true);
    try {
      const response = await fetch("/api/integrations/google-calendar/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = (await readJson(
        response,
        t("googleCalendar.syncFailed"),
      )) as GoogleCalendarSyncResult;

      const failed = (result.failed ?? 0) + (result.agenda_failed ?? 0);
      if (failed > 0) {
        toast.error(t("googleCalendar.syncFinishedWithErrors", { count: failed }));
      } else {
        toast.success(
          t("googleCalendar.syncCompleteWithAgenda", {
            count: result.synced ?? 0,
            agenda: result.agenda_synced ?? 0,
          }),
        );
      }
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("googleCalendar.syncFailed"));
    } finally {
      setSyncing(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm(t("googleCalendar.disconnectConfirm"))) return;

    setDisconnecting(true);
    try {
      const response = await fetch("/api/integrations/google-calendar/connection", {
        method: "DELETE",
      });
      await readJson(response, t("googleCalendar.disconnectFailed"));
      setStatus((current) => (current ? { ...current, connected: false, connection: null } : current));
      setCalendars([]);
      setSelectedCalendarId("");
      setSyncEnabled(true);
      setShareAgenda(true);
      setLoadError(null);
      toast.success(t("googleCalendar.disconnected"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("googleCalendar.disconnectFailed"));
    } finally {
      setDisconnecting(false);
    }
  };

  const connect = () => {
    setRedirecting(true);
    window.location.assign("/api/integrations/google-calendar/connect");
  };

  return (
    <section
      aria-labelledby="google-calendar-integration-title"
      className={cn("relative overflow-hidden rounded-2xl p-4 glass sm:p-5", className)}
      data-testid="google-calendar-integration-card"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-300/20 bg-primary/10 text-primary shadow-[0_0_20px_rgba(59,130,246,0.12)]">
            <CalendarCheck2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              {t("googleCalendar.eyebrow")}
            </p>
            <h2 id="google-calendar-integration-title" className="mt-1 text-lg font-semibold text-foreground">
              {t("googleCalendar.title")}
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-muted-foreground">
              {t("googleCalendar.description")}
            </p>
          </div>
        </div>

        {loading ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("common.loading")}
          </span>
        ) : connected ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-upflow-success/30 bg-upflow-success/10 px-2.5 py-1 text-xs font-semibold text-upflow-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t("googleCalendar.connected")}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Cloud className="h-3.5 w-3.5" />
            {t("googleCalendar.notConnected")}
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-5 space-y-3" aria-live="polite">
          <div className="h-10 animate-pulse rounded-xl bg-muted/50" />
          <div className="h-16 animate-pulse rounded-xl bg-muted/30" />
        </div>
      ) : loadError ? (
        <div className="mt-5 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
          <div className="flex gap-2.5">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="text-sm font-semibold text-foreground">{t("googleCalendar.loadFailed")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{loadError}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={redirecting || disconnecting}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/10"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t("googleCalendar.retry")}
            </button>
            {connected ? (
              <>
                <button
                  type="button"
                  onClick={connect}
                  disabled={redirecting || disconnecting}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-blue-300/25 bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {redirecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
                  {redirecting ? t("googleCalendar.connecting") : t("googleCalendar.reconnect")}
                </button>
                <button
                  type="button"
                  onClick={() => void disconnect()}
                  disabled={redirecting || disconnecting}
                  className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-semibold text-destructive transition hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {disconnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unplug className="h-3.5 w-3.5" />}
                  {disconnecting ? t("googleCalendar.disconnecting") : t("googleCalendar.disconnect")}
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : status?.ready === false ? (
        <div className="mt-5 grid gap-3 rounded-xl border border-upflow-warning/30 bg-upflow-warning/10 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="flex gap-2.5">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-upflow-warning" />
            <div>
              <p className="text-sm font-semibold text-foreground">{t("googleCalendar.configurationTitle")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("googleCalendar.configurationDescription")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs font-semibold text-foreground transition hover:bg-accent dark:border-white/10 dark:hover:bg-white/10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t("googleCalendar.retry")}
          </button>
        </div>
      ) : !connected && connection?.last_error ? (
        <div className="mt-5 rounded-xl border border-upflow-warning/30 bg-upflow-warning/10 p-4">
          <div className="flex gap-2.5">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-upflow-warning" />
            <div>
              <p className="text-sm font-semibold text-foreground">{t("googleCalendar.reconnectNeededTitle")}</p>
              <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
                {t("googleCalendar.reconnectNeededDescription")}
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={connect}
              disabled={redirecting || disconnecting}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-blue-300/25 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_rgba(59,130,246,0.22)] transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {redirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
              {redirecting ? t("googleCalendar.connecting") : t("googleCalendar.reconnect")}
            </button>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={redirecting || disconnecting}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
              {disconnecting ? t("googleCalendar.disconnecting") : t("googleCalendar.disconnect")}
            </button>
          </div>
        </div>
      ) : !connected ? (
        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4 dark:bg-white/[0.025]">
          <p className="text-sm font-medium text-foreground">{t("googleCalendar.connectTitle")}</p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">
            {t("googleCalendar.connectDescription")}
          </p>
          <button
            type="button"
            onClick={connect}
            disabled={redirecting}
            className="mt-4 inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-blue-300/25 bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_rgba(59,130,246,0.22)] transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {redirecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Cloud className="h-4 w-4" />}
            {redirecting ? t("googleCalendar.connecting") : t("googleCalendar.connect")}
          </button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-xs text-muted-foreground dark:bg-white/[0.025]">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-upflow-success" />
              {connection?.email
                ? t("googleCalendar.connectedAs", { email: connection.email })
                : t("googleCalendar.connected")}
            </span>
            <span aria-hidden="true" className="hidden h-3 w-px bg-border sm:block dark:bg-white/10" />
            <span>
              {lastSynced
                ? t("googleCalendar.lastSynced", { date: lastSynced })
                : t("googleCalendar.notSyncedYet")}
            </span>
            {agendaLastSynced ? (
              <>
                <span aria-hidden="true" className="hidden h-3 w-px bg-border sm:block dark:bg-white/10" />
                <span>{t("googleCalendar.agendaLastSynced", { date: agendaLastSynced })}</span>
              </>
            ) : null}
          </div>

          {connection?.last_error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-upflow-warning/30 bg-upflow-warning/10 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">{t("googleCalendar.syncNeedsAttention")}</span>{" "}
                {t("googleCalendar.syncNeedsAttentionDescription")}
              </p>
              <button
                type="button"
                onClick={connect}
                disabled={redirecting || disconnecting}
                className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-upflow-warning/30 bg-background/60 px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/10"
              >
                {redirecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
                {redirecting ? t("googleCalendar.connecting") : t("googleCalendar.reconnect")}
              </button>
            </div>
          ) : null}

          {connection?.agenda_last_error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-upflow-warning/30 bg-upflow-warning/10 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">{t("googleCalendar.agendaSyncNeedsAttention")}</span>{" "}
                {t("googleCalendar.agendaSyncNeedsAttentionDescription")}
              </p>
              <button
                type="button"
                onClick={() => void syncNow()}
                disabled={saving || syncing || disconnecting || !selectedCalendarId}
                className="inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg border border-upflow-warning/30 bg-background/60 px-2.5 py-1.5 text-xs font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/10"
              >
                {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {syncing ? t("googleCalendar.syncing") : t("googleCalendar.syncNow")}
              </button>
            </div>
          ) : null}

          <label className="block space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t("googleCalendar.calendar")}
            </span>
            <select
              value={selectedCalendarId}
              onChange={(event) => setSelectedCalendarId(event.target.value)}
              disabled={saving || syncing || disconnecting || calendars.length === 0}
              className="h-10 w-full rounded-xl border border-border bg-background/65 px-3 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.04]"
            >
              <option value="">{t("googleCalendar.chooseCalendar")}</option>
              {calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.name}{calendar.primary ? ` (${t("googleCalendar.primary")})` : ""}
                </option>
              ))}
            </select>
            {calendars.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t("googleCalendar.noCalendars")}</p>
            ) : null}
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 transition hover:border-primary/30 dark:bg-white/[0.025]">
            <input
              type="checkbox"
              checked={syncEnabled}
              onChange={(event) => setSyncEnabled(event.target.checked)}
              disabled={saving || syncing || disconnecting}
              className="mt-0.5 h-4 w-4 rounded border-border bg-background text-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:bg-white/5"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">{t("googleCalendar.automaticSync")}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                {t("googleCalendar.automaticSyncDescription")}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.05] p-3 transition hover:border-primary/40">
            <input
              type="checkbox"
              checked={shareAgenda}
              onChange={(event) => setShareAgenda(event.target.checked)}
              disabled={saving || syncing || disconnecting}
              className="mt-0.5 h-4 w-4 rounded border-border bg-background text-primary focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/20 dark:bg-white/5"
            />
            <span>
              <span className="block text-sm font-medium text-foreground">{t("googleCalendar.shareAgenda")}</span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                {t("googleCalendar.shareAgendaDescription")}
              </span>
            </span>
          </label>

          <div className="flex flex-col gap-2 border-t border-border/70 pt-4 sm:flex-row sm:flex-wrap sm:items-center dark:border-white/10">
            <button
              type="button"
              onClick={() => void saveConnection()}
              disabled={saving || syncing || disconnecting || !selectedCalendarId}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-blue-300/25 bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {saving ? t("googleCalendar.saving") : t("googleCalendar.save")}
            </button>
            <button
              type="button"
              onClick={() => void syncNow()}
              disabled={saving || syncing || disconnecting || !selectedCalendarId}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-border bg-background/60 px-3.5 py-2 text-sm font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:hover:bg-white/10"
            >
              {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {syncing ? t("googleCalendar.syncing") : t("googleCalendar.syncNow")}
            </button>
            <button
              type="button"
              onClick={() => void disconnect()}
              disabled={saving || syncing || disconnecting}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2 text-sm font-semibold text-destructive transition hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-60 sm:ml-auto"
            >
              {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unplug className="h-4 w-4" />}
              {disconnecting ? t("googleCalendar.disconnecting") : t("googleCalendar.disconnect")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
