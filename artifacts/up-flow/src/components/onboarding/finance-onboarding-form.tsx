"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Crown,
  DollarSign,
  FileLock2,
  IdCard,
  Loader2,
  Mail,
  Phone,
  Save,
  Send,
  Tag,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { cn, formatDate } from "@/lib/utils";

type FinanceCompany = {
  id: string;
  name: string;
  legal_name: string | null;
  cnpj: string | null;
  billing_email: string | null;
  main_contact_email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  billing_notes: string | null;
  contract_value: string | number | null;
  payment_terms: string | null;
  contract_start_date: string | null;
  plan_name: string | null;
  service_type: string | null;
};

type FinanceFormResponse = {
  can_edit: boolean;
  task: {
    id: string;
    title: string;
    status: string;
    assignee: { id: string; name: string; email: string } | null;
    project: { id: string; name: string } | null;
  };
  checklist_item: { id: string; title: string; status: string };
  company: FinanceCompany;
  onboarding: {
    id: string;
    status: string;
    progress: number;
    contracts: Array<{
      id: string;
      file_name: string;
      created_at: string;
      uploaded_at?: string | null;
      uploader?: { id: string; name: string; email: string } | null;
    }>;
  };
};

type FieldKey =
  | "legal_name"
  | "cnpj"
  | "phone"
  | "billing_email"
  | "plan_name"
  | "contract_value"
  | "service_type"
  | "main_contact_email"
  | "payment_terms"
  | "contract_start_date"
  | "billing_notes";

type Values = Record<FieldKey, string>;

type Props = {
  taskId: string;
  onClose?: () => void;
  onUpdate?: () => void | Promise<void>;
  embedded?: boolean;
};

const PLAN_OPTIONS = [
  "Plano Starter",
  "Plano Growth",
  "Plano Performance",
  "Plano Venture",
  "Plano Personalizado",
];

const SERVICE_TYPE_OPTIONS = ["B2B", "B2C"];

function emptyValues(): Values {
  return {
    legal_name: "",
    cnpj: "",
    phone: "",
    billing_email: "",
    plan_name: "",
    contract_value: "",
    service_type: "",
    main_contact_email: "",
    payment_terms: "",
    contract_start_date: "",
    billing_notes: "",
  };
}

const fieldInputClassName =
  "min-h-12 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-300/[0.15] dark:bg-[#071024]";

function toDateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function valuesFromCompany(company: FinanceCompany): Values {
  return {
    legal_name: company.legal_name ?? company.name ?? "",
    cnpj: company.cnpj ?? "",
    phone: company.phone ?? company.whatsapp ?? "",
    billing_email: company.billing_email ?? "",
    plan_name: company.plan_name ?? "",
    contract_value: company.contract_value != null ? String(company.contract_value) : "",
    service_type: company.service_type ?? "",
    main_contact_email: company.main_contact_email ?? "",
    payment_terms: company.payment_terms ?? "",
    contract_start_date: toDateTimeLocal(company.contract_start_date),
    billing_notes: company.billing_notes ?? "",
  };
}

function normalizeCurrency(value: string) {
  return value.replace(/[^\d,.-]/g, "");
}

export default function FinanceOnboardingForm({ taskId, onClose, onUpdate, embedded = false }: Props) {
  const { language, t } = useLanguage();
  const isPt = language === "pt-BR";
  const [form, setForm] = useState<FinanceFormResponse | null>(null);
  const [values, setValues] = useState<Values>(() => emptyValues());
  const valuesRef = useRef<Values>(emptyValues());
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<FieldKey | "all" | "contract" | null>(null);
  const [savedField, setSavedField] = useState<FieldKey | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const timers = useRef<Partial<Record<FieldKey, number>>>({});

  const copy = {
    eyebrow: isPt ? "Onboarding financeiro" : "Finance onboarding",
    title: isPt ? "Onboarding Financeiro" : "Finance Onboarding",
    subtitle: isPt
      ? "Preencha as informacoes financeiras do cliente para ativar o processo de onboarding."
      : "Complete the client's financial information to activate onboarding.",
    account: isPt ? "Dados da conta" : "Account details",
    contract: isPt ? "Informacoes do contrato" : "Contract information",
    attachment: isPt ? "Contrato anexado" : "Contract attachment",
    legal_name: isPt ? "Nome da Marca" : "Brand name",
    cnpj: "CNPJ",
    phone: isPt ? "Telefone" : "Phone",
    billing_email: "Email",
    plan_name: isPt ? "Plano Contratado" : "Contracted plan",
    contract_value: isPt ? "Mensalidade" : "Monthly fee",
    service_type: isPt ? "Tipo de Marca" : "Brand type",
    main_contact_email: isPt ? "Gestor Responsavel" : "Responsible manager",
    payment_terms: isPt ? "Comercial Responsavel" : "Commercial owner",
    contract_start_date: isPt ? "Data de Vencimento" : "Due date",
    billing_notes: isPt ? "Observacoes financeiras" : "Finance notes",
    upload: isPt ? "Anexar contrato" : "Attach contract",
    saveAdvance: isPt ? "Salvar e avancar" : "Save and continue",
    autosave: isPt ? "Campos salvam automaticamente." : "Fields save automatically.",
    saved: isPt ? "Tudo salvo" : "All saved",
    viewOnly: isPt ? "Voce tem acesso somente leitura." : "You have view-only access.",
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/onboarding/finance-form/${taskId}`);
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || (isPt ? "Nao foi possivel carregar o cadastro financeiro." : "Could not load finance onboarding."));
      }
      const data = (await res.json()) as FinanceFormResponse;
      const nextValues = valuesFromCompany(data.company);
      setForm(data);
      valuesRef.current = nextValues;
      setValues(nextValues);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isPt ? "Erro ao carregar cadastro financeiro." : "Failed to load finance onboarding.");
      onClose?.();
    } finally {
      setLoading(false);
    }
  }, [isPt, onClose, taskId]);

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
      const res = await fetch(`/api/onboarding/finance-form/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || (isPt ? "Nao foi possivel salvar." : "Could not save."));
      }
      const data = (await res.json()) as FinanceFormResponse;
      setForm(data);
      return data;
    },
    [isPt, taskId],
  );

  const saveField = useCallback(
    async (field: FieldKey) => {
      if (!form?.can_edit) return;
      setSavingField(field);
      try {
        await savePatch({ finance: valuesRef.current });
        setSavedField(field);
        window.setTimeout(() => setSavedField((current) => (current === field ? null : current)), 1400);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : isPt ? "Nao foi possivel salvar." : "Could not save.");
      } finally {
        setSavingField((current) => (current === field ? null : current));
      }
    },
    [form?.can_edit, isPt, savePatch],
  );

  const setField = (field: FieldKey, value: string) => {
    const cleanValue = field === "contract_value" ? normalizeCurrency(value) : value;
    const next = { ...valuesRef.current, [field]: cleanValue };
    valuesRef.current = next;
    setValues(next);
    if (timers.current[field]) clearTimeout(timers.current[field]);
    timers.current[field] = window.setTimeout(() => void saveField(field), 550);
  };

  const saveAll = async () => {
    if (!form?.can_edit) return;
    for (const timer of Object.values(timers.current)) {
      if (timer) clearTimeout(timer);
    }
    timers.current = {};
    setSavingField("all");
    try {
      await savePatch({ finance: valuesRef.current });
      toast.success(copy.saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isPt ? "Nao foi possivel salvar." : "Could not save.");
    } finally {
      setSavingField(null);
    }
  };

  const complete = async () => {
    if (!form?.can_edit) return;
    for (const timer of Object.values(timers.current)) {
      if (timer) clearTimeout(timer);
    }
    timers.current = {};
    setFinalizing(true);
    try {
      await savePatch({ finance: valuesRef.current, complete: true });
      toast.success(isPt ? "Cadastro financeiro concluido." : "Finance onboarding completed.");
      await onUpdate?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isPt ? "Nao foi possivel concluir." : "Could not complete.");
    } finally {
      setFinalizing(false);
    }
  };

  const uploadContract = async (file: File | undefined) => {
    if (!file || !form?.can_edit || !form?.onboarding.id) return;
    setSavingField("contract");
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch(`/api/onboarding/${form.onboarding.id}/contract`, {
        method: "POST",
        body,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || (isPt ? "Nao foi possivel anexar o contrato." : "Could not upload contract."));
      }
      toast.success(isPt ? "Contrato anexado." : "Contract uploaded.");
      await load();
      await onUpdate?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isPt ? "Nao foi possivel anexar o contrato." : "Could not upload contract.");
    } finally {
      setSavingField(null);
    }
  };

  const completed = form?.checklist_item.status === "complete" || form?.task.status === "done";

  return (
    <div className={cn(embedded ? "w-full" : "fixed inset-0 z-[80] overflow-y-auto bg-slate-950/60 px-3 py-5 backdrop-blur-md sm:px-6 dark:bg-[#020617]/[0.85]")}>
      <div className={cn("rounded-3xl border border-border bg-card text-card-foreground shadow-[0_30px_120px_rgba(37,99,235,0.16)] dark:border-blue-300/25 dark:bg-[#050b18]", embedded ? "w-full" : "mx-auto w-full max-w-[1180px]")}>
        <div className={cn("flex flex-col gap-6 border-b border-border p-5 dark:border-blue-300/10 sm:p-8 lg:flex-row lg:items-center lg:justify-between", !embedded && "sticky top-0 z-10 bg-card/95 backdrop-blur dark:bg-[#050b18]/95")}>
          <div className="flex min-w-0 items-start gap-5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-blue-300/40 bg-blue-500/[0.15] text-blue-700 shadow-[0_0_36px_rgba(59,130,246,0.2)] dark:border-blue-300/30 dark:bg-blue-500/20 dark:text-blue-100 dark:shadow-[0_0_36px_rgba(59,130,246,0.35)]">
              <FileLock2 className="h-8 w-8" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-blue-300">{copy.eyebrow}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                {copy.title}
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
              {form && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{form.company.name}</span>
                  <span>{form.task.assignee?.name ?? t("companyDialog.notAssigned")}</span>
                  <span>{form.task.project?.name ?? "Finance"}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {form && (
              <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", completed ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200" : "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-100")}>
                {completed ? (isPt ? "Concluido" : "Complete") : (isPt ? "Em andamento" : "In progress")}
              </span>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                title={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[420px] items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <>
            <div className="space-y-5 p-5 sm:p-8">
              <SectionTitle title={copy.account} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field icon={<Building2 className="h-5 w-5" />} label={copy.legal_name} saving={savingField === "legal_name"} saved={savedField === "legal_name"}>
                  <input value={values.legal_name} disabled={!form?.can_edit} onChange={(event) => setField("legal_name", event.target.value)} placeholder={isPt ? "Ex.: Lilia Rosa" : "E.g. Lilia Rosa"} className={fieldInputClassName} />
                </Field>
                <Field icon={<IdCard className="h-5 w-5" />} label={copy.cnpj} saving={savingField === "cnpj"} saved={savedField === "cnpj"}>
                  <input value={values.cnpj} disabled={!form?.can_edit} onChange={(event) => setField("cnpj", event.target.value)} placeholder="00.000.000/0000-00" className={fieldInputClassName} />
                </Field>
                <Field icon={<Phone className="h-5 w-5" />} label={copy.phone} saving={savingField === "phone"} saved={savedField === "phone"}>
                  <input value={values.phone} disabled={!form?.can_edit} onChange={(event) => setField("phone", event.target.value)} placeholder="(11) 99999-9999" className={fieldInputClassName} />
                </Field>
                <Field icon={<Mail className="h-5 w-5" />} label={copy.billing_email} saving={savingField === "billing_email"} saved={savedField === "billing_email"}>
                  <input value={values.billing_email} disabled={!form?.can_edit} onChange={(event) => setField("billing_email", event.target.value)} placeholder={isPt ? "email@exemplo.com" : "email@example.com"} className={fieldInputClassName} />
                </Field>
              </div>

              <SectionTitle title={copy.contract} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field icon={<Crown className="h-5 w-5" />} label={copy.plan_name} saving={savingField === "plan_name"} saved={savedField === "plan_name"}>
                  <select value={values.plan_name} disabled={!form?.can_edit} onChange={(event) => setField("plan_name", event.target.value)} className={fieldInputClassName}>
                    <option value="">{isPt ? "Selecione o plano" : "Select plan"}</option>
                    {PLAN_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field icon={<DollarSign className="h-5 w-5" />} label={copy.contract_value} saving={savingField === "contract_value"} saved={savedField === "contract_value"}>
                  <input value={values.contract_value} disabled={!form?.can_edit} onChange={(event) => setField("contract_value", event.target.value)} placeholder="R$ 0,00" className={fieldInputClassName} />
                </Field>
                <Field icon={<Tag className="h-5 w-5" />} label={copy.service_type} saving={savingField === "service_type"} saved={savedField === "service_type"}>
                  <select value={values.service_type} disabled={!form?.can_edit} onChange={(event) => setField("service_type", event.target.value)} className={fieldInputClassName}>
                    <option value="">{isPt ? "Selecione o tipo" : "Select type"}</option>
                    {SERVICE_TYPE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </Field>
                <Field icon={<UserRound className="h-5 w-5" />} label={copy.main_contact_email} saving={savingField === "main_contact_email"} saved={savedField === "main_contact_email"}>
                  <input value={values.main_contact_email} disabled={!form?.can_edit} onChange={(event) => setField("main_contact_email", event.target.value)} placeholder={isPt ? "Nome do gestor responsável" : "Responsible manager"} className={fieldInputClassName} />
                </Field>
                <Field icon={<UserRound className="h-5 w-5" />} label={copy.payment_terms} saving={savingField === "payment_terms"} saved={savedField === "payment_terms"}>
                  <input value={values.payment_terms} disabled={!form?.can_edit} onChange={(event) => setField("payment_terms", event.target.value)} placeholder={isPt ? "Nome do comercial responsável" : "Commercial owner"} className={fieldInputClassName} />
                </Field>
                <Field icon={<CalendarDays className="h-5 w-5" />} label={copy.contract_start_date} saving={savingField === "contract_start_date"} saved={savedField === "contract_start_date"}>
                  <input type="datetime-local" value={values.contract_start_date} disabled={!form?.can_edit} onChange={(event) => setField("contract_start_date", event.target.value)} className={fieldInputClassName} />
                </Field>
              </div>

              <Field icon={<Save className="h-5 w-5" />} label={copy.billing_notes} saving={savingField === "billing_notes"} saved={savedField === "billing_notes"}>
                <textarea value={values.billing_notes} disabled={!form?.can_edit} onChange={(event) => setField("billing_notes", event.target.value)} rows={3} className={cn(fieldInputClassName, "resize-none py-3")} />
              </Field>

              <div className="rounded-2xl border border-border bg-muted/30 p-4 dark:border-blue-300/10 dark:bg-white/[0.15]">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <FileLock2 className="h-4 w-4 text-blue-300" />
                    {copy.attachment}
                  </div>
                  <label className={cn("inline-flex cursor-pointer items-center gap-2 rounded-xl border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-500/[0.15] dark:border-blue-300/20 dark:text-blue-100", !form?.can_edit && "pointer-events-none opacity-50")}>
                    {savingField === "contract" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {copy.upload}
                    <input type="file" className="hidden" onChange={(event) => void uploadContract(event.target.files?.[0])} />
                  </label>
                </div>
                <div className="space-y-2">
                  {(form?.onboarding.contracts ?? []).map((contract) => (
                    <div key={contract.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground dark:border-white/10 dark:bg-[#071024]">
                      <span className="min-w-0 truncate">{contract.file_name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatDate(contract.created_at, language)}</span>
                    </div>
                  ))}
                  {(form?.onboarding.contracts ?? []).length === 0 && (
                    <p className="rounded-xl border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground dark:border-white/10 dark:bg-[#071024]">
                      {isPt ? "Nenhum contrato anexado ainda." : "No contract attached yet."}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className={cn("flex flex-col gap-3 border-t border-border bg-card/95 p-5 dark:border-blue-300/10 dark:bg-[#050b18]/95 sm:flex-row sm:items-center sm:justify-between sm:px-8", !embedded && "sticky bottom-0 backdrop-blur")}>
              <p className="text-xs text-muted-foreground">{form?.can_edit ? copy.autosave : copy.viewOnly}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={saveAll}
                  disabled={!form?.can_edit || savingField === "all"}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60 dark:border-blue-300/[0.15] dark:bg-white/5 dark:hover:bg-white/10"
                >
                  {savingField === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {isPt ? "Salvar resumo" : "Save summary"}
                </button>
                <button
                  type="button"
                  onClick={complete}
                  disabled={!form?.can_edit || finalizing}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_28px_rgba(59,130,246,0.3)] hover:bg-blue-400 disabled:opacity-60"
                >
                  {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : completed ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  {completed ? (isPt ? "Cadastro concluido" : "Completed") : copy.saveAdvance}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_16px_rgba(59,130,246,0.9)]" />
      <h3 className="text-base font-bold text-foreground">{title}</h3>
      <span className="h-px flex-1 bg-blue-300/[0.15]" />
    </div>
  );
}

function Field({
  icon,
  label,
  children,
  saving,
  saved,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  saving?: boolean;
  saved?: boolean;
}) {
  return (
    <label className="block rounded-2xl border border-border bg-muted/30 p-4 shadow-sm dark:border-blue-300/10 dark:bg-white/[0.15] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-blue-50">
          <span className="text-blue-400">{icon}</span>
          <span className="truncate">{label}</span>
        </span>
        <span className="min-w-[58px] text-right text-[10px] font-semibold text-muted-foreground">
          {saving ? "Salvando" : saved ? "Salvo" : ""}
        </span>
      </div>
      {children}
    </label>
  );
}
