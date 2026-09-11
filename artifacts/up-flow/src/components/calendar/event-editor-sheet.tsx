"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  BellRing,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Clock3,
  ExternalLink,
  Loader2,
  MapPin,
  UserRound,
  UsersRound,
  Video,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { commercialLeadRevenueTier } from "@/lib/commercial-lead-revenue";
import { cn, formatLongDate, formatTime } from "@/lib/utils";
import type { CalendarEvent } from "@/lib/types";

type EventViewerSheetProps = {
  event: CalendarEvent;
  onClose: () => void;
};

function personLabel(
  person: { name: string; email: string } | null | undefined,
) {
  return person?.name || person?.email || null;
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card/40 p-4 dark:border-white/10 dark:bg-white/[0.025]">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <span className="text-primary">{icon}</span>
        {title}
      </h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Fact({
  label,
  value,
  className,
}: {
  label: string;
  value: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border border-border/70 bg-background/45 px-3 py-2.5 dark:border-white/10",
        className,
      )}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 break-words text-sm font-medium text-foreground">
        {value}
      </div>
    </div>
  );
}

function reminderLabel(
  minutes: number,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  return minutes % 60 === 0
    ? t("calendarEditor.hoursBefore", { count: minutes / 60 })
    : t("calendarEditor.minutesBefore", { count: minutes });
}

export default function EventEditorSheet({
  event,
  onClose,
}: EventViewerSheetProps) {
  const { language, t } = useLanguage();
  const [detail, setDetail] = useState<CalendarEvent>(event);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setDetail(event);
    setLoading(true);
    setLoadError(false);

    fetch(`/api/calendar/events/${event.id}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Event detail unavailable");
        return (await response.json()) as CalendarEvent;
      })
      .then((payload) => setDetail(payload))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setLoadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [event]);

  const taskUrl =
    detail.task_id && detail.project_id
      ? `/projects/${detail.project_id}?task=${detail.task_id}`
      : null;
  const attendees = detail.attendees ?? [];
  const commercialLead = detail.commercial_lead_presentation;
  const commercialLeadRevenue = commercialLead
    ? commercialLeadRevenueTier(Number(commercialLead.monthly_revenue))
    : null;
  const startsAt = new Date(detail.starts_at);
  const endsAt = detail.ends_at ? new Date(detail.ends_at) : null;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        data-calendar-event-viewer
        className="flex w-[calc(100vw-16px)] flex-col p-0 sm:max-w-2xl"
      >
        <SheetHeader className="border-b border-border px-5 py-5 pr-12 text-left dark:border-white/10 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
              {t(`calendarEditor.type.${detail.type}`)}
            </span>
            {detail.status === "cancelled" ? (
              <span className="rounded-full border border-red-400/25 bg-red-400/10 px-2.5 py-1 text-[10px] font-semibold text-red-200">
                {t("calendarEditor.cancelledTitle")}
              </span>
            ) : null}
          </div>
          <SheetTitle className="text-xl leading-tight">
            {detail.title}
          </SheetTitle>
          <SheetDescription>{t("calendarViewer.description")}</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 sm:px-6">
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("common.loading")}
            </div>
          ) : null}
          {loadError ? (
            <p className="rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-xs text-amber-100">
              {t("calendarEditor.loadError")}
            </p>
          ) : null}

          <Section
            icon={<CalendarDays className="h-4 w-4" />}
            title={t("calendarEditor.eventInformation")}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Fact
                label={t("calendarEditor.date")}
                value={formatLongDate(startsAt, language)}
              />
              <Fact
                label={t("calendar.fieldTime")}
                value={`${formatTime(startsAt, language)}${endsAt ? ` – ${formatTime(endsAt, language)}` : ""}`}
              />
              {detail.location ? (
                <Fact
                  label={t("calendarEditor.location")}
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {detail.location}
                    </span>
                  }
                />
              ) : null}
              {detail.meeting_url ? (
                <Fact
                  label={t("calendarEditor.meetingLink")}
                  value={
                    <a
                      href={detail.meeting_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-primary hover:underline"
                    >
                      <Video className="h-3.5 w-3.5" />
                      {t("calendarViewer.joinMeeting")}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  }
                />
              ) : null}
              {detail.description ? (
                <Fact
                  label={t("calendarEditor.descriptionNotes")}
                  value={
                    <p className="whitespace-pre-wrap leading-6">
                      {detail.description}
                    </p>
                  }
                  className="sm:col-span-2"
                />
              ) : null}
            </div>
          </Section>

          {commercialLead ? (
            <Section
              icon={<Building2 className="h-4 w-4" />}
              title={t("calendarEditor.leadRegistration")}
            >
              <div
                data-testid="calendar-commercial-lead-fields"
                className="grid gap-2 sm:grid-cols-2"
              >
                <Fact
                  label={t("commercialLead.brandName")}
                  value={commercialLead.brand_name}
                />
                <Fact
                  label={t("commercialLead.ownerName")}
                  value={commercialLead.owner_name}
                />
                <Fact
                  label={t("commercialLead.ownerEmail")}
                  value={commercialLead.owner_email}
                />
                <Fact
                  label={t("commercialLead.instagram")}
                  value={`@${commercialLead.instagram.replace(/^@/, "")}`}
                />
                <Fact
                  label={t("commercialLead.monthlyRevenue")}
                  value={
                    commercialLeadRevenue
                      ? t(commercialLeadRevenue.labelKey)
                      : String(commercialLead.monthly_revenue)
                  }
                />
                <Fact
                  label={t("commercialLead.whatsapp")}
                  value={`🇧🇷 +55 ${commercialLead.whatsapp}`}
                />
                <Fact
                  label={t("commercialLead.companyType")}
                  value={commercialLead.company_type}
                />
                <Fact
                  label={t("commercialLead.observations")}
                  value={
                    commercialLead.observations ||
                    t("calendarEditor.noLeadObservations")
                  }
                  className="sm:col-span-2"
                />
              </div>
            </Section>
          ) : null}

          <Section
            icon={<UsersRound className="h-4 w-4" />}
            title={t("calendarEditor.participants")}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Fact
                label={t("calendarEditor.creator")}
                value={personLabel(detail.creator) || t("common.none")}
              />
              <Fact
                label={t("calendarEditor.responsiblePerson")}
                value={
                  personLabel(detail.responsible) ||
                  t("calendarEditor.noResponsible")
                }
              />
            </div>
            {attendees.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-2">
                {attendees.map((attendee) => (
                  <span
                    key={attendee.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-foreground dark:border-white/10"
                  >
                    <UserRound className="h-3 w-3 text-muted-foreground" />
                    {personLabel(attendee.user) || attendee.user_id}
                  </span>
                ))}
              </div>
            ) : null}
          </Section>

          <Section
            icon={<BriefcaseBusiness className="h-4 w-4" />}
            title={t("calendarEditor.relatedWork")}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <Fact
                label={t("calendarEditor.relatedClient")}
                value={detail.company?.name || t("calendarEditor.noClient")}
              />
              <Fact
                label={t("calendarEditor.relatedSpace")}
                value={detail.space?.name || t("calendarEditor.noSpace")}
              />
              <Fact
                label={t("calendarEditor.relatedProject")}
                value={detail.project?.name || t("calendarEditor.noProject")}
              />
            </div>
            {detail.task ? (
              <div className="mt-2 rounded-lg border border-primary/20 bg-primary/[0.06] px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                  {t("calendarViewer.linkedTask")}
                </p>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {detail.task.title}
                </p>
              </div>
            ) : null}
          </Section>

          {(detail.reminders?.length ?? 0) > 0 ? (
            <Section
              icon={<BellRing className="h-4 w-4" />}
              title={t("calendarEditor.notifications")}
            >
              <div className="flex flex-wrap gap-2">
                {detail.reminders?.map((reminder) => (
                  <span
                    key={reminder.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/30 px-2.5 py-1 text-xs text-foreground dark:border-white/10"
                  >
                    <Clock3 className="h-3 w-3 text-muted-foreground" />
                    {reminderLabel(reminder.minutes_before, t)}
                  </span>
                ))}
              </div>
            </Section>
          ) : null}
        </div>

        <div className="border-t border-border bg-background/95 px-5 py-4 dark:border-white/10 sm:px-6">
          {taskUrl ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">
                {t("calendarViewer.editOnTaskHint")}
              </p>
              <Button asChild className="shrink-0">
                <Link href={taskUrl} onClick={onClose}>
                  {t("calendarViewer.openTask")}
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {t("calendarViewer.readOnlyHint")}
              </p>
              <Button type="button" variant="outline" onClick={onClose}>
                {t("common.close")}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
