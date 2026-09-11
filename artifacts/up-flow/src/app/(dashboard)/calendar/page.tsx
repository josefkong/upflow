"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import Header from "@/components/layout/header";
import { logError } from "@/lib/log-error";
import {
  Calendar as CalendarIcon,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cloud,
  DoorOpen,
  Plus,
  RefreshCw,
  Workflow,
} from "lucide-react";
import {
  appDateKey,
  cn,
  formatLongDate,
  formatTime,
  mergeAppDateAndTime,
} from "@/lib/utils";
import type { CalendarEvent } from "@/lib/types";
import ScheduleMeetingDialog from "@/components/dashboard/schedule-meeting-dialog";
import EventEditorSheet from "@/components/calendar/event-editor-sheet";
import GuidedCalendarCreateDialog from "@/components/calendar/guided-calendar-create-dialog";
import CalendarTimeGrid, {
  type CalendarTimelineItem,
} from "@/components/calendar/calendar-time-grid";
import GoogleCalendarIntegrationCard from "@/components/calendar/google-calendar-integration-card";
import { CreateActionButton } from "@/components/ui/create-action-button";
import { useLanguage } from "@/components/language-provider";
import { useAppUser } from "@/components/user-provider";
import {
  departmentColorTone,
  resolveUniqueDepartmentColors,
} from "@/lib/department-colors";
import {
  isMeetingRoomEvent,
  meetingRoomKeyFromLocation,
  meetingRoomNameFromLocation,
} from "@/lib/meeting-rooms";

const WEEKDAY_KEYS = [
  "time.day.mon",
  "time.day.tue",
  "time.day.wed",
  "time.day.thu",
  "time.day.fri",
  "time.day.sat",
  "time.day.sun",
];

function isSameDay(a: Date, b: Date) {
  return appDateKey(a) === appDateKey(b);
}

function dateKey(input: Date | string) {
  return appDateKey(input);
}

function dateFromQueryParam(value: string | null) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map((part) => Number(part));
  if (year && month && day) return new Date(year, month - 1, day);
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function startOfMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const dow = first.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  return new Date(year, month, 1 - offset);
}

function eventTime(event: CalendarEvent, language: "en" | "pt-BR") {
  return formatTime(event.starts_at, language);
}

const DEFAULT_EVENT_COLOR = "bg-primary/20 text-primary border-l-primary";
const COMPLETED_EVENT_COLOR =
  "bg-upflow-success/30 text-upflow-success border-l-upflow-success";
const DAY_CELL_VISIBLE_ITEM_LIMIT = 6;

type SelectableUser = {
  id: string;
  name: string | null;
  email: string;
  department_id?: string | null;
  department_name?: string | null;
  department_color?: string | null;
  department_sort_order?: number | null;
};

type CalendarDepartment = {
  id: string;
  name: string;
  color: string | null;
  sort_order: number | null;
};

type SharedGoogleAgendaEntry = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  is_private: boolean;
  user: SelectableUser & { avatar_url?: string | null };
};

type SharedAgendaResponse = {
  items: SharedGoogleAgendaEntry[];
  failed: boolean;
};

type CalendarSource = "all" | "upflow" | "google" | "room";
type AgendaScope = "me" | "all" | `department:${string}` | `user:${string}`;
type CalendarViewMode = "day" | "fourDays" | "week" | "month";

function addCalendarDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfCalendarWeek(date: Date) {
  const start = new Date(date);
  const weekDay = start.getDay();
  start.setDate(start.getDate() - (weekDay === 0 ? 6 : weekDay - 1));
  start.setHours(0, 0, 0, 0);
  return start;
}

function capitalizeCalendarLabel(value: string, language: "en" | "pt-BR") {
  return value
    ? `${value.charAt(0).toLocaleUpperCase(language)}${value.slice(1)}`
    : value;
}

function calendarRangeTitle(days: Date[], language: "en" | "pt-BR") {
  const first = days[0];
  const last = days.at(-1) ?? first;
  if (!first) return "";
  if (days.length === 1)
    return capitalizeCalendarLabel(formatLongDate(first, language), language);

  const startLabel = new Intl.DateTimeFormat(language, {
    day: "2-digit",
    month: "short",
  }).format(first);
  const endLabel = new Intl.DateTimeFormat(language, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(last);
  return capitalizeCalendarLabel(`${startLabel} – ${endLabel}`, language);
}

type SelectedScheduleItem =
  | { source: "upflow"; startsAt: string; event: CalendarEvent }
  | { source: "google"; startsAt: string; entry: SharedGoogleAgendaEntry };

function agendaEntryOccursOnDay(entry: SharedGoogleAgendaEntry, day: Date) {
  const startsAt = new Date(entry.starts_at);
  const endsAt = new Date(entry.ends_at);
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate());

  if (entry.all_day) {
    const entryStart = new Date(
      startsAt.getFullYear(),
      startsAt.getMonth(),
      startsAt.getDate(),
    );
    const entryEnd = new Date(
      endsAt.getFullYear(),
      endsAt.getMonth(),
      endsAt.getDate(),
    );
    return dayStart >= entryStart && dayStart < entryEnd;
  }

  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);
  return startsAt < dayEnd && endsAt > dayStart;
}

type ScheduleDefaults = {
  type: "meeting" | "reminder";
  title?: string;
  description?: string;
  taskId?: string | null;
  onboardingChecklistItemId?: string | null;
  projectId?: string | null;
  time?: string;
  attendeeIds?: string[];
};

function eventColor(event: CalendarEvent) {
  return event.color || DEFAULT_EVENT_COLOR;
}

function eventIsComplete(event: CalendarEvent) {
  return (
    event.color === COMPLETED_EVENT_COLOR ||
    event.color?.includes("upflow-success") ||
    false
  );
}

function eventHasEnded(event: CalendarEvent, now: Date) {
  if (!event.ends_at) return false;
  return new Date(event.ends_at).getTime() <= now.getTime();
}

function eventDisplayState(event: CalendarEvent, now: Date) {
  const cancelled =
    (event as CalendarEvent & { status?: string }).status === "cancelled";
  if (cancelled) {
    return {
      isComplete: false,
      isAutoComplete: false,
      isCancelled: true,
      color: "bg-muted/60 text-muted-foreground border-l-muted-foreground",
    };
  }
  const manuallyComplete = eventIsComplete(event);
  const automaticallyComplete = !manuallyComplete && eventHasEnded(event, now);
  const isComplete = manuallyComplete || automaticallyComplete;

  return {
    isComplete,
    isAutoComplete: automaticallyComplete,
    isCancelled: false,
    color: isComplete ? COMPLETED_EVENT_COLOR : eventColor(event),
  };
}

function eventUserIds(event: CalendarEvent) {
  return Array.from(
    new Set(
      [
        event.created_by,
        ...(event.attendees ?? []).map((attendee) => attendee.user_id),
      ].filter(Boolean),
    ),
  );
}

function isCalendarAppointment(event: CalendarEvent) {
  return event.type !== "task" && event.type !== "deadline";
}

export default function CalendarPage() {
  const { language, t } = useLanguage();
  const user = useAppUser();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [today, setToday] = useState(() => new Date());
  const [cursor, setCursor] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [sharedAgendaEntries, setSharedAgendaEntries] = useState<
    SharedGoogleAgendaEntry[]
  >([]);
  const [sharedAgendaUnavailable, setSharedAgendaUnavailable] = useState(false);
  const [loadedCalendarRange, setLoadedCalendarRange] = useState<string | null>(
    null,
  );
  const [failedCalendarRange, setFailedCalendarRange] = useState<string | null>(
    null,
  );
  const [selected, setSelected] = useState<Date>(today);
  const [showSchedule, setShowSchedule] = useState(false);
  const [manualCreateOpen, setManualCreateOpen] = useState(false);
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [scheduleType, setScheduleType] = useState<"meeting" | "reminder">(
    "meeting",
  );
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [people, setPeople] = useState<SelectableUser[]>([]);
  const [workspaceDepartments, setWorkspaceDepartments] = useState<
    CalendarDepartment[]
  >([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [agendaScope, setAgendaScope] = useState<AgendaScope>("me");
  const [sourceFilter, setSourceFilter] = useState<CalendarSource>("all");
  const selectedUserIds = useMemo(() => {
    if (agendaScope === "all") return new Set<string>();
    if (agendaScope === "me") return new Set(user?.id ? [user.id] : []);
    if (agendaScope.startsWith("user:"))
      return new Set([agendaScope.slice("user:".length)]);
    const departmentId = agendaScope.slice("department:".length);
    return new Set(
      people
        .filter((person) => person.department_id === departmentId)
        .map((person) => person.id),
    );
  }, [agendaScope, people, user?.id]);
  const [scheduleDefaults, setScheduleDefaults] =
    useState<ScheduleDefaults | null>(null);
  const calendarRequestIdRef = useRef(0);
  const calendarRequestControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const result = searchParams?.get("google_calendar");
    if (
      result !== "connected" &&
      result !== "error" &&
      result !== "official_origin_required" &&
      result !== "session_required"
    ) {
      return;
    }

    if (result === "connected") {
      toast.success(t("googleCalendar.connectedNotice"));
    } else if (result === "official_origin_required") {
      toast.error(t("googleCalendar.officialOriginRequired"));
    } else if (result === "session_required") {
      toast.error(t("googleCalendar.sessionRequired"));
    } else {
      toast.error(t("googleCalendar.connectFailed"));
    }

    const nextParams = new URLSearchParams(searchParams?.toString());
    nextParams.delete("google_calendar");
    const query = nextParams.toString();
    router.replace(query ? `/calendar?${query}` : "/calendar", {
      scroll: false,
    });
  }, [router, searchParams, t]);

  useEffect(() => {
    const linkedDate = dateFromQueryParam(searchParams?.get("date") ?? null);
    if (linkedDate) {
      setSelected(linkedDate);
      setCursor(new Date(linkedDate.getFullYear(), linkedDate.getMonth(), 1));
    }

    const create = searchParams?.get("create");
    if (create !== "meeting" && create !== "event" && create !== "reminder")
      return;

    const type = create === "meeting" ? "meeting" : "reminder";
    const openDate = linkedDate ?? new Date();
    setScheduleType(type);
    setScheduleDefaults({
      type,
      title: searchParams?.get("title") ?? undefined,
      description: searchParams?.get("description") ?? undefined,
      taskId: searchParams?.get("task"),
      onboardingChecklistItemId: searchParams?.get("onboarding_item"),
      projectId: searchParams?.get("project"),
      attendeeIds: (searchParams?.get("attendees") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      time: searchParams?.get("time") ?? "09:00",
    });
    setSelected(openDate);
    setCursor(new Date(openDate.getFullYear(), openDate.getMonth(), 1));
    setShowSchedule(true);
    router.replace("/calendar", { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    const refreshToday = () => setToday(new Date());
    const interval = window.setInterval(refreshToday, 60_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshToday();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const gridStart = startOfMonthGrid(year, month);
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridStart.getDate() + 42);
  const calendarRangeKey = `${appDateKey(gridStart)}:${appDateKey(gridEnd)}`;
  const calendarHasLoaded = loadedCalendarRange === calendarRangeKey;
  const calendarLoadError = failedCalendarRange === calendarRangeKey;
  const calendarIsLoading = !calendarHasLoaded && !calendarLoadError;

  const loadCalendar = () => {
    const requestId = ++calendarRequestIdRef.current;
    const rangeKey = calendarRangeKey;
    calendarRequestControllerRef.current?.abort();
    const controller = new AbortController();
    calendarRequestControllerRef.current = controller;
    setFailedCalendarRange((current) =>
      current === rangeKey ? null : current,
    );
    const from = mergeAppDateAndTime(gridStart, "00:00").toISOString();
    const to = mergeAppDateAndTime(gridEnd, "23:59").toISOString();
    const sharedAgendaRequest = fetch(
      `/api/calendar/shared-agenda?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            `Unable to load shared Google agenda: ${response.status}`,
          );
        const payload = (await response.json()) as {
          items?: SharedGoogleAgendaEntry[];
        };
        return {
          items: payload.items ?? [],
          failed: false,
        } satisfies SharedAgendaResponse;
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          logError("calendar:shared-agenda:load", error);
        return { items: [], failed: true } satisfies SharedAgendaResponse;
      });

    Promise.all([
      fetch(`/api/calendar/events?from=${from}&to=${to}`, {
        signal: controller.signal,
      }).then(async (response) => {
        if (!response.ok)
          throw new Error(`Unable to load calendar events: ${response.status}`);
        return response.json();
      }),
      sharedAgendaRequest,
    ])
      .then(([eventData, sharedAgendaData]) => {
        if (requestId !== calendarRequestIdRef.current) return;
        const eventList = (eventData.items ??
          eventData.events ??
          []) as CalendarEvent[];
        setEvents(eventList.filter(isCalendarAppointment));
        setSharedAgendaEntries(sharedAgendaData.items);
        setSharedAgendaUnavailable(sharedAgendaData.failed);
        setLoadedCalendarRange(rangeKey);
        setFailedCalendarRange(null);
      })
      .catch((err) => {
        if (
          requestId !== calendarRequestIdRef.current ||
          controller.signal.aborted
        )
          return;
        logError("calendar:load", err);
        setFailedCalendarRange(rangeKey);
      })
      .finally(() => {
        if (
          requestId === calendarRequestIdRef.current &&
          calendarRequestControllerRef.current === controller
        ) {
          calendarRequestControllerRef.current = null;
        }
      });
  };

  useEffect(() => {
    loadCalendar();
    return () => {
      calendarRequestControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  useEffect(() => {
    if (!user?.currentWorkspaceId) return;
    const controller = new AbortController();
    setPeopleLoading(true);
    Promise.all([
      fetch(
        `/api/users?workspace_id=${user.currentWorkspaceId}&status=active`,
        {
          signal: controller.signal,
        },
      ).then(async (res) => {
        if (!res.ok) return { items: [] as SelectableUser[] };
        return (await res.json()) as { items?: SelectableUser[] };
      }),
      fetch(`/api/workspaces/${user.currentWorkspaceId}/departments`, {
        signal: controller.signal,
      }).then(async (res) => {
        if (!res.ok) return { items: [] as CalendarDepartment[] };
        return (await res.json()) as { items?: CalendarDepartment[] };
      }),
    ])
      .then(([peopleData, departmentData]) => {
        setPeople(peopleData.items ?? []);
        setWorkspaceDepartments(departmentData.items ?? []);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          setPeople([]);
          setWorkspaceDepartments([]);
        }
      })
      .finally(() => setPeopleLoading(false));

    return () => controller.abort();
  }, [user?.currentWorkspaceId]);

  useEffect(() => {
    const linkedEventId = searchParams?.get("event");
    if (!linkedEventId) return;
    const linkedEvent = events.find((event) => event.id === linkedEventId);
    if (!linkedEvent) return;
    setSelected(new Date(linkedEvent.starts_at));
    setEditingEvent(linkedEvent);
  }, [events, searchParams]);

  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
  const timelineDays = useMemo(() => {
    if (viewMode === "day") return [new Date(selected)];
    const first =
      viewMode === "week" ? startOfCalendarWeek(selected) : new Date(selected);
    const count = viewMode === "week" ? 7 : 4;
    return Array.from({ length: count }, (_, index) =>
      addCalendarDays(first, index),
    );
  }, [selected, viewMode]);

  const departments = useMemo(() => {
    if (workspaceDepartments.length > 0) {
      return [...workspaceDepartments].sort((left, right) => {
        const order =
          (left.sort_order ?? Number.MAX_SAFE_INTEGER) -
          (right.sort_order ?? Number.MAX_SAFE_INTEGER);
        return order || left.name.localeCompare(right.name);
      });
    }

    const byId = new Map<string, CalendarDepartment>();
    people.forEach((person) => {
      if (!person.department_id || !person.department_name) return;
      byId.set(person.department_id, {
        id: person.department_id,
        name: person.department_name,
        color: person.department_color ?? null,
        sort_order: person.department_sort_order ?? null,
      });
    });
    return Array.from(byId.values()).sort((left, right) => {
      const order =
        (left.sort_order ?? Number.MAX_SAFE_INTEGER) -
        (right.sort_order ?? Number.MAX_SAFE_INTEGER);
      return order || left.name.localeCompare(right.name);
    });
  }, [people, workspaceDepartments]);

  const departmentColorById = useMemo(
    () => resolveUniqueDepartmentColors(departments),
    [departments],
  );

  const personById = useMemo(
    () => new Map(people.map((person) => [person.id, person])),
    [people],
  );

  const filteredEvents = useMemo(() => {
    const currentRangeEvents = calendarHasLoaded ? events : [];
    const sourceEvents =
      sourceFilter === "google"
        ? []
        : sourceFilter === "room"
          ? currentRangeEvents.filter(isMeetingRoomEvent)
          : currentRangeEvents;
    if (agendaScope === "all") return sourceEvents;
    return sourceEvents.filter((event) =>
      eventUserIds(event).some((id) => selectedUserIds.has(id)),
    );
  }, [agendaScope, calendarHasLoaded, events, selectedUserIds, sourceFilter]);

  const filteredSharedAgendaEntries = useMemo(() => {
    const currentRangeEntries = calendarHasLoaded ? sharedAgendaEntries : [];
    if (sourceFilter === "upflow" || sourceFilter === "room") return [];
    if (agendaScope === "all") return currentRangeEntries;
    return currentRangeEntries.filter((entry) =>
      selectedUserIds.has(entry.user.id),
    );
  }, [
    agendaScope,
    calendarHasLoaded,
    selectedUserIds,
    sharedAgendaEntries,
    sourceFilter,
  ]);

  const eventDepartmentTone = useCallback(
    (event: CalendarEvent) => {
      const ids = eventUserIds(event);
      const selectedMatch = ids.find((id) => selectedUserIds.has(id));
      const id = selectedMatch ?? ids[0];
      const departmentId = id ? personById.get(id)?.department_id : null;
      return departmentColorTone(
        departmentId ? departmentColorById.get(departmentId) : null,
      );
    },
    [departmentColorById, personById, selectedUserIds],
  );

  const sharedAgendaTone = useCallback(
    (entry: SharedGoogleAgendaEntry) => {
      const departmentId = personById.get(entry.user.id)?.department_id;
      return departmentColorTone(
        departmentId ? departmentColorById.get(departmentId) : null,
      );
    },
    [departmentColorById, personById],
  );

  const eventVisualClass = (
    event: CalendarEvent,
    display: ReturnType<typeof eventDisplayState>,
  ) => {
    if (display.isCancelled) return display.color;
    return eventDepartmentTone(event).event;
  };

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach((event) => {
      const key = dateKey(event.starts_at);
      map.set(key, [...(map.get(key) ?? []), event]);
    });
    return map;
  }, [filteredEvents]);

  const sharedAgendaByDay = useMemo(() => {
    const map = new Map<string, SharedGoogleAgendaEntry[]>();
    filteredSharedAgendaEntries.forEach((entry) => {
      const startsAt = new Date(entry.starts_at);
      const endsAt = new Date(entry.ends_at);
      const firstDay = new Date(
        startsAt.getFullYear(),
        startsAt.getMonth(),
        startsAt.getDate(),
      );
      const lastDay = new Date(
        endsAt.getFullYear(),
        endsAt.getMonth(),
        endsAt.getDate(),
      );

      for (let day = firstDay; day <= lastDay; day.setDate(day.getDate() + 1)) {
        if (!agendaEntryOccursOnDay(entry, day)) continue;
        const key = dateKey(day);
        map.set(key, [...(map.get(key) ?? []), entry]);
      }
    });
    return map;
  }, [filteredSharedAgendaEntries]);

  const timelineItems = useMemo<CalendarTimelineItem[]>(
    () => [
      ...filteredEvents.map((event) => {
        const display = eventDisplayState(event, today);
        return {
          id: event.id,
          startsAt: event.starts_at,
          endsAt: event.ends_at,
          allDay: false,
          title: event.title,
          source: "upflow" as const,
          sourceLabel: isMeetingRoomEvent(event)
            ? t("calendar.sourceRoom")
            : t("calendar.sourceUpflow"),
          colorRgb: eventDepartmentTone(event).rgb,
          complete: display.isComplete,
          cancelled: display.isCancelled,
        };
      }),
      ...filteredSharedAgendaEntries.map((entry) => ({
        id: entry.id,
        startsAt: entry.starts_at,
        endsAt: entry.ends_at,
        allDay: entry.all_day,
        title: entry.is_private ? t("calendar.sharedAgendaBusy") : entry.title,
        source: "google" as const,
        sourceLabel: t("calendar.sourceGoogle"),
        colorRgb: sharedAgendaTone(entry).rgb,
        readOnly: true,
      })),
    ],
    [
      eventDepartmentTone,
      filteredEvents,
      filteredSharedAgendaEntries,
      sharedAgendaTone,
      t,
      today,
    ],
  );

  const selectedKey = dateKey(selected);
  const selectedScheduleItems = useMemo<SelectedScheduleItem[]>(() => {
    const dayEvents = eventsByDay.get(selectedKey) ?? [];
    const daySharedAgendaEntries = sharedAgendaByDay.get(selectedKey) ?? [];
    return [
      ...dayEvents.map((event) => ({
        source: "upflow" as const,
        startsAt: event.starts_at,
        event,
      })),
      ...daySharedAgendaEntries.map((entry) => ({
        source: "google" as const,
        startsAt: entry.starts_at,
        entry,
      })),
    ].sort(
      (left, right) =>
        new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime(),
    );
  }, [eventsByDay, selectedKey, sharedAgendaByDay]);
  const selectedIsToday = isSameDay(selected, today);
  const formattedMonthTitle = new Intl.DateTimeFormat(language, {
    month: "long",
    year: "numeric",
  }).format(cursor);
  const monthTitle =
    viewMode === "month"
      ? capitalizeCalendarLabel(formattedMonthTitle, language)
      : calendarRangeTitle(timelineDays, language);
  const agendaDescription = useMemo(() => {
    if (agendaScope === "me") return t("calendar.myScheduleDescription");
    if (agendaScope === "all") return t("calendar.allSchedulesDescription");
    if (agendaScope.startsWith("department:")) {
      const department = departments.find(
        (item) => `department:${item.id}` === agendaScope,
      );
      return department
        ? t("calendar.departmentScheduleDescription", { name: department.name })
        : t("calendar.allSchedulesDescription");
    }
    const person = people.find((item) => `user:${item.id}` === agendaScope);
    return person
      ? t("calendar.memberScheduleDescription", {
          name: person.name || person.email,
        })
      : t("calendar.myScheduleDescription");
  }, [agendaScope, departments, people, t]);

  const navigateTimeline = (amount: number) => {
    const interval = viewMode === "week" ? 7 : viewMode === "fourDays" ? 4 : 1;
    const next = addCalendarDays(selected, amount * interval);
    setSelected(next);
    setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
  };
  const goPrev = () => {
    if (viewMode !== "month") {
      navigateTimeline(-1);
      return;
    }
    const next = new Date(year, month - 1, 1);
    setCursor(next);
    setSelected(next);
  };
  const goNext = () => {
    if (viewMode !== "month") {
      navigateTimeline(1);
      return;
    }
    const next = new Date(year, month + 1, 1);
    setCursor(next);
    setSelected(next);
  };
  const goToday = () => {
    const now = new Date();
    setToday(now);
    setCursor(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(now);
  };

  return (
    <>
      <Header title={t("calendar.title")} />
      <div className="grid grid-cols-1 gap-4 p-4 sm:gap-6 sm:p-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <details
          className="group min-w-0 xl:col-span-2"
          data-testid="calendar-source-settings"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-left transition hover:bg-accent dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06] [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                <Cloud className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-foreground">
                  {t("calendar.sources")}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t("calendar.sourcesDescription")}
                </span>
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
          </summary>
          <GoogleCalendarIntegrationCard className="mt-3" />
        </details>

        <section
          className="min-w-0 rounded-2xl p-4 glass sm:p-5"
          data-testid="unified-calendar"
        >
          <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
                {t("calendar.unifiedSchedule")}
              </p>
              <h3 className="mt-1 text-lg font-semibold text-foreground">
                {monthTitle}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("calendar.unifiedScheduleDescription")}
              </p>
            </div>
            <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap sm:pt-1">
              <label
                className="relative shrink-0"
                data-testid="calendar-view-selector"
              >
                <span className="sr-only">{t("calendar.viewMode")}</span>
                <select
                  value={viewMode}
                  onChange={(event) =>
                    setViewMode(event.target.value as CalendarViewMode)
                  }
                  className="h-9 appearance-none rounded-xl border border-border bg-muted/35 py-0 pl-3 pr-8 text-xs font-semibold text-foreground outline-none transition hover:bg-accent focus:border-primary/50 focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/[0.04]"
                >
                  <option value="day">{t("calendar.viewDay")}</option>
                  <option value="fourDays">{t("calendar.viewFourDays")}</option>
                  <option value="week">{t("calendar.viewWeek")}</option>
                  <option value="month">{t("calendar.viewMonth")}</option>
                </select>
                <ChevronDown className="upflow-select-chevron pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </label>
              <div
                className="shrink-0"
                data-testid="calendar-create-control"
              >
                <CreateActionButton
                  onClick={() => setManualCreateOpen(true)}
                  aria-haspopup="dialog"
                  aria-label={t("calendar.quickCreate")}
                  title={t("calendar.quickCreate")}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{t("calendar.quickCreateShort")}</span>
                </CreateActionButton>
              </div>
              <div
                data-testid="calendar-date-navigation"
                className="inline-flex shrink-0 items-center gap-1"
              >
                <button
                  onClick={goToday}
                  className="h-9 rounded-xl bg-muted/50 px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted dark:bg-white/5 dark:hover:bg-white/10"
                >
                  {t("calendar.today")}
                </button>
                <button
                  onClick={goPrev}
                  aria-label={t("calendar.previousPeriod")}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground dark:hover:bg-white/5"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={goNext}
                  aria-label={t("calendar.nextPeriod")}
                  className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground dark:hover:bg-white/5"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {calendarLoadError && (
            <div
              role="alert"
              className="mb-4 flex flex-col gap-3 rounded-xl border border-upflow-warning/40 bg-upflow-warning/10 px-3 py-3 text-xs text-foreground sm:flex-row sm:items-center sm:justify-between"
            >
              <p>
                {calendarHasLoaded
                  ? t("calendar.loadUnavailableStale")
                  : t("calendar.loadUnavailable")}
              </p>
              <button
                type="button"
                onClick={() => loadCalendar()}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-upflow-warning/40 bg-background/70 px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-background"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t("calendar.retryLoad")}
              </button>
            </div>
          )}

          {calendarIsLoading && (
            <p
              id="calendar-loading-status"
              role="status"
              className="mb-4 text-xs text-muted-foreground"
            >
              {t("calendar.loadingSchedule")}
            </p>
          )}

          <div className="mb-4 rounded-xl border border-border bg-muted/30 px-3 py-3 dark:border-white/10 dark:bg-white/[0.15]">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-foreground">
                  {t("calendar.sourceFilter")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {t("calendar.sourceFilterDescription")}
                </p>
              </div>
              <div
                data-testid="calendar-source-tabs"
                role="group"
                aria-label={t("calendar.sourceFilter")}
                className="grid min-h-11 w-full shrink-0 grid-cols-4 gap-1 rounded-lg border border-border bg-background/70 p-1 dark:border-white/10 dark:bg-[#080d1b] xl:w-[30rem]"
              >
                {(
                  [
                    {
                      value: "all" as const,
                      label: t("calendar.sourceAll"),
                      Icon: CalendarDays,
                    },
                    {
                      value: "upflow" as const,
                      label: t("calendar.sourceUpflow"),
                      Icon: Workflow,
                    },
                    {
                      value: "google" as const,
                      label: t("calendar.sourceGoogle"),
                      Icon: Cloud,
                    },
                    {
                      value: "room" as const,
                      label: t("calendar.sourceRoom"),
                      Icon: DoorOpen,
                    },
                  ] as const
                ).map(({ value, label, Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSourceFilter(value)}
                    aria-pressed={sourceFilter === value}
                    className={cn(
                      "inline-flex h-9 min-w-0 items-center justify-center gap-2 rounded-md px-2 text-xs font-medium transition sm:px-2.5",
                      sourceFilter === value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground dark:hover:bg-white/10",
                    )}
                  >
                    <Icon
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 stroke-[1.75]"
                    />
                    <span className="whitespace-nowrap">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 flex flex-col gap-3 border-t border-border/70 pt-3 xl:flex-row xl:items-center xl:justify-between dark:border-white/10">
              <div>
                <p className="text-xs font-semibold text-foreground">
                  {t("calendar.peopleFilter")}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {agendaDescription}
                </p>
              </div>
              <label className="relative min-w-[220px]">
                <span className="sr-only">{t("calendar.peopleFilter")}</span>
                <select
                  value={agendaScope}
                  onChange={(event) =>
                    setAgendaScope(event.target.value as AgendaScope)
                  }
                  disabled={peopleLoading}
                  className="h-10 w-full rounded-xl border border-border bg-background px-3 pr-9 text-xs font-medium text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50 dark:border-white/10 dark:bg-[#080d1b]"
                >
                  <option value="me">
                    {peopleLoading
                      ? t("common.loading")
                      : t("calendar.mySchedule")}
                  </option>
                  {departments.length > 0 && (
                    <optgroup label={t("calendar.departmentGroup")}>
                      {departments.map((department) => (
                        <option
                          key={department.id}
                          value={`department:${department.id}`}
                        >
                          {t("calendar.departmentSchedule", {
                            name: department.name,
                          })}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label={t("calendar.peopleGroup")}>
                    {people.map((person) => (
                      <option key={person.id} value={`user:${person.id}`}>
                        {person.name || person.email}
                      </option>
                    ))}
                  </optgroup>
                  <option value="all">{t("calendar.allSchedules")}</option>
                </select>
              </label>
            </div>
            {!peopleLoading && people.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("calendar.noUsersToFilter")}
              </p>
            )}
            {sharedAgendaUnavailable &&
              sourceFilter !== "upflow" &&
              sourceFilter !== "room" &&
              !calendarIsLoading && (
                <p role="alert" className="mt-2 text-xs text-upflow-warning">
                  {t("calendar.sharedAgendaUnavailable")}
                </p>
              )}
          </div>

          {viewMode === "month" ? (
            <>
              <div className="mb-1 grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {WEEKDAY_KEYS.map((dayKey) => (
                  <div key={dayKey} className="py-1 text-center">
                    {t(dayKey)}
                  </div>
                ))}
              </div>

              <div
                aria-busy={calendarIsLoading}
                aria-describedby={
                  calendarIsLoading ? "calendar-loading-status" : undefined
                }
                className="grid min-w-0 grid-cols-7 gap-1"
              >
                {days.map((day) => {
                  const inMonth = day.getMonth() === month;
                  const isToday = isSameDay(day, today);
                  const isSelected = isSameDay(day, selected);
                  const key = dateKey(day);
                  const dayEvents = eventsByDay.get(key) ?? [];
                  const daySharedAgendaEntries =
                    sharedAgendaByDay.get(key) ?? [];
                  const totalDayItems =
                    dayEvents.length + daySharedAgendaEntries.length;
                  const needsMoreIndicator =
                    totalDayItems > DAY_CELL_VISIBLE_ITEM_LIMIT;
                  const visibleItemSlots = needsMoreIndicator
                    ? DAY_CELL_VISIBLE_ITEM_LIMIT - 1
                    : DAY_CELL_VISIBLE_ITEM_LIMIT;
                  const visibleDayEvents = dayEvents.slice(0, visibleItemSlots);
                  const visibleDaySharedAgendaEntries =
                    daySharedAgendaEntries.slice(
                      0,
                      Math.max(visibleItemSlots - visibleDayEvents.length, 0),
                    );
                  const hiddenDayItems =
                    totalDayItems -
                    visibleDayEvents.length -
                    visibleDaySharedAgendaEntries.length;
                  return (
                    <button
                      key={key}
                      onClick={() => setSelected(day)}
                      className={cn(
                        "flex h-24 min-h-24 flex-col items-start overflow-hidden rounded-lg border p-1 text-left transition-colors sm:h-32 sm:min-h-32 sm:p-1.5 xl:h-36 xl:min-h-36",
                        isSelected
                          ? "border-primary/60 bg-primary/10"
                          : "border-transparent hover:bg-accent dark:hover:bg-white/5",
                        !inMonth && "opacity-40",
                      )}
                    >
                      <span
                        className={cn(
                          "shrink-0 text-xs font-medium",
                          isToday
                            ? "w-5 h-5 flex items-center justify-center rounded-full bg-primary text-primary-foreground"
                            : "text-foreground",
                        )}
                      >
                        {day.getDate()}
                      </span>
                      <div
                        className="mt-1 hidden w-full space-y-0.5 overflow-hidden sm:block"
                        data-calendar-day-items
                      >
                        {visibleDayEvents.map((event) => {
                          const display = eventDisplayState(event, today);
                          const isRoomBooking = isMeetingRoomEvent(event);

                          return (
                            <div
                              key={event.id}
                              title={`${eventTime(event, language)} ${event.title}${isRoomBooking ? ` - ${t("calendar.roomBooking")}` : ""}${display.isAutoComplete ? ` - ${t("calendar.autoCompleted")}` : ""}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected(day);
                                setEditingEvent(event);
                              }}
                              className={cn(
                                "min-h-[15px] cursor-pointer truncate rounded border-l-2 px-1 py-0.5 text-[9px] leading-none",
                                display.isCancelled &&
                                  "opacity-60 line-through",
                                eventVisualClass(event, display),
                              )}
                            >
                              {display.isComplete && (
                                <Check className="mr-0.5 inline h-2.5 w-2.5" />
                              )}
                              {isRoomBooking && !display.isComplete && (
                                <DoorOpen className="mr-0.5 inline h-2.5 w-2.5" />
                              )}
                              {eventTime(event, language)} {event.title}
                            </div>
                          );
                        })}
                        {visibleDaySharedAgendaEntries.map((entry) => {
                          const tone = sharedAgendaTone(entry);
                          return (
                            <div
                              key={entry.id}
                              title={`${entry.all_day ? t("calendar.sharedAgendaAllDay") : formatTime(entry.starts_at, language)} ${entry.is_private ? t("calendar.sharedAgendaBusy") : entry.title}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelected(day);
                              }}
                              className={cn(
                                "min-h-[15px] truncate rounded border-l-2 px-1 py-0.5 text-[9px] leading-none",
                                tone.event,
                              )}
                            >
                              <Cloud className="mr-0.5 inline h-2.5 w-2.5" />
                              {entry.all_day
                                ? t("calendar.sharedAgendaAllDay")
                                : formatTime(entry.starts_at, language)}{" "}
                              {entry.is_private
                                ? t("calendar.sharedAgendaBusy")
                                : entry.title}
                            </div>
                          );
                        })}
                        {hiddenDayItems > 0 && (
                          <div className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium leading-none text-muted-foreground dark:bg-white/5">
                            {t("calendar.more", { count: hiddenDayItems })}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <CalendarTimeGrid
              days={timelineDays}
              items={timelineItems}
              language={language}
              today={today}
              allDayLabel={t("calendar.allDay")}
              emptyLabel={t("calendar.noSchedule")}
              onSelectDay={(day) => {
                setSelected(day);
                setCursor(new Date(day.getFullYear(), day.getMonth(), 1));
              }}
              onOpenItem={(item) => {
                const itemDate = new Date(item.startsAt);
                setSelected(itemDate);
                setCursor(
                  new Date(itemDate.getFullYear(), itemDate.getMonth(), 1),
                );
                if (item.source === "upflow") {
                  const event = events.find(
                    (candidate) => candidate.id === item.id,
                  );
                  if (event) setEditingEvent(event);
                }
              }}
            />
          )}
        </section>

        <aside className="min-w-0 space-y-4">
          <div className="rounded-2xl p-3 glass sm:p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {selectedIsToday ? t("calendar.today") : t("common.selected")}
                </p>
                <h3 className="mt-0.5 text-base font-semibold leading-snug text-foreground">
                  {formatLongDate(selected, language)}
                </h3>
              </div>
            </div>

            <div className="mt-3">
              <p className="mb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {t("calendar.daySchedule")}
              </p>
              {calendarIsLoading ? (
                <p className="text-xs text-muted-foreground">
                  {t("common.loading")}
                </p>
              ) : selectedScheduleItems.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-4 text-center dark:border-white/5 dark:bg-white/[0.15]">
                  <p className="text-xs text-muted-foreground">
                    {t("calendar.noSchedule")}
                  </p>
                </div>
              ) : (
                <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
                  {selectedScheduleItems.map((item) => {
                    if (item.source === "google") {
                      const { entry } = item;
                      return (
                        <li
                          key={`google-${entry.id}`}
                          title={t("calendar.googleReadOnly")}
                          className="flex items-start gap-2 rounded-lg border border-primary/15 bg-primary/5 px-2.5 py-2"
                        >
                          <Cloud className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                          <div className="min-w-0 flex-1">
                            <p
                              data-testid="selected-day-event-title"
                              className="break-words text-sm font-semibold leading-snug text-foreground"
                            >
                              {entry.is_private
                                ? t("calendar.sharedAgendaBusy")
                                : entry.title}
                            </p>
                            <div
                              data-testid="selected-day-event-meta"
                              className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"
                            >
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                <Clock
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                                {entry.all_day
                                  ? t("calendar.sharedAgendaAllDay")
                                  : formatTime(entry.starts_at, language)}
                              </span>
                              <span className="shrink-0 rounded-full border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[9px] font-semibold text-primary">
                                {t("calendar.sourceGoogle")}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 break-words text-[10px] text-muted-foreground">
                              {entry.user.name || entry.user.email}
                            </p>
                          </div>
                        </li>
                      );
                    }

                    const { event } = item;
                    const display = eventDisplayState(event, today);
                    const tone = eventDepartmentTone(event);
                    const isRoomBooking = isMeetingRoomEvent(event);

                    return (
                      <li
                        key={event.id}
                        title={
                          display.isAutoComplete
                            ? t("calendar.autoCompleted")
                            : undefined
                        }
                        onClick={() => setEditingEvent(event)}
                        className={cn(
                          "group flex cursor-pointer items-start gap-2 rounded-lg border-l-2 px-2.5 py-2 transition-colors hover:bg-accent dark:hover:bg-white/5",
                          eventVisualClass(event, display),
                          display.isCancelled && "opacity-60 line-through",
                        )}
                      >
                        {isRoomBooking ? (
                          <DoorOpen className="mt-0.5 h-4 w-4 shrink-0" />
                        ) : (
                          <span
                            className={cn(
                              "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                              tone.dot,
                            )}
                          />
                        )}
                        <div className="min-w-0 flex-1 text-left">
                          <p
                            data-testid="selected-day-event-title"
                            className="break-words text-sm font-semibold leading-snug text-foreground"
                          >
                            {display.isComplete && (
                              <Check className="mr-1 inline h-3.5 w-3.5 text-upflow-success" />
                            )}
                            {event.title}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <div
                              data-testid="selected-day-event-meta"
                              className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"
                            >
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                                <Clock
                                  aria-hidden="true"
                                  className="h-3.5 w-3.5"
                                />
                                {eventTime(event, language)}
                              </span>
                              {isRoomBooking && (
                                <span className="shrink-0 rounded-full border border-cyan-300/25 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-cyan-100">
                                  {t("calendar.roomBooking")}
                                </span>
                              )}
                              {!isRoomBooking && (
                                <span className="shrink-0 rounded-full border border-border bg-muted/30 px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground dark:border-white/10 dark:bg-white/5">
                                  {t("calendar.sourceUpflow")}
                                </span>
                              )}
                            </div>
                          </div>
                          {(event.location ||
                            event.meeting_url ||
                            event.description ||
                            display.isAutoComplete) && (
                            <p className="mt-1 line-clamp-2 break-words text-[10px] text-muted-foreground">
                              {isRoomBooking
                                ? meetingRoomKeyFromLocation(event.location)
                                  ? meetingRoomNameFromLocation(event.location)
                                  : t("meetingRoom.unspecifiedRoom")
                                : event.location ||
                                  event.meeting_url ||
                                  event.description ||
                                  t("calendar.autoCompleted")}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="rounded-2xl p-4 glass sm:p-5">
            <div className="flex items-center gap-2 mb-2">
              <CalendarIcon className="w-4 h-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {t("calendar.legendDepartments")}
              </p>
            </div>
            <ul className="text-xs space-y-1.5">
              {departments.map((department) => {
                const tone = departmentColorTone(
                  departmentColorById.get(department.id),
                );

                return (
                  <li key={department.id} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: `rgb(${tone.rgb})` }}
                    />
                    {department.name}
                  </li>
                );
              })}
              <li className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{
                    backgroundColor: `rgb(${departmentColorTone(null).rgb})`,
                  }}
                />
                {t("calendar.legendNoDepartment")}
              </li>
            </ul>
            <div className="mt-4 border-t border-border/60 pt-3 dark:border-white/5">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {t("calendar.legendSources")}
              </p>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <Cloud className="h-3.5 w-3.5" />
                  {t("calendar.sourceGoogle")}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <DoorOpen className="h-3.5 w-3.5" />
                  {t("calendar.sourceRoom")}
                </span>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <ScheduleMeetingDialog
        open={showSchedule}
        onClose={() => {
          setShowSchedule(false);
          setScheduleDefaults(null);
        }}
        initialDate={selected}
        initialTime={scheduleDefaults?.time ?? "09:00"}
        title={
          (scheduleDefaults?.type ?? scheduleType) === "meeting"
            ? t("calendar.quickMeeting")
            : t("calendar.quickEvent")
        }
        defaultType={scheduleDefaults?.type ?? scheduleType}
        defaultTitle={scheduleDefaults?.title}
        defaultDescription={scheduleDefaults?.description}
        defaultTaskId={scheduleDefaults?.taskId ?? null}
        defaultOnboardingChecklistItemId={
          scheduleDefaults?.onboardingChecklistItemId ?? null
        }
        defaultProjectId={scheduleDefaults?.projectId ?? null}
        defaultAttendeeIds={scheduleDefaults?.attendeeIds ?? []}
        onScheduled={(event) => {
          setEvents((prev) =>
            [...prev, event].sort(
              (a, b) =>
                new Date(a.starts_at).getTime() -
                new Date(b.starts_at).getTime(),
            ),
          );
          setSelected(new Date(event.starts_at));
          setScheduleDefaults(null);
          loadCalendar();
        }}
      />

      <GuidedCalendarCreateDialog
        open={manualCreateOpen}
        onClose={() => setManualCreateOpen(false)}
        initialDate={selected}
        people={people}
        peopleLoading={peopleLoading}
        creatorUserId={user?.id}
        onScheduled={(event) => {
          setEvents((previous) =>
            [...previous, event].sort(
              (left, right) =>
                new Date(left.starts_at).getTime() -
                new Date(right.starts_at).getTime(),
            ),
          );
          setSelected(new Date(event.starts_at));
          loadCalendar();
        }}
      />

      {editingEvent && (
        <EventEditorSheet
          event={editingEvent}
          onClose={() => setEditingEvent(null)}
        />
      )}
    </>
  );
}
