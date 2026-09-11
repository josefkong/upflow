"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  CheckCircle2,
  CircleDashed,
  ExternalLink,
  Loader2,
  LockKeyhole,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import {
  isSharedOnboardingSchedulingKey,
  sharedOnboardingStageLabel,
} from "@/lib/onboarding-stages";
import {
  onboardingMeetingName,
  onboardingMeetingTitle,
} from "@/lib/onboarding-meeting-copy";
import type {
  ClientOnboarding,
  OnboardingChecklistItem,
  OnboardingMeeting,
} from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

type Props = {
  onboardingId: string;
  taskId: string;
  projectId: string;
  companyName: string;
  onChanged?: () => void;
};

function meetingForItem(
  meetings: OnboardingMeeting[],
  itemId: string,
) {
  return meetings.find((meeting) => meeting.checklist_item_id === itemId);
}

function calendarHref(input: {
  item: OnboardingChecklistItem;
  taskId: string;
  projectId: string;
  companyName: string;
}) {
  const params = new URLSearchParams({
    create: "meeting",
    task: input.taskId,
    project: input.projectId,
    onboarding_item: input.item.id,
    title: onboardingMeetingTitle({
      companyName: input.companyName,
      automationKey: input.item.automation_key,
      department: input.item.department,
    }),
    description: [
      `Cliente: ${input.companyName}`,
      `Departamento: ${input.item.department}`,
      input.item.notes ?? "",
    ]
      .filter(Boolean)
      .join("\n"),
  });
  if (input.item.owner_id) params.set("attendees", input.item.owner_id);
  return `/calendar?${params.toString()}`;
}

export function SharedOnboardingTaskWorkflow({
  onboardingId,
  taskId,
  projectId,
  companyName,
  onChanged,
}: Props) {
  const { language, t } = useLanguage();
  const [onboarding, setOnboarding] = useState<ClientOnboarding | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/onboarding/${onboardingId}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as
        | (ClientOnboarding & { error?: string })
        | null;
      if (!response.ok || !payload?.id) {
        throw new Error(payload?.error || t("task.onboardingWorkflowLoadError"));
      }
      setOnboarding(payload);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("task.onboardingWorkflowLoadError"),
      );
    } finally {
      setLoading(false);
    }
  }, [onboardingId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const sharedItems = useMemo(
    () =>
      (onboarding?.checklist_items ?? [])
        .filter(
          (item) =>
            item.automation_key?.startsWith("shared_onboarding:") &&
            item.automation_key !== "shared_onboarding:task",
        )
        .sort((left, right) => left.sort_order - right.sort_order),
    [onboarding?.checklist_items],
  );
  const schedulingItems = sharedItems.filter((item) =>
    isSharedOnboardingSchedulingKey(item.automation_key),
  );
  const executionItems = sharedItems.filter(
    (item) => !isSharedOnboardingSchedulingKey(item.automation_key),
  );
  const meetings = onboarding?.meetings ?? [];
  const editableItemIds = useMemo(
    () =>
      new Set(onboarding?.capabilities?.editable_checklist_item_ids ?? []),
    [onboarding?.capabilities?.editable_checklist_item_ids],
  );
  const scheduledCount = schedulingItems.filter((item) => {
    const meeting = meetingForItem(meetings, item.id);
    return item.status === "complete" && meeting?.scheduled;
  }).length;

  const completeItem = async (item: OnboardingChecklistItem) => {
    setSavingItemId(item.id);
    try {
      const response = await fetch(
        `/api/onboarding/${onboardingId}/items/${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "complete" }),
        },
      );
      const payload = (await response.json().catch(() => null)) as
        | { error?: string }
        | null;
      if (!response.ok) {
        throw new Error(payload?.error || t("task.onboardingStageError"));
      }
      toast.success(t("task.onboardingStageCompleted"));
      await load();
      onChanged?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("task.onboardingStageError"),
      );
    } finally {
      setSavingItemId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("common.loading")}
      </div>
    );
  }

  if (!onboarding) return null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {t("task.onboardingScheduleTitle")}
          </p>
          <p className="mt-1 text-sm text-slate-300">
            {t("task.onboardingScheduleProgress", {
              completed: scheduledCount,
              total: schedulingItems.length,
            })}
          </p>
        </div>
        <span className="rounded-full border border-primary/25 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
          {onboarding.progress}%
        </span>
      </div>

      <div className="grid gap-2 lg:grid-cols-3">
        {schedulingItems.map((item) => {
          const meeting = meetingForItem(meetings, item.id);
          const scheduled = Boolean(meeting?.scheduled && meeting.scheduled_at);
          const editable = editableItemIds.has(item.id);
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-xl border p-3",
                scheduled
                  ? "border-emerald-400/20 bg-emerald-400/[0.06]"
                  : "border-white/10 bg-black/10",
              )}
            >
              <div className="flex items-start gap-2">
                {scheduled ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                ) : (
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-100">
                    {onboardingMeetingName({
                      automationKey: item.automation_key,
                      department: item.department,
                    })}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {item.owner?.name ?? item.department}
                  </p>
                  {item.notes ? (
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      {item.notes}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 border-t border-white/10 pt-2.5">
                {scheduled ? (
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300/70">
                      {t("task.onboardingScheduledFor")}
                    </p>
                    <p className="text-sm font-semibold text-emerald-200">
                      {formatDateTime(meeting?.scheduled_at, language)}
                    </p>
                    {meeting?.meeting_url ? (
                      <a
                        href={meeting.meeting_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        {t("task.onboardingOpenMeeting")}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : null}
                  </div>
                ) : editable ? (
                  <a
                    href={calendarHref({
                      item,
                      taskId,
                      projectId,
                      companyName,
                    })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary transition hover:bg-primary/15"
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    {t("task.onboardingScheduleAction")}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-slate-500">
                    <LockKeyhole className="h-3.5 w-3.5" />
                    {t("task.onboardingAwaitingDepartment")}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
          {t("task.onboardingExecutionTitle")}
        </p>
        <div className="grid gap-2 lg:grid-cols-3">
          {executionItems.map((item, index) => {
            const complete = item.status === "complete";
            const editable = editableItemIds.has(item.id);
            return (
              <div
                key={item.id}
                className={cn(
                  "flex min-h-24 flex-col justify-between rounded-xl border p-3",
                  complete
                    ? "border-emerald-400/20 bg-emerald-400/[0.06]"
                    : editable
                      ? "border-primary/30 bg-primary/[0.07]"
                      : "border-white/10 bg-black/10",
                )}
              >
                <div className="flex items-start gap-2">
                  {complete ? (
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
                  ) : editable ? (
                    <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                  )}
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      {t("task.onboardingStageNumber", { number: index + 1 })}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-slate-100">
                      {sharedOnboardingStageLabel(item.automation_key) ??
                        item.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      {item.owner?.name ?? item.department}
                    </p>
                  </div>
                </div>
                {editable && !complete ? (
                  <button
                    type="button"
                    onClick={() => void completeItem(item)}
                    disabled={savingItemId === item.id}
                    className="mt-3 inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60"
                  >
                    {savingItemId === item.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    {t("task.onboardingCompleteStage")}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
