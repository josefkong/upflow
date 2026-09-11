"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Loader2,
  MonitorUp,
  UserRoundCheck,
  UsersRound,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { CreateActionButton } from "@/components/ui/create-action-button";
import { APP_TIME_ZONE, cn, mergeAppDateAndTime } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/types";

export type CalendarCreatePerson = {
  id: string;
  name: string | null;
  email: string;
  department_id?: string | null;
  department_name?: string | null;
};

type CompanyOption = {
  id: string;
  name: string;
};

type CalendarItemKind = "meeting" | "event" | "onboarding";
type CalendarAudience = "internal" | "external" | "online";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const minutes = index * 30;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
});

function dateInputValue(date?: Date) {
  const value = new Date(date ?? new Date());
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
}

function dateFromInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
}

function endTimeOneHourAfter(startTime: string) {
  const [hours, minutes] = startTime.split(":").map(Number);
  const total = hours * 60 + minutes + 60;
  if (total >= 24 * 60) return "23:30";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function openNativeDatePicker(input: HTMLInputElement) {
  const picker = input as HTMLInputElement & { showPicker?: () => void };
  try {
    picker.showPicker?.();
  } catch {
    // Browsers without showPicker still open the native picker normally.
  }
}

function ChoiceCard({
  checked,
  icon,
  label,
  name,
  value,
  onChange,
}: {
  checked: boolean;
  icon: React.ReactNode;
  label: string;
  name: string;
  value: string;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition",
        checked
          ? "border-primary/60 bg-primary/15 text-foreground ring-1 ring-primary/20"
          : "border-border bg-background/45 text-muted-foreground hover:border-primary/35 hover:text-foreground dark:border-white/10",
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
      <span
        className={cn(
          "shrink-0",
          checked ? "text-primary" : "text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">{label}</span>
      {checked && <Check className="h-4 w-4 shrink-0 text-primary" />}
    </label>
  );
}

export default function GuidedCalendarCreateDialog({
  open,
  onClose,
  onScheduled,
  initialDate,
  initialTime = "09:00",
  people,
  peopleLoading,
  creatorUserId,
}: {
  open: boolean;
  onClose: () => void;
  onScheduled: (event: CalendarEvent) => void;
  initialDate: Date;
  initialTime?: string;
  people: CalendarCreatePerson[];
  peopleLoading: boolean;
  creatorUserId?: string | null;
}) {
  const { t } = useLanguage();
  const formRef = useRef<HTMLFormElement>(null);
  const [kind, setKind] = useState<CalendarItemKind>("meeting");
  const [audience, setAudience] = useState<CalendarAudience>("internal");
  const [companyId, setCompanyId] = useState("");
  const [responsibleUserId, setResponsibleUserId] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [date, setDate] = useState(dateInputValue(initialDate));
  const [startTime, setStartTime] = useState(initialTime);
  const [endTime, setEndTime] = useState(endTimeOneHourAfter(initialTime));
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const sortedPeople = useMemo(
    () =>
      [...people].sort((left, right) =>
        (left.name || left.email).localeCompare(right.name || right.email),
      ),
    [people],
  );
  const peopleByDepartment = useMemo(() => {
    const groups = new Map<string, CalendarCreatePerson[]>();
    sortedPeople.forEach((person) => {
      const label = person.department_name || t("calendarCreate.noDepartment");
      groups.set(label, [...(groups.get(label) ?? []), person]);
    });
    return Array.from(groups.entries()).sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [sortedPeople, t]);

  useEffect(() => {
    if (!open) return;
    setKind("meeting");
    setAudience("internal");
    setCompanyId("");
    setResponsibleUserId(creatorUserId ?? "");
    setAttendeeIds(creatorUserId ? [creatorUserId] : []);
    setDate(dateInputValue(initialDate));
    setStartTime(initialTime);
    setEndTime(endTimeOneHourAfter(initialTime));
    const frame = window.requestAnimationFrame(() => {
      formRef.current
        ?.querySelector<HTMLElement>("input, select, button")
        ?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [creatorUserId, initialDate, initialTime, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, open, submitting]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setCompaniesLoading(true);
    fetch("/api/companies?limit=100&include_summary=false&status=all", {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load clients");
        return (await response.json()) as { items?: CompanyOption[] };
      })
      .then((payload) => setCompanies(payload.items ?? []))
      .catch((error) => {
        if ((error as Error).name !== "AbortError") {
          setCompanies([]);
          toast.error(t("calendarCreate.clientsLoadError"));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCompaniesLoading(false);
      });
    return () => controller.abort();
  }, [open, t]);

  if (!open) return null;

  const availableAttendees = sortedPeople.filter(
    (person) => person.id !== responsibleUserId,
  );
  const validEndTimes = TIME_OPTIONS.filter((value) => value > startTime);

  const toggleAttendee = (userId: string) => {
    if (userId === creatorUserId) return;
    setAttendeeIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  };

  const submit = async (submitEvent: React.FormEvent) => {
    submitEvent.preventDefault();
    if (!date || !startTime || !endTime || !responsibleUserId) {
      toast.error(t("calendarCreate.requiredError"));
      return;
    }
    if (!companyId) {
      toast.error(t("calendarCreate.clientRequired"));
      return;
    }

    const startsAt = mergeAppDateAndTime(dateFromInput(date), startTime);
    const endsAt = mergeAppDateAndTime(dateFromInput(date), endTime);
    if (endsAt <= startsAt) {
      toast.error(t("calendarCreate.endAfterStart"));
      return;
    }

    const company = companies.find((item) => item.id === companyId);
    const kindLabel =
      kind === "meeting"
        ? t("calendarCreate.meeting")
        : kind === "onboarding"
          ? t("calendarCreate.onboarding")
          : t("calendarCreate.event");
    const title =
      audience === "online"
        ? t("calendarCreate.onlineTitle", {
            type: kindLabel,
            client: company?.name || t("calendarCreate.client"),
          })
        : audience === "external"
          ? t("calendarCreate.externalTitle", {
              type: kindLabel,
              client: company?.name || t("calendarCreate.client"),
            })
          : t("calendarCreate.internalTitle", {
              type: kindLabel,
              client: company?.name || t("calendarCreate.client"),
            });
    const type = kind === "event" ? "reminder" : "client_call";

    setSubmitting(true);
    try {
      const response = await fetch("/api/calendar/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          type,
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
          timezone: APP_TIME_ZONE,
          responsible_user_id: responsibleUserId,
          attendee_ids: attendeeIds.filter((id) => id !== responsibleUserId),
          reminder_minutes: [5],
          google_meet_requested: audience === "online",
          company_id: companyId,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };
        if (body.code === "GOOGLE_CALENDAR_CONNECTION_REQUIRED") {
          throw new Error(t("calendarCreate.responsibleGoogleRequired"));
        }
        throw new Error(body.error || "Unable to create calendar item");
      }
      const created = (await response.json()) as CalendarEvent;
      onScheduled(created);
      toast.success(t("calendarCreate.created"));
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t("calendarCreate.createError"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <form
        ref={formRef}
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-calendar-create-title"
        data-testid="guided-calendar-create-dialog"
        className="flex max-h-[calc(100dvh-24px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl dark:border-white/10 dark:bg-[#08101f] sm:max-h-[calc(100dvh-48px)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 dark:border-white/10 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/25 bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2
                id="guided-calendar-create-title"
                className="text-base font-semibold text-foreground sm:text-lg"
              >
                {t("calendarCreate.title")}
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {t("calendarCreate.description")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label={t("common.close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="grid gap-5">
            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-foreground">
                {t("calendarCreate.type")}
              </legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <ChoiceCard
                  checked={kind === "meeting"}
                  icon={<Video className="h-4 w-4" />}
                  label={t("calendarCreate.meeting")}
                  name="calendar-item-kind"
                  value="meeting"
                  onChange={() => setKind("meeting")}
                />
                <ChoiceCard
                  checked={kind === "event"}
                  icon={<CalendarDays className="h-4 w-4" />}
                  label={t("calendarCreate.event")}
                  name="calendar-item-kind"
                  value="event"
                  onChange={() => setKind("event")}
                />
                <ChoiceCard
                  checked={kind === "onboarding"}
                  icon={<ClipboardCheck className="h-4 w-4" />}
                  label={t("calendarCreate.onboarding")}
                  name="calendar-item-kind"
                  value="onboarding"
                  onChange={() => setKind("onboarding")}
                />
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-xs font-semibold text-foreground">
                {t("calendarCreate.audience")}
              </legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <ChoiceCard
                  checked={audience === "internal"}
                  icon={<UsersRound className="h-4 w-4" />}
                  label={t("calendarCreate.internal")}
                  name="calendar-audience"
                  value="internal"
                  onChange={() => setAudience("internal")}
                />
                <ChoiceCard
                  checked={audience === "external"}
                  icon={<Building2 className="h-4 w-4" />}
                  label={t("calendarCreate.external")}
                  name="calendar-audience"
                  value="external"
                  onChange={() => setAudience("external")}
                />
                <ChoiceCard
                  checked={audience === "online"}
                  icon={<MonitorUp className="h-4 w-4" />}
                  label={t("calendarCreate.online")}
                  name="calendar-audience"
                  value="online"
                  onChange={() => setAudience("online")}
                />
              </div>
            </fieldset>
          </div>

          <div className="mt-5">
            <label
              htmlFor="calendar-create-client"
              className="mb-1.5 block text-xs font-semibold text-foreground"
            >
              {t("calendarCreate.client")}{" "}
              <span className="text-upflow-danger">*</span>
            </label>
            <div className="relative">
              <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <select
                id="calendar-create-client"
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                disabled={companiesLoading}
                className="h-11 w-full appearance-none rounded-xl border border-border bg-background/55 py-0 pl-10 pr-10 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-white/10"
              >
                <option value="">
                  {companiesLoading
                    ? t("common.loading")
                    : t("calendarCreate.chooseClient")}
                </option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="calendar-create-responsible"
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                {t("calendarCreate.responsible")}{" "}
                <span className="text-upflow-danger">*</span>
              </label>
              <div className="relative">
                <UserRoundCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <select
                  id="calendar-create-responsible"
                  value={responsibleUserId}
                  onChange={(event) => {
                    const id = event.target.value;
                    setResponsibleUserId(id);
                    setAttendeeIds((current) =>
                      Array.from(
                        new Set([
                          ...current.filter((item) => item !== id),
                          ...(creatorUserId && creatorUserId !== id
                            ? [creatorUserId]
                            : []),
                        ]),
                      ),
                    );
                  }}
                  disabled={peopleLoading}
                  className="h-11 w-full appearance-none rounded-xl border border-border bg-background/55 py-0 pl-10 pr-10 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-white/10"
                >
                  <option value="">
                    {peopleLoading
                      ? t("common.loading")
                      : t("calendarCreate.chooseResponsible")}
                  </option>
                  {peopleByDepartment.map(([department, members]) => (
                    <optgroup key={department} label={department}>
                      {members.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name || person.email}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
            </div>

            <div>
              <label
                htmlFor="calendar-create-date"
                className="mb-1.5 block text-xs font-semibold text-foreground"
              >
                {t("calendarCreate.date")}{" "}
                <span className="text-upflow-danger">*</span>
              </label>
              <div className="relative">
                <input
                  id="calendar-create-date"
                  type="date"
                  value={date}
                  onClick={(event) => openNativeDatePicker(event.currentTarget)}
                  onChange={(event) => setDate(event.target.value)}
                  className="h-11 w-full rounded-xl border border-border bg-background/55 px-3 pr-10 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-white/10"
                />
              </div>
            </div>
          </div>

          <fieldset className="mt-5">
            <legend className="mb-2 text-xs font-semibold text-foreground">
              {t("calendarCreate.time")}{" "}
              <span className="text-upflow-danger">*</span>
            </legend>
            <div className="grid grid-cols-2 gap-3">
              <label className="min-w-0">
                <span className="mb-1.5 block text-[11px] text-muted-foreground">
                  {t("calendarCreate.startTime")}
                </span>
                <span className="relative block">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <select
                    value={startTime}
                    onChange={(event) => {
                      const next = event.target.value;
                      setStartTime(next);
                      setEndTime(endTimeOneHourAfter(next));
                    }}
                    className="h-11 w-full appearance-none rounded-xl border border-border bg-background/55 py-0 pl-10 pr-10 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-white/10"
                  >
                    {TIME_OPTIONS.slice(0, -2).map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </span>
              </label>
              <label className="min-w-0">
                <span className="mb-1.5 block text-[11px] text-muted-foreground">
                  {t("calendarCreate.endTime")}
                </span>
                <span className="relative block">
                  <Clock3 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <select
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    className="h-11 w-full appearance-none rounded-xl border border-border bg-background/55 py-0 pl-10 pr-10 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20 dark:border-white/10"
                  >
                    {validEndTimes.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                </span>
              </label>
            </div>
          </fieldset>

          <fieldset className="mt-5">
            <legend className="text-xs font-semibold text-foreground">
              {t("calendarCreate.attendees")}
            </legend>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t("calendarCreate.attendeesHint")}
            </p>
            <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-border bg-background/35 p-2 dark:border-white/10">
              {peopleLoading ? (
                <div className="flex items-center justify-center gap-2 px-3 py-5 text-xs text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("common.loading")}
                </div>
              ) : availableAttendees.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  {t("calendarCreate.noAttendees")}
                </p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {availableAttendees.map((person) => {
                    const isCreator = person.id === creatorUserId;
                    const checked =
                      isCreator || attendeeIds.includes(person.id);
                    return (
                      <label
                        key={person.id}
                        className={cn(
                          "flex min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition",
                          checked ? "bg-primary/10" : "hover:bg-accent",
                          isCreator && "cursor-default",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={isCreator}
                          onChange={() => toggleAttendee(person.id)}
                          className="h-4 w-4 shrink-0 rounded border-border bg-background text-primary focus:ring-primary/30"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-foreground">
                            {person.name || person.email}
                            {isCreator && (
                              <span className="ml-1.5 text-[10px] font-semibold text-primary">
                                {t("calendarCreate.creator")}
                              </span>
                            )}
                          </span>
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {person.department_name ||
                              t("calendarCreate.noDepartment")}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </fieldset>
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 dark:border-white/10 sm:flex-row sm:justify-end sm:px-6">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-9 items-center justify-center rounded-xl border border-border px-4 text-xs font-semibold text-foreground transition hover:bg-accent disabled:opacity-50 dark:border-white/10"
          >
            {t("common.cancel")}
          </button>
          <CreateActionButton
            type="submit"
            disabled={submitting}
            className="px-4"
          >
            {submitting && <Loader2 className="animate-spin" />}
            {submitting ? t("calendarCreate.saving") : t("calendarCreate.save")}
          </CreateActionButton>
        </footer>
      </form>
    </div>,
    document.body,
  );
}
