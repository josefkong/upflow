"use client";

/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  Clock3,
  Loader2,
  Plus,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBrazilianMobile } from "@/lib/brazilian-mobile";
import { COMMERCIAL_LEAD_REVENUE_TIERS } from "@/lib/commercial-lead-revenue";
import type { Task, TaskAssignee } from "@/lib/types";

type Props = {
  open: boolean;
  projectId: string;
  workspaceId: string;
  onClose: () => void;
  onCreated: (task: Task) => void;
};

const EMPTY_FORM = {
  brandName: "",
  ownerName: "",
  ownerEmail: "",
  instagram: "",
  monthlyRevenue: "",
  whatsapp: "",
  presentationDate: "",
  presentationStart: "",
  presentationEnd: "",
  assigneeId: "",
  companyType: "B2B" as "B2B" | "B2C" | "Ambos",
  observations: "",
};

const FORM_CONTROL =
  "h-10 border-input bg-muted/35 px-3 text-sm shadow-none transition hover:bg-muted/45 focus-visible:bg-background";
const FORM_DATE_TIME_CONTROL = `${FORM_CONTROL} upflow-date-time-input`;
const FORM_SELECT =
  "h-10 w-full appearance-none rounded-md border border-input bg-muted/35 py-1 pl-3 pr-12 text-sm shadow-none outline-none transition hover:bg-muted/45 focus:bg-background focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

export default function CommercialLeadCreateSheet({
  open,
  projectId,
  workspaceId,
  onClose,
  onCreated,
}: Props) {
  const { t } = useLanguage();
  const firstFieldRef = useRef<HTMLInputElement | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [users, setUsers] = useState<TaskAssignee[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY_FORM);
    setLoadingUsers(true);
    fetch(`/api/users?workspace_id=${workspaceId}&status=active&limit=500`)
      .then(async (response) => {
        if (!response.ok) throw new Error(t("commercialLead.usersLoadFailed"));
        return response.json() as Promise<{ items?: TaskAssignee[] }>;
      })
      .then((data) => setUsers(data.items ?? []))
      .catch(() => toast.error(t("commercialLead.usersLoadFailed")))
      .finally(() => setLoadingUsers(false));
  }, [open, t, workspaceId]);

  const set = (key: keyof typeof EMPTY_FORM, value: string) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const setPresentationStart = (value: string) => {
    if (!value) {
      setForm((current) => ({
        ...current,
        presentationStart: "",
        presentationEnd: "",
      }));
      return;
    }
    const [hours, minutes] = value.split(":").map(Number);
    const endMinutes = (hours * 60 + minutes + 60) % (24 * 60);
    const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    setForm((current) => ({
      ...current,
      presentationStart: value,
      presentationEnd: end,
    }));
  };

  const openPicker = (event: React.MouseEvent<HTMLInputElement>) => {
    try {
      event.currentTarget.showPicker?.();
    } catch {
      event.currentTarget.focus();
    }
  };

  const presentationIso = (time: string, nextDayWhenEarlier = false) => {
    if (!form.presentationDate || !time) return null;
    const result = new Date(`${form.presentationDate}T${time}:00`);
    if (
      nextDayWhenEarlier &&
      form.presentationStart &&
      time <= form.presentationStart
    ) {
      result.setDate(result.getDate() + 1);
    }
    return result.toISOString();
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    if (
      (form.presentationDate ||
        form.presentationStart ||
        form.presentationEnd) &&
      !(form.presentationDate && form.presentationStart && form.presentationEnd)
    ) {
      toast.error(t("commercialLead.completePresentationWindow"));
      return;
    }
    const presentationStart = presentationIso(form.presentationStart);
    const presentationEnd = presentationIso(form.presentationEnd, true);
    if (
      presentationStart &&
      presentationEnd &&
      new Date(presentationEnd) <= new Date(presentationStart)
    ) {
      toast.error(t("commercialLead.invalidPresentationWindow"));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("/api/commercial/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          brand_name: form.brandName,
          owner_name: form.ownerName,
          owner_email: form.ownerEmail,
          instagram: form.instagram,
          monthly_revenue: Number(form.monthlyRevenue),
          whatsapp: form.whatsapp,
          presentation_starts_at: presentationStart,
          presentation_ends_at: presentationEnd,
          assignee_id: form.assigneeId,
          company_type: form.companyType,
          observations: form.observations || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as Task & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || t("commercialLead.createFailed"));
      toast.success(t("commercialLead.created"));
      onCreated(data);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.createFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && !submitting && onClose()}
    >
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogHeader className="border-b border-border px-5 py-4 text-left sm:px-6">
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <UserRound className="h-4 w-4" />
            {t("commercialLead.eyebrow")}
          </div>
          <DialogTitle>{t("commercialLead.createTitle")}</DialogTitle>
          <DialogDescription>
            {t("commercialLead.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("commercialLead.brandName")} required>
                <Input
                  ref={firstFieldRef}
                  autoFocus
                  required
                  value={form.brandName}
                  onChange={(e) => set("brandName", e.target.value)}
                  className={FORM_CONTROL}
                />
              </FormField>
              <FormField label={t("commercialLead.ownerName")} required>
                <Input
                  required
                  value={form.ownerName}
                  onChange={(e) => set("ownerName", e.target.value)}
                  className={FORM_CONTROL}
                />
              </FormField>
              <FormField label={t("commercialLead.ownerEmail")} required>
                <Input
                  type="email"
                  required
                  value={form.ownerEmail}
                  onChange={(e) => set("ownerEmail", e.target.value)}
                  className={FORM_CONTROL}
                />
              </FormField>
              <FormField label={t("commercialLead.instagram")} required>
                <div className="flex h-10 items-center rounded-md border border-input bg-muted/35 transition hover:bg-muted/45 focus-within:bg-background focus-within:ring-1 focus-within:ring-ring">
                  <span
                    aria-hidden="true"
                    className="border-r border-input px-3 text-sm font-semibold text-muted-foreground"
                  >
                    @
                  </span>
                  <Input
                    required
                    aria-label={t("commercialLead.instagramUsername")}
                    placeholder={t("commercialLead.instagramPlaceholder")}
                    value={form.instagram}
                    onChange={(e) =>
                      set(
                        "instagram",
                        e.target.value.replace(/^@+/, "").replace(/\s+/g, ""),
                      )
                    }
                    className="h-9 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </FormField>
              <FormField label={t("commercialLead.monthlyRevenue")} required>
                <FormSelect
                  required
                  value={form.monthlyRevenue}
                  onChange={(e) => set("monthlyRevenue", e.target.value)}
                >
                  <option value="">
                    {t("commercialLead.chooseRevenueTier")}
                  </option>
                  {COMMERCIAL_LEAD_REVENUE_TIERS.map((tier) => (
                    <option key={tier.value} value={tier.value}>
                      {t(tier.labelKey)}
                    </option>
                  ))}
                </FormSelect>
              </FormField>
              <FormField label={t("commercialLead.whatsapp")} required>
                <BrazilianWhatsAppInput
                  value={form.whatsapp}
                  onChange={(value) => set("whatsapp", value)}
                  countryLabel={t("commercialLead.whatsappCountry")}
                  placeholder={t("commercialLead.whatsappPlaceholder")}
                />
              </FormField>
              <FormField label={t("commercialLead.assignee")} required>
                <FormSelect
                  required
                  disabled={loadingUsers}
                  value={form.assigneeId}
                  onChange={(e) => set("assigneeId", e.target.value)}
                >
                  <option value="">
                    {loadingUsers
                      ? t("common.loading")
                      : t("commercialLead.chooseAssignee")}
                  </option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name} — {user.email}
                    </option>
                  ))}
                </FormSelect>
              </FormField>
              <FormField label={t("commercialLead.companyType")} required>
                <FormSelect
                  required
                  value={form.companyType}
                  onChange={(e) => set("companyType", e.target.value)}
                >
                  <option value="B2B">B2B</option>
                  <option value="B2C">B2C</option>
                  <option value="Ambos">
                    {t("commercialLead.companyType.both")}
                  </option>
                </FormSelect>
              </FormField>
            </div>
            <fieldset className="rounded-xl border border-border p-4">
              <legend className="px-2 text-sm font-semibold">
                {t("commercialLead.presentationWindow")}
              </legend>
              <p className="mb-4 text-xs text-muted-foreground">
                {t("commercialLead.presentationHint")}
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <FormField label={t("commercialLead.presentationDate")}>
                  <DateTimeControlIcon type="date">
                    <Input
                      type="date"
                      value={form.presentationDate}
                      onClick={openPicker}
                      onChange={(e) => set("presentationDate", e.target.value)}
                      className={FORM_DATE_TIME_CONTROL}
                    />
                  </DateTimeControlIcon>
                </FormField>
                <FormField label={t("commercialLead.startTime")}>
                  <DateTimeControlIcon type="time">
                    <Input
                      type="time"
                      value={form.presentationStart}
                      onClick={openPicker}
                      onInput={(e) =>
                        setPresentationStart(e.currentTarget.value)
                      }
                      className={FORM_DATE_TIME_CONTROL}
                    />
                  </DateTimeControlIcon>
                </FormField>
                <FormField label={t("commercialLead.endTime")}>
                  <DateTimeControlIcon type="time">
                    <Input
                      type="time"
                      value={form.presentationEnd}
                      onClick={openPicker}
                      onChange={(e) => set("presentationEnd", e.target.value)}
                      className={FORM_DATE_TIME_CONTROL}
                    />
                  </DateTimeControlIcon>
                </FormField>
              </div>
            </fieldset>
            <FormField label={t("commercialLead.observations")}>
              <Textarea
                rows={3}
                value={form.observations}
                onChange={(e) => set("observations", e.target.value)}
                className="border-input bg-muted/35 shadow-none transition hover:bg-muted/45 focus-visible:bg-background"
              />
            </FormField>
          </div>
          <DialogFooter className="border-t border-border px-5 py-4 sm:px-6">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
            >
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={submitting || loadingUsers}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {t("commercialLead.addLead")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FormSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block min-w-0">
      <select {...props} className={FORM_SELECT} />
      <ChevronDown
        aria-hidden="true"
        className="upflow-select-chevron pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}

function DateTimeControlIcon({
  type,
  children,
}: {
  type: "date" | "time";
  children: React.ReactNode;
}) {
  const Icon = type === "date" ? CalendarDays : Clock3;
  return (
    <span className="relative block min-w-0">
      {children}
      <Icon
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
      />
    </span>
  );
}

function BrazilianWhatsAppInput({
  value,
  onChange,
  countryLabel,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  countryLabel: string;
  placeholder: string;
}) {
  return (
    <span className="flex h-10 min-w-0 items-center rounded-md border border-input bg-muted/35 transition hover:bg-muted/45 focus-within:bg-background focus-within:ring-1 focus-within:ring-ring">
      <span
        className="flex h-full shrink-0 items-center gap-2 border-r border-input px-3 text-xs font-semibold text-muted-foreground"
        title={countryLabel}
      >
        <img
          src="https://flagcdn.com/w40/br.png"
          alt=""
          className="h-3.5 w-5 rounded-[2px] object-cover shadow-sm"
        />
        <span>+55</span>
      </span>
      <Input
        type="tel"
        inputMode="numeric"
        required
        pattern="[0-9]{2} [0-9]{5}-[0-9]{4}"
        maxLength={13}
        value={value}
        placeholder={placeholder}
        aria-label={`${countryLabel}: WhatsApp`}
        onChange={(event) =>
          onChange(formatBrazilianMobile(event.target.value))
        }
        className="h-9 min-w-0 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </span>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="block">
        <span>
          {label}
          {required ? <span className="ml-1 text-destructive">*</span> : null}
        </span>
        <span className="mt-2 block">{children}</span>
      </Label>
    </div>
  );
}
