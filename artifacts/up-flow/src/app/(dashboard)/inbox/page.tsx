"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Header from "@/components/layout/header";
import { useAppUser } from "@/components/user-provider";
import { useLanguage } from "@/components/language-provider";
import { logError } from "@/lib/log-error";
import {
  Inbox as InboxIcon,
  UserCheck,
  MessageSquare,
  Clock,
  CheckCheck,
  UserPlus,
  ArrowRightCircle,
  AtSign,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { equipmentNotificationLabel, memberJoinedNotificationLabel } from "@/lib/notification-copy";
import { getNotificationHref } from "@/lib/notification-links";
import {
  readNotificationPreferences,
  writeNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notification-preferences";
import { publishInboxPendingCount } from "@/lib/inbox-pending-count";
import type { Notification } from "@/lib/types";
import { toast } from "sonner";

type Filter =
  | "all"
  | "action_needed"
  | "unread"
  | "assigned"
  | "commented"
  | "due_soon"
  | "member_joined"
  | "status_changed"
  | "mentioned";
type Translate = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

const SNOOZED_NOTIFICATIONS_KEY = "upflow:snoozed-notifications";
const SNOOZE_MS = 60 * 60 * 1000;
const ACTION_NEEDED_TYPES = new Set<Notification["type"]>([
  "assigned",
  "mentioned",
  "due_soon",
]);

const STATUS_KEY: Record<string, string> = {
  todo: "status.todo",
  in_progress: "status.inProgress",
  done: "status.done",
};

function iconFor(type: string) {
  if (type === "assigned")
    return <UserCheck className="w-4 h-4 text-primary" />;
  if (type === "commented")
    return <MessageSquare className="w-4 h-4 text-upflow-success" />;
  if (type === "member_joined")
    return <UserPlus className="w-4 h-4 text-primary" />;
  if (type === "status_changed")
    return <ArrowRightCircle className="w-4 h-4 text-primary" />;
  if (type === "mentioned")
    return <AtSign className="w-4 h-4 text-upflow-success" />;
  return <Clock className="w-4 h-4 text-upflow-warning" />;
}

function labelFor(
  n: Notification,
  language: "en" | "pt" | "pt-BR",
  t: Translate,
) {
  if (n.type === "member_joined") {
    return memberJoinedNotificationLabel(n, language);
  }
  const data = (n.data ?? {}) as {
    old_status?: string;
    new_status?: string;
    actor_name?: string;
    task_title?: string;
    source?: string;
    collaborator_name?: string;
    space_name?: string;
  };
  const taskTitle = n.task?.title || data.task_title || t("inbox.aTask");
  const equipmentLabel = equipmentNotificationLabel(n, language);
  if (equipmentLabel) return equipmentLabel;
  if (data.source === "space_share_request") {
    const actor = data.actor_name || t("inbox.someone");
    const collaborator =
      data.collaborator_name || (language === "en" ? "a collaborator" : "um colaborador");
    const space = data.space_name || (language === "en" ? "a space" : "um espaço");
    return language === "en"
      ? `${actor} requested access to ${space} for ${collaborator}`
      : `${actor} solicitou acesso ao espaço ${space} para ${collaborator}`;
  }
  if (data.source === "social_media_moodboard_ready") {
    return language === "en"
      ? `Social Media moodboard ready: "${taskTitle}" can move into creative production`
      : `Moodboard de Social Media pronto: "${taskTitle}" pode seguir para producao criativa`;
  }
  if (data.source === "social_media_post_overdue") {
    return language === "en"
      ? `Social Media post overdue: "${taskTitle}" needs attention`
      : `Post de Social Media atrasado: "${taskTitle}" precisa de atencao`;
  }
  if (data.source === "task_follower_added") {
    const actor = data.actor_name || t("inbox.someone");
    return language === "en"
      ? `${actor} added you as a follower of "${taskTitle}"`
      : `${actor} adicionou você ao acompanhamento de "${taskTitle}"`;
  }
  if (n.type === "assigned")
    return t("inbox.notification.assigned", { task: taskTitle });
  if (n.type === "commented")
    return t("inbox.notification.commented", { task: taskTitle });
  if (n.type === "due_soon")
    return t("inbox.notification.dueSoon", { task: taskTitle });
  if (n.type === "status_changed") {
    const actor = data.actor_name || t("inbox.someone");
    const newLabel = data.new_status
      ? t(STATUS_KEY[data.new_status] ?? data.new_status)
      : t("inbox.newStatus");
    return t("inbox.notification.statusChanged", {
      actor,
      task: taskTitle,
      status: newLabel,
    });
  }
  if (n.type === "mentioned") {
    const data = (n.data ?? {}) as { actor_name?: string };
    const actor = data.actor_name || t("inbox.someone");
    return t("inbox.notification.mentioned", { actor, task: taskTitle });
  }
  return taskTitle;
}

function timeAgo(iso: string, t: Translate, locale: string) {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diff = Math.max(0, now - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("inbox.justNow");
  if (m < 60) return t("inbox.minutesAgo", { count: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("inbox.hoursAgo", { count: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t("inbox.daysAgo", { count: d });
  return formatDate(iso, locale);
}

function readSnoozedNotifications() {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SNOOZED_NOTIFICATIONS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, until]) => typeof until === "number" && until > now,
      ),
    );
  } catch {
    return {};
  }
}

function writeSnoozedNotifications(value: Record<string, number>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SNOOZED_NOTIFICATIONS_KEY, JSON.stringify(value));
}

export default function InboxPage() {
  const { language, t } = useLanguage();
  const user = useAppUser();
  const locale = language === "pt-BR" ? "pt-BR" : "en-US";
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>({});
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(() =>
      readNotificationPreferences(user?.id),
    );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = (await res.json()) as { items: Notification[] };
        setNotifications(data.items ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setSnoozedUntil(readSnoozedNotifications());
    setNotificationPreferences(readNotificationPreferences(user?.id));
  }, [user?.id]);

  const activeNotifications = useMemo(() => {
    const now = Date.now();
    return notifications.filter((n) => (snoozedUntil[n.id] ?? 0) <= now);
  }, [notifications, snoozedUntil]);

  const counts = useMemo(() => {
    return {
      all: activeNotifications.length,
      action_needed: activeNotifications.filter((n) =>
        ACTION_NEEDED_TYPES.has(n.type),
      ).length,
      unread: activeNotifications.filter((n) => !n.read).length,
      assigned: activeNotifications.filter((n) => n.type === "assigned").length,
      commented: activeNotifications.filter((n) => n.type === "commented")
        .length,
      due_soon: activeNotifications.filter((n) => n.type === "due_soon").length,
      member_joined: activeNotifications.filter(
        (n) => n.type === "member_joined",
      ).length,
      status_changed: activeNotifications.filter(
        (n) => n.type === "status_changed",
      ).length,
      mentioned: activeNotifications.filter((n) => n.type === "mentioned")
        .length,
    };
  }, [activeNotifications]);

  useEffect(() => {
    publishInboxPendingCount(user?.id, counts.action_needed);
  }, [counts.action_needed, user?.id]);

  const visible = useMemo(() => {
    if (filter === "all") return activeNotifications;
    if (filter === "action_needed")
      return activeNotifications.filter((n) => ACTION_NEEDED_TYPES.has(n.type));
    if (filter === "unread") return activeNotifications.filter((n) => !n.read);
    return activeNotifications.filter((n) => n.type === filter);
  }, [activeNotifications, filter]);

  const markRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n)),
    );
    await fetch(`/api/notifications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ read: true }),
    }).catch((err) => logError("inbox:mark-read", err, { id }));
  };

  const markAllRead = async () => {
    const unread = activeNotifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    await Promise.all(
      unread.map((n) =>
        fetch(`/api/notifications/${n.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read: true }),
        }),
      ),
    );
    toast.success(t("inbox.markedRead", { count: unread.length }));
  };

  const snoozeNotification = (id: string) => {
    const next = {
      ...readSnoozedNotifications(),
      [id]: Date.now() + SNOOZE_MS,
    };
    writeSnoozedNotifications(next);
    setSnoozedUntil(next);
    toast.success(t("inbox.snoozedForOneHour"));
  };

  const toggleAssistantPopups = () => {
    const next = {
      ...notificationPreferences,
      assistantPopups: !notificationPreferences.assistantPopups,
    };
    writeNotificationPreferences(user?.id, next);
    setNotificationPreferences(next);
    toast.success(
      next.assistantPopups
        ? t("inbox.assignmentPopupsEnabled")
        : t("inbox.assignmentPopupsDisabled"),
    );
  };

  const tabs: { key: Filter; labelKey: string }[] = [
    { key: "all", labelKey: "inbox.filter.all" },
    { key: "action_needed", labelKey: "inbox.filter.actionNeeded" },
    { key: "unread", labelKey: "inbox.filter.unread" },
    { key: "assigned", labelKey: "inbox.filter.assigned" },
    { key: "mentioned", labelKey: "inbox.filter.mentions" },
    { key: "commented", labelKey: "inbox.filter.comments" },
    { key: "status_changed", labelKey: "inbox.filter.status" },
    { key: "due_soon", labelKey: "inbox.filter.dueSoon" },
    { key: "member_joined", labelKey: "inbox.filter.joined" },
  ];

  return (
    <>
      <Header title={t("inbox.title")} />
      <div className="mx-auto max-w-3xl space-y-4 overflow-x-hidden p-4 sm:p-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {tabs.map((tab) => {
              const active = filter === tab.key;
              const count = counts[tab.key];
              return (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/5 text-muted-foreground hover:text-foreground hover:bg-white/10",
                  )}
                >
                  {t(tab.labelKey)}
                  <span
                    className={cn(
                      "tabular-nums text-[10px] px-1.5 rounded-full",
                      active ? "bg-white/20" : "bg-white/10",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          {counts.unread > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {t("inbox.markAllRead")}
            </button>
          )}
          <button
            onClick={toggleAssistantPopups}
            className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-sky-400/35 hover:bg-sky-400/10 hover:text-foreground"
          >
            {notificationPreferences.assistantPopups
              ? t("inbox.assignmentPopupsOn")
              : t("inbox.assignmentPopupsOff")}
          </button>
        </div>

        <section className="glass rounded-2xl overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {t("common.loading")}
            </div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center">
              <InboxIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground/60" />
              <p className="text-sm font-medium text-foreground">
                {filter === "unread"
                  ? t("inbox.emptyUnreadTitle")
                  : filter === "action_needed"
                    ? t("inbox.emptyActionNeededTitle")
                    : t("inbox.emptyTitle")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {filter === "unread"
                  ? t("inbox.emptyUnreadBody")
                  : filter === "action_needed"
                    ? t("inbox.emptyActionNeededBody")
                    : t("inbox.emptyBody")}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {visible.map((n) => {
                const notificationHref = getNotificationHref(n);
                const Row = (
                  <div
                    className={cn(
                      "flex items-start gap-3 px-5 py-4 transition-colors",
                      !n.read && "bg-primary/5",
                      notificationHref && "hover:bg-white/5 cursor-pointer",
                    )}
                  >
                    <div className="mt-0.5 flex-shrink-0">
                      {iconFor(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground leading-snug">
                        {labelFor(n, language, t)}
                      </p>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {n.task?.project?.name ? (
                          <>
                            <span className="truncate">
                              {n.task.project.name}
                            </span>
                            <span>·</span>
                          </>
                        ) : n.type === "member_joined" && n.workspace?.name ? (
                          <>
                            <span className="truncate">{n.workspace.name}</span>
                            <span>·</span>
                          </>
                        ) : null}
                        <span>{timeAgo(n.created_at, t, locale)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!n.read ? (
                        <>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              markRead(n.id);
                            }}
                            className="text-[11px] text-primary hover:underline"
                          >
                            {t("inbox.markRead")}
                          </button>
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              snoozeNotification(n.id);
                            }}
                            className="text-[11px] text-muted-foreground hover:text-primary hover:underline"
                          >
                            {t("inbox.snoozeOneHour")}
                          </button>
                          <span className="w-2 h-2 rounded-full bg-primary mt-0.5" />
                        </>
                      ) : ACTION_NEEDED_TYPES.has(n.type) ? (
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            snoozeNotification(n.id);
                          }}
                          className="text-[11px] text-muted-foreground hover:text-primary hover:underline"
                        >
                          {t("inbox.snoozeOneHour")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {notificationHref ? (
                      <Link
                        href={notificationHref}
                        onClick={() => !n.read && markRead(n.id)}
                      >
                        {Row}
                      </Link>
                    ) : (
                      Row
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
