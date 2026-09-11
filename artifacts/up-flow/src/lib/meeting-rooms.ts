import type { CalendarEvent } from "@/lib/types";

export type MeetingRoomKey = "b2b" | "b2c";

export const MEETING_ROOM_OPTIONS = [
  {
    key: "b2b" as const,
    name: "Sala B2B",
    location: "Sala B2B",
    color: "bg-cyan-400/20 text-cyan-100 border-l-cyan-400",
  },
  {
    key: "b2c" as const,
    name: "Sala B2C",
    location: "Sala B2C",
    color: "bg-violet-400/20 text-violet-100 border-l-violet-400",
  },
] as const;

export const LEGACY_MEETING_ROOM_NAME = "Sala a definir";
export const DEFAULT_MEETING_ROOM_DURATION_MINUTES = 60;
export const FALLBACK_EVENT_DURATION_MINUTES = 30;

function normalizeMeetingRoomText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function meetingRoomByKey(key: MeetingRoomKey) {
  return MEETING_ROOM_OPTIONS.find((room) => room.key === key)!;
}

export function meetingRoomKeyFromLocation(
  location: string | null | undefined,
): MeetingRoomKey | null {
  const normalized = normalizeMeetingRoomText(location);
  if (normalized.includes("sala b2b") || normalized.includes("meeting room b2b")) {
    return "b2b";
  }
  if (normalized.includes("sala b2c") || normalized.includes("meeting room b2c")) {
    return "b2c";
  }
  return null;
}

export function isLegacyMeetingRoomLocation(
  location: string | null | undefined,
) {
  const normalized = normalizeMeetingRoomText(location);
  return (
    !meetingRoomKeyFromLocation(location) &&
    (normalized.includes("sala de reuniao") ||
      normalized.includes("meeting room"))
  );
}

export function isMeetingRoomEvent(
  event: Pick<CalendarEvent, "type" | "location">,
) {
  return (
    event.type === "meeting" &&
    (Boolean(meetingRoomKeyFromLocation(event.location)) ||
      isLegacyMeetingRoomLocation(event.location))
  );
}

export function meetingRoomNameFromLocation(
  location: string | null | undefined,
) {
  const key = meetingRoomKeyFromLocation(location);
  return key ? meetingRoomByKey(key).name : LEGACY_MEETING_ROOM_NAME;
}

export function meetingRoomColorFromLocation(
  location: string | null | undefined,
) {
  const key = meetingRoomKeyFromLocation(location);
  return key ? meetingRoomByKey(key).color : null;
}
