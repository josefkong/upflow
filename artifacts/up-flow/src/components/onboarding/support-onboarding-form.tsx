"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  Link2,
  Loader2,
  MessageSquareText,
  Save,
  Send,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";

type SupportGroup = {
  id: string;
  group_created: boolean;
  group_name: string | null;
  group_link: string | null;
  main_client_contact: string | null;
  commercial_responsible: string | null;
  account_responsible: string | null;
  internal_participants: unknown;
  client_participants: unknown;
  status: string | null;
  notes: string | null;
};

type SupportFormResponse = {
  can_edit: boolean;
  task: {
    id: string;
    title: string;
    status: string;
    assignee: { id: string; name: string; email: string } | null;
    project: { id: string; name: string } | null;
  } | null;
  checklist_item: { id: string; title: string; status: string };
  company: {
    id: string;
    name: string;
    main_contact_email: string | null;
    phone: string | null;
    whatsapp: string | null;
  };
  onboarding: {
    id: string;
    status: string;
    progress: number;
  };
  support_group: SupportGroup | null;
};

type FieldKey =
  | "group_name"
  | "group_link"
  | "main_client_contact"
  | "commercial_responsible"
  | "account_responsible"
  | "internal_participants"
  | "client_participants"
  | "status"
  | "notes";

type Values = Record<FieldKey, string>;

type Props = {
  taskId: string;
  onClose?: () => void;
  onUpdate?: () => void | Promise<void>;
  embedded?: boolean;
};

const STATUS_OPTIONS = [
  { value: "not_created", pt: "Nao criado", en: "Not created" },
  { value: "pending_client", pt: "Aguardando cliente", en: "Waiting on client" },
  { value: "created", pt: "Criado", en: "Created" },
];

const fieldInputClassName =
  "min-h-12 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/25 disabled:cursor-not-allowed disabled:opacity-60 dark:border-blue-300/[0.15] dark:bg-[#071024]";

function emptyValues(): Values {
  return {
    group_name: "",
    group_link: "",
    main_client_contact: "",
    commercial_responsible: "",
    account_responsible: "",
    internal_participants: "",
    client_participants: "",
    status: "not_created",
    notes: "",
  };
}

function listToText(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string").join("\n");
  if (typeof value === "string") return value;
  return "";
}

function valuesFromData(data: SupportFormResponse): Values {
  const supportGroup = data.support_group;
  return {
    group_name: supportGroup?.group_name ?? `${data.company.name} - suporte`,
    group_link: supportGroup?.group_link ?? "",
    main_client_contact:
      supportGroup?.main_client_contact ??
      data.company.main_contact_email ??
      data.company.whatsapp ??
      data.company.phone ??
      "",
    commercial_responsible: supportGroup?.commercial_responsible ?? "",
    account_responsible: supportGroup?.account_responsible ?? data.task?.assignee?.name ?? "",
    internal_participants: listToText(supportGroup?.internal_participants),
    client_participants: listToText(supportGroup?.client_participants),
    status: supportGroup?.status ?? (supportGroup?.group_created ? "created" : "not_created"),
    notes: supportGroup?.notes ?? "",
  };
}

export default function SupportOnboardingForm({ taskId, onClose, onUpdate, embedded = false }: Props) {
  const { language, t } = useLanguage();
  const isPt = language === "pt-BR";
  const [form, setForm] = useState<SupportFormResponse | null>(null);
  const [values, setValues] = useState<Values>(() => emptyValues());
  const valuesRef = useRef<Values>(emptyValues());
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<FieldKey | "all" | null>(null);
  const [savedField, setSavedField] = useState<FieldKey | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  const timers = useRef<Partial<Record<FieldKey, number>>>({});

  const copy = {
    eyebrow: isPt ? "Onboarding de suporte" : "Support onboarding",
    title: isPt ? "Setup de suporte" : "Support Setup",
    subtitle: isPt
      ? "Configure o grupo ou canal do cliente para iniciar a comunicacao operacional."
      : "Set up the client group or channel for operational communication.",
    group: isPt ? "Dados do grupo" : "Group details",
    participants: isPt ? "Participantes" : "Participants",
    group_name: isPt ? "Nome do grupo" : "Group name",
    group_link: isPt ? "Link do grupo" : "Group link",
    status: "Status",
    main_client_contact: isPt ? "Contato principal do cliente" : "Main client contact",
    commercial_responsible: isPt ? "Comercial responsavel" : "Commercial owner",
    account_responsible: isPt ? "Responsavel da conta" : "Account owner",
    internal_participants: isPt ? "Participantes internos" : "Internal participants",
    client_participants: isPt ? "Participantes do cliente" : "Client participants",
    notes: isPt ? "Observacoes do suporte" : "Support notes",
    save: isPt ? "Salvar resumo" : "Save summary",
    complete: isPt ? "Marcar grupo criado" : "Mark group created",
    completed: isPt ? "Grupo criado" : "Group created",
    autosave: isPt ? "Campos salvam automaticamente." : "Fields save automatically.",
    viewOnly: isPt ? "Voce tem acesso somente leitura." : "You have view-only access.",
  };

  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/onboarding/support-form/${taskId}`, { signal });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || (isPt ? "Nao foi possivel carregar o setup de suporte." : "Could not load support setup."));
      }
      const data = (await res.json()) as SupportFormResponse;
      if (signal.aborted) return;
      const nextValues = valuesFromData(data);
      setForm(data);
      setValues(nextValues);
      valuesRef.current = nextValues;
    } catch (err) {
      if (!signal.aborted) {
        toast.error(err instanceof Error ? err.message : isPt ? "Erro ao carregar suporte." : "Failed to load support setup.");
        onClose?.();
      }
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [isPt, onClose, taskId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => {
      controller.abort();
      for (const timer of Object.values(timers.current)) {
        if (timer) clearTimeout(timer);
      }
    };
  }, [load]);

  const savePatch = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch(`/api/onboarding/support-form/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || (isPt ? "Nao foi possivel salvar." : "Could not save."));
      }
      const data = (await res.json()) as SupportFormResponse;
      setForm(data);
      return data;
    },
    [isPt, taskId],
  );

  const supportPayload = useCallback(
    (current: Values) => ({
      ...current,
      group_created: current.status === "created" || Boolean(form?.support_group?.group_created),
    }),
    [form?.support_group?.group_created],
  );

  const saveField = useCallback(
    async (field: FieldKey) => {
      if (!form?.can_edit) return;
      setSavingField(field);
      try {
        await savePatch({ support_group: supportPayload(valuesRef.current) });
        setSavedField(field);
        window.setTimeout(() => setSavedField((current) => (current === field ? null : current)), 1400);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : isPt ? "Nao foi possivel salvar." : "Could not save.");
      } finally {
        setSavingField((current) => (current === field ? null : current));
      }
    },
    [form?.can_edit, isPt, savePatch, supportPayload],
  );

  const setField = (field: FieldKey, value: string) => {
    const next = { ...valuesRef.current, [field]: value };
    valuesRef.current = next;
    setValues(next);
    if (timers.current[field]) clearTimeout(timers.current[field]);
    timers.current[field] = window.setTimeout(() => void saveField(field), 550);
  };

  const flushField = (field: FieldKey, value?: string) => {
    if (timers.current[field]) clearTimeout(timers.current[field]);
    delete timers.current[field];
    if (value !== undefined && valuesRef.current[field] !== value) {
      const next = { ...valuesRef.current, [field]: value };
      valuesRef.current = next;
      setValues(next);
    }
    void saveField(field);
  };

  const saveAll = async () => {
    if (!form?.can_edit) return;
    for (const timer of Object.values(timers.current)) {
      if (timer) clearTimeout(timer);
    }
    timers.current = {};
    setSavingField("all");
    try {
      await savePatch({ support_group: supportPayload(valuesRef.current) });
      toast.success(isPt ? "Setup de suporte salvo." : "Support setup saved.");
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
      await savePatch({ support_group: supportPayload({ ...valuesRef.current, status: "created" }), complete: true });
      toast.success(isPt ? "Grupo de suporte concluido." : "Support group completed.");
      await onUpdate?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : isPt ? "Nao foi possivel concluir." : "Could not complete.");
    } finally {
      setFinalizing(false);
    }
  };

  const completed = form?.checklist_item.status === "complete" || form?.task?.status === "done" || form?.support_group?.group_created;

  return (
    <div className={cn("support-onboarding-form-shell", embedded ? "w-full" : "fixed inset-0 z-[80] overflow-y-auto bg-[#020617]/[0.85] px-3 py-5 backdrop-blur-md sm:px-6")}>
      <div className={cn("support-onboarding-form-card rounded-3xl border border-blue-300/25 bg-card text-card-foreground shadow-[0_30px_120px_rgba(37,99,235,0.16)] dark:bg-[#050b18]", embedded ? "w-full" : "mx-auto w-full max-w-[1120px]")}>
        <div className={cn("flex flex-col gap-6 border-b border-border p-5 dark:border-blue-300/10 sm:p-8 lg:flex-row lg:items-center lg:justify-between", !embedded && "sticky top-0 z-10 bg-card/95 backdrop-blur dark:bg-[#050b18]/95")}>
          <div className="flex min-w-0 items-start gap-5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/30 bg-emerald-500/[0.15] text-emerald-500 shadow-[0_0_36px_rgba(16,185,129,0.18)] dark:text-emerald-200">
              <MessageSquareText className="h-8 w-8" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.32em] text-blue-500 dark:text-blue-300">{copy.eyebrow}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">{copy.title}</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{copy.subtitle}</p>
              {form && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{form.company.name}</span>
                  <span>{form.task?.assignee?.name ?? t("companyDialog.notAssigned")}</span>
                  <span>{form.task?.project?.name ?? "Technical Support"}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {form && (
              <span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", completed ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-600 dark:text-emerald-200" : "border-blue-400/30 bg-blue-400/10 text-blue-700 dark:text-blue-100")}>
                {completed ? copy.completed : (isPt ? "Em andamento" : "In progress")}
              </span>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                title={t("common.close")}
              >
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <>
            <div className="space-y-5 p-5 sm:p-8">
              <SectionTitle title={copy.group} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field icon={<MessageSquareText className="h-5 w-5" />} label={copy.group_name} saving={savingField === "group_name"} saved={savedField === "group_name"}>
                  <input value={values.group_name} disabled={!form?.can_edit} onChange={(event) => setField("group_name", event.target.value)} onBlur={(event) => flushField("group_name", event.currentTarget.value)} placeholder={`${form?.company.name ?? (isPt ? "Cliente" : "Client")} - ${isPt ? "suporte" : "support"}`} className={fieldInputClassName} />
                </Field>
                <Field icon={<Link2 className="h-5 w-5" />} label={copy.group_link} saving={savingField === "group_link"} saved={savedField === "group_link"}>
                  <div className="flex gap-2">
                    <input value={values.group_link} disabled={!form?.can_edit} onChange={(event) => setField("group_link", event.target.value)} onBlur={(event) => flushField("group_link", event.currentTarget.value)} placeholder="https://chat.whatsapp.com/..." className={fieldInputClassName} />
                    {values.group_link ? (
                      <a href={values.group_link} target="_blank" rel="noreferrer" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground hover:text-blue-500 dark:border-blue-300/[0.15] dark:bg-[#071024]">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    ) : null}
                  </div>
                </Field>
                <Field icon={<ClipboardCheck className="h-5 w-5" />} label={copy.status} saving={savingField === "status"} saved={savedField === "status"}>
                  <select value={values.status} disabled={!form?.can_edit} onChange={(event) => setField("status", event.target.value)} onBlur={(event) => flushField("status", event.currentTarget.value)} className={fieldInputClassName}>
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {isPt ? option.pt : option.en}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field icon={<UserRound className="h-5 w-5" />} label={copy.main_client_contact} saving={savingField === "main_client_contact"} saved={savedField === "main_client_contact"}>
                  <input value={values.main_client_contact} disabled={!form?.can_edit} onChange={(event) => setField("main_client_contact", event.target.value)} onBlur={(event) => flushField("main_client_contact", event.currentTarget.value)} placeholder={isPt ? "cliente@email.com / WhatsApp" : "client@email.com / WhatsApp"} className={fieldInputClassName} />
                </Field>
              </div>

              <SectionTitle title={copy.participants} />
              <div className="grid gap-4 md:grid-cols-2">
                <Field icon={<UserRound className="h-5 w-5" />} label={copy.commercial_responsible} saving={savingField === "commercial_responsible"} saved={savedField === "commercial_responsible"}>
                  <input value={values.commercial_responsible} disabled={!form?.can_edit} onChange={(event) => setField("commercial_responsible", event.target.value)} onBlur={(event) => flushField("commercial_responsible", event.currentTarget.value)} placeholder={isPt ? "Nome do comercial" : "Commercial owner"} className={fieldInputClassName} />
                </Field>
                <Field icon={<UserRound className="h-5 w-5" />} label={copy.account_responsible} saving={savingField === "account_responsible"} saved={savedField === "account_responsible"}>
                  <input value={values.account_responsible} disabled={!form?.can_edit} onChange={(event) => setField("account_responsible", event.target.value)} onBlur={(event) => flushField("account_responsible", event.currentTarget.value)} placeholder={isPt ? "Nome do responsável da conta" : "Account owner"} className={fieldInputClassName} />
                </Field>
                <Field icon={<UsersRound className="h-5 w-5" />} label={copy.internal_participants} saving={savingField === "internal_participants"} saved={savedField === "internal_participants"}>
                  <textarea value={values.internal_participants} disabled={!form?.can_edit} onChange={(event) => setField("internal_participants", event.target.value)} onBlur={(event) => flushField("internal_participants", event.currentTarget.value)} rows={4} placeholder={isPt ? "Um participante por linha" : "One participant per line"} className={cn(fieldInputClassName, "resize-none py-3")} />
                </Field>
                <Field icon={<UsersRound className="h-5 w-5" />} label={copy.client_participants} saving={savingField === "client_participants"} saved={savedField === "client_participants"}>
                  <textarea value={values.client_participants} disabled={!form?.can_edit} onChange={(event) => setField("client_participants", event.target.value)} onBlur={(event) => flushField("client_participants", event.currentTarget.value)} rows={4} placeholder={isPt ? "Um contato por linha" : "One contact per line"} className={cn(fieldInputClassName, "resize-none py-3")} />
                </Field>
              </div>

              <Field icon={<Save className="h-5 w-5" />} label={copy.notes} saving={savingField === "notes"} saved={savedField === "notes"}>
                <textarea value={values.notes} disabled={!form?.can_edit} onChange={(event) => setField("notes", event.target.value)} onBlur={(event) => flushField("notes", event.currentTarget.value)} rows={3} className={cn(fieldInputClassName, "resize-none py-3")} />
              </Field>
            </div>

            <div className={cn("flex flex-col gap-3 border-t border-border bg-card/95 p-5 dark:border-blue-300/10 dark:bg-[#050b18]/95 sm:flex-row sm:items-center sm:justify-between sm:px-8", !embedded && "sticky bottom-0 backdrop-blur")}>
              <p className="text-xs text-muted-foreground">{form?.can_edit ? copy.autosave : copy.viewOnly}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={saveAll}
                  disabled={!form?.can_edit || savingField === "all"}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-60 dark:border-blue-300/[0.15] dark:bg-white/5 dark:hover:bg-white/10"
                >
                  {savingField === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {copy.save}
                </button>
                <button
                  type="button"
                  onClick={complete}
                  disabled={!form?.can_edit || finalizing}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_0_28px_rgba(59,130,246,0.3)] hover:bg-blue-400 disabled:opacity-60"
                >
                  {finalizing ? <Loader2 className="h-4 w-4 animate-spin" /> : completed ? <CheckCircle2 className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                  {completed ? copy.completed : copy.complete}
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
    <label className="support-onboarding-form-card block rounded-2xl border border-border bg-background/70 p-4 shadow-sm dark:border-blue-300/10 dark:bg-white/[0.15] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-foreground">
          <span className="text-blue-500 dark:text-blue-400">{icon}</span>
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
