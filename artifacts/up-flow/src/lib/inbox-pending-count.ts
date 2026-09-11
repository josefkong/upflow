import type { Notification } from "@/lib/types";

export const INBOX_PENDING_COUNT_EVENT = "upflow:inbox-pending-count-changed";

export const INBOX_PENDING_NOTIFICATION_TYPES = new Set<Notification["type"]>([
  "assigned",
  "mentioned",
  "due_soon",
]);

export type InboxPendingCountDetail = {
  userId: string;
  count: number;
};

export function countPendingInboxNotifications(
  notifications: Array<Pick<Notification, "type">>,
): number {
  return notifications.filter((notification) =>
    INBOX_PENDING_NOTIFICATION_TYPES.has(notification.type),
  ).length;
}

export function publishInboxPendingCount(
  userId: string | null | undefined,
  count: number,
): void {
  if (!userId || typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<InboxPendingCountDetail>(INBOX_PENDING_COUNT_EVENT, {
      detail: { userId, count: Math.max(0, count) },
    }),
  );
}

export function formatInboxPendingBadge(count: number): string {
  return count > 99 ? "99+" : String(Math.max(0, count));
}
