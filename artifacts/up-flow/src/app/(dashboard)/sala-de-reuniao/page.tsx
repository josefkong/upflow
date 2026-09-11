"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  DoorOpen,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  Video,
} from "lucide-react";
import Header from "@/components/layout/header";
import ScheduleMeetingDialog from "@/components/dashboard/schedule-meeting-dialog";
import { CreateActionButton } from "@/components/ui/create-action-button";
import { useLanguage } from "@/components/language-provider";
import { useAppUser } from "@/components/user-provider";
import { appDateKey, cn, formatLongDate, formatTime, mergeAppDateAndTime } from "@/lib/utils";
import { logError } from "@/lib/log-error";
import type { CalendarEvent } from "@/lib/types";
import {
  MEETING_ROOM_OPTIONS,
  isMeetingRoomEvent,
  meetingRoomKeyFromLocation,
  meetingRoomNameFromLocation,
  type MeetingRoomKey,
} from "@/lib/meeting-rooms";

const DEFAULT_SLOT_MINUTES = 30;
const DAY_CELL_VISIBLE_ITEM_LIMIT = 8;
const WEEKDAY_KEYS = [
  "time.day.mon",
  "time.day.tue",
  "time.day.wed",
  "time.day.thu",
  "time.day.fri",
  "time.day.sat",
  "time.day.sun",
];

type RoomCalendarEvent = CalendarEvent & {
  creator?: { id: string; name: string | null; email: string } | null;
};

type SelectableUser = {
  id: string;
  name: string | null;
  email: string;
};

function dateKey(input: Date | string) {
  return appDateKey(input);
}

function startOfMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const dow = first.getDay();
  const offset = dow === 0 ? 6 : dow - 1;
  return new Date(year, month, 1 - offset);
}

function eventEnd(event: RoomCalendarEvent) {
  const start = new Date(event.starts_at);
  if (event.ends_at) return new Date(event.ends_at);
  return new Date(start.getTime() + DEFAULT_SLOT_MINUTES * 60 * 1000);
}

function hasOverlap(a: RoomCalendarEvent, b: RoomCalendarEvent) {
  const aStart = new Date(a.starts_at).getTime();
  const aEnd = eventEnd(a).getTime();
  const bStart = new Date(b.starts_at).getTime();
  const bEnd = eventEnd(b).getTime();
  return aStart < bEnd && bStart < aEnd;
}

function conflictIds(events: RoomCalendarEvent[]) {
  const ids = new Set<string>();
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      if (dateKey(events[i].starts_at) !== dateKey(events[j].starts_at)) continue;
      const firstRoom = meetingRoomKeyFromLocation(events[i].location) ?? "legacy";
      const secondRoom = meetingRoomKeyFromLocation(events[j].location) ?? "legacy";
      if (firstRoom !== secondRoom) continue;
      if (!hasOverlap(events[i], events[j])) continue;
      ids.add(events[i].id);
      ids.add(events[j].id);
    }
  }
  return ids;
}

function personName(person: { name: string | null; email: string } | null | undefined, fallback: string) {
  return person?.name || person?.email || fallback;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function eventPeople(event: RoomCalendarEvent, fallback: string) {
  const names = [
    personName(event.creator, fallback),
    ...(event.attendees ?? []).map((attendee) => personName(attendee.user, fallback)),
  ];
  return Array.from(new Set(names.filter(Boolean)));
}

function eventUserIds(event: RoomCalendarEvent) {
  return Array.from(
    new Set([
      event.created_by,
      ...(event.attendees ?? []).map((attendee) => attendee.user_id),
    ]),
  );
}

function eventRange(event: RoomCalendarEvent, language: "en" | "pt-BR") {
  return `${formatTime(event.starts_at, language)} - ${formatTime(eventEnd(event), language)}`;
}

export default function MeetingRoomPage() {
  const { language, t } = useLanguage();
  const user = useAppUser();
  const [today, setToday] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(today);
  const [events, setEvents] = useState<RoomCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState<SelectableUser[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRoomKey, setSelectedRoomKey] = useState<MeetingRoomKey | "legacy" | "">("");
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleRoomKey, setScheduleRoomKey] = useState<MeetingRoomKey>("b2b");

  useEffect(() => {
    const interval = window.setInterval(() => setToday(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const gridStart = useMemo(() => startOfMonthGrid(year, month), [month, year]);
  const gridEnd = useMemo(() => {
    const end = new Date(gridStart);
    end.setDate(gridStart.getDate() + 42);
    return end;
  }, [gridStart]);

  const loadRoomCalendar = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setLoading(true);
      try {
        const from = mergeAppDateAndTime(gridStart, "00:00").toISOString();
        const to = mergeAppDateAndTime(gridEnd, "23:59").toISOString();
        const res = await fetch(`/api/calendar/events?from=${from}&to=${to}`);
        if (!res.ok) throw new Error("Failed to load meeting room calendar");
        const data = (await res.json()) as { items?: RoomCalendarEvent[]; events?: RoomCalendarEvent[] };
        const roomEvents = (data.items ?? data.events ?? [])
          .filter(isMeetingRoomEvent)
          .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
        setEvents(roomEvents);
      } catch (err) {
        logError("meeting-room:load", err);
        toast.error(t("meetingRoom.loadFailed"));
      } finally {
        if (!options?.silent) setLoading(false);
      }
    },
    [gridEnd, gridStart, t],
  );

  useEffect(() => {
    void loadRoomCalendar();
  }, [loadRoomCalendar]);

  useEffect(() => {
    if (!user?.currentWorkspaceId) return;
    const controller = new AbortController();
    setPeopleLoading(true);
    fetch(`/api/users?workspace_id=${user.currentWorkspaceId}&status=active`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) return { items: [] };
        return (await res.json()) as { items?: SelectableUser[] };
      })
      .then((data) => setPeople(data.items ?? []))
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          logError("meeting-room:people", err);
          setPeople([]);
        }
      })
      .finally(() => setPeopleLoading(false));

    return () => controller.abort();
  }, [user?.currentWorkspaceId]);

  const days = useMemo(() => {
    return Array.from({ length: 42 }, (_, i) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + i);
      return day;
    });
  }, [gridStart]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (selectedUserId && !eventUserIds(event).includes(selectedUserId)) {
        return false;
      }
      if (!selectedRoomKey) return true;
      const roomKey = meetingRoomKeyFromLocation(event.location);
      return selectedRoomKey === "legacy"
        ? roomKey === null
        : roomKey === selectedRoomKey;
    });
  }, [events, selectedRoomKey, selectedUserId]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, RoomCalendarEvent[]>();
    filteredEvents.forEach((event) => {
      const key = dateKey(event.starts_at);
      map.set(key, [...(map.get(key) ?? []), event]);
    });
    return map;
  }, [filteredEvents]);

  const selectedKey = dateKey(selected);
  const todayKey = dateKey(today);
  const selectedEvents = eventsByDay.get(selectedKey) ?? [];
  const todaysEvents = eventsByDay.get(todayKey) ?? [];
  const conflicts = useMemo(() => conflictIds(filteredEvents), [filteredEvents]);
  const upcomingEvents = useMemo(
    () => filteredEvents.filter((event) => eventEnd(event).getTime() >= today.getTime()),
    [filteredEvents, today],
  );
  const nextEvent = upcomingEvents[0] ?? null;
  const roomAvailability = useMemo(
    () =>
      MEETING_ROOM_OPTIONS.map((room) => {
        const roomEvents = events
          .filter(
            (event) =>
              meetingRoomKeyFromLocation(event.location) === room.key &&
              event.status !== "cancelled",
          )
          .sort(
            (a, b) =>
              new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
          );
        const active = roomEvents.find(
          (event) =>
            new Date(event.starts_at).getTime() <= today.getTime() &&
            eventEnd(event).getTime() > today.getTime(),
        );
        const next = roomEvents.find(
          (event) => new Date(event.starts_at).getTime() > today.getTime(),
        );
        return { room, active, next };
      }),
    [events, today],
  );
  const formattedMonthTitle = new Intl.DateTimeFormat(language, {
    month: "long",
    year: "numeric",
  }).format(cursor);
  const monthTitle = formattedMonthTitle
    ? `${formattedMonthTitle.charAt(0).toLocaleUpperCase(language)}${formattedMonthTitle.slice(1)}`
    : formattedMonthTitle;
  const selectedPerson = useMemo(
    () => people.find((person) => person.id === selectedUserId) ?? null,
    [people, selectedUserId],
  );

  const goPrev = () => {
    const next = new Date(year, month - 1, 1);
    setCursor(next);
    setSelected(next);
  };
  const goNext = () => {
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

  const openSchedule = (roomKey?: MeetingRoomKey) => {
    if (roomKey) setScheduleRoomKey(roomKey);
    setShowSchedule(true);
  };

  const handleScheduled = (event: CalendarEvent) => {
    const roomEvent = event as RoomCalendarEvent;
    if (isMeetingRoomEvent(roomEvent)) {
      setEvents((prev) =>
        [...prev, roomEvent].sort(
          (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
        ),
      );
    }
    setSelected(new Date(event.starts_at));
    void loadRoomCalendar({ silent: true });
  };

  const handleDelete = async (event: RoomCalendarEvent) => {
    if (!confirm(t("calendar.deleteConfirm", { title: event.title }))) return;
    try {
      const res = await fetch(`/api/calendar/events/${event.id}`, { method: "DELETE" });
      if (res.status === 403) {
        toast.error(t("calendar.noPermission"));
        return;
      }
      if (!res.ok) throw new Error("Failed to delete room booking");
      setEvents((prev) => prev.filter((item) => item.id !== event.id));
      toast.success(t("calendar.eventDeleted"));
      void loadRoomCalendar({ silent: true });
    } catch (err) {
      logError("meeting-room:delete", err);
      toast.error(t("calendar.couldNotDelete"));
    }
  };

  return (
    <>
      <Header title={t("meetingRoom.title")} />
      <main className="space-y-4 p-4 sm:space-y-6 sm:p-6">
        <section className="overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-lg dark:border-blue-300/[0.15] dark:bg-[#070c1a]/[0.88] dark:shadow-[0_24px_70px_rgba(0,0,0,0.22)] sm:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-blue-700/75 dark:text-blue-200/60">
                {t("meetingRoom.eyebrow")}
              </p>
              <h1 className="mt-3 text-3xl font-bold tracking-normal text-foreground sm:text-4xl">
                {t("meetingRoom.title")}
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                {t("meetingRoom.subtitle")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void loadRoomCalendar()}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:bg-accent dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
              >
                <RefreshCw className="h-4 w-4" />
                {t("common.refresh")}
              </button>
              <CreateActionButton
                onClick={() => openSchedule()}
              >
                <Plus className="h-4 w-4" />
                {t("meetingRoom.reserveRoom")}
              </CreateActionButton>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-foreground">
                  {t("meetingRoom.roomsNow")}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t("meetingRoom.roomsNowHint")}
                </p>
              </div>
              <span className="text-[11px] text-muted-foreground">
                {formatTime(today, language)}
              </span>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {roomAvailability.map(({ room, active, next }) => (
                <div
                  key={room.key}
                  className={cn(
                    "rounded-2xl border p-4",
                    room.key === "b2b"
                      ? "border-cyan-400/25 bg-cyan-400/[0.07]"
                      : "border-violet-400/25 bg-violet-400/[0.07]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                          room.key === "b2b"
                            ? "bg-cyan-400/15 text-cyan-300"
                            : "bg-violet-400/15 text-violet-300",
                        )}
                      >
                        <DoorOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-foreground">
                          {room.name}
                        </h2>
                        <p
                          className={cn(
                            "mt-0.5 text-xs font-semibold",
                            active ? "text-upflow-warning" : "text-upflow-success",
                          )}
                        >
                          {active
                            ? t("meetingRoom.inUseUntil", {
                                time: formatTime(eventEnd(active), language),
                              })
                            : t("meetingRoom.availableNow")}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => openSchedule(room.key)}
                      className="shrink-0 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-semibold text-foreground transition hover:bg-accent dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                    >
                      {t("meetingRoom.book")}
                    </button>
                  </div>
                  <div className="mt-3 border-t border-border/70 pt-3 text-xs dark:border-white/10">
                    {active ? (
                      <div className="min-w-0">
                        <p className="truncate text-foreground">{active.title}</p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {t("meetingRoom.reservedBy", {
                            name: personName(active.creator, t("nav.team")),
                          })}
                        </p>
                      </div>
                    ) : next ? (
                      <div className="min-w-0">
                        <p className="truncate text-muted-foreground">
                          {t("meetingRoom.nextRoomBooking", {
                            date: formatLongDate(next.starts_at, language),
                            time: formatTime(next.starts_at, language),
                          })}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {next.title} · {personName(next.creator, t("nav.team"))}
                        </p>
                      </div>
                    ) : (
                      <p className="text-muted-foreground">
                        {t("meetingRoom.noUpcomingForRoom")}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              icon={CalendarDays}
              label={t("meetingRoom.todayBookings")}
              value={loading ? "..." : String(todaysEvents.length)}
              detail={t("meetingRoom.todayBookingsDetail")}
            />
            <MetricCard
              icon={Clock3}
              label={t("meetingRoom.nextBooking")}
              value={nextEvent ? formatTime(nextEvent.starts_at, language) : t("common.none")}
              detail={nextEvent ? nextEvent.title : t("meetingRoom.noUpcomingBookings")}
            />
            <MetricCard
              icon={AlertTriangle}
              label={t("meetingRoom.conflicts")}
              value={loading ? "..." : String(conflicts.size)}
              detail={conflicts.size > 0 ? t("meetingRoom.conflictsDetail") : t("meetingRoom.noConflicts")}
              tone={conflicts.size > 0 ? "warning" : "success"}
            />
            <MetricCard
              icon={DoorOpen}
              label={t("meetingRoom.monthBookings")}
              value={loading ? "..." : String(filteredEvents.length)}
              detail={monthTitle}
            />
          </div>
        </section>

        <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0 rounded-2xl p-4 glass sm:p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{monthTitle}</h2>
                <p className="text-xs text-muted-foreground">{t("meetingRoom.calendarHint")}</p>
              </div>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={goToday}
                  className="rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted dark:bg-white/5 dark:hover:bg-white/10"
                >
                  {t("calendar.today")}
                </button>
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label={t("calendar.previousMonth")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground dark:hover:bg-white/5"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label={t("calendar.nextMonth")}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground dark:hover:bg-white/5"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-border bg-muted/30 px-3 py-3 dark:border-white/10 dark:bg-white/[0.15]">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {t("meetingRoom.userFilter")}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {selectedPerson
                      ? t("meetingRoom.userFilterSelected", {
                          name: selectedPerson.name || selectedPerson.email,
                        })
                      : t("meetingRoom.userFilterAll")}
                  </p>
                </div>
                <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-2">
                  <label className="relative min-w-[190px]">
                    <span className="sr-only">{t("meetingRoom.roomFilter")}</span>
                    <select
                      value={selectedRoomKey}
                      onChange={(event) =>
                        setSelectedRoomKey(
                          event.target.value as MeetingRoomKey | "legacy" | "",
                        )
                      }
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 pr-9 text-xs font-medium text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-[#080d1b]"
                    >
                      <option value="">{t("meetingRoom.allRooms")}</option>
                      {MEETING_ROOM_OPTIONS.map((room) => (
                        <option key={room.key} value={room.key}>
                          {room.name}
                        </option>
                      ))}
                      <option value="legacy">{t("meetingRoom.unspecifiedRoom")}</option>
                    </select>
                  </label>
                  <label className="relative min-w-[190px]">
                    <span className="sr-only">{t("meetingRoom.userFilter")}</span>
                    <select
                      value={selectedUserId}
                      onChange={(event) => setSelectedUserId(event.target.value)}
                      disabled={peopleLoading}
                      className="h-10 w-full rounded-xl border border-border bg-background px-3 pr-9 text-xs font-medium text-foreground outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/20 disabled:opacity-50 dark:border-white/10 dark:bg-[#080d1b]"
                    >
                      <option value="">
                        {peopleLoading ? t("common.loading") : t("meetingRoom.allUsers")}
                      </option>
                      {people.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name || person.email}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
              {!peopleLoading && people.length === 0 && (
                <p className="mt-2 text-xs text-muted-foreground">{t("meetingRoom.noUsers")}</p>
              )}
            </div>

            <div className="overflow-x-auto pb-1">
              <div className="min-w-[780px]">
                <div className="mb-1 grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {WEEKDAY_KEYS.map((dayKey) => (
                    <div key={dayKey} className="px-2 py-1 text-center">
                      {t(dayKey)}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const key = dateKey(day);
                const dayEvents = eventsByDay.get(key) ?? [];
                const isSelected = key === selectedKey;
                const isToday = key === todayKey;
                const inMonth = day.getMonth() === month;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelected(day)}
                    className={cn(
                      "flex min-h-[152px] flex-col rounded-xl border p-2 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 sm:min-h-[164px]",
                      isSelected
                        ? "border-primary/70 bg-primary/[0.15] shadow-[0_0_28px_rgba(59,130,246,0.16)]"
                        : "border-border bg-background hover:border-primary/30 hover:bg-accent dark:border-white/10 dark:bg-white/[0.15] dark:hover:border-white/20 dark:hover:bg-white/[0.15]",
                      !inMonth && "opacity-[0.45]",
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-1">
                      <span
                        className={cn(
                          "flex h-6 min-w-6 items-center justify-center rounded-lg px-1.5 text-xs font-semibold",
                          isToday ? "bg-primary text-primary-foreground" : "text-foreground",
                        )}
                      >
                        {day.getDate()}
                      </span>
                      {dayEvents.length > 0 && (
                        <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:border-sky-300/20 dark:text-sky-100">
                          {dayEvents.length}
                        </span>
                      )}
                    </div>
                    <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto pr-0.5">
                      {dayEvents.slice(0, DAY_CELL_VISIBLE_ITEM_LIMIT).map((event) => (
                        <span
                          key={event.id}
                          title={`${formatTime(event.starts_at, language)} ${event.title}`}
                          className={cn(
                            "flex min-h-[17px] items-center gap-1 rounded-md border-l-2 px-1.5 py-0.5 text-[9px] font-medium leading-none",
                            conflicts.has(event.id)
                              ? "border-l-upflow-warning bg-upflow-warning/[0.15] text-upflow-warning"
                              : meetingRoomKeyFromLocation(event.location) === "b2c"
                                ? "border-l-violet-400 bg-violet-400/[0.15] text-violet-700 dark:text-violet-100"
                                : meetingRoomKeyFromLocation(event.location) === "b2b"
                                  ? "border-l-cyan-400 bg-cyan-400/[0.15] text-cyan-700 dark:text-cyan-100"
                                  : "border-l-primary bg-primary/[0.15] text-sky-700 dark:text-sky-100",
                          )}
                        >
                          <span className="shrink-0 font-bold tabular-nums">{formatTime(event.starts_at, language)}</span>
                          <span className="shrink-0 opacity-75">
                            {meetingRoomKeyFromLocation(event.location)?.toUpperCase() ?? "?"}
                          </span>
                          <span className="min-w-0 truncate">{event.title}</span>
                        </span>
                      ))}
                      {dayEvents.length > DAY_CELL_VISIBLE_ITEM_LIMIT && (
                        <span className="block text-[9px] text-muted-foreground">
                          {t("calendar.more", { count: dayEvents.length - DAY_CELL_VISIBLE_ITEM_LIMIT })}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
                </div>
              </div>
            </div>
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl p-4 glass sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {t("meetingRoom.selectedDay")}
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-foreground">
                    {formatLongDate(selected, language)}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => openSchedule()}
                  className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("meetingRoom.book")}
                </button>
              </div>
              <div className="mt-4">
                {loading ? (
                  <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
                ) : selectedEvents.length === 0 ? (
                  <div className="rounded-xl border border-border bg-muted/30 px-3 py-6 text-center dark:border-white/10 dark:bg-white/[0.15]">
                    <DoorOpen className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
                    <p className="text-sm font-semibold text-foreground">{t("meetingRoom.roomAvailable")}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("meetingRoom.noBookingsSelectedDay")}</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {[
                      ...MEETING_ROOM_OPTIONS.map((room) => ({
                        key: room.key,
                        label: room.name,
                      })),
                      { key: "legacy", label: t("meetingRoom.unspecifiedRoom") },
                    ].map((room) => {
                      const roomEvents = selectedEvents.filter((event) => {
                        const eventRoom = meetingRoomKeyFromLocation(event.location);
                        return room.key === "legacy"
                          ? eventRoom === null
                          : eventRoom === room.key;
                      });
                      if (roomEvents.length === 0) return null;
                      return (
                        <div key={room.key}>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                              {room.label}
                            </p>
                            <span className="text-[10px] text-muted-foreground">
                              {roomEvents.length}
                            </span>
                          </div>
                          <ul className="space-y-2">
                            {roomEvents.map((event) => (
                              <MeetingItem
                                key={event.id}
                                event={event}
                                hasConflict={conflicts.has(event.id)}
                                onDelete={handleDelete}
                                language={language}
                                t={t}
                              />
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl p-4 glass sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    {t("meetingRoom.allBookings")}
                  </p>
                  <h2 className="mt-1 text-base font-semibold text-foreground">{t("meetingRoom.monthAgenda")}</h2>
                </div>
                <span className="rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-muted-foreground dark:border-white/10 dark:bg-white/5">
                  {filteredEvents.length}
                </span>
              </div>
              {loading ? (
                <p className="text-xs text-muted-foreground">{t("common.loading")}</p>
              ) : filteredEvents.length === 0 ? (
                <p className="rounded-xl border border-border bg-muted/30 px-3 py-4 text-xs text-muted-foreground dark:border-white/10 dark:bg-white/[0.15]">
                  {t("meetingRoom.noBookingsMonth")}
                </p>
              ) : (
                <ul className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {filteredEvents.map((event) => (
                    <MeetingItem
                      key={event.id}
                      event={event}
                      compact
                      hasConflict={conflicts.has(event.id)}
                      onDelete={handleDelete}
                      language={language}
                      t={t}
                    />
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </main>

      <ScheduleMeetingDialog
        open={showSchedule}
        onClose={() => setShowSchedule(false)}
        onScheduled={handleScheduled}
        initialDate={selected}
        initialTime="09:00"
        title={t("meetingRoom.reserveRoom")}
        defaultType="meeting"
        roomBooking
        defaultMeetingRoomKey={scheduleRoomKey}
      />
    </>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
  tone = "default",
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "success" | "warning";
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-4 dark:border-white/10 dark:bg-white/[0.15]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-blue-700/75 dark:text-blue-100/60">
          {label}
        </p>
        <Icon
          className={cn(
            "h-4 w-4",
            tone === "success" && "text-upflow-success",
            tone === "warning" && "text-upflow-warning",
            tone === "default" && "text-primary",
          )}
        />
      </div>
      <p className="mt-3 text-3xl font-bold text-foreground">{value}</p>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function MeetingItem({
  event,
  compact = false,
  hasConflict,
  onDelete,
  language,
  t,
}: {
  event: RoomCalendarEvent;
  compact?: boolean;
  hasConflict: boolean;
  onDelete: (event: RoomCalendarEvent) => void;
  language: "en" | "pt-BR";
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const people = eventPeople(event, t("nav.team"));
  const primaryPerson = people[0] ?? t("nav.team");
  const detailDate = compact ? formatLongDate(event.starts_at, language) : null;
  const roomKey = meetingRoomKeyFromLocation(event.location);
  const roomName = roomKey
    ? meetingRoomNameFromLocation(event.location)
    : t("meetingRoom.unspecifiedRoom");
  return (
    <li
      className={cn(
        "rounded-xl border bg-muted/30 p-3 dark:bg-white/[0.15]",
        hasConflict ? "border-upflow-warning/[0.35]" : "border-border dark:border-white/10",
      )}
    >
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/[0.15] text-xs font-bold text-primary">
          {initials(primaryPerson)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{event.title}</p>
            {hasConflict && (
              <span className="inline-flex items-center gap-1 rounded-full border border-upflow-warning/30 bg-upflow-warning/10 px-2 py-0.5 text-[10px] font-semibold text-upflow-warning">
                <AlertTriangle className="h-3 w-3" />
                {t("meetingRoom.conflict")}
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Clock3 className="h-3.5 w-3.5" />
              {eventRange(event, language)}
            </span>
            {detailDate && <span>{detailDate}</span>}
            <span className="inline-flex min-w-0 items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              <span className="truncate">{people.join(", ")}</span>
            </span>
          </div>
          {event.description && (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{event.description}</p>
          )}
          <div className="mt-3 flex items-center justify-between gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-semibold",
                roomKey === "b2b"
                  ? "border-cyan-400/25 bg-cyan-400/10 text-cyan-700 dark:text-cyan-100"
                  : roomKey === "b2c"
                    ? "border-violet-400/25 bg-violet-400/10 text-violet-700 dark:text-violet-100"
                    : "border-border bg-background text-muted-foreground dark:border-white/10 dark:bg-white/5",
              )}
            >
              <Video className="h-3 w-3" />
              {roomName}
            </span>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => onDelete(event)}
                aria-label={`${t("common.delete")} ${event.title}`}
                title={t("common.delete")}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-upflow-danger transition hover:bg-upflow-danger/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <Link
                href={`/calendar?date=${dateKey(event.starts_at)}&event=${event.id}`}
                className="rounded-lg px-2 py-1 text-xs font-semibold text-primary transition hover:bg-primary/10"
              >
                {t("common.open")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}
