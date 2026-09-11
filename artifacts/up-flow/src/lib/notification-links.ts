import type { Notification } from "@/lib/types";

export function getNotificationHref(notification: Notification): string | null {
  const data = notification.data as {
    source?: string;
    company_id?: string;
    calendar_event_id?: string;
    starts_at?: string;
    space_id?: string;
    project_id?: string;
    equipment_request_id?: string;
  } | null;

  if (data?.source === "equipment_request" && data.project_id) {
    const params = new URLSearchParams();
    if (data.equipment_request_id) {
      params.set("equipment_request", data.equipment_request_id);
    }
    const query = params.toString();
    return `/projects/${data.project_id}${query ? `?${query}` : ""}`;
  }

  if (notification.task?.project?.id) {
    const params = new URLSearchParams({ task: notification.task.id });
    return `/projects/${notification.task.project.id}?${params.toString()}`;
  }

  if (
    (data?.source === "calendar_event_assigned" ||
      data?.source === "calendar_event_reminder") &&
    data.calendar_event_id
  ) {
    const params = new URLSearchParams({ event: data.calendar_event_id });
    if (data.starts_at) params.set("date", data.starts_at.slice(0, 10));
    return `/calendar?${params.toString()}`;
  }

  if (data?.source?.startsWith("client_onboarding") && data.company_id) {
    return `/onboarding/${data.company_id}`;
  }

  if (data?.source === "space_share_request" && data.space_id) {
    return `/spaces/${data.space_id}`;
  }

  if (notification.type === "member_joined") {
    return "/team";
  }

  return null;
}
