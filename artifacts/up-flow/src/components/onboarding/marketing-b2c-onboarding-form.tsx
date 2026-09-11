"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Circle,
  CreditCard,
  FileText,
  Globe2,
  Instagram,
  Loader2,
  LockKeyhole,
  Mail,
  MapPin,
  Megaphone,
  PackageCheck,
  Phone,
  RefreshCcw,
  Save,
  Send,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Target,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { cn, formatDate } from "@/lib/utils";

type FieldKey =
  | "brandName"
  | "officialSite"
  | "instagram"
  | "brandSince"
  | "digitalSince"
  | "brandDescription"
  | "currentMoment"
  | "topProducts"
  | "averageTicket"
  | "monthlyRevenue"
  | "monthlyBudget"
  | "targetAudience"
  | "ageRange"
  | "regions"
  | "purchaseMotivation"
  | "ecommercePlatform"
  | "storeUrl"
  | "catalogStatus"
  | "feedStockStatus"
  | "checkoutPaymentNotes"
  | "metaPixelStatus"
  | "googleAdsStatus"
  | "mediaBudgetMeta"
  | "mediaBudgetGoogle"
  | "campaignGoals"
  | "marketingResponsible"
  | "ecommerceResponsible"
  | "creativeApprover"
  | "whatsapp"
  | "email";

type B2CFormResponse = {
  id: string;
  status: string;
  values: Partial<Record<FieldKey, string>>;
  completed_at: string | null;
  can_edit: boolean;
  task: {
    id: string;
    title: string;
    status: string;
    assignee: { id: string; name: string; email: string } | null;
    project: { id: string; name: string } | null;
  };
  company: { id: string; name: string; website: string | null; industry: string | null };
  onboarding: {
    id: string;
    status: string;
    progress: number;
    contracted_services: string[] | null;
  };
};

type FieldDefinition = {
  key: FieldKey;
  icon: ComponentType<{ className?: string }>;
  multiline?: boolean;
};

type SectionDefinition = {
  key: string;
  tone: "blue" | "amber" | "violet" | "rose" | "emerald" | "slate";
  fields: FieldDefinition[];
};

const sections: SectionDefinition[] = [
  {
    key: "brand",
    tone: "blue",
    fields: [
      { key: "brandName", icon: Building2 },
      { key: "officialSite", icon: Globe2 },
      { key: "instagram", icon: Instagram },
      { key: "brandSince", icon: CalendarDays },
      { key: "digitalSince", icon: CalendarDays },
      { key: "brandDescription", icon: FileText, multiline: true },
    ],
  },
  {
    key: "currentMoment",
    tone: "violet",
    fields: [
      { key: "currentMoment", icon: BarChart3, multiline: true },
      { key: "topProducts", icon: PackageCheck, multiline: true },
      { key: "averageTicket", icon: CreditCard },
      { key: "monthlyRevenue", icon: BarChart3 },
      { key: "monthlyBudget", icon: Megaphone },
    ],
  },
  {
    key: "audience",
    tone: "amber",
    fields: [
      { key: "targetAudience", icon: Target, multiline: true },
      { key: "ageRange", icon: UsersRound },
      { key: "regions", icon: MapPin },
      { key: "purchaseMotivation", icon: ShoppingBag, multiline: true },
    ],
  },
  {
    key: "ecommerce",
    tone: "emerald",
    fields: [
      { key: "ecommercePlatform", icon: ShoppingCart },
      { key: "storeUrl", icon: Globe2 },
      { key: "catalogStatus", icon: PackageCheck },
      { key: "feedStockStatus", icon: PackageCheck },
      { key: "checkoutPaymentNotes", icon: CreditCard, multiline: true },
    ],
  },
  {
    key: "traffic",
    tone: "rose",
    fields: [
      { key: "metaPixelStatus", icon: ShieldCheck },
      { key: "googleAdsStatus", icon: BarChart3 },
      { key: "mediaBudgetMeta", icon: Megaphone },
      { key: "mediaBudgetGoogle", icon: Megaphone },
      { key: "campaignGoals", icon: Target, multiline: true },
    ],
  },
  {
    key: "people",
    tone: "slate",
    fields: [
      { key: "marketingResponsible", icon: UserRound },
      { key: "ecommerceResponsible", icon: UserRound },
      { key: "creativeApprover", icon: CheckCircle2 },
      { key: "whatsapp", icon: Phone },
      { key: "email", icon: Mail },
    ],
  },
];

const fieldKeys = sections.flatMap((section) => section.fields.map((field) => field.key));

const toneClasses: Record<SectionDefinition["tone"], string> = {
  blue: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-200",
  amber: "border-amber-500/[0.35] bg-amber-500/10 text-amber-700 dark:text-amber-200",
  violet: "border-violet-500/[0.35] bg-violet-500/10 text-violet-700 dark:text-violet-200",
  rose: "border-rose-500/[0.35] bg-rose-500/10 text-rose-700 dark:text-rose-200",
  emerald: "border-emerald-500/[0.35] bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
  slate: "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-200",
};

function statusClass(status: string) {
  if (status === "complete") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200";
  return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-100";
}

function cleanValues(values: Partial<Record<FieldKey, string>> | undefined) {
  const result = {} as Record<FieldKey, string>;
  for (const key of fieldKeys) result[key] = values?.[key] ?? "";
  return result;
}

type Props = {
  taskId: string;
  onClose?: () => void;
  onUpdate?: () => void | Promise<void>;
  embedded?: boolean;
};

export default function MarketingB2COnboardingForm({ taskId, onClose, onUpdate, embedded = false }: Props) {
  const { language, t } = useLanguage();
  const [form, setForm] = useState<B2CFormResponse | null>(null);
  const [values, setValues] = useState<Record<FieldKey, string>>(() => cleanValues(undefined));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<FieldKey | "all" | null>(null);
  const [savedField, setSavedField] = useState<FieldKey | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const timers = useRef<Partial<Record<FieldKey, number>>>({});
  const valuesRef = useRef<Record<FieldKey, string>>(cleanValues(undefined));

  const filledCount = useMemo(
    () => fieldKeys.filter((key) => values[key]?.trim()).length,
    [values],
  );
  const fieldProgress = Math.round((filledCount / fieldKeys.length) * 100);
  const completed = form?.status === "complete";

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/onboarding/marketing-b2c-form/${taskId}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t("marketingB2CForm.loadFailed"));
      }
      const data = (await res.json()) as B2CFormResponse;
      const normalizedValues = cleanValues(data.values);
      setForm(data);
      valuesRef.current = normalizedValues;
      setValues(normalizedValues);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("marketingB2CForm.loadFailed");
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [t, taskId]);

  useEffect(() => {
    void load();
    return () => {
      for (const timer of Object.values(timers.current)) {
        if (timer) clearTimeout(timer);
      }
    };
  }, [load]);

  const savePatch = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/onboarding/marketing-b2c-form/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || t("marketingB2CForm.saveFailed"));
      }
      const data = (await res.json()) as B2CFormResponse;
      setForm(data);
      return data;
    },
    [t, taskId],
  );

  const saveField = useCallback(
    async (field: FieldKey) => {
      if (!form?.can_edit) return;
      setSavingField(field);
      try {
        await savePatch({ values: valuesRef.current });
        setSavedField(field);
        window.setTimeout(() => setSavedField((current) => (current === field ? null : current)), 1400);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : t("marketingB2CForm.saveFailed"));
      } finally {
        setSavingField((current) => (current === field ? null : current));
      }
    },
    [form?.can_edit, savePatch, t],
  );

  const scheduleFieldSave = (field: FieldKey, value: string) => {
    const nextValues = { ...valuesRef.current, [field]: value };
    valuesRef.current = nextValues;
    setValues(nextValues);
    if (timers.current[field]) clearTimeout(timers.current[field]);
    timers.current[field] = window.setTimeout(() => {
      void saveField(field);
    }, 900);
  };

  const saveAllNow = async () => {
    if (!form?.can_edit) return;
    for (const timer of Object.values(timers.current)) {
      if (timer) clearTimeout(timer);
    }
    timers.current = {};
    setSavingField("all");
    try {
      await savePatch({ values: valuesRef.current });
      toast.success(t("marketingB2CForm.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("marketingB2CForm.saveFailed"));
    } finally {
      setSavingField(null);
    }
  };

  const finalize = async () => {
    if (!form?.can_edit || completed) return;
    for (const timer of Object.values(timers.current)) {
      if (timer) clearTimeout(timer);
    }
    timers.current = {};
    setFinalizing(true);
    try {
      await savePatch({ values: valuesRef.current, finalize: true });
      toast.success(t("marketingB2CForm.finalized"));
      await onUpdate?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("marketingB2CForm.finalizeFailed"));
    } finally {
      setFinalizing(false);
    }
  };

  const fieldLabel = (key: FieldKey) => t(`marketingB2CForm.field.${key}`);
  const fieldPlaceholder = (key: FieldKey) => t(`marketingB2CForm.placeholder.${key}`);

  if (!loading && !form) {
    return (
      <div className={cn(
        "rounded-2xl border border-rose-300/30 bg-card p-6 text-card-foreground shadow-sm",
        !embedded && "fixed inset-4 z-[80] overflow-y-auto",
      )}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-rose-300/30 bg-rose-500/10 text-rose-500">
              <AlertCircle className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="text-base font-bold">{t("marketingB2CForm.loadFailed")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{loadError ?? t("marketingB2CForm.loadFailed")}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {onClose ? (
              <button type="button" onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold hover:bg-muted">
                {t("common.close")}
              </button>
            ) : null}
            <button type="button" onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white hover:bg-blue-500">
              <RefreshCcw className="h-4 w-4" />
              {t("common.retry")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      embedded ? "w-full" : "fixed inset-0 z-[80] overflow-y-auto bg-slate-950/60 px-3 py-5 backdrop-blur-md sm:px-6 dark:bg-[#020617]/[0.85]",
    )}>
      <div className={cn(
        "w-full rounded-2xl border border-border bg-card text-card-foreground shadow-[0_30px_120px_rgba(37,99,235,0.16)] dark:border-blue-300/25 dark:bg-[#050a18]",
        !embedded && "mx-auto max-w-[1480px]",
      )}>
        <div className={cn(
          "border-b border-border bg-card/95 px-4 py-4 backdrop-blur dark:border-blue-300/10 dark:bg-[#050a18]/95 sm:px-6",
          !embedded && "sticky top-0 z-10",
        )}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-blue-400/30 bg-blue-500/[0.15] text-blue-700 dark:border-blue-300/20 dark:text-blue-100">
                  <ShoppingBag className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-blue-300">
                    {t("marketingB2CForm.eyebrow")}
                  </p>
                  <h2 className="mt-1 truncate text-2xl font-bold text-foreground">
                    {loading ? t("common.loading") : form?.company.name ?? t("marketingB2CForm.title")}
                  </h2>
                </div>
                {form && (
                  <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", statusClass(form.status))}>
                    {completed ? t("marketingB2CForm.status.complete") : t("marketingB2CForm.status.draft")}
                  </span>
                )}
              </div>
              {form && (
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span>{form.task.assignee?.name ?? t("companyDialog.notAssigned")}</span>
                  <span>{form.task.project?.name ?? t("marketingB2CForm.department")}</span>
                  {form.completed_at && <span>{t("marketingB2CForm.completedAt", { date: formatDate(form.completed_at, language) })}</span>}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="min-w-[220px] rounded-xl border border-border bg-muted/30 p-3 dark:border-blue-300/[0.15] dark:bg-white/[0.15]">
                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{t("marketingB2CForm.fieldProgress", { done: filledCount, total: fieldKeys.length })}</span>
                  <span>{fieldProgress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted dark:bg-white/[0.15]">
                  <div className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" style={{ width: `${fieldProgress}%` }} />
                </div>
              </div>
              {onClose && (
                <button
                  onClick={onClose}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                  title={t("common.close")}
                >
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <>
            <div className="grid gap-4 p-4 xl:grid-cols-[repeat(6,minmax(0,1fr))] sm:p-6">
              {sections.map((section, index) => {
                const sectionFilled = section.fields.filter((field) => values[field.key]?.trim()).length;
                const sectionDone = sectionFilled === section.fields.length;
                return (
                  <section
                    key={section.key}
                    className={cn(
                      "min-w-0 rounded-2xl border border-border bg-muted/30 p-4 shadow-sm dark:border-blue-300/[0.15] dark:bg-[#0a1223]/[0.82] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
                      index < 4 ? "xl:col-span-3" : "xl:col-span-3",
                    )}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold", toneClasses[section.tone])}>
                            {sectionFilled}
                          </span>
                          <h3 className="min-w-0 truncate text-sm font-bold uppercase tracking-[0.08em] text-foreground">
                            {t(`marketingB2CForm.section.${section.key}`)}
                          </h3>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {sectionDone ? t("marketingB2CForm.sectionComplete") : t("marketingB2CForm.sectionProgress", { done: sectionFilled, total: section.fields.length })}
                        </p>
                      </div>
                      {sectionDone ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      {section.fields.map((field) => {
                        const Icon = field.icon;
                        const value = values[field.key] ?? "";
                        const isSaving = savingField === field.key;
                        const isSaved = savedField === field.key;
                        return (
                          <label key={field.key} className={cn("block", field.multiline ? "sm:col-span-2" : "")}>
                            <div className="mb-1.5 flex items-center justify-between gap-3">
                              <span className="flex min-w-0 items-center gap-2 text-xs font-semibold text-blue-700 dark:text-blue-100/[0.55]">
                                <Icon className="h-3.5 w-3.5 shrink-0 text-blue-300/80" />
                                <span className="truncate">{fieldLabel(field.key)}</span>
                              </span>
                              <span className="min-w-[54px] text-right text-[10px] font-semibold text-muted-foreground">
                                {isSaving ? t("common.saving") : isSaved ? t("marketingB2CForm.savedShort") : ""}
                              </span>
                            </div>
                            {field.multiline ? (
                              <textarea
                                value={value}
                                disabled={!form?.can_edit}
                                onChange={(event) => scheduleFieldSave(field.key, event.target.value)}
                                placeholder={fieldPlaceholder(field.key)}
                                rows={3}
                                className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-blue-400 disabled:opacity-60 dark:border-white/10 dark:bg-[#050a18]"
                              />
                            ) : (
                              <input
                                value={value}
                                disabled={!form?.can_edit}
                                onChange={(event) => scheduleFieldSave(field.key, event.target.value)}
                                placeholder={fieldPlaceholder(field.key)}
                                className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-blue-400 disabled:opacity-60 dark:border-white/10 dark:bg-[#050a18]"
                              />
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </section>
                );
              })}

              <section className="min-w-0 rounded-2xl border border-border bg-muted/30 p-4 dark:border-blue-300/[0.15] dark:bg-[#0a1223]/[0.82] xl:col-span-6">
                <div className="grid gap-4 lg:grid-cols-[1fr_260px] lg:items-center">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center gap-2">
                      <span className={cn("flex h-8 w-8 items-center justify-center rounded-full border", completed ? toneClasses.emerald : toneClasses.slate)}>
                        {completed ? <Check className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                      </span>
                      <div>
                        <h3 className="text-base font-bold text-foreground">{t("marketingB2CForm.finalValidation")}</h3>
                        <p className="text-xs text-muted-foreground">
                          {completed ? t("marketingB2CForm.reopenHint") : t("marketingB2CForm.finalHint")}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("marketingB2CForm.optionalHint")}
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-background p-4 dark:border-white/10 dark:bg-[#050a18]">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700/75 dark:text-blue-100/[0.55]">
                      {t("marketingB2CForm.centralProgress")}
                    </p>
                    <p className="mt-2 text-3xl font-bold text-foreground">{form?.onboarding.progress ?? 0}%</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t("marketingB2CForm.centralProgressHint")}</p>
                  </div>
                </div>
              </section>
            </div>

            <div className={cn(
              "flex flex-col gap-3 border-t border-border bg-card/95 p-4 backdrop-blur dark:border-blue-300/10 dark:bg-[#050a18]/95 sm:flex-row sm:items-center sm:justify-between sm:px-6",
              !embedded && "sticky bottom-0",
            )}>
              <p className="text-xs text-muted-foreground">
                {form?.can_edit ? t("marketingB2CForm.autosaveHint") : t("marketingB2CForm.viewOnlyHint")}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  onClick={saveAllNow}
                  disabled={!form?.can_edit || savingField === "all"}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60 dark:border-blue-300/[0.15] dark:bg-white/5 dark:hover:bg-white/10"
                >
                  {savingField === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t("marketingB2CForm.saveSummary")}
                </button>
                <button
                  onClick={finalize}
                  disabled={!form?.can_edit || completed || finalizing}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_28px_rgba(59,130,246,0.3)] disabled:opacity-70",
                    completed ? "bg-emerald-600" : "upflow-gradient-button",
                  )}
                >
                  {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : completed ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  {completed ? t("marketingB2CForm.finalizedAction") : t("marketingB2CForm.finalizeAction")}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
