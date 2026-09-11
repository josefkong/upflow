"use client";

import Image from "next/image";
import {
  type FormEvent,
  type InputHTMLAttributes,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  ArrowRight,
  Boxes,
  Camera,
  Check,
  ClipboardCheck,
  Clock3,
  FileImage,
  History,
  Loader2,
  Mic2,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { CreateActionButton } from "@/components/ui/create-action-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  EQUIPMENT_CANCELLATION_REASONS,
  EQUIPMENT_DAMAGE_TYPES,
  EQUIPMENT_PURPOSE_LABELS,
  EQUIPMENT_PURPOSES,
  MINIMUM_EQUIPMENT_USE_MS,
} from "@/lib/equipment-request-options";

type Person = { id: string; name: string; email: string };
type Checkout = {
  id: string;
  status: string;
  purpose: string;
  expected_return_at: string;
  requested_at: string;
  requester_receipt_confirmed_at: string | null;
  admin_return_confirmed_at: string | null;
  handover_photo_paths: string[];
  damage_photo_paths: string[];
  terms_accepted_at: string | null;
  requester: Person;
  administrator: Person | null;
  equipment?: { id: string; name: string; asset_code: string; category: string; status: string };
};
type EquipmentItem = {
  id: string;
  name: string;
  category: string;
  asset_code: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  description: string | null;
  status: string;
  condition: string;
  current_holder: Person | null;
  last_holder: Person | null;
  checkouts: Checkout[];
};
type EquipmentResponse = {
  items: EquipmentItem[];
  active_checkouts: Checkout[];
  summary: { total: number; available: number; in_use: number; pending: number; maintenance: number };
  viewer: { id: string; name: string; can_manage: boolean; can_delete: boolean };
};
type ModalState =
  | { kind: "add" }
  | { kind: "request"; item: EquipmentItem }
  | { kind: "history"; item: EquipmentItem }
  | { kind: "transition"; checkout: Checkout; action: string }
  | { kind: "release"; item: EquipmentItem }
  | { kind: "delete"; item: EquipmentItem }
  | null;

const EMPTY_DATA: EquipmentResponse = {
  items: [],
  active_checkouts: [],
  summary: { total: 0, available: 0, in_use: 0, pending: 0, maintenance: 0 },
  viewer: { id: "", name: "", can_manage: false, can_delete: false },
};

const FIELD_CLASS =
  "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/15";
const TEXTAREA_CLASS = cn(FIELD_CLASS, "h-auto min-h-24 py-2.5 resize-y");
const FILE_CLASS =
  "block w-full rounded-xl border border-dashed border-border bg-background px-3 py-3 text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:font-semibold file:text-primary";

const pt = {
  title: "Controle Operacional",
  subtitle: "Solicitações, posse e devoluções avançam somente após as confirmações responsáveis.",
  total: "Total de Equipamentos", available: "Disponíveis", inUse: "Em Uso", pending: "Pendências", maintenance: "Manutenção",
  search: "Buscar por equipamento, código ou categoria...", allStatus: "Todos os Status", allCategories: "Todas as Categorias",
  add: "Adicionar Equipamento", empty: "Nenhum equipamento encontrado.", request: "Solicitar Item", history: "Ver Histórico", usageHistory: "Histórico de Uso",
  usedBy: "Utilizado por", collectedAt: "Retirado em", returnedAt: "Devolvido em", notReturned: "Ainda em uso", noUsageHistory: "Este equipamento ainda não possui utilizações registradas.",
  currentHolder: "Em posse de", lastHolder: "Último Responsável", expected: "Devolução Prevista", availableNow: "Disponível para Solicitação",
  activeFlow: "Solicitações em Andamento", addTitle: "Adicionar Equipamento", addDescription: "Cadastre um item individual para manter a posse rastreável.",
  name: "Nome do Equipamento", category: "Categoria", code: "Código Patrimonial", brand: "Marca", model: "Modelo", serial: "Número de Série", description: "Observações", condition: "Estado Atual",
  requestTitle: "Solicitar Equipamento", purpose: "Finalidade de Uso", returnAt: "Data e Horário da Devolução", cancel: "Cancelar", confirm: "Confirmar",
  confirmHandover: "Aceitar Solicitação", confirmReceipt: "Confirmar Retirada", requestReturn: "Solicitar Devolução", inspectReturn: "Inspecionar Devolução", reject: "Recusar Solicitação", cancelRequest: "Cancelar Solicitação",
  waitingReceipt: "Aguardando confirmação de recebimento", waitingAdmin: "Aguardando conferência da Administração", requestedBy: "Solicitado por", flow: "Etapa Atual",
  release: "Liberar para Uso", notes: "Motivo", damageNotes: "Tipo de avaria", save: "Salvar", loading: "Carregando inventário...",
  termsTitle: "Termos de Uso e Responsabilidade", termsAgree: "Concordo com os Termos de Uso do Equipamento.", minimumUse: "O período mínimo de uso é de 1 hora.",
  beforePhotos: "Fotos do Equipamento Antes da Retirada", beforePhotosHelp: "Envie ao menos 4 fotos: frente, verso e laterais.", adminConfirmation: "Confirmo que verifiquei a finalidade e registrei as fotos de todos os lados.",
  receivedConfirmation: "Confirmo que o equipamento recebido está de acordo com as fotos.", photos: "Fotos Registradas", countdown: "Tempo para Devolução", overdue: "Prazo de devolução vencido",
  inspectionAgreement: "Confirmo que ambas as partes estão de acordo com a inspeção.", damageNotice: "Confirmo que o solicitante foi notificado da avaria.", damagePhoto: "Foto da Avaria",
  deleteEquipment: "Excluir Equipamento", deleteDescription: "O equipamento será removido do inventário ativo. Seu histórico de utilização permanecerá preservado.", deleteBlocked: "Não é possível excluir um equipamento com solicitação em andamento.",
};
const en = {
  title: "Operational Control",
  subtitle: "Requests, custody, and returns advance only after the responsible confirmations.",
  total: "Total Equipment", available: "Available", inUse: "In Use", pending: "Pending", maintenance: "Maintenance",
  search: "Search equipment, code, or category...", allStatus: "All Statuses", allCategories: "All Categories",
  add: "Add Equipment", empty: "No equipment found.", request: "Request Item", history: "View History", usageHistory: "Usage History",
  usedBy: "Used By", collectedAt: "Collected At", returnedAt: "Returned At", notReturned: "Still in Use", noUsageHistory: "This equipment has no recorded usage yet.",
  currentHolder: "Held By", lastHolder: "Last Holder", expected: "Expected Return", availableNow: "Available to Request",
  activeFlow: "Active Requests", addTitle: "Add Equipment", addDescription: "Register each item individually to keep custody traceable.",
  name: "Equipment Name", category: "Category", code: "Asset Code", brand: "Brand", model: "Model", serial: "Serial Number", description: "Notes", condition: "Current Condition",
  requestTitle: "Request Equipment", purpose: "Purpose", returnAt: "Return Date and Time", cancel: "Cancel", confirm: "Confirm",
  confirmHandover: "Accept Request", confirmReceipt: "Confirm Pickup", requestReturn: "Request Return", inspectReturn: "Inspect Return", reject: "Reject Request", cancelRequest: "Cancel Request",
  waitingReceipt: "Waiting for receipt confirmation", waitingAdmin: "Waiting for Administration inspection", requestedBy: "Requested By", flow: "Current Stage",
  release: "Release for Use", notes: "Reason", damageNotes: "Damage Type", save: "Save", loading: "Loading inventory...",
  termsTitle: "Equipment Use and Responsibility Terms", termsAgree: "I agree to the Equipment Use Terms.", minimumUse: "The minimum use period is 1 hour.",
  beforePhotos: "Equipment Photos Before Pickup", beforePhotosHelp: "Upload at least 4 photos: front, back, and sides.", adminConfirmation: "I confirm that I reviewed the purpose and photographed all sides.",
  receivedConfirmation: "I confirm that the equipment received matches the photos.", photos: "Recorded Photos", countdown: "Time Until Return", overdue: "Return deadline has passed",
  inspectionAgreement: "I confirm that both parties agree with the inspection.", damageNotice: "I confirm that the requester was notified of the damage.", damagePhoto: "Damage Photo",
  deleteEquipment: "Delete Equipment", deleteDescription: "The equipment will be removed from the active inventory. Its usage history will remain preserved.", deleteBlocked: "Equipment with an active request cannot be deleted.",
};

const statusStyles: Record<string, string> = {
  available: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  requested: "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  awaiting_receipt: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  in_use: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  return_requested: "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  maintenance: "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

function labelStatus(status: string, isPt: boolean) {
  const labels: Record<string, [string, string]> = {
    available: ["Disponível", "Available"], requested: ["Solicitado", "Requested"],
    awaiting_receipt: ["Aguardando Recebimento", "Awaiting Receipt"], in_use: ["Em Uso", "In Use"],
    return_requested: ["Devolução Solicitada", "Return Requested"], maintenance: ["Em Manutenção", "Maintenance"],
    checked_out: ["Em Uso", "In Use"], returned: ["Devolvido", "Returned"], rejected: ["Recusado", "Rejected"], cancelled: ["Cancelado", "Cancelled"],
  };
  return labels[status]?.[isPt ? 0 : 1] ?? status;
}

function formatDate(value: string, isPt: boolean) {
  return new Intl.DateTimeFormat(isPt ? "pt-BR" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function localDateTimeInput(value: number) {
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}

function purposeLabel(value: string, isPt: boolean) {
  const option = EQUIPMENT_PURPOSE_LABELS[value as keyof typeof EQUIPMENT_PURPOSE_LABELS];
  return option?.[isPt ? "pt" : "en"] ?? value;
}

async function responseError(response: Response) {
  const body = (await response.json().catch(() => null)) as { error?: string } | null;
  return body?.error || "Não foi possível concluir esta ação.";
}

export default function EquipmentControlBoard({ projectId }: { projectId: string }) {
  const { language } = useLanguage();
  const isPt = language === "pt-BR";
  const c = isPt ? pt : en;
  const [data, setData] = useState<EquipmentResponse>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");
  const [modal, setModal] = useState<ModalState>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/equipment?project_id=${projectId}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      setData((await response.json()) as EquipmentResponse);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Erro ao carregar inventário.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const categories = useMemo(() => [...new Set(data.items.map((item) => item.category))].sort(), [data.items]);
  const items = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return data.items.filter((item) =>
      (status === "all" || item.status === status) &&
      (category === "all" || item.category === category) &&
      (!term || [item.name, item.category, item.asset_code, item.brand, item.model].some((value) => value?.toLocaleLowerCase().includes(term))),
    );
  }, [category, data.items, query, status]);

  async function submitJson(url: string, method: "POST" | "PATCH", body: Record<string, unknown>, success: string) {
    setBusy(true);
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(await responseError(response));
      toast.success(success);
      setModal(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível concluir esta ação.");
    } finally { setBusy(false); }
  }

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submitJson("/api/equipment", "POST", {
      project_id: projectId, name: form.get("name"), category: form.get("category"), asset_code: form.get("asset_code"),
      brand: form.get("brand"), model: form.get("model"), serial_number: form.get("serial_number"), description: form.get("description"), condition: form.get("condition"),
    }, isPt ? "Equipamento adicionado." : "Equipment added.");
  }

  function onRequest(event: FormEvent<HTMLFormElement>, item: EquipmentItem) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const raw = String(form.get("expected_return_at") || "");
    void submitJson(`/api/equipment/${item.id}/request`, "POST", {
      purpose: form.get("purpose"),
      expected_return_at: new Date(raw).toISOString(),
      terms_accepted: form.get("terms_accepted") === "on",
    }, isPt ? "Solicitação enviada à Administração." : "Request sent to Administration.");
  }

  function onTransition(event: FormEvent<HTMLFormElement>, checkout: Checkout, action: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void (async () => {
      setBusy(true);
      try {
        const photoKind = action === "confirm_handover"
          ? "handover"
          : action === "confirm_return"
            ? "damage"
            : null;
        const photos = form
          .getAll("photos")
          .filter((entry): entry is File => entry instanceof File && entry.size > 0);
        if (photoKind && photos.length) {
          const upload = new FormData();
          upload.set("kind", photoKind);
          photos.forEach((photo) => upload.append("files", photo));
          const uploadResponse = await fetch(
            `/api/equipment/requests/${checkout.id}/photos`,
            { method: "POST", body: upload },
          );
          if (!uploadResponse.ok) throw new Error(await responseError(uploadResponse));
        }

        const response = await fetch(`/api/equipment/requests/${checkout.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            condition: action === "confirm_return" ? form.get("condition") : undefined,
            reason: ["reject", "cancel"].includes(action) ? form.get("reason") : undefined,
            damage_type: action === "confirm_return" ? form.get("damage_type") || undefined : undefined,
            purpose_and_photos_confirmed: form.get("purpose_and_photos_confirmed") === "on",
            photo_match_confirmed: form.get("photo_match_confirmed") === "on",
            inspection_confirmed: form.get("inspection_confirmed") === "on",
            damage_notice_confirmed: form.get("damage_notice_confirmed") === "on",
          }),
        });
        if (!response.ok) throw new Error(await responseError(response));
        toast.success(isPt ? "Etapa confirmada." : "Stage confirmed.");
        setModal(null);
        await load();
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível concluir esta ação.");
      } finally {
        setBusy(false);
      }
    })();
  }

  function onInstantTransition(checkout: Checkout, action: "request_return") {
    void submitJson(
      `/api/equipment/requests/${checkout.id}`,
      "PATCH",
      { action },
      isPt ? "Devolução solicitada ao responsável." : "Return requested from the holder.",
    );
  }

  function onRelease(event: FormEvent<HTMLFormElement>, item: EquipmentItem) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void submitJson(`/api/equipment/${item.id}`, "PATCH", {
      action: "release_from_maintenance", condition: form.get("condition"), notes: form.get("notes"),
    }, isPt ? "Equipamento liberado para uso." : "Equipment released for use.");
  }

  async function onDelete(item: EquipmentItem) {
    setBusy(true);
    try {
      const response = await fetch(`/api/equipment/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      toast.success(isPt ? "Equipamento excluído do inventário ativo." : "Equipment removed from the active inventory.");
      setModal(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : c.deleteBlocked);
    } finally {
      setBusy(false);
    }
  }

  const summary = [
    [c.total, data.summary.total, Boxes, "text-blue-500"], [c.available, data.summary.available, PackageCheck, "text-emerald-500"],
    [c.inUse, data.summary.in_use, UserRound, "text-violet-500"], [c.pending, data.summary.pending, Clock3, "text-amber-500"],
    [c.maintenance, data.summary.maintenance, Wrench, "text-rose-500"],
  ] as const;

  if (loading) return <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{c.loading}</div>;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{c.title}</p><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{c.subtitle}</p></div>
          {data.viewer.can_manage && <CreateActionButton onClick={() => setModal({ kind: "add" })}><Plus className="h-4 w-4" />{c.add}</CreateActionButton>}
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {summary.map(([label, value, Icon, color]) => <div key={label} className="flex min-h-24 items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-border bg-muted/40"><Icon className={cn("h-5 w-5", color)} /></span><div className="min-w-0"><p className="text-2xl font-bold text-foreground">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div></div>)}
      </div>

      {data.active_checkouts.length > 0 && <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-primary" /><h2 className="text-base font-bold">{c.activeFlow}</h2><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">{data.active_checkouts.length}</span></div>
        <div className="grid gap-3 xl:grid-cols-2">{data.active_checkouts.map((checkout) => <RequestCard key={checkout.id} checkout={checkout} viewer={data.viewer} c={c} isPt={isPt} onAction={(action) => setModal({ kind: "transition", checkout, action })} onInstantAction={() => onInstantTransition(checkout, "request_return")} />)}</div>
      </section>}

      <section className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_210px_210px]">
          <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className={cn(FIELD_CLASS, "pl-9")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={c.search} /></label>
          <select className={FIELD_CLASS} value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">{c.allStatus}</option>{["available", "requested", "awaiting_receipt", "in_use", "return_requested", "maintenance"].map((value) => <option key={value} value={value}>{labelStatus(value, isPt)}</option>)}</select>
          <select className={FIELD_CLASS} value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">{c.allCategories}</option>{categories.map((value) => <option key={value}>{value}</option>)}</select>
        </div>
      </section>

      {items.length ? <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">{items.map((item) => <EquipmentCard key={item.id} item={item} c={c} isPt={isPt} canManage={data.viewer.can_manage} canDelete={data.viewer.can_delete} onRequest={() => setModal({ kind: "request", item })} onHistory={() => setModal({ kind: "history", item })} onRelease={() => setModal({ kind: "release", item })} onDelete={() => setModal({ kind: "delete", item })} />)}</div> : <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">{c.empty}</div>}

      <EquipmentModal modal={modal} busy={busy} c={c} isPt={isPt} viewer={data.viewer} onClose={() => !busy && setModal(null)} onAdd={onAdd} onRequest={onRequest} onTransition={onTransition} onRelease={onRelease} onDelete={onDelete} />
    </div>
  );
}

function RequestCard({
  checkout,
  viewer,
  c,
  isPt,
  onAction,
  onInstantAction,
}: {
  checkout: Checkout;
  viewer: EquipmentResponse["viewer"];
  c: typeof pt;
  isPt: boolean;
  onAction: (action: string) => void;
  onInstantAction: () => void;
}) {
  const mine = checkout.requester.id === viewer.id;
  const countdown = useEquipmentCountdown(checkout.expected_return_at, isPt);
  const canSeePhotos = mine || viewer.can_manage;

  return (
    <article className="rounded-xl border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-foreground">{checkout.equipment?.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {checkout.equipment?.asset_code} · {checkout.equipment?.category}
          </p>
        </div>
        <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusStyles[checkout.equipment?.status || checkout.status])}>
          {labelStatus(checkout.status, isPt)}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
        <span><b className="text-foreground">{c.requestedBy}:</b> {checkout.requester.name}</span>
        <span><b className="text-foreground">{c.expected}:</b> {formatDate(checkout.expected_return_at, isPt)}</span>
      </div>
      <p className="mt-3 rounded-lg bg-muted/40 px-3 py-2 text-sm text-foreground">
        {purposeLabel(checkout.purpose, isPt)}
      </p>

      {checkout.status === "checked_out" && mine && (
        <div className={cn("mt-3 rounded-lg border px-3 py-2 text-xs font-semibold", countdown.overdue ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300" : "border-primary/20 bg-primary/5 text-primary")}>
          <span className="inline-flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" />{countdown.overdue ? c.overdue : `${c.countdown}: ${countdown.label}`}</span>
        </div>
      )}

      {canSeePhotos && checkout.handover_photo_paths.length > 0 && checkout.status !== "requested" && (
        <PhotoGrid checkout={checkout} kind="handover" label={c.photos} />
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {viewer.can_manage && checkout.status === "requested" && (
          <>
            <Button size="sm" onClick={() => onAction("confirm_handover")}><Check className="h-4 w-4" />{c.confirmHandover}</Button>
            <Button size="sm" variant="outline" onClick={() => onAction("reject")}><X className="h-4 w-4" />{c.reject}</Button>
            <Button size="sm" variant="outline" onClick={() => onAction("cancel")}><X className="h-4 w-4" />{c.cancelRequest}</Button>
          </>
        )}
        {!viewer.can_manage && mine && checkout.status === "requested" && (
          <Button size="sm" variant="outline" onClick={() => onAction("cancel")}><X className="h-4 w-4" />{c.cancelRequest}</Button>
        )}
        {mine && checkout.status === "awaiting_receipt" && (
          <Button size="sm" onClick={() => onAction("confirm_receipt")}><PackageCheck className="h-4 w-4" />{c.confirmReceipt}</Button>
        )}
        {viewer.can_manage && checkout.status === "checked_out" && (
          <Button size="sm" onClick={onInstantAction}><RotateCcw className="h-4 w-4" />{c.requestReturn}</Button>
        )}
        {viewer.can_manage && checkout.status === "return_requested" && (
          <Button size="sm" onClick={() => onAction("confirm_return")}><ClipboardCheck className="h-4 w-4" />{c.inspectReturn}</Button>
        )}
        {!mine && !viewer.can_manage && (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />{c.waitingAdmin}</span>
        )}
      </div>
    </article>
  );
}

function useEquipmentCountdown(value: string, isPt: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const difference = new Date(value).getTime() - now;
  const absoluteMinutes = Math.max(0, Math.ceil(Math.abs(difference) / 60_000));
  const days = Math.floor(absoluteMinutes / 1_440);
  const hours = Math.floor((absoluteMinutes % 1_440) / 60);
  const minutes = absoluteMinutes % 60;
  const chunks = [
    days ? `${days}${isPt ? "d" : "d"}` : "",
    hours ? `${hours}h` : "",
    `${minutes}min`,
  ].filter(Boolean);
  return { overdue: difference <= 0, label: chunks.join(" ") };
}

function PhotoGrid({ checkout, kind, label }: { checkout: Checkout; kind: "handover" | "damage"; label: string }) {
  const paths = kind === "handover" ? checkout.handover_photo_paths : checkout.damage_photo_paths;
  return (
    <div className="mt-3">
      <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><FileImage className="h-3.5 w-3.5" />{label}</p>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {paths.map((_, index) => (
          <a key={`${kind}-${index}`} href={`/api/equipment/requests/${checkout.id}/photos/${kind}/${index}`} target="_blank" rel="noreferrer" className="relative h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30">
            <Image unoptimized src={`/api/equipment/requests/${checkout.id}/photos/${kind}/${index}`} alt={`${label} ${index + 1}`} fill sizes="80px" className="object-cover" />
          </a>
        ))}
      </div>
    </div>
  );
}

function EquipmentCard({ item, c, isPt, canManage, canDelete, onRequest, onHistory, onRelease, onDelete }: { item: EquipmentItem; c: typeof pt; isPt: boolean; canManage: boolean; canDelete: boolean; onRequest: () => void; onHistory: () => void; onRelease: () => void; onDelete: () => void }) {
  const active = item.checkouts.find((checkout) => ["requested", "awaiting_receipt", "checked_out", "return_requested"].includes(checkout.status));
  const Icon = item.category.toLocaleLowerCase().includes("micro") ? Mic2 : item.category.toLocaleLowerCase().includes("câm") || item.category.toLocaleLowerCase().includes("cam") ? Camera : Boxes;
  return <article className="flex min-h-64 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/30 sm:p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-primary/20 bg-primary/10"><Icon className="h-5 w-5 text-primary" /></span><div className="min-w-0"><h3 className="truncate font-bold text-foreground">{item.name}</h3><p className="truncate text-xs text-muted-foreground">{item.category} · {item.asset_code}</p></div></div><span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold", statusStyles[item.status])}>{labelStatus(item.status, isPt)}</span></div>{(item.brand || item.model || item.serial_number) && <p className="mt-4 text-sm text-muted-foreground">{[item.brand, item.model, item.serial_number].filter(Boolean).join(" · ")}</p>}<div className="mt-4 grid gap-2 text-sm"><div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{item.current_holder || active ? c.currentHolder : c.lastHolder}</span><b className="truncate text-right text-foreground">{item.current_holder?.name || active?.requester.name || item.last_holder?.name || "—"}</b></div>{active && <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{c.expected}</span><b className="text-right text-xs text-foreground">{formatDate(active.expected_return_at, isPt)}</b></div>}</div>{item.description && <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{item.description}</p>}<div className="mt-auto flex flex-wrap gap-2 pt-5"><Button size="sm" variant="outline" onClick={onHistory}><History className="h-4 w-4" />{c.history}</Button>{item.status === "available" && <Button size="sm" onClick={onRequest}><ArrowRight className="h-4 w-4" />{c.request}</Button>}{item.status === "maintenance" && canManage && <Button size="sm" onClick={onRelease}><RotateCcw className="h-4 w-4" />{c.release}</Button>}{canDelete && <Button size="sm" variant="outline" disabled={Boolean(active)} title={active ? c.deleteBlocked : undefined} className="border-rose-500/30 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-300" onClick={onDelete}><Trash2 className="h-4 w-4" />{c.deleteEquipment}</Button>}</div></article>;
}

function EquipmentModal({ modal, busy, c, isPt, viewer, onClose, onAdd, onRequest, onTransition, onRelease, onDelete }: { modal: ModalState; busy: boolean; c: typeof pt; isPt: boolean; viewer: EquipmentResponse["viewer"]; onClose: () => void; onAdd: (event: FormEvent<HTMLFormElement>) => void; onRequest: (event: FormEvent<HTMLFormElement>, item: EquipmentItem) => void; onTransition: (event: FormEvent<HTMLFormElement>, checkout: Checkout, action: string) => void; onRelease: (event: FormEvent<HTMLFormElement>, item: EquipmentItem) => void; onDelete: (item: EquipmentItem) => void }) {
  if (!modal) return null;
  if (modal.kind === "delete") {
    return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{c.deleteEquipment} · {modal.item.name}</DialogTitle><DialogDescription>{c.deleteDescription}</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{c.cancel}</Button><Button type="button" disabled={busy} className="bg-rose-600 text-white hover:bg-rose-700" onClick={() => onDelete(modal.item)}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}{c.deleteEquipment}</Button></DialogFooter></DialogContent></Dialog>;
  }
  if (modal.kind === "history") {
    const usageHistory = modal.item.checkouts.filter(
      (checkout) => Boolean(checkout.requester_receipt_confirmed_at),
    );

    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{c.usageHistory} · {modal.item.name}</DialogTitle>
            <DialogDescription>{modal.item.asset_code}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {usageHistory.length ? usageHistory.map((checkout) => (
              <article key={checkout.id} className="rounded-xl border border-border bg-muted/20 p-3 sm:p-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-primary/20 bg-primary/10">
                    <UserRound className="h-4 w-4 text-primary" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{c.usedBy}</p>
                    <p className="truncate text-sm font-semibold text-foreground">{checkout.requester.name}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 border-t border-border/70 pt-3 text-xs sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">{c.collectedAt}</p>
                    <p className="mt-0.5 font-medium text-foreground">{formatDate(checkout.requester_receipt_confirmed_at!, isPt)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{c.returnedAt}</p>
                    <p className={cn("mt-0.5 font-medium", checkout.admin_return_confirmed_at ? "text-foreground" : "text-amber-600 dark:text-amber-300")}>
                      {checkout.admin_return_confirmed_at ? formatDate(checkout.admin_return_confirmed_at, isPt) : c.notReturned}
                    </p>
                  </div>
                </div>
                {(viewer.can_manage || checkout.requester.id === viewer.id) && checkout.handover_photo_paths.length > 0 && <PhotoGrid checkout={checkout} kind="handover" label={c.beforePhotos} />}
                {(viewer.can_manage || checkout.requester.id === viewer.id) && checkout.damage_photo_paths.length > 0 && <PhotoGrid checkout={checkout} kind="damage" label={c.damagePhoto} />}
              </article>
            )) : <p className="py-8 text-center text-sm text-muted-foreground">{c.noUsageHistory}</p>}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const transitionTitle = modal.kind === "transition" ? (modal.action === "confirm_handover" ? c.confirmHandover : modal.action === "confirm_receipt" ? c.confirmReceipt : modal.action === "request_return" ? c.requestReturn : modal.action === "confirm_return" ? c.inspectReturn : modal.action === "reject" ? c.reject : c.cancelRequest) : "";
  const transitionReasons = modal.kind === "transition" && modal.action === "reject"
    ? EQUIPMENT_CANCELLATION_REASONS.filter((value) => ["schedule_conflict", "request_invalid"].includes(value))
    : EQUIPMENT_CANCELLATION_REASONS.filter((value) => ["requester_cancelled", "administration_cancelled"].includes(value));
  return <Dialog open onOpenChange={(open) => !open && onClose()}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{modal.kind === "add" ? c.addTitle : modal.kind === "request" ? `${c.requestTitle} · ${modal.item.name}` : modal.kind === "release" ? `${c.release} · ${modal.item.name}` : transitionTitle}</DialogTitle>{modal.kind === "add" && <DialogDescription>{c.addDescription}</DialogDescription>}</DialogHeader>
    {modal.kind === "add" && <form onSubmit={onAdd} className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Field label={c.name} name="name" required /><label className="space-y-1.5 text-sm font-medium">{c.category}<select name="category" required className={FIELD_CLASS} defaultValue=""><option value="" disabled>{isPt ? "Selecione uma categoria" : "Select a category"}</option>{["Câmera", "Microfone", "Tripé", "Tocha", "Barra de Luz", "Iluminação", "Áudio", "Acessório"].map((value) => <option key={value} value={value}>{value}</option>)}</select></label><Field label={c.code} name="asset_code" /><Field label={c.brand} name="brand" /><Field label={c.model} name="model" /><Field label={c.serial} name="serial_number" /><label className="space-y-1.5 text-sm font-medium">{c.condition}<select name="condition" className={FIELD_CLASS} defaultValue="good">{conditionOptions(isPt, false)}</select></label></div><label className="block space-y-1.5 text-sm font-medium">{c.description}<textarea name="description" className={TEXTAREA_CLASS} /></label><ModalActions busy={busy} cancel={c.cancel} confirm={c.save} onCancel={onClose} /></form>}
    {modal.kind === "request" && <form onSubmit={(event) => onRequest(event, modal.item)} className="space-y-4"><label className="block space-y-1.5 text-sm font-medium">{c.purpose}<select name="purpose" required className={FIELD_CLASS} defaultValue=""><option value="" disabled>{isPt ? "Selecione a finalidade" : "Select the purpose"}</option>{EQUIPMENT_PURPOSES.map((value) => <option key={value} value={value}>{purposeLabel(value, isPt)}</option>)}</select></label><div><Field label={c.returnAt} name="expected_return_at" type="datetime-local" required min={localDateTimeInput(Date.now() + MINIMUM_EQUIPMENT_USE_MS + 60_000)} onClick={(event) => event.currentTarget.showPicker?.()} /><p className="mt-1.5 text-xs text-muted-foreground">{c.minimumUse}</p></div><EquipmentTerms isPt={isPt} title={c.termsTitle} /><label className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 p-3 text-sm"><input type="checkbox" name="terms_accepted" required className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" /><span>{c.termsAgree}</span></label><ModalActions busy={busy} cancel={c.cancel} confirm={c.confirm} onCancel={onClose} /></form>}
    {modal.kind === "transition" && <form onSubmit={(event) => onTransition(event, modal.checkout, modal.action)} className="space-y-4">
      {modal.action === "confirm_handover" && <><div><label className="block space-y-1.5 text-sm font-medium">{c.beforePhotos}<input type="file" name="photos" accept="image/png,image/jpeg,image/webp" multiple required={modal.checkout.handover_photo_paths.length === 0} className={FILE_CLASS} /></label><p className="mt-1.5 text-xs text-muted-foreground">{c.beforePhotosHelp}</p></div>{modal.checkout.handover_photo_paths.length > 0 && <PhotoGrid checkout={modal.checkout} kind="handover" label={c.photos} />}<label className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 p-3 text-sm"><input type="checkbox" name="purpose_and_photos_confirmed" required className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" /><span>{c.adminConfirmation}</span></label></>}
      {modal.action === "confirm_receipt" && <><PhotoGrid checkout={modal.checkout} kind="handover" label={c.photos} /><label className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 p-3 text-sm"><input type="checkbox" name="photo_match_confirmed" required className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" /><span>{c.receivedConfirmation}</span></label></>}
      {modal.action === "confirm_return" && <ReturnInspectionFields c={c} isPt={isPt} checkout={modal.checkout} />}
      {["reject", "cancel"].includes(modal.action) && <label className="block space-y-1.5 text-sm font-medium">{c.notes}<select name="reason" required className={FIELD_CLASS} defaultValue=""><option value="" disabled>{isPt ? "Selecione um motivo" : "Select a reason"}</option>{transitionReasons.map((value) => <option key={value} value={value}>{cancellationReasonLabel(value, isPt)}</option>)}</select></label>}
      <ModalActions busy={busy} cancel={c.cancel} confirm={transitionTitle} onCancel={onClose} />
    </form>}
    {modal.kind === "release" && <form onSubmit={(event) => onRelease(event, modal.item)} className="space-y-4"><label className="block space-y-1.5 text-sm font-medium">{c.condition}<select required name="condition" className={FIELD_CLASS} defaultValue="good">{conditionOptions(isPt, false)}</select></label><label className="block space-y-1.5 text-sm font-medium">{c.notes}<select name="notes" className={FIELD_CLASS} defaultValue="maintenance_completed"><option value="maintenance_completed">{isPt ? "Manutenção concluída" : "Maintenance completed"}</option><option value="inspection_completed">{isPt ? "Inspeção concluída" : "Inspection completed"}</option></select></label><ModalActions busy={busy} cancel={c.cancel} confirm={c.release} onCancel={onClose} /></form>}
  </DialogContent></Dialog>;
}

function EquipmentTerms({ isPt, title }: { isPt: boolean; title: string }) {
  const clauses = isPt
    ? [
        "Utilizar o equipamento apenas para a finalidade selecionada e no período autorizado.",
        "Conferir o estado do item pelas fotos antes da retirada e comunicar qualquer divergência antes do uso.",
        "Manter a guarda do equipamento, não emprestá-lo a terceiros e protegê-lo contra queda, líquido, furto e uso não autorizado.",
        "Devolver o item no prazo e nas mesmas condições, ressalvado o desgaste normal de uso.",
        "Comunicar imediatamente perda, acidente ou avaria. Danos decorrentes de dolo, negligência ou uso indevido poderão gerar responsabilidade após apuração interna, conforme contrato, política interna e legislação aplicável.",
      ]
    : [
        "Use the equipment only for the selected purpose and authorized period.",
        "Check the item against the photos before pickup and report discrepancies before use.",
        "Keep custody of the equipment, do not lend it, and protect it from impact, liquids, theft, and unauthorized use.",
        "Return the item on time and in the same condition, except for normal wear.",
        "Report loss, accidents, or damage immediately. Intentional, negligent, or improper use may create responsibility after internal review under applicable agreements, policies, and law.",
      ];
  return <details className="rounded-xl border border-border bg-muted/20 p-3"><summary className="cursor-pointer text-sm font-semibold text-primary">{title}</summary><ol className="mt-3 list-decimal space-y-2 pl-5 text-xs leading-relaxed text-muted-foreground">{clauses.map((clause) => <li key={clause}>{clause}</li>)}</ol><p className="mt-3 border-t border-border pt-3 text-[11px] text-muted-foreground">{isPt ? "Este aceite registra ciência operacional e não substitui apuração interna, contrato ou legislação aplicável." : "This acknowledgement records operational awareness and does not replace internal review, agreements, or applicable law."}</p></details>;
}

function ReturnInspectionFields({ c, isPt, checkout }: { c: typeof pt; isPt: boolean; checkout: Checkout }) {
  const [condition, setCondition] = useState("good");
  const damaged = condition === "damaged";
  return <><label className="block space-y-1.5 text-sm font-medium">{c.condition}<select required name="condition" className={FIELD_CLASS} value={condition} onChange={(event) => setCondition(event.target.value)}>{conditionOptions(isPt, true)}</select></label>{damaged && <><label className="block space-y-1.5 text-sm font-medium">{c.damageNotes}<select required name="damage_type" className={FIELD_CLASS} defaultValue=""><option value="" disabled>{isPt ? "Selecione o tipo de avaria" : "Select the damage type"}</option>{EQUIPMENT_DAMAGE_TYPES.map((value) => <option key={value} value={value}>{damageTypeLabel(value, isPt)}</option>)}</select></label><label className="block space-y-1.5 text-sm font-medium">{c.damagePhoto}<input type="file" name="photos" accept="image/png,image/jpeg,image/webp" required={checkout.damage_photo_paths.length === 0} className={FILE_CLASS} /></label>{checkout.damage_photo_paths.length > 0 && <PhotoGrid checkout={checkout} kind="damage" label={c.photos} />}<label className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 p-3 text-sm"><input type="checkbox" name="damage_notice_confirmed" required className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" /><span>{c.damageNotice}</span></label></>}<label className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 p-3 text-sm"><input type="checkbox" name="inspection_confirmed" required className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" /><span>{c.inspectionAgreement}</span></label></>;
}

function Field({ label, name, type = "text", ...props }: { label: string; name: string; type?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "type">) { return <label className="space-y-1.5 text-sm font-medium">{label}<input name={name} type={type} className={FIELD_CLASS} {...props} /></label>; }
function ModalActions({ busy, cancel, confirm, onCancel }: { busy: boolean; cancel: string; confirm: string; onCancel: () => void }) { return <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{cancel}</Button><Button type="submit" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{confirm}</Button></DialogFooter>; }
function conditionOptions(isPt: boolean, damaged: boolean) { const values = damaged ? ["new", "excellent", "good", "worn", "damaged"] : ["new", "excellent", "good", "worn"]; const labels: Record<string, [string, string]> = { new: ["Novo", "New"], excellent: ["Excelente", "Excellent"], good: ["Bom", "Good"], worn: ["Com Desgaste", "Worn"], damaged: ["Com Avaria", "Damaged"] }; return values.map((value) => <option value={value} key={value}>{labels[value][isPt ? 0 : 1]}</option>); }
function cancellationReasonLabel(value: string, isPt: boolean) { const labels: Record<string, [string, string]> = { requester_cancelled: ["Cancelada pelo solicitante", "Cancelled by requester"], administration_cancelled: ["Cancelada pela Administração", "Cancelled by Administration"], schedule_conflict: ["Conflito de agenda", "Schedule conflict"], request_invalid: ["Solicitação incompatível", "Invalid request"] }; return labels[value]?.[isPt ? 0 : 1] ?? value; }
function damageTypeLabel(value: string, isPt: boolean) { const labels: Record<string, [string, string]> = { impact: ["Impacto ou queda", "Impact or drop"], scratch: ["Risco ou dano superficial", "Scratch or surface damage"], liquid: ["Contato com líquido", "Liquid exposure"], missing_part: ["Peça ou acessório ausente", "Missing part or accessory"], electrical: ["Falha elétrica", "Electrical failure"], other: ["Outra avaria", "Other damage"] }; return labels[value]?.[isPt ? 0 : 1] ?? value; }
