import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { isBefore, parseISO } from "date-fns";

export const APP_LOCALE = "pt-BR";
export const APP_TIME_ZONE = "America/Sao_Paulo";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function normalizeDate(date: string | Date): Date {
  return typeof date === "string" ? parseISO(date) : date;
}

function appDateParts(date: string | Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(normalizeDate(date));

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

function timeZoneOffsetMs(date: Date) {
  const parts = appDateParts(date);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return localAsUtc - date.getTime();
}

export function appDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offset = timeZoneOffsetMs(new Date(utcGuess));
  return new Date(utcGuess - offset);
}

export function parseAppDateOnly(value: string): Date | "invalid" {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "invalid";
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const localCheck = new Date(year, month - 1, day);
  if (
    localCheck.getFullYear() !== year ||
    localCheck.getMonth() !== month - 1 ||
    localCheck.getDate() !== day
  ) {
    return "invalid";
  }
  // Date-only fields are operational deadlines, not exact instants. Store them
  // at noon in Sao Paulo so UTC conversion cannot display the previous day.
  return appDateTimeToUtc(year, month, day, 12, 0);
}

export function parseAppDate(value: string): Date | "invalid" {
  const dateOnly = parseAppDateOnly(value);
  if (dateOnly !== "invalid") return dateOnly;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

export function appDateKey(date: string | Date): string {
  const parts = appDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function appTimeInputValue(date: string | Date): string {
  const parts = appDateParts(date);
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function mergeAppDateAndTime(date: Date, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const parts = appDateParts(date);
  return appDateTimeToUtc(
    parts.year,
    parts.month,
    parts.day,
    hours || 0,
    minutes || 0,
  );
}

function activeLocale(locale?: string) {
  if (locale) return locale;
  if (typeof document !== "undefined") {
    const language = document.documentElement.lang;
    if (language === "pt-BR") return language;
    if (language === "en") return "en-US";
  }
  return APP_LOCALE;
}

export function formatDate(
  date: string | Date | null | undefined,
  locale?: string,
): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(activeLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
  }).format(normalizeDate(date));
}

export function formatShortDate(
  date: string | Date | null | undefined,
  locale?: string,
): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(activeLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    timeZone: APP_TIME_ZONE,
  }).format(normalizeDate(date));
}

export function formatLongDate(
  date: string | Date | null | undefined,
  locale?: string,
): string {
  if (!date) return "";
  const resolvedLocale = activeLocale(locale);
  const formattedDate = new Intl.DateTimeFormat(resolvedLocale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: APP_TIME_ZONE,
  }).format(normalizeDate(date));

  return formattedDate.replace(
    /(^|,\s+|\s+de\s+)(\p{L})/gu,
    (_match, prefix: string, initial: string) =>
      `${prefix}${initial.toLocaleUpperCase(resolvedLocale)}`,
  );
}

export function formatDateTime(
  date: string | Date | null | undefined,
  locale?: string,
): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(activeLocale(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: APP_TIME_ZONE,
  }).format(normalizeDate(date));
}

export function formatTime(
  date: string | Date | null | undefined,
  locale?: string,
): string {
  if (!date) return "";
  return new Intl.DateTimeFormat(activeLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: APP_TIME_ZONE,
  }).format(normalizeDate(date));
}

export function formatIsoDateInput(
  date: string | Date | null | undefined,
): string {
  if (!date) return "";
  if (typeof date === "string") {
    const match = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  }
  const d = normalizeDate(date);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = String(d.getFullYear());
  return `${day}/${month}/${year}`;
}

export function maskBrazilianDateInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function parseBrazilianDateInput(
  value: string,
): string | null | "invalid" {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "invalid";

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "invalid";
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function isOverdue(dueDate: string | Date | null | undefined): boolean {
  if (!dueDate) return false;
  const d = normalizeDate(dueDate);
  return isBefore(d, new Date());
}

function appDateOrdinal(date: string | Date) {
  const parts = appDateParts(date);
  return Math.floor(
    Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000,
  );
}

export type DueDateUrgency = "overdue_or_today" | "due_soon" | "planned";

export function dueDateUrgency(
  dueDate: string | Date,
  now: string | Date = new Date(),
): DueDateUrgency {
  const diffDays = appDateOrdinal(dueDate) - appDateOrdinal(now);
  if (diffDays <= 0) return "overdue_or_today";
  if (diffDays <= 2) return "due_soon";
  return "planned";
}

export function relativeDueDateLabel(
  dueDate: string | Date | null | undefined,
  locale?: string,
): string {
  if (!dueDate) return "";
  const resolvedLocale = activeLocale(locale);
  const isPortuguese = resolvedLocale.toLowerCase().startsWith("pt");
  const diffDays = appDateOrdinal(dueDate) - appDateOrdinal(new Date());
  if (diffDays < 0) return isPortuguese ? "Atrasada" : "Overdue";
  if (diffDays === 0) return isPortuguese ? "Hoje" : "Today";
  if (diffDays === 1) return isPortuguese ? "Amanhã" : "Tomorrow";
  if (diffDays <= 7)
    return isPortuguese ? `Em ${diffDays} dias` : `In ${diffDays} days`;
  return formatDate(dueDate, resolvedLocale);
}

export function priorityColor(priority: string): string {
  switch (priority) {
    case "high":
      return "bg-upflow-danger/15 text-upflow-danger";
    case "medium":
      return "bg-upflow-warning/15 text-upflow-warning";
    case "low":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function statusColor(status: string): string {
  switch (status) {
    case "done":
    case "active":
      return "bg-upflow-success/15 text-upflow-success";
    case "in_progress":
      return "bg-primary/15 text-primary";
    case "todo":
    case "archived":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function statusLabel(
  status: string,
  translate?: (key: string, vars?: Record<string, string | number>) => string,
): string {
  switch (status) {
    case "todo":
      return translate ? translate("status.todo") : "To Do";
    case "in_progress":
      return translate ? translate("status.inProgress") : "In Progress";
    case "done":
      return translate ? translate("status.done") : "Done";
    case "active":
      return translate ? translate("status.active") : "Active";
    case "archived":
      return translate ? translate("status.archived") : "Archived";
    default:
      return status;
  }
}
