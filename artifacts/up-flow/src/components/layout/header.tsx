"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Search,
  Bell,
  UserCheck,
  MessageSquare,
  Clock,
  UserPlus,
  ArrowRightCircle,
  AtSign,
  Languages,
  RefreshCw,
  Sparkles,
  X,
  Moon,
  Sun,
} from "lucide-react";
import CommandPalette from "@/components/command-palette";
import { useAppUser } from "@/components/user-provider";
import { useLanguage } from "@/components/language-provider";
import { useTheme } from "@/components/theme-provider";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import { getCachedJson } from "@/lib/client-cache";
import { getNotificationHref } from "@/lib/notification-links";
import { equipmentNotificationLabel, memberJoinedNotificationLabel } from "@/lib/notification-copy";
import {
  NOTIFICATION_PREFERENCES_EVENT,
  readNotificationPreferences,
  type NotificationPreferences,
} from "@/lib/notification-preferences";
import { cn } from "@/lib/utils";
import { logError } from "@/lib/log-error";
import {
  ApiResponseError,
  recoverExpiredSession,
} from "@/lib/client-auth-recovery";
import {
  countPendingInboxNotifications,
  publishInboxPendingCount,
} from "@/lib/inbox-pending-count";
import type { Notification } from "@/lib/types";

interface HeaderProps {
  title: string;
  /**
   * Lets workspace pages turn the global header search into a local search
   * without duplicating the shell.  Omitted on every existing route, so the
   * original project/task/document search remains unchanged.
   */
  searchValue?: string;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  onSearchChange?: (value: string) => void;
  onSearchSubmit?: () => void;
  /** Optional page actions rendered before the notifications control. */
  actions?: ReactNode;
}

const NOTIFICATION_CACHE_TTL_MS = 30_000;
const COMMERCIAL_AUTOMATION_PULSE_INTERVAL_MS = 30_000;
let notificationCache: {
  userId: string;
  items: Notification[];
  loadedAt: number;
} | null = null;

function claimCommercialAutomationPulse(userId: string) {
  const now = Date.now();
  try {
    const key = `upflow:commercial-automation-pulse:${userId}`;
    const lastRun = Number(window.localStorage.getItem(key) ?? 0);
    if (
      Number.isFinite(lastRun) &&
      now - lastRun < COMMERCIAL_AUTOMATION_PULSE_INTERVAL_MS
    ) {
      return false;
    }
    window.localStorage.setItem(key, String(now));
  } catch {
    // Privacy modes can disable localStorage. The server-side atomic claim
    // still prevents duplicate workflow notifications in that case.
  }
  return true;
}
let notificationRequest: {
  userId: string;
  promise: Promise<Notification[]>;
} | null = null;

function fetchUnreadCount(userId: string, force = false): Promise<number> {
  return getCachedJson<{ unread: number }>(
    `notifications:unread-count:${userId}`,
    "/api/notifications/unread-count",
    { ttlMs: 30_000, force },
  ).then((data) => {
    if (typeof data.unread !== "number") {
      throw new Error("Unread notification count was not returned");
    }
    return data.unread;
  });
}

function fetchNotificationItems(
  userId: string,
  force = false,
): Promise<Notification[]> {
  if (
    !force &&
    notificationCache?.userId === userId &&
    Date.now() - notificationCache.loadedAt < NOTIFICATION_CACHE_TTL_MS
  ) {
    return Promise.resolve(notificationCache.items);
  }
  // A forced refresh should bypass cached data, but it should never create a
  // second identical request while one is already in flight. Reusing it keeps
  // slower responses from racing newer notification state in the header.
  if (notificationRequest?.userId === userId) {
    return notificationRequest.promise;
  }

  const request = fetch("/api/notifications").then(async (res) => {
    if (!res.ok) {
      throw new ApiResponseError(
        `Unable to load notifications: ${res.status}`,
        res.status,
      );
    }
    const data = (await res.json()) as { items: Notification[] };
    if (!Array.isArray(data.items)) {
      throw new Error("Notifications response did not include an items list");
    }
    const items = data.items;
    notificationCache = { userId, items, loadedAt: Date.now() };
    return items;
  });

  notificationRequest = { userId, promise: request };
  void request
    .finally(() => {
      if (notificationRequest?.promise === request) notificationRequest = null;
    })
    .catch(() => undefined);
  return request;
}

function isPortuguese(language: "en" | "pt" | "pt-BR") {
  return language === "pt" || language === "pt-BR";
}

function notificationStatusLabel(
  status: string,
  language: "en" | "pt" | "pt-BR",
) {
  const labels = isPortuguese(language)
    ? { todo: "A Fazer", in_progress: "Em Andamento", done: "Concluído" }
    : { todo: "To Do", in_progress: "In Progress", done: "Done" };
  return labels[status as keyof typeof labels] ?? status;
}

function notificationIcon(type: string, source?: string) {
  if (source === "space_share_request")
    return <UserPlus className="w-3.5 h-3.5 text-primary" />;
  if (type === "assigned")
    return <UserCheck className="w-3.5 h-3.5 text-primary" />;
  if (type === "commented")
    return <MessageSquare className="w-3.5 h-3.5 text-upflow-success" />;
  if (type === "member_joined")
    return <UserPlus className="w-3.5 h-3.5 text-primary" />;
  if (type === "status_changed")
    return <ArrowRightCircle className="w-3.5 h-3.5 text-primary" />;
  if (type === "mentioned")
    return <AtSign className="w-3.5 h-3.5 text-upflow-success" />;
  return <Clock className="w-3.5 h-3.5 text-upflow-warning" />;
}

function notificationData(n: Notification): Record<string, unknown> {
  return n.data && typeof n.data === "object"
    ? (n.data as Record<string, unknown>)
    : {};
}

function getStringData(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "string" ? value : undefined;
}

function getNumberData(data: Record<string, unknown>, key: string) {
  const value = data[key];
  return typeof value === "number" ? value : undefined;
}

function calendarAssignmentLabel(
  type: string | undefined,
  language: "en" | "pt" | "pt-BR",
) {
  const isMeeting = type === "meeting";
  if (language === "en") return isMeeting ? "meeting" : "calendar event";
  return isMeeting ? "reunião" : "evento do calendário";
}

function notificationContext(n: Notification, language: "en" | "pt" | "pt-BR") {
  const data = notificationData(n);
  if (
    data.source === "calendar_event_assigned" ||
    data.source === "calendar_event_reminder"
  ) {
    const startsAt = getStringData(data, "starts_at");
    if (startsAt) {
      const date = new Date(startsAt);
      if (!Number.isNaN(date.getTime())) {
        return new Intl.DateTimeFormat(language, {
          dateStyle: "short",
          timeStyle: "short",
        }).format(date);
      }
    }
    return n.workspace?.name ?? (language === "en" ? "Calendar" : "Calendário");
  }

  return n.task?.project?.name ?? n.workspace?.name ?? null;
}

function shouldShowAssistantPopup(n: Notification) {
  if (n.read || n.type !== "assigned") return false;
  const data = notificationData(n);
  return Boolean(
    n.task?.id ||
      data.source === "calendar_event_assigned" ||
      data.source === "calendar_event_reminder",
  );
}

function notificationAcknowledgementKey(notification: Notification) {
  const data = notificationData(notification);
  const calendarEventId = getStringData(data, "calendar_event_id");
  const calendarReminderKey = getStringData(
    data,
    "calendar_event_reminder_key",
  );
  if (data.source === "calendar_event_reminder" && calendarReminderKey) {
    return `calendar-reminder:${calendarReminderKey}`;
  }
  if (data.source === "calendar_event_assigned" && calendarEventId) {
    return `calendar-event:${calendarEventId}`;
  }
  return `notification:${notification.id}`;
}

function notificationLabel(
  n: Notification,
  language: "en" | "pt" | "pt-BR" = "en",
) {
  if (n.type === "member_joined") {
    return memberJoinedNotificationLabel(n, language);
  }
  const data = notificationData(n);
  const equipmentLabel = equipmentNotificationLabel(n, language);
  if (equipmentLabel) return equipmentLabel;
  if (data.source === "space_share_request") {
    const actor =
      getStringData(data, "actor_name") ??
      (language === "en" ? "A collaborator" : "Um colaborador");
    const collaborator =
      getStringData(data, "collaborator_name") ??
      (language === "en" ? "a collaborator" : "um colaborador");
    const space =
      getStringData(data, "space_name") ??
      (language === "en" ? "a space" : "um espaço");
    return language === "en"
      ? `${actor} requested access to ${space} for ${collaborator}`
      : `${actor} solicitou acesso ao espaço ${space} para ${collaborator}`;
  }
  if (data.source === "social_media_moodboard_ready") {
    const taskTitle =
      n.task?.title ||
      getStringData(data, "task_title") ||
      (language === "en" ? "the moodboard" : "o moodboard");
    return language === "en"
      ? `Social Media moodboard ready: "${taskTitle}" can move into creative production`
      : `Moodboard de Social Media pronto: "${taskTitle}" pode seguir para produção criativa`;
  }
  if (data.source === "social_media_post_overdue") {
    const taskTitle =
      n.task?.title ||
      getStringData(data, "task_title") ||
      (language === "en" ? "the social post" : "o post de social media");
    return language === "en"
      ? `Social Media post overdue: "${taskTitle}" needs attention`
      : `Post de Social Media atrasado: "${taskTitle}" precisa de atenção`;
  }
  if (data.source === "calendar_event_assigned") {
    const eventTitle =
      getStringData(data, "calendar_event_title") ??
      (language === "en" ? "event" : "evento");
    const eventType = calendarAssignmentLabel(
      getStringData(data, "calendar_event_type"),
      language,
    );
    return language === "en"
      ? `Assigned to ${eventType} "${eventTitle}"`
      : `Atribuído a ${eventType} "${eventTitle}"`;
  }
  if (data.source === "calendar_event_reminder") {
    const eventTitle =
      getStringData(data, "calendar_event_title") ??
      (language === "en" ? "event" : "evento");
    const minutes = getNumberData(data, "minutes_before");
    if (minutes === 60) {
      return language === "en"
        ? `Reminder: "${eventTitle}" starts in 1 hour`
        : `Lembrete: "${eventTitle}" começa em 1 hora`;
    }
    return language === "en"
      ? `Reminder: "${eventTitle}" starts in ${minutes ?? 0} minutes`
      : `Lembrete: "${eventTitle}" começa em ${minutes ?? 0} minutos`;
  }
  if (data.source === "manual_project_notification") {
    const actor =
      getStringData(data, "actor_name") ||
      (language === "en" ? "A teammate" : "Um colega");
    const notifiedTaskTitle =
      n.task?.title ||
      getStringData(data, "task_title") ||
      (language === "en" ? "a task" : "uma tarefa");
    return language === "en"
      ? `${actor} requested your attention on "${notifiedTaskTitle}"`
      : `${actor} solicitou sua atenção em "${notifiedTaskTitle}"`;
  }
  if (data.source === "commercial_lead_presentation_confirmation") {
    const brandName =
      getStringData(data, "brand_name") ||
      n.task?.title ||
      (language === "en" ? "the Lead" : "o Lead");
    return language === "en"
      ? `Confirm whether the presentation for "${brandName}" took place`
      : `Confirme se a apresentação de "${brandName}" foi realizada`;
  }
  if (data.source === "commercial_lead_qualification") {
    const brandName =
      getStringData(data, "brand_name") ||
      n.task?.title ||
      (language === "en" ? "the Lead" : "o Lead");
    return language === "en"
      ? `Qualify "${brandName}" to continue or archive this Lead`
      : `Qualifique "${brandName}" para continuar ou arquive este Lead`;
  }
  if (data.source === "commercial_lead_follow_up_due") {
    const brandName =
      getStringData(data, "brand_name") ||
      n.task?.title ||
      (language === "en" ? "the Lead" : "o Lead");
    return language === "en"
      ? `Follow Up due for "${brandName}"`
      : `Follow Up pendente para "${brandName}"`;
  }
  if (data.source === "task_follower_added") {
    const actor =
      getStringData(data, "actor_name") ||
      (language === "en" ? "A teammate" : "Um colega");
    const followedTaskTitle =
      n.task?.title ||
      getStringData(data, "task_title") ||
      (language === "en" ? "a task" : "uma tarefa");
    return language === "en"
      ? `${actor} added you as a follower of "${followedTaskTitle}"`
      : `${actor} adicionou você ao acompanhamento de "${followedTaskTitle}"`;
  }
  const taskTitle =
    n.task?.title ||
    getStringData(data, "task_title") ||
    (language === "en" ? "a task" : "uma tarefa");
  if (n.type === "assigned") {
    return language === "en"
      ? `Assigned to "${taskTitle}"`
      : `Atribuído a "${taskTitle}"`;
  }
  if (n.type === "commented") {
    return language === "en"
      ? `New comment on "${taskTitle}"`
      : `Novo comentário em "${taskTitle}"`;
  }
  if (n.type === "due_soon") {
    return language === "en"
      ? `"${taskTitle}" is due soon`
      : `"${taskTitle}" vence em breve`;
  }
  if (n.type === "status_changed") {
    const actor =
      getStringData(data, "actor_name") ||
      (language === "en" ? "Someone" : "Alguém");
    const newStatus = getStringData(data, "new_status");
    const newLabel = newStatus
      ? notificationStatusLabel(newStatus, language)
      : language === "en"
        ? "a new status"
        : "um novo status";
    return language === "en"
      ? `${actor} moved "${taskTitle}" to ${newLabel}`
      : `${actor} moveu "${taskTitle}" para ${newLabel}`;
  }
  if (n.type === "mentioned") {
    const data = notificationData(n);
    const actor =
      getStringData(data, "actor_name") ||
      (language === "en" ? "Someone" : "Alguém");
    return language === "en"
      ? `${actor} mentioned you on "${taskTitle}"`
      : `${actor} mencionou você em "${taskTitle}"`;
  }
  return taskTitle;
}

export default function Header({
  title,
  searchValue,
  searchPlaceholder,
  searchAriaLabel,
  onSearchChange,
  onSearchSubmit,
  actions,
}: HeaderProps) {
  const router = useRouter();
  const user = useAppUser();
  const { language, toggleLanguage, t } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [search, setSearch] = useState("");
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [notificationsHaveLoaded, setNotificationsHaveLoaded] = useState(false);
  const [notificationListUnavailable, setNotificationListUnavailable] =
    useState(false);
  const [notificationUnreadUnavailable, setNotificationUnreadUnavailable] =
    useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [assistantNotification, setAssistantNotification] =
    useState<Notification | null>(null);
  const [assistantActionPending, setAssistantActionPending] = useState(false);
  const [notificationPreferences, setNotificationPreferences] =
    useState<NotificationPreferences>(() =>
      readNotificationPreferences(user?.id),
    );
  const panelRef = useRef<HTMLDivElement>(null);
  const notificationToggleRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const activeNotificationUserIdRef = useRef<string | null>(user?.id ?? null);
  const shownAssistantIdsRef = useRef<Set<string>>(new Set());
  const notificationListRequestRef = useRef(0);
  const notificationUnreadRequestRef = useRef(0);
  const notificationsUnavailable =
    notificationListUnavailable ||
    (!notificationsHaveLoaded && notificationUnreadUnavailable);
  const effectiveSearchAriaLabel =
    searchAriaLabel ?? t("header.searchAriaLabel", { title });
  const usesLocalSearchLabel = searchAriaLabel !== undefined;

  useEffect(() => {
    publishInboxPendingCount(
      user?.id,
      countPendingInboxNotifications(notifications),
    );
  }, [notifications, user?.id]);

  const fetchNotifications = useCallback(
    async (force = false, options?: { showAssistant?: boolean }) => {
      const userId = user?.id;
      if (!userId) {
        setNotifications([]);
        setUnreadCount(0);
        setNotificationsLoading(false);
        setNotificationsHaveLoaded(false);
        setNotificationListUnavailable(false);
        setNotificationUnreadUnavailable(false);
        return;
      }

      const requestId = ++notificationListRequestRef.current;
      setNotificationsLoading(true);
      try {
        const items = await fetchNotificationItems(userId, force);
        if (
          activeNotificationUserIdRef.current !== userId ||
          notificationListRequestRef.current !== requestId
        )
          return;
        setNotifications(items);
        setUnreadCount(items.filter((n) => !n.read).length);
        setNotificationsHaveLoaded(true);
        setNotificationListUnavailable(false);
        if (options?.showAssistant && notificationPreferences.assistantPopups) {
          const nextNotification = items.find(
            (item) =>
              shouldShowAssistantPopup(item) &&
              !shownAssistantIdsRef.current.has(item.id),
          );
          if (nextNotification) {
            shownAssistantIdsRef.current.add(nextNotification.id);
            setAssistantNotification(nextNotification);
          }
        }
      } catch (error) {
        if (recoverExpiredSession(error)) return;
        logError("notifications:load", error);
        if (
          activeNotificationUserIdRef.current === userId &&
          notificationListRequestRef.current === requestId
        ) {
          setNotificationListUnavailable(true);
        }
      } finally {
        if (
          activeNotificationUserIdRef.current === userId &&
          notificationListRequestRef.current === requestId
        ) {
          setNotificationsLoading(false);
        }
      }
    },
    [user?.id, notificationPreferences.assistantPopups],
  );

  useEffect(() => {
    activeNotificationUserIdRef.current = user?.id ?? null;
    shownAssistantIdsRef.current.clear();
    setAssistantNotification(null);
    setNotifications([]);
    setUnreadCount(0);
    setNotificationsLoading(false);
    setNotificationsHaveLoaded(false);
    setNotificationListUnavailable(false);
    setNotificationUnreadUnavailable(false);

    const onPreferencesChanged = (event?: Event) => {
      const detail =
        event instanceof CustomEvent
          ? (event.detail as { userId?: string } | undefined)
          : undefined;
      if (detail?.userId && detail.userId !== user?.id) return;
      setNotificationPreferences(readNotificationPreferences(user?.id));
    };
    onPreferencesChanged();
    window.addEventListener(
      NOTIFICATION_PREFERENCES_EVENT,
      onPreferencesChanged,
    );
    window.addEventListener("storage", onPreferencesChanged);
    return () => {
      window.removeEventListener(
        NOTIFICATION_PREFERENCES_EVENT,
        onPreferencesChanged,
      );
      window.removeEventListener("storage", onPreferencesChanged);
    };
  }, [user?.id]);

  const refreshUnreadCount = useCallback(
    async (force = false) => {
      const userId = user?.id;
      if (!userId) {
        setUnreadCount(0);
        return;
      }
      const requestId = ++notificationUnreadRequestRef.current;
      try {
        const count = await fetchUnreadCount(userId, force);
        if (
          activeNotificationUserIdRef.current === userId &&
          notificationUnreadRequestRef.current === requestId
        ) {
          setUnreadCount(count);
          setNotificationUnreadUnavailable(false);
        }
      } catch (error) {
        if (recoverExpiredSession(error)) return;
        logError("notifications:unread-count", error);
        if (
          activeNotificationUserIdRef.current === userId &&
          notificationUnreadRequestRef.current === requestId
        ) {
          setNotificationUnreadUnavailable(true);
        }
      }
    },
    [user?.id],
  );

  const retryNotifications = useCallback(() => {
    void fetchNotifications(true);
    void refreshUnreadCount(true);
  }, [fetchNotifications, refreshUnreadCount]);

  const closeNotificationPanel = useCallback((restoreFocus = false) => {
    setPanelOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() =>
        notificationToggleRef.current?.focus(),
      );
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    fetchNotifications(true, { showAssistant: true });
    const supabase = createSupabaseBrowserClient();
    const handleIncomingNotification = (showAssistant: boolean) => {
      refreshUnreadCount(true);
      fetchNotifications(true, { showAssistant });
    };
    const fallbackPoll = window.setInterval(() => {
      fetchNotifications(true, { showAssistant: true });
    }, 30_000);
    const dbChannel = supabase
      .channel(`db-notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "Notification",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          handleIncomingNotification(payload.eventType === "INSERT");
        },
      )
      .subscribe();
    const broadcastChannel = supabase
      .channel(`notifications:${user.id}`)
      .on("broadcast", { event: "new_notification" }, () => {
        handleIncomingNotification(true);
      })
      .subscribe();
    return () => {
      window.clearInterval(fallbackPoll);
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(broadcastChannel);
    };
  }, [user?.id, fetchNotifications, refreshUnreadCount]);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) return;

    let cancelled = false;
    const runPulse = async () => {
      if (
        document.visibilityState !== "visible" ||
        !claimCommercialAutomationPulse(userId)
      ) {
        return;
      }

      try {
        const response = await fetch("/api/commercial/automations/pulse", {
          method: "POST",
          cache: "no-store",
        });
        if (!response.ok) {
          throw new ApiResponseError(
            `Unable to run commercial automations: ${response.status}`,
            response.status,
          );
        }
        const result = (await response.json()) as {
          presentation_confirmations?: number;
          follow_ups_created?: number;
          equipment_overdue?: { notified?: number };
        };
        if (
          !cancelled &&
          ((result.presentation_confirmations ?? 0) > 0 ||
            (result.follow_ups_created ?? 0) > 0 ||
            (result.equipment_overdue?.notified ?? 0) > 0)
        ) {
          await Promise.all([
            fetchNotifications(true, { showAssistant: true }),
            refreshUnreadCount(true),
          ]);
        }
      } catch (error) {
        if (recoverExpiredSession(error)) return;
        logError("commercial-automations:pulse", error, { user_id: userId });
      }
    };

    void runPulse();
    const interval = window.setInterval(
      () => void runPulse(),
      COMMERCIAL_AUTOMATION_PULSE_INTERVAL_MS,
    );
    const runWhenVisible = () => {
      if (document.visibilityState === "visible") void runPulse();
    };
    window.addEventListener("focus", runWhenVisible);
    document.addEventListener("visibilitychange", runWhenVisible);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", runWhenVisible);
      document.removeEventListener("visibilitychange", runWhenVisible);
    };
  }, [user?.id, fetchNotifications, refreshUnreadCount]);

  useEffect(() => {
    if (panelOpen) fetchNotifications();
  }, [panelOpen, fetchNotifications]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        // Let the element the person clicked keep focus. The bell regains
        // focus only when the panel is dismissed from the keyboard.
        closeNotificationPanel();
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape" && panelOpen) closeNotificationPanel(true);
    }
    if (panelOpen) {
      document.addEventListener("mousedown", handleClick);
      document.addEventListener("keydown", handleKey);
    }
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [closeNotificationPanel, panelOpen]);

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    await Promise.all(
      unread.map((n) =>
        fetch(`/api/notifications/${n.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read: true }),
        }),
      ),
    );
    setUnreadCount(0);
    setNotifications((prev) => {
      const next = prev.map((n) => ({ ...n, read: true }));
      notificationCache = user?.id
        ? { userId: user.id, items: next, loadedAt: Date.now() }
        : null;
      return next;
    });
  };

  const markNotificationRead = useCallback(
    async (notification: Notification) => {
      if (notification.read) return true;

      try {
        const response = await fetch(`/api/notifications/${notification.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ read: true }),
          keepalive: true,
        });
        if (!response.ok) {
          throw new ApiResponseError(
            `Unable to mark notification as read: ${response.status}`,
            response.status,
          );
        }

        const result = (await response.json()) as {
          acknowledged_count?: number;
        };
        const acknowledgedCount = Math.max(
          1,
          result.acknowledged_count ?? 1,
        );
        const acknowledgementKey =
          notificationAcknowledgementKey(notification);

        setUnreadCount((count) => Math.max(0, count - acknowledgedCount));
        setNotifications((prev) => {
          const next = prev.map((item) =>
            notificationAcknowledgementKey(item) === acknowledgementKey
              ? { ...item, read: true }
              : item,
          );
          notificationCache = user?.id
            ? { userId: user.id, items: next, loadedAt: Date.now() }
            : null;
          return next;
        });
        return true;
      } catch (error) {
        if (recoverExpiredSession(error)) return false;
        logError("notifications:mark-read", error, {
          notification_id: notification.id,
        });
        toast.error(t("header.assistantActionFailed"));
        void fetchNotifications(true);
        void refreshUnreadCount(true);
        return false;
      }
    },
    [fetchNotifications, refreshUnreadCount, t, user?.id],
  );

  const handleDismissAssistantNotification = async () => {
    const notification = assistantNotification;
    if (!notification || assistantActionPending) return;

    setAssistantActionPending(true);
    const acknowledged = await markNotificationRead(notification);
    if (acknowledged) {
      setAssistantNotification((current) =>
        current?.id === notification.id ? null : current,
      );
    }
    setAssistantActionPending(false);
  };

  const handleOpenNotification = async (notification: Notification) => {
    const href = getNotificationHref(notification);
    const acknowledged = await markNotificationRead(notification);
    if (!acknowledged) return;

    setAssistantNotification((current) =>
      current?.id === notification.id ? null : current,
    );

    if (href) {
      closeNotificationPanel();
      router.push(href);
    }
  };

  const handleSearch = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (onSearchSubmit) {
        onSearchSubmit();
        return;
      }
      const query = new FormData(e.currentTarget).get("q");
      const normalizedQuery = typeof query === "string" ? query.trim() : "";
      if (normalizedQuery) {
        router.push(`/search?q=${encodeURIComponent(normalizedQuery)}`);
      }
    },
    [onSearchSubmit, router],
  );

  const assistantContext = assistantNotification
    ? notificationContext(assistantNotification, language)
    : null;

  return (
    <>
      <header className="sticky top-0 z-[70] flex min-h-20 flex-col gap-3 px-4 py-3 glass-header sm:flex-row sm:items-center sm:gap-4 sm:px-6">
        <form
          data-testid="header-global-search"
          onSubmit={handleSearch}
          action="/search"
          method="get"
          className="w-full min-w-0 pl-11 sm:flex-1 md:pl-0"
          aria-label={
            usesLocalSearchLabel ? undefined : effectiveSearchAriaLabel
          }
        >
          <div className="relative w-full">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              type="search"
              name="q"
              aria-label={
                usesLocalSearchLabel ? effectiveSearchAriaLabel : undefined
              }
              value={searchValue ?? search}
              onChange={(e) => {
                if (searchValue === undefined) setSearch(e.target.value);
                onSearchChange?.(e.target.value);
              }}
              placeholder={
                searchPlaceholder ??
                t("header.searchPlaceholder", {
                  title: title.toLowerCase(),
                })
              }
              className="upflow-shell-search upflow-focus-glow h-10 w-full rounded-full border border-border bg-background/95 pl-11 pr-4 text-sm shadow-sm backdrop-blur-md transition placeholder:text-muted-foreground hover:border-primary/[0.35] hover:bg-background focus:border-sky-400/70 dark:border-blue-300/10 dark:bg-[#050a18]/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_30px_rgba(37,99,235,0.08)] dark:hover:border-blue-300/25 dark:hover:bg-[#070d1f]/90 sm:h-11 md:pr-16"
            />
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("upflow:command-palette-open"),
                )
              }
              aria-label={t("header.openCommandPalette")}
              className="upflow-shell-kbd absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-lg border border-border bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-blue-300/10 dark:bg-white/5 md:flex"
            >
              Ctrl K
            </button>
          </div>
        </form>

        <div className="flex min-w-0 flex-shrink-0 items-center justify-end gap-2 sm:self-auto">
          {actions}
          <div
            data-testid="header-global-controls"
            className="ml-auto flex shrink-0 items-center gap-2"
          >
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={t("language.toggle")}
              title={`${t("language.toggle")}: ${
                language === "en"
                  ? t("language.portugueseBrazil")
                  : t("language.english")
              }`}
              className="upflow-shell-control inline-flex h-10 items-center gap-1.5 rounded-full border border-border bg-card px-2.5 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur-md transition-all hover:border-sky-400/[0.55] hover:bg-accent hover:text-foreground dark:border-blue-300/10 dark:bg-[#071024]/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:hover:bg-sky-400/10 dark:hover:shadow-[0_0_24px_rgba(59,130,246,0.16)] sm:h-11 sm:px-3"
            >
              <Languages className="h-4 w-4" />
              <span>{language === "en" ? "EN" : "PT"}</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label={
                isDark
                  ? t("header.switchToLightMode")
                  : t("header.switchToDarkMode")
              }
              title={
                isDark
                  ? t("header.switchToLightMode")
                  : t("header.switchToDarkMode")
              }
              className="upflow-shell-control inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm backdrop-blur-md transition-all hover:border-sky-400/[0.55] hover:bg-accent hover:text-foreground dark:border-blue-300/10 dark:bg-[#071024]/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:hover:bg-sky-400/10 dark:hover:shadow-[0_0_24px_rgba(59,130,246,0.16)] sm:h-11 sm:w-11"
            >
              {isDark ? (
                <Sun className="h-[18px] w-[18px]" />
              ) : (
                <Moon className="h-[18px] w-[18px]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              aria-label={t("header.refresh")}
              title={t("header.refresh")}
              className="upflow-shell-control group inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm backdrop-blur-md transition-all hover:border-sky-400/[0.55] hover:bg-accent hover:text-foreground active:scale-95 dark:border-blue-300/10 dark:bg-[#071024]/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:hover:bg-sky-400/10 dark:hover:shadow-[0_0_24px_rgba(59,130,246,0.16)] sm:h-11 sm:w-11"
            >
              <RefreshCw className="h-[18px] w-[18px] transition-transform duration-300 group-active:rotate-180" />
            </button>
            <div className="relative" ref={panelRef}>
              <button
                ref={notificationToggleRef}
                type="button"
                onClick={() => setPanelOpen((v) => !v)}
                aria-label={t("header.notifications")}
                aria-expanded={panelOpen}
                aria-controls="header-notification-panel"
                className="upflow-shell-control relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm backdrop-blur-md transition-all hover:border-sky-400/[0.55] hover:bg-accent hover:text-foreground dark:border-blue-300/10 dark:bg-[#071024]/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] dark:hover:bg-sky-400/10 dark:hover:shadow-[0_0_24px_rgba(59,130,246,0.16)] sm:h-11 sm:w-11"
              >
                <Bell className="h-[18px] w-[18px]" />
                {unreadCount > 0 && (
                  <span className="upflow-pulse-badge absolute right-2 top-2 h-2 w-2 rounded-full bg-upflow-danger ring-2 ring-background" />
                )}
              </button>

              {panelOpen && (
                <div
                  id="header-notification-panel"
                  role="dialog"
                  aria-label={t("header.notifications")}
                  className="fixed left-4 right-4 top-16 z-[80] overflow-hidden rounded-xl glass-strong sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <span className="text-sm font-semibold text-foreground">
                      {t("header.notifications")}
                    </span>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-xs text-primary hover:underline"
                      >
                        {t("header.markAllRead")}
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-border">
                    {notificationsUnavailable && notifications.length > 0 && (
                      <div
                        role="status"
                        aria-live="polite"
                        className="flex items-center justify-between gap-3 border-b border-upflow-warning/30 bg-upflow-warning/10 px-4 py-2.5 text-xs text-foreground"
                      >
                        <span>{t("header.notificationsUnavailableStale")}</span>
                        <button
                          type="button"
                          onClick={retryNotifications}
                          className="shrink-0 font-medium text-primary hover:underline"
                        >
                          {t("header.retryNotifications")}
                        </button>
                      </div>
                    )}
                    {notifications.length === 0 && notificationsUnavailable ? (
                      <div
                        role="alert"
                        className="px-4 py-8 text-center text-sm text-muted-foreground"
                      >
                        <p>{t("header.notificationsUnavailable")}</p>
                        <button
                          type="button"
                          onClick={retryNotifications}
                          className="mt-2 text-xs font-medium text-primary hover:underline"
                        >
                          {t("header.retryNotifications")}
                        </button>
                      </div>
                    ) : notifications.length === 0 &&
                      (!notificationsHaveLoaded || notificationsLoading) ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        {t("common.loading")}
                      </div>
                    ) : notifications.length === 0 ? (
                      <div className="py-10 text-center text-sm text-muted-foreground">
                        {t("header.allCaughtUp")}
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          type="button"
                          key={n.id}
                          onClick={() => handleOpenNotification(n)}
                          className={cn(
                            "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors",
                            !n.read && "bg-primary/5",
                          )}
                        >
                          <div className="mt-0.5 flex-shrink-0">
                            {notificationIcon(
                              n.type,
                              getStringData(notificationData(n), "source"),
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-foreground leading-snug">
                              {notificationLabel(n, language)}
                            </p>
                            {notificationContext(n, language) && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                {notificationContext(n, language)}
                              </p>
                            )}
                          </div>
                          {!n.read && (
                            <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0 mt-1.5" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {assistantNotification && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed right-4 top-24 z-[60] w-[calc(100vw-2rem)] max-w-sm overflow-hidden rounded-2xl border border-border bg-popover/95 p-4 text-popover-foreground shadow-xl backdrop-blur-xl dark:border-sky-300/60 dark:bg-[#071024]/95 dark:text-foreground dark:shadow-[0_0_0_1px_rgba(125,211,252,0.25),0_24px_90px_rgba(37,99,235,0.52)]"
        >
          <span className="pointer-events-none absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_12%_0%,rgba(96,165,250,0.32),transparent_34%),radial-gradient(circle_at_100%_0%,rgba(14,165,233,0.26),transparent_32%)]" />
          <span className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 animate-ping rounded-full bg-sky-400/20" />
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary ring-1 ring-sky-300/40">
                <span className="absolute inset-0 animate-ping rounded-xl bg-sky-400/20" />
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
                  {t("header.assistantEyebrow")}
                </p>
                <p className="truncate text-sm font-semibold">
                  {t("header.assistantTitle")}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleDismissAssistantNotification()}
              disabled={assistantActionPending}
              aria-label={t("header.assistantDismiss")}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-wait disabled:opacity-50 dark:hover:bg-white/10"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm font-medium leading-snug">
            {notificationLabel(assistantNotification, language)}
          </p>
          {assistantContext && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {assistantContext}
            </p>
          )}
          <p className="relative mt-3 rounded-lg border border-sky-300/30 bg-sky-400/10 px-3 py-2 text-xs font-medium text-sky-800 dark:border-sky-300/[0.35] dark:text-sky-100">
            {t("header.assistantStickyHint")}
          </p>
          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => void handleDismissAssistantNotification()}
              disabled={assistantActionPending}
              className="rounded-lg border border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:cursor-wait disabled:opacity-50 dark:border-white/10 dark:hover:bg-white/10"
            >
              {t("header.assistantDismiss")}
            </button>
            <button
              type="button"
              onClick={() => {
                const notification = assistantNotification;
                if (!notification || assistantActionPending) return;
                setAssistantActionPending(true);
                void handleOpenNotification(notification).finally(() =>
                  setAssistantActionPending(false),
                );
              }}
              disabled={assistantActionPending}
              className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-wait disabled:opacity-60"
            >
              {t("header.assistantOpen")}
            </button>
          </div>
        </div>
      )}

      <CommandPalette />
    </>
  );
}
