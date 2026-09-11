"use client";

/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  Building2,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock3,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileUp,
  Instagram,
  Loader2,
  LockKeyhole,
  Mail,
  MessageCircle,
  Pencil,
  RefreshCw,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  UserRound,
  Video,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/components/language-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatBrazilianMobile } from "@/lib/brazilian-mobile";
import { formatBrazilianCnpj, isBrazilianCnpj } from "@/lib/brazilian-cnpj";
import { cn } from "@/lib/utils";
import {
  brazilianCurrencyDigits,
  formatBrazilianCurrencyInteger,
  formatBrazilianCurrencyText,
  normalizeBrazilianCurrencyInteger,
} from "@/lib/brazilian-currency";
import {
  COMMERCIAL_LEAD_REVENUE_TIERS,
  commercialLeadRevenueTier,
} from "@/lib/commercial-lead-revenue";
import {
  COMMERCIAL_CONTRACT_SERVICES,
  commercialContractMonthlyFeeFromLead,
  commercialContractPlanFromLead,
} from "@/lib/commercial-contract";
import {
  GROUP_UP_PLAN_VALUES,
  UP_ZERO_PLAN_VALUES,
  negotiatedScopeItems,
  type GroupUpPlan,
  type UpZeroPlan,
} from "@/lib/commercial-lead-negotiation";
import type { CommercialLead, TaskAssignee } from "@/lib/types";

type LeadEditForm = {
  brandName: string;
  ownerName: string;
  ownerEmail: string;
  instagram: string;
  monthlyRevenue: string;
  whatsapp: string;
  presentationDate: string;
  presentationStart: string;
  presentationEnd: string;
  assigneeId: string;
  companyType: "B2B" | "B2C" | "Ambos";
  observations: string;
};

type NegotiationForm = {
  groupUpPlan: GroupUpPlan | "";
  groupUpMonthlyFee: string;
  upZeroPlan: UpZeroPlan | "";
  upZeroMonthlyFee: string;
  upZeroImplementationFee: string;
  negotiatedScope: string[];
};

type ContractForm = {
  cnpj: string;
  legalName: string;
  plan: string;
  services: string[];
  monthlyFee: string;
};

const LEAD_EDIT_CONTROL =
  "h-8 rounded-md border-0 bg-white/[0.025] px-3 py-0 text-sm font-semibold text-slate-100 caret-blue-300 shadow-none transition hover:bg-white/[0.045] focus-visible:bg-blue-400/[0.055] focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-60";
const LEAD_EDIT_SELECT =
  "h-8 w-full cursor-pointer appearance-none rounded-md border-0 bg-white/[0.025] py-0 pl-3 pr-12 text-sm font-semibold text-slate-100 outline-none transition hover:bg-white/[0.045] focus:bg-blue-400/[0.055] disabled:cursor-not-allowed disabled:opacity-60";
const LEAD_ACTION_SECONDARY =
  "h-9 rounded-xl border border-white/10 bg-black/15 px-3 text-xs font-semibold text-slate-300 shadow-none hover:border-blue-400/35 hover:bg-blue-400/10 hover:text-blue-100";
const LEAD_ACTION_PRIMARY =
  "h-9 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-[0_8px_24px_rgba(79,108,255,0.22)] hover:bg-primary/90";

const FOLLOW_UP_CHECKPOINTS = [
  { stage: "first_contact", days: 3 },
  { stage: "second_contact", days: 7 },
  { stage: "final_contact", days: 14 },
] as const;

function localDatePart(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTimePart(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function editFormFromLead(lead: CommercialLead): LeadEditForm {
  return {
    brandName: lead.brand_name,
    ownerName: lead.owner_name,
    ownerEmail: lead.owner_email,
    instagram: lead.instagram.replace(/^@+/, ""),
    monthlyRevenue: String(lead.monthly_revenue),
    whatsapp: formatBrazilianMobile(lead.whatsapp),
    presentationDate: localDatePart(lead.presentation_starts_at),
    presentationStart: localTimePart(lead.presentation_starts_at),
    presentationEnd: localTimePart(lead.presentation_ends_at),
    assigneeId: lead.assignee_id,
    companyType: lead.company_type,
    observations: lead.observations ?? "",
  };
}

function negotiationFormFromLead(lead: CommercialLead): NegotiationForm {
  const groupUpPlan = lead.group_up_plan ?? "";
  const upZeroPlan = lead.up_zero_plan ?? "";
  const expectedScope =
    groupUpPlan && upZeroPlan
      ? negotiatedScopeItems(groupUpPlan, upZeroPlan).map((item) => item.key)
      : [];
  return {
    groupUpPlan,
    groupUpMonthlyFee:
      lead.group_up_monthly_fee === null
        ? ""
        : normalizeBrazilianCurrencyInteger(lead.group_up_monthly_fee),
    upZeroPlan,
    upZeroMonthlyFee:
      lead.up_zero_monthly_fee === null
        ? ""
        : normalizeBrazilianCurrencyInteger(lead.up_zero_monthly_fee),
    upZeroImplementationFee:
      lead.up_zero_implementation_fee === null
        ? ""
        : normalizeBrazilianCurrencyInteger(lead.up_zero_implementation_fee),
    negotiatedScope: Array.isArray(lead.negotiated_scope)
      ? lead.negotiated_scope
      : lead.negotiation_checklist_completed_at
        ? expectedScope
        : [],
  };
}

function contractFormFromLead(lead: CommercialLead): ContractForm {
  return {
    cnpj: formatBrazilianCnpj(lead.contract_cnpj ?? ""),
    legalName: lead.contract_legal_name ?? "",
    plan: lead.contract_plan ?? commercialContractPlanFromLead(lead),
    services: Array.isArray(lead.contract_services)
      ? lead.contract_services
      : [],
    monthlyFee: normalizeBrazilianCurrencyInteger(
      lead.contract_monthly_fee ?? commercialContractMonthlyFeeFromLead(lead),
    ),
  };
}

export function CommercialLeadPanel({
  lead,
  users = [],
  canContribute,
  isFollowUpTask = false,
  isContractHandoffTask = false,
  isFinanceContractTask = false,
  onRefresh,
}: {
  lead: CommercialLead;
  users?: TaskAssignee[];
  canContribute: boolean;
  isFollowUpTask?: boolean;
  isContractHandoffTask?: boolean;
  isFinanceContractTask?: boolean;
  onRefresh: () => void;
}) {
  const { language, t } = useLanguage();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [presentationDate, setPresentationDate] = useState("");
  const [presentationStart, setPresentationStart] = useState("");
  const [presentationEnd, setPresentationEnd] = useState("");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<LeadEditForm>(() =>
    editFormFromLead(lead),
  );
  const [negotiationForm, setNegotiationForm] = useState<NegotiationForm>(() =>
    negotiationFormFromLead(lead),
  );
  const [contractForm, setContractForm] = useState<ContractForm>(() =>
    contractFormFromLead(lead),
  );
  const [proposalReviewed, setProposalReviewed] = useState(false);
  const [followUpVerified, setFollowUpVerified] = useState(false);
  const [presentationSyncing, setPresentationSyncing] = useState(false);
  const [presentationClock, setPresentationClock] = useState(() => Date.now());
  const canOperateContractStages = Boolean(
    canContribute &&
      lead.can_advance_contract &&
      (isContractHandoffTask || isFinanceContractTask),
  );
  const financeContractStatus =
    lead.finance_contract_task?.status ??
    (lead.contract_confirmed_at ? "todo" : null);
  const dateLocale = language === "pt-BR" ? "pt-BR" : "en-US";
  const revenueTier = commercialLeadRevenueTier(Number(lead.monthly_revenue));
  const revenue = revenueTier
    ? t(revenueTier.labelKey)
    : new Intl.NumberFormat(dateLocale, {
        style: "currency",
        currency: "BRL",
      }).format(Number(lead.monthly_revenue));
  const presentation =
    lead.presentation_starts_at && lead.presentation_ends_at
      ? `${new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(lead.presentation_starts_at))} – ${new Intl.DateTimeFormat(dateLocale, { timeStyle: "short" }).format(new Date(lead.presentation_ends_at))}`
      : t("commercialLead.notScheduled");
  const presentationHasEnded = Boolean(
    lead.presentation_ends_at &&
    new Date(lead.presentation_ends_at).getTime() <= presentationClock,
  );
  const presentationCanChange = ["lead", "presentation_scheduled"].includes(
    lead.stage,
  );
  const followUpDue = Boolean(
    lead.next_follow_up_at &&
    new Date(lead.next_follow_up_at).getTime() <= presentationClock,
  );
  const followUpHref =
    lead.follow_up_task_id && lead.follow_up_task?.project_id
      ? `/projects/${lead.follow_up_task.project_id}?task=${lead.follow_up_task_id}`
      : null;
  const contractHandoffHref =
    lead.contract_handoff_task_id && lead.contract_handoff_task?.project_id
      ? `/projects/${lead.contract_handoff_task.project_id}?task=${lead.contract_handoff_task_id}`
      : null;
  const financeContractHref =
    lead.finance_contract_task_id && lead.finance_contract_task?.project_id
      ? `/projects/${lead.finance_contract_task.project_id}?task=${lead.finance_contract_task_id}`
      : null;
  const presentationIntegration = lead.presentation_integration;
  const presentationStatusClass =
    presentationIntegration?.status === "ready"
      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
      : presentationIntegration?.status === "failed"
        ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
        : presentationIntegration?.status === "not_configured" ||
            presentationIntegration?.status === "not_connected"
          ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
          : "border-blue-400/25 bg-blue-400/10 text-blue-200";
  const editFormId = `commercial-lead-edit-${lead.id}`;
  const negotiationFormId = `commercial-lead-negotiation-${lead.id}`;
  const requiredNegotiatedScope =
    negotiationForm.groupUpPlan && negotiationForm.upZeroPlan
      ? negotiatedScopeItems(
          negotiationForm.groupUpPlan,
          negotiationForm.upZeroPlan,
        )
      : [];
  const negotiatedScopeComplete = requiredNegotiatedScope.every((item) =>
    negotiationForm.negotiatedScope.includes(item.key),
  );

  useEffect(() => {
    if (!editing) {
      setEditForm(editFormFromLead(lead));
      setNegotiationForm(negotiationFormFromLead(lead));
    }
  }, [editing, lead]);

  useEffect(() => {
    setContractForm(contractFormFromLead(lead));
  }, [lead]);

  useEffect(() => {
    setProposalReviewed(false);
  }, [lead.proposal_file_name, lead.proposal_uploaded_at]);

  useEffect(() => {
    setFollowUpVerified(false);
  }, [lead.follow_up_stage]);

  useEffect(() => {
    setPresentationClock(Date.now());
    if (!lead.presentation_ends_at) return;
    const remaining =
      new Date(lead.presentation_ends_at).getTime() - Date.now();
    if (remaining <= 0) return;
    const timeout = window.setTimeout(
      () => setPresentationClock(Date.now()),
      Math.min(remaining + 250, 2_147_000_000),
    );
    return () => window.clearTimeout(timeout);
  }, [lead.presentation_ends_at]);

  const setEditValue = <Key extends keyof LeadEditForm>(
    key: Key,
    value: LeadEditForm[Key],
  ) => {
    setEditForm((current) => ({ ...current, [key]: value }));
  };

  const setEditPresentationStart = (value: string) => {
    if (!value) {
      setEditForm((current) => ({
        ...current,
        presentationStart: "",
        presentationEnd: "",
      }));
      return;
    }
    const [hours, minutes] = value.split(":").map(Number);
    const endMinutes = (hours * 60 + minutes + 60) % (24 * 60);
    const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
    setEditForm((current) => ({
      ...current,
      presentationStart: value,
      presentationEnd: end,
    }));
  };

  const editPresentationIso = (time: string, nextDayWhenEarlier = false) => {
    if (!editForm.presentationDate || !time) return null;
    const date = new Date(`${editForm.presentationDate}T${time}:00`);
    if (
      nextDayWhenEarlier &&
      editForm.presentationStart &&
      time <= editForm.presentationStart
    ) {
      date.setDate(date.getDate() + 1);
    }
    return date.toISOString();
  };

  const saveDetails = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    const includesNegotiation = Boolean(
      lead.negotiation_checklist_completed_at,
    );
    if (
      includesNegotiation &&
      (!negotiationForm.groupUpPlan || !negotiationForm.upZeroPlan)
    ) {
      toast.error(t("commercialLead.negotiationPlansRequired"));
      return;
    }
    if (
      includesNegotiation &&
      negotiationForm.groupUpPlan !== "none" &&
      !(Number(negotiationForm.groupUpMonthlyFee) > 0)
    ) {
      toast.error(t("commercialLead.groupUpMonthlyFeeRequired"));
      return;
    }
    if (
      includesNegotiation &&
      negotiationForm.upZeroPlan !== "none" &&
      !(Number(negotiationForm.upZeroMonthlyFee) > 0)
    ) {
      toast.error(t("commercialLead.upZeroMonthlyFeeRequired"));
      return;
    }
    if (
      includesNegotiation &&
      negotiationForm.upZeroPlan !== "none" &&
      (negotiationForm.upZeroImplementationFee === "" ||
        Number(negotiationForm.upZeroImplementationFee) < 0)
    ) {
      toast.error(t("commercialLead.upZeroImplementationFeeRequired"));
      return;
    }
    if (includesNegotiation && !negotiatedScopeComplete) {
      toast.error(t("commercialLead.negotiatedScopeRequired"));
      return;
    }
    const hasPresentationValue = Boolean(
      editForm.presentationDate ||
      editForm.presentationStart ||
      editForm.presentationEnd,
    );
    if (
      hasPresentationValue &&
      !(
        editForm.presentationDate &&
        editForm.presentationStart &&
        editForm.presentationEnd
      )
    ) {
      toast.error(t("commercialLead.completePresentationWindow"));
      return;
    }
    const startsAt = editPresentationIso(editForm.presentationStart);
    const endsAt = editPresentationIso(editForm.presentationEnd, true);
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      toast.error(t("commercialLead.invalidPresentationWindow"));
      return;
    }

    setBusy(true);
    try {
      const response = await fetch(`/api/commercial/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_details",
          brand_name: editForm.brandName,
          owner_name: editForm.ownerName,
          owner_email: editForm.ownerEmail,
          instagram: editForm.instagram,
          monthly_revenue: Number(editForm.monthlyRevenue),
          whatsapp: editForm.whatsapp,
          presentation_starts_at: startsAt,
          presentation_ends_at: endsAt,
          assignee_id: editForm.assigneeId,
          company_type: editForm.companyType,
          observations: editForm.observations || null,
          negotiation: includesNegotiation
            ? {
                group_up_plan: negotiationForm.groupUpPlan,
                group_up_monthly_fee:
                  negotiationForm.groupUpPlan === "none"
                    ? null
                    : Number(negotiationForm.groupUpMonthlyFee),
                up_zero_plan: negotiationForm.upZeroPlan,
                up_zero_monthly_fee:
                  negotiationForm.upZeroPlan === "none"
                    ? null
                    : Number(negotiationForm.upZeroMonthlyFee),
                up_zero_implementation_fee:
                  negotiationForm.upZeroPlan === "none"
                    ? null
                    : Number(negotiationForm.upZeroImplementationFee),
                negotiated_scope: negotiationForm.negotiatedScope,
              }
            : undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || t("commercialLead.updateFailed"));
      }
      toast.success(t("commercialLead.updated"));
      setEditing(false);
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.updateFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmPresentation = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/commercial/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_presentation" }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || t("commercialLead.confirmFailed"));
      toast.success(t("commercialLead.presentationConfirmed"));
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.confirmFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const qualifyLead = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/commercial/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "qualify_lead" }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || t("commercialLead.qualificationFailed"));
      }
      toast.success(t("commercialLead.qualified"));
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.qualificationFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const archiveLead = async (reason: "not_qualified" | "not_closed") => {
    const confirmationKey =
      reason === "not_qualified"
        ? "commercialLead.archiveNotQualifiedConfirm"
        : "commercialLead.archiveNotClosedConfirm";
    if (!window.confirm(t(confirmationKey))) return;

    setBusy(true);
    try {
      const response = await fetch(`/api/commercial/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive_lead", reason }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || t("commercialLead.archiveFailed"));
      }
      toast.success(t("commercialLead.archived"));
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.archiveFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmClosed = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/commercial/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm_closed" }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || t("commercialLead.closeFailed"));
      toast.success(t("commercialLead.closed"));
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.closeFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const reopenLead = async () => {
    if (!window.confirm(t("commercialLead.reopenConfirm"))) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/commercial/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reopen_after_close" }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || t("commercialLead.reopenFailed"));
      }
      toast.success(t("commercialLead.reopened"));
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.reopenFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const ensureContractHandoff = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/commercial/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ensure_contract_handoff" }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          data.error || t("commercialLead.contractHandoffCreateFailed"),
        );
      }
      toast.success(t("commercialLead.contractHandoffCreated"));
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.contractHandoffCreateFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmContractHandoff = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!isBrazilianCnpj(contractForm.cnpj)) {
      toast.error(t("commercialLead.contractCnpjInvalid"));
      return;
    }
    if (contractForm.services.length === 0) {
      toast.error(t("commercialLead.contractServicesRequired"));
      return;
    }
    if (!(Number(contractForm.monthlyFee) > 0)) {
      toast.error(t("commercialLead.contractMonthlyFeeRequired"));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/commercial/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm_contract_handoff",
          cnpj: contractForm.cnpj,
          legal_name: contractForm.legalName,
          plan: contractForm.plan,
          services: contractForm.services,
          monthly_fee: Number(contractForm.monthlyFee),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          data.error || t("commercialLead.contractHandoffConfirmFailed"),
        );
      }
      toast.success(t("commercialLead.contractHandoffConfirmed"));
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.contractHandoffConfirmFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const advanceContract = async (
    action: "mark_contract_sent" | "mark_contract_signed",
  ) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/commercial/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          data.error || t("commercialLead.contractStageUpdateFailed"),
        );
      }
      toast.success(
        t(
          action === "mark_contract_sent"
            ? "commercialLead.contractSentConfirmed"
            : "commercialLead.contractSignedConfirmed",
        ),
      );
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.contractStageUpdateFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const schedulePresentation = async () => {
    if (!presentationDate || !presentationStart || !presentationEnd) {
      toast.error(t("commercialLead.completePresentationWindow"));
      return;
    }
    const startsAt = new Date(`${presentationDate}T${presentationStart}:00`);
    const endsAt = new Date(`${presentationDate}T${presentationEnd}:00`);
    if (presentationEnd <= presentationStart)
      endsAt.setDate(endsAt.getDate() + 1);
    if (endsAt <= startsAt) {
      toast.error(t("commercialLead.invalidPresentationWindow"));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/commercial/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "schedule_presentation",
          starts_at: startsAt.toISOString(),
          ends_at: endsAt.toISOString(),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || t("commercialLead.scheduleFailed"));
      toast.success(t("commercialLead.presentationScheduled"));
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.scheduleFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const copyMeetingLink = async () => {
    if (!presentationIntegration?.meeting_url) return;
    try {
      await navigator.clipboard.writeText(presentationIntegration.meeting_url);
      toast.success(t("commercialLead.meetingLinkCopied"));
    } catch {
      toast.error(t("commercialLead.meetingLinkCopyFailed"));
    }
  };

  const retryPresentationSync = async () => {
    if (presentationSyncing) return;
    setPresentationSyncing(true);
    try {
      const response = await fetch(`/api/commercial/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retry_presentation_sync" }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          data.error || t("commercialLead.meetingSyncRetryFailed"),
        );
      }
      toast.success(t("commercialLead.meetingSyncRetried"));
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.meetingSyncRetryFailed"),
      );
    } finally {
      setPresentationSyncing(false);
    }
  };

  const saveNegotiationChecklist = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();
    if (!negotiationForm.groupUpPlan || !negotiationForm.upZeroPlan) {
      toast.error(t("commercialLead.negotiationPlansRequired"));
      return;
    }
    if (
      negotiationForm.groupUpPlan !== "none" &&
      !(Number(negotiationForm.groupUpMonthlyFee) > 0)
    ) {
      toast.error(t("commercialLead.groupUpMonthlyFeeRequired"));
      return;
    }
    if (
      negotiationForm.upZeroPlan !== "none" &&
      !(Number(negotiationForm.upZeroMonthlyFee) > 0)
    ) {
      toast.error(t("commercialLead.upZeroMonthlyFeeRequired"));
      return;
    }
    if (
      negotiationForm.upZeroPlan !== "none" &&
      (negotiationForm.upZeroImplementationFee === "" ||
        Number(negotiationForm.upZeroImplementationFee) < 0)
    ) {
      toast.error(t("commercialLead.upZeroImplementationFeeRequired"));
      return;
    }
    if (!negotiatedScopeComplete) {
      toast.error(t("commercialLead.negotiatedScopeRequired"));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/commercial/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_negotiation_checklist",
          group_up_plan: negotiationForm.groupUpPlan,
          group_up_monthly_fee:
            negotiationForm.groupUpPlan === "none"
              ? null
              : Number(negotiationForm.groupUpMonthlyFee),
          up_zero_plan: negotiationForm.upZeroPlan,
          up_zero_monthly_fee:
            negotiationForm.upZeroPlan === "none"
              ? null
              : Number(negotiationForm.upZeroMonthlyFee),
          up_zero_implementation_fee:
            negotiationForm.upZeroPlan === "none"
              ? null
              : Number(negotiationForm.upZeroImplementationFee),
          negotiated_scope: negotiationForm.negotiatedScope,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          data.error || t("commercialLead.negotiationChecklistSaveFailed"),
        );
      }
      toast.success(t("commercialLead.negotiationChecklistSaved"));
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.negotiationChecklistSaveFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const uploadProposal = async (file: File) => {
    setBusy(true);
    try {
      const body = new FormData();
      body.set("file", file);
      const response = await fetch(
        `/api/commercial/leads/${lead.id}/proposal`,
        { method: "POST", body },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(data.error || t("commercialLead.proposalUploadFailed"));
      toast.success(t("commercialLead.proposalUploaded"));
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.proposalUploadFailed"),
      );
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirmProposalFile = async () => {
    if (!proposalReviewed) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/commercial/leads/${lead.id}/proposal`,
        { method: "PATCH" },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          data.error || t("commercialLead.proposalFileConfirmFailed"),
        );
      }
      toast.success(t("commercialLead.proposalFileConfirmed"));
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.proposalFileConfirmFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const openProposalFile = async () => {
    const proposalWindow = window.open("about:blank", "_blank");
    if (proposalWindow) proposalWindow.opener = null;
    setBusy(true);
    try {
      const response = await fetch(`/api/commercial/leads/${lead.id}/proposal`);
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        url?: string;
      };
      if (!response.ok || !data.url) {
        throw new Error(data.error || t("commercialLead.proposalOpenFailed"));
      }
      if (proposalWindow) {
        proposalWindow.location.replace(data.url);
      } else {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      proposalWindow?.close();
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.proposalOpenFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const removeProposalFile = async () => {
    if (!window.confirm(t("commercialLead.proposalRemoveConfirm"))) return;
    setBusy(true);
    try {
      const response = await fetch(
        `/api/commercial/leads/${lead.id}/proposal`,
        { method: "DELETE" },
      );
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || t("commercialLead.proposalRemoveFailed"));
      }
      toast.success(t("commercialLead.proposalRemoved"));
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.proposalRemoveFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  const recordFollowUpContact = async () => {
    if (!followUpVerified) {
      toast.error(t("commercialLead.followUpVerificationRequired"));
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/api/commercial/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "record_follow_up" }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || t("commercialLead.followUpRecordFailed"));
      }
      toast.success(t("commercialLead.followUpRecorded"));
      setFollowUpVerified(false);
      onRefresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("commercialLead.followUpRecordFailed"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-b border-white/10 bg-blue-500/[0.05] px-4 py-5 sm:px-5 lg:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">
            {t("commercialLead.record")}
          </p>
          <h3 className="mt-1 text-lg font-semibold text-white">
            {lead.brand_name}
          </h3>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="inline-flex h-9 items-center rounded-xl border border-blue-400/25 bg-blue-400/10 px-3 text-xs font-semibold text-blue-200">
            {t(`commercialLead.stage.${lead.stage}`)}
          </span>
          {canContribute && editing ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  setEditForm(editFormFromLead(lead));
                  setNegotiationForm(negotiationFormFromLead(lead));
                  setEditing(false);
                }}
                className={LEAD_ACTION_SECONDARY}
              >
                {t("common.cancel")}
              </Button>
              <Button
                type="submit"
                form={editFormId}
                size="sm"
                disabled={busy || users.length === 0}
                className={LEAD_ACTION_PRIMARY}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {busy ? t("common.saving") : t("commercialLead.saveChanges")}
              </Button>
            </>
          ) : canContribute ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditForm(editFormFromLead(lead));
                setNegotiationForm(negotiationFormFromLead(lead));
                setEditing(true);
              }}
              className={LEAD_ACTION_SECONDARY}
            >
              <Pencil className="h-4 w-4" />
              {t("commercialLead.editRecord")}
            </Button>
          ) : null}
        </div>
      </div>
      {editing ? (
        <form id={editFormId} onSubmit={saveDetails} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <EditField
              icon={<Building2 className="h-4 w-4" />}
              label={t("commercialLead.brandName")}
              required
            >
              <Input
                required
                value={editForm.brandName}
                onChange={(event) =>
                  setEditValue("brandName", event.target.value)
                }
                className={LEAD_EDIT_CONTROL}
              />
            </EditField>
            <EditField
              icon={<UserRound className="h-4 w-4" />}
              label={t("commercialLead.ownerName")}
              required
            >
              <Input
                required
                value={editForm.ownerName}
                onChange={(event) =>
                  setEditValue("ownerName", event.target.value)
                }
                className={LEAD_EDIT_CONTROL}
              />
            </EditField>
            <EditField
              icon={<Mail className="h-4 w-4" />}
              label={t("commercialLead.ownerEmail")}
              required
            >
              <Input
                type="email"
                required
                value={editForm.ownerEmail}
                onChange={(event) =>
                  setEditValue("ownerEmail", event.target.value)
                }
                className={LEAD_EDIT_CONTROL}
              />
            </EditField>
            <EditField
              icon={<Instagram className="h-4 w-4" />}
              label={t("commercialLead.instagram")}
              required
            >
              <div className="flex h-8 items-center">
                <span
                  aria-hidden="true"
                  className="mr-2 border-r border-white/10 pr-2 text-sm font-semibold text-slate-400"
                >
                  @
                </span>
                <Input
                  required
                  aria-label={t("commercialLead.instagramUsername")}
                  value={editForm.instagram}
                  onChange={(event) =>
                    setEditValue(
                      "instagram",
                      event.target.value.replace(/^@+/, "").replace(/\s+/g, ""),
                    )
                  }
                  className={LEAD_EDIT_CONTROL}
                />
              </div>
            </EditField>
            <EditField
              icon={<Wallet className="h-4 w-4" />}
              label={t("commercialLead.monthlyRevenue")}
              required
            >
              <LeadEditSelect
                required
                value={editForm.monthlyRevenue}
                onChange={(event) =>
                  setEditValue("monthlyRevenue", event.target.value)
                }
              >
                {COMMERCIAL_LEAD_REVENUE_TIERS.map((tier) => (
                  <option key={tier.value} value={tier.value}>
                    {t(tier.labelKey)}
                  </option>
                ))}
              </LeadEditSelect>
            </EditField>
            <EditField
              icon={<MessageCircle className="h-4 w-4" />}
              label={t("commercialLead.whatsapp")}
              required
            >
              <LeadWhatsAppControl
                value={editForm.whatsapp}
                onChange={(value) => setEditValue("whatsapp", value)}
                countryLabel={t("commercialLead.whatsappCountry")}
                placeholder={t("commercialLead.whatsappPlaceholder")}
              />
            </EditField>
            <EditField
              icon={<UserRound className="h-4 w-4" />}
              label={t("commercialLead.assignee")}
              required
            >
              <LeadEditSelect
                required
                value={editForm.assigneeId}
                onChange={(event) =>
                  setEditValue("assigneeId", event.target.value)
                }
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} — {user.email}
                  </option>
                ))}
              </LeadEditSelect>
            </EditField>
            <EditField
              icon={<CheckCircle2 className="h-4 w-4" />}
              label={t("commercialLead.companyType")}
              required
            >
              <LeadEditSelect
                required
                value={editForm.companyType}
                onChange={(event) =>
                  setEditValue(
                    "companyType",
                    event.target.value as "B2B" | "B2C" | "Ambos",
                  )
                }
              >
                <option value="B2B">B2B</option>
                <option value="B2C">B2C</option>
                <option value="Ambos">
                  {t("commercialLead.companyType.both")}
                </option>
              </LeadEditSelect>
            </EditField>
          </div>
          <fieldset
            className="rounded-xl border border-white/10 bg-black/10 p-3 transition focus-within:border-blue-400/35 focus-within:bg-blue-400/[0.035]"
            disabled={!presentationCanChange}
          >
            <legend className="flex items-center gap-2 px-1 text-[11px] font-medium text-slate-500">
              <CalendarClock className="h-4 w-4" />
              {t("commercialLead.presentationWindow")}
            </legend>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <EditField compact label={t("commercialLead.presentationDate")}>
                <LeadDateTimeControlIcon type="date">
                  <Input
                    type="date"
                    value={editForm.presentationDate}
                    onClick={openNativeDateTimePicker}
                    onChange={(event) =>
                      setEditValue("presentationDate", event.target.value)
                    }
                    className={cn(LEAD_EDIT_CONTROL, "upflow-date-time-input")}
                  />
                </LeadDateTimeControlIcon>
              </EditField>
              <EditField compact label={t("commercialLead.startTime")}>
                <LeadDateTimeControlIcon type="time">
                  <Input
                    type="time"
                    value={editForm.presentationStart}
                    onClick={openNativeDateTimePicker}
                    onInput={(event) =>
                      setEditPresentationStart(event.currentTarget.value)
                    }
                    className={cn(LEAD_EDIT_CONTROL, "upflow-date-time-input")}
                  />
                </LeadDateTimeControlIcon>
              </EditField>
              <EditField compact label={t("commercialLead.endTime")}>
                <LeadDateTimeControlIcon type="time">
                  <Input
                    type="time"
                    value={editForm.presentationEnd}
                    onClick={openNativeDateTimePicker}
                    onChange={(event) =>
                      setEditValue("presentationEnd", event.target.value)
                    }
                    className={cn(LEAD_EDIT_CONTROL, "upflow-date-time-input")}
                  />
                </LeadDateTimeControlIcon>
              </EditField>
            </div>
            {!presentationCanChange ? (
              <p className="mt-3 text-xs text-slate-400">
                {t("commercialLead.presentationHistoryLocked")}
              </p>
            ) : null}
          </fieldset>
          <EditField
            icon={<Pencil className="h-4 w-4" />}
            label={t("commercialLead.observations")}
          >
            <Textarea
              rows={3}
              value={editForm.observations}
              onChange={(event) =>
                setEditValue("observations", event.target.value)
              }
              className="min-h-20 resize-y border-0 bg-transparent px-2.5 py-1 text-sm leading-6 text-slate-100 caret-blue-300 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </EditField>
          {lead.negotiation_checklist_completed_at ? (
            <fieldset className="rounded-xl border border-emerald-400/25 bg-emerald-400/[0.045] p-4">
              <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-emerald-200">
                <ClipboardCheck className="h-4 w-4" />
                {t("commercialLead.negotiationSummary")}
              </legend>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {t("commercialLead.negotiationEditHint")}
              </p>
              <NegotiationEditFields
                form={negotiationForm}
                setForm={setNegotiationForm}
                t={t}
              />
            </fieldset>
          ) : null}
        </form>
      ) : (
        <>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <LeadDatum
              icon={<Mail className="h-4 w-4" />}
              label={t("commercialLead.owner")}
              value={`${lead.owner_name} · ${lead.owner_email}`}
            />
            <LeadDatum
              icon={<Instagram className="h-4 w-4" />}
              label={t("commercialLead.instagram")}
              value={`@${lead.instagram.replace(/^@+/, "")}`}
            />
            <LeadDatum
              icon={<MessageCircle className="h-4 w-4" />}
              label={t("commercialLead.whatsapp")}
              value={`+55 ${formatBrazilianMobile(lead.whatsapp)}`}
            />
            <LeadDatum
              icon={<Wallet className="h-4 w-4" />}
              label={t("commercialLead.monthlyRevenue")}
              value={revenue}
            />
            <LeadDatum
              icon={<CalendarClock className="h-4 w-4" />}
              label={t("commercialLead.presentationWindow")}
              value={presentation}
            />
            <LeadDatum
              icon={<CheckCircle2 className="h-4 w-4" />}
              label={t("commercialLead.companyType")}
              value={lead.company_type}
            />
          </dl>
          <div className="mt-4">
            <TextBlock
              label={t("commercialLead.observations")}
              value={lead.observations || "—"}
            />
          </div>
        </>
      )}
      {presentationIntegration ? (
        <section
          data-testid="commercial-lead-google-meet"
          className="mt-4 rounded-xl border border-blue-300/20 bg-blue-400/[0.045] p-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/25 bg-blue-400/10 text-blue-200">
                <Video className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-blue-100">
                  {t("commercialLead.meetingTitle")}
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {t("commercialLead.meetingDescription")}
                </p>
              </div>
            </div>
            <span
              className={cn(
                "inline-flex min-h-8 w-fit shrink-0 items-center rounded-lg border px-2.5 py-1 text-xs font-semibold",
                presentationStatusClass,
              )}
            >
              {t(
                `commercialLead.meetingStatus.${presentationIntegration.status}`,
              )}
            </span>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div className="min-w-0 rounded-lg border border-white/10 bg-black/10 p-3">
              <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                {t("commercialLead.presentationWindow")}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-100">
                {presentation}
              </dd>
            </div>
            <div className="min-w-0 rounded-lg border border-white/10 bg-black/10 p-3">
              <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                {t("commercialLead.connectedCalendar")}
              </dt>
              <dd className="mt-1 truncate text-sm font-semibold text-slate-100">
                {presentationIntegration.calendar_label ||
                  t("commercialLead.googleCalendar")}
              </dd>
            </div>
            <div className="min-w-0 rounded-lg border border-white/10 bg-black/10 p-3 sm:col-span-2 xl:col-span-1">
              <dt className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
                {t("commercialLead.meetingParticipants")}
              </dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {presentationIntegration.participants.map((participant) => (
                  <span
                    key={participant.id}
                    title={participant.email}
                    className="max-w-full truncate rounded-md bg-white/[0.06] px-2 py-1 text-xs font-medium text-slate-200"
                  >
                    {participant.name}
                  </span>
                ))}
              </dd>
            </div>
          </dl>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {presentationIntegration.meeting_url ? (
              <a
                href={presentationIntegration.meeting_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_rgba(79,108,255,0.22)] transition hover:bg-primary/90 sm:w-auto"
              >
                <Video className="h-4 w-4" />
                {t("commercialLead.joinGoogleMeet")}
              </a>
            ) : null}
            {presentationIntegration.meeting_url ? (
              <button
                type="button"
                onClick={() => void copyMeetingLink()}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-blue-400/30 hover:bg-blue-400/10 sm:w-auto"
              >
                <Copy className="h-4 w-4" />
                {t("commercialLead.copyMeetingLink")}
              </button>
            ) : null}
            {presentationIntegration.google_event_url ? (
              <a
                href={presentationIntegration.google_event_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/10 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-blue-400/30 hover:bg-blue-400/10 sm:w-auto"
              >
                <ExternalLink className="h-4 w-4" />
                {t("commercialLead.openGoogleCalendar")}
              </a>
            ) : null}
            {presentationIntegration.status === "not_configured" ||
            presentationIntegration.status === "not_connected" ? (
              <Link
                href="/calendar"
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/15 sm:w-auto"
              >
                <CalendarClock className="h-4 w-4" />
                {t("commercialLead.configureGoogleCalendar")}
              </Link>
            ) : null}
            {canContribute &&
            !presentationIntegration.meeting_url &&
            presentationIntegration.status !== "not_configured" &&
            presentationIntegration.status !== "not_connected" ? (
              <button
                type="button"
                onClick={() => void retryPresentationSync()}
                disabled={presentationSyncing}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-blue-400/25 bg-blue-400/10 px-4 py-2 text-sm font-semibold text-blue-100 transition hover:bg-blue-400/15 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                <RefreshCw
                  className={cn(
                    "h-4 w-4",
                    presentationSyncing && "animate-spin",
                  )}
                />
                {presentationSyncing
                  ? t("commercialLead.retryingMeetingSync")
                  : t("commercialLead.retryMeetingSync")}
              </button>
            ) : null}
          </div>
          {!presentationIntegration.meeting_url ? (
            <p className="mt-3 text-xs leading-5 text-slate-400">
              {t("commercialLead.meetingLinkPendingHint")}
            </p>
          ) : null}
        </section>
      ) : null}
      {canContribute && !editing && lead.stage === "lead" ? (
        <div className="mt-4 rounded-xl border border-blue-400/20 bg-blue-400/[0.06] p-4">
          <p className="text-sm font-semibold text-blue-100">
            {t("commercialLead.schedulePresentation")}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <LeadDateTimeControlIcon type="date">
              <input
                aria-label={t("commercialLead.presentationDate")}
                type="date"
                value={presentationDate}
                onClick={openNativeDateTimePicker}
                onChange={(event) => setPresentationDate(event.target.value)}
                className="upflow-date-time-input h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white"
              />
            </LeadDateTimeControlIcon>
            <LeadDateTimeControlIcon type="time">
              <input
                aria-label={t("commercialLead.startTime")}
                type="time"
                value={presentationStart}
                onClick={openNativeDateTimePicker}
                onChange={(event) => {
                  const value = event.target.value;
                  setPresentationStart(value);
                  if (!value) {
                    setPresentationEnd("");
                    return;
                  }
                  const [hours, minutes] = value.split(":").map(Number);
                  const endMinutes = (hours * 60 + minutes + 60) % (24 * 60);
                  setPresentationEnd(
                    `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`,
                  );
                }}
                className="upflow-date-time-input h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white"
              />
            </LeadDateTimeControlIcon>
            <LeadDateTimeControlIcon type="time">
              <input
                aria-label={t("commercialLead.endTime")}
                type="time"
                value={presentationEnd}
                onClick={openNativeDateTimePicker}
                onChange={(event) => setPresentationEnd(event.target.value)}
                className="upflow-date-time-input h-10 w-full rounded-md border border-white/10 bg-black/20 px-3 text-sm text-white"
              />
            </LeadDateTimeControlIcon>
          </div>
          <Button
            className="mt-3"
            onClick={schedulePresentation}
            disabled={busy}
          >
            <CalendarClock className="h-4 w-4" />
            {t("commercialLead.schedulePresentation")}
          </Button>
        </div>
      ) : null}
      {canContribute &&
      !editing &&
      lead.stage === "presentation_scheduled" &&
      presentationHasEnded ? (
        <Button className="mt-4" onClick={confirmPresentation} disabled={busy}>
          <CheckCircle2 className="h-4 w-4" />
          {t("commercialLead.confirmPresentation")}
        </Button>
      ) : null}
      {canContribute &&
      !editing &&
      lead.stage === "presentation_scheduled" &&
      !presentationHasEnded ? (
        <p className="mt-4 text-xs text-slate-400">
          {t("commercialLead.confirmAfterPresentation")}
        </p>
      ) : null}
      {!editing && lead.stage === "qualification" && !lead.qualified_at ? (
        <div className="mt-4 rounded-xl border border-cyan-400/25 bg-cyan-400/[0.06] p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/25 bg-cyan-400/10 text-cyan-200">
              <BadgeCheck className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-cyan-100">
                {t("commercialLead.qualificationTitle")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {t("commercialLead.qualificationHint")}
              </p>
            </div>
          </div>
          {canContribute ? (
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                onClick={() => void archiveLead("not_qualified")}
                disabled={busy}
                className="h-9 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] px-3 text-xs font-semibold text-rose-200 hover:bg-rose-400/10"
              >
                <Archive className="h-4 w-4" />
                {t("commercialLead.markNotQualified")}
              </Button>
              <Button
                type="button"
                onClick={qualifyLead}
                disabled={busy}
                className={LEAD_ACTION_PRIMARY}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <BadgeCheck className="h-4 w-4" />
                )}
                {t("commercialLead.markQualified")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {canContribute &&
      !editing &&
      lead.stage === "qualification" &&
      lead.qualified_at ? (
        <form
          id={negotiationFormId}
          onSubmit={saveNegotiationChecklist}
          noValidate
          className="mt-4 rounded-xl border border-violet-400/25 bg-violet-400/[0.06] p-4"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-400/25 bg-violet-400/10 text-violet-200">
              <ClipboardCheck className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-violet-100">
                {t("commercialLead.negotiationChecklist")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {t("commercialLead.negotiationChecklistHint")}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <EditField
              icon={<Building2 className="h-4 w-4" />}
              label={t("commercialLead.groupUpPlan")}
              required
            >
              <LeadEditSelect
                required
                value={negotiationForm.groupUpPlan}
                onChange={(event) => {
                  const plan = event.target.value as GroupUpPlan | "";
                  setNegotiationForm((current) => ({
                    ...current,
                    groupUpPlan: plan,
                    negotiatedScope: current.negotiatedScope.filter(
                      (key) => !key.startsWith("group_up."),
                    ),
                    ...(plan === "none" ? { groupUpMonthlyFee: "" } : {}),
                  }));
                }}
              >
                <option value="" disabled>
                  {t("commercialLead.choosePlan")}
                </option>
                {GROUP_UP_PLAN_VALUES.map((plan) => (
                  <option key={plan} value={plan}>
                    {t(`commercialLead.groupUpPlan.${plan}`)}
                  </option>
                ))}
              </LeadEditSelect>
            </EditField>
            <EditField
              icon={<Wallet className="h-4 w-4" />}
              label={t("commercialLead.groupUpMonthlyFee")}
              required={negotiationForm.groupUpPlan !== "none"}
            >
              <LeadCurrencyInput
                disabled={negotiationForm.groupUpPlan === "none"}
                required={Boolean(
                  negotiationForm.groupUpPlan &&
                  negotiationForm.groupUpPlan !== "none",
                )}
                value={negotiationForm.groupUpMonthlyFee}
                onChange={(value) =>
                  setNegotiationForm((current) => ({
                    ...current,
                    groupUpMonthlyFee: value,
                  }))
                }
              />
            </EditField>
            <EditField
              icon={<Building2 className="h-4 w-4" />}
              label={t("commercialLead.upZeroPlan")}
              required
            >
              <LeadEditSelect
                required
                value={negotiationForm.upZeroPlan}
                onChange={(event) => {
                  const plan = event.target.value as UpZeroPlan | "";
                  setNegotiationForm((current) => ({
                    ...current,
                    upZeroPlan: plan,
                    negotiatedScope: current.negotiatedScope.filter(
                      (key) => !key.startsWith("up_zero."),
                    ),
                    ...(plan === "none"
                      ? {
                          upZeroMonthlyFee: "",
                          upZeroImplementationFee: "",
                        }
                      : {}),
                  }));
                }}
              >
                <option value="" disabled>
                  {t("commercialLead.choosePlan")}
                </option>
                {UP_ZERO_PLAN_VALUES.map((plan) => (
                  <option key={plan} value={plan}>
                    {t(`commercialLead.upZeroPlan.${plan}`)}
                  </option>
                ))}
              </LeadEditSelect>
            </EditField>
            <EditField
              icon={<Wallet className="h-4 w-4" />}
              label={t("commercialLead.upZeroMonthlyFee")}
              required={negotiationForm.upZeroPlan !== "none"}
            >
              <LeadCurrencyInput
                disabled={negotiationForm.upZeroPlan === "none"}
                required={Boolean(
                  negotiationForm.upZeroPlan &&
                  negotiationForm.upZeroPlan !== "none",
                )}
                value={negotiationForm.upZeroMonthlyFee}
                onChange={(value) =>
                  setNegotiationForm((current) => ({
                    ...current,
                    upZeroMonthlyFee: value,
                  }))
                }
              />
            </EditField>
            <EditField
              icon={<Wallet className="h-4 w-4" />}
              label={t("commercialLead.upZeroImplementationFee")}
              required={negotiationForm.upZeroPlan !== "none"}
            >
              <LeadCurrencyInput
                disabled={negotiationForm.upZeroPlan === "none"}
                required={Boolean(
                  negotiationForm.upZeroPlan &&
                  negotiationForm.upZeroPlan !== "none",
                )}
                value={negotiationForm.upZeroImplementationFee}
                onChange={(value) =>
                  setNegotiationForm((current) => ({
                    ...current,
                    upZeroImplementationFee: value,
                  }))
                }
              />
            </EditField>
          </div>
          <NegotiatedScopeChecklist
            form={negotiationForm}
            setForm={setNegotiationForm}
            t={t}
          />
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button
              type="submit"
              disabled={busy}
              className={LEAD_ACTION_PRIMARY}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {t("commercialLead.completeNegotiationChecklist")}
            </Button>
          </div>
        </form>
      ) : null}
      {lead.negotiation_checklist_completed_at &&
      lead.stage !== "qualification" &&
      !editing ? (
        <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <ClipboardCheck className="h-4 w-4" />
            {t("commercialLead.negotiationSummary")}
          </div>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <NegotiationDatum
              label={t("commercialLead.groupUpPlan")}
              value={t(
                `commercialLead.groupUpPlan.${lead.group_up_plan ?? "none"}`,
              )}
              amount={lead.group_up_monthly_fee}
            />
            <NegotiationDatum
              label={t("commercialLead.upZeroPlan")}
              value={t(
                `commercialLead.upZeroPlan.${lead.up_zero_plan ?? "none"}`,
              )}
              amount={lead.up_zero_monthly_fee}
            />
            {lead.up_zero_plan && lead.up_zero_plan !== "none" ? (
              <NegotiationDatum
                label={t("commercialLead.upZeroImplementationFee")}
                value={t("commercialLead.oneTimeFee")}
                amount={lead.up_zero_implementation_fee}
              />
            ) : null}
          </dl>
          <NegotiatedScopeChecklist
            form={negotiationForm}
            t={t}
            readOnly
          />
        </div>
      ) : null}
      {!editing &&
      (lead.proposal_file_name ||
        (canContribute && lead.stage === "proposal_sending")) ? (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
          <input
            ref={fileRef}
            className="sr-only"
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void uploadProposal(file);
            }}
          />
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-100">
                {lead.proposal_file_name
                  ? t("commercialLead.proposalReviewTitle")
                  : t("commercialLead.proposalRequired")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {lead.proposal_file_name
                  ? lead.stage === "proposal_sending"
                    ? t("commercialLead.proposalPendingConfirmation")
                    : t("commercialLead.proposalConfirmedFile")
                  : t("commercialLead.proposalRequiredHint")}
              </p>
            </div>
            {!lead.proposal_file_name && canContribute ? (
              <Button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                className={LEAD_ACTION_PRIMARY}
              >
                <Upload className="h-4 w-4" />
                {t("commercialLead.proposalAttach")}
              </Button>
            ) : null}
          </div>
          {lead.proposal_file_name ? (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/15 p-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 text-amber-200">
                  <FileUp className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-100">
                    {lead.proposal_file_name}
                  </p>
                  {lead.proposal_uploaded_at ? (
                    <p className="mt-0.5 text-[11px] text-slate-500">
                      {new Intl.DateTimeFormat(dateLocale, {
                        dateStyle: "short",
                        timeStyle: "short",
                      }).format(new Date(lead.proposal_uploaded_at))}
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={openProposalFile}
                  disabled={busy}
                  className={LEAD_ACTION_SECONDARY}
                >
                  <ExternalLink className="h-4 w-4" />
                  {t("commercialLead.proposalOpen")}
                </Button>
                {canContribute &&
                ["proposal_sending", "awaiting_response"].includes(
                  lead.stage,
                ) ? (
                  <>
                    <Button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      disabled={busy}
                      className={LEAD_ACTION_SECONDARY}
                    >
                      <RefreshCw className="h-4 w-4" />
                      {t("commercialLead.proposalReplace")}
                    </Button>
                    <Button
                      type="button"
                      onClick={removeProposalFile}
                      disabled={busy}
                      className="h-9 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] px-3 text-xs font-semibold text-rose-200 hover:bg-rose-400/10"
                    >
                      <Trash2 className="h-4 w-4" />
                      {t("commercialLead.proposalRemove")}
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ) : null}
          {lead.proposal_file_name &&
          canContribute &&
          lead.stage === "proposal_sending" ? (
            <div className="mt-3 flex flex-col gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-slate-300">
                <input
                  type="checkbox"
                  checked={proposalReviewed}
                  onChange={(event) =>
                    setProposalReviewed(event.target.checked)
                  }
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/20 accent-primary"
                />
                <span>{t("commercialLead.proposalReviewCheck")}</span>
              </label>
              <Button
                type="button"
                onClick={confirmProposalFile}
                disabled={busy || !proposalReviewed}
                className={LEAD_ACTION_PRIMARY}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {t("commercialLead.proposalConfirmFile")}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {lead.stage === "awaiting_response" && lead.next_follow_up_at ? (
        <p className="mt-3 text-xs text-slate-300">
          {t("commercialLead.nextFollowUp")}:{" "}
          {new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium" }).format(
            new Date(lead.next_follow_up_at),
          )}{" "}
          · {t("commercialLead.followUpCount", { count: lead.follow_up_count })}
        </p>
      ) : null}
      {lead.stage === "awaiting_response" &&
      (isFollowUpTask || followUpHref) ? (
        <div className="mt-4 rounded-xl border border-blue-400/20 bg-blue-400/[0.06] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-blue-100">
                {t("commercialLead.followUpCadence")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {isFollowUpTask ? (
                  t("commercialLead.followUpChildTaskHint")
                ) : (
                  <>
                    {t("commercialLead.followUpLinkedTaskPrefix")}{" "}
                    <Link
                      href={followUpHref!}
                      className="inline-flex items-center gap-1 font-semibold text-blue-300 underline decoration-blue-300/40 underline-offset-2 transition hover:text-blue-200 hover:decoration-blue-200 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300/70"
                    >
                      Follow Up
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </Link>
                    .
                  </>
                )}
              </p>
            </div>
            {lead.follow_up_stage ? (
              <span className="inline-flex min-h-8 shrink-0 items-center rounded-lg bg-blue-400/10 px-3 text-xs font-semibold text-blue-200">
                {t(`commercialLead.followUpStage.${lead.follow_up_stage}`)}
              </span>
            ) : null}
          </div>
          {lead.next_follow_up_at ? (
            <p className="mt-3 text-xs font-medium text-slate-300">
              {t("commercialLead.nextContact", {
                date: new Intl.DateTimeFormat(dateLocale, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(lead.next_follow_up_at)),
              })}
            </p>
          ) : (
            <p className="mt-3 text-xs text-slate-400">
              {t("commercialLead.awaitingDecisionHint")}
            </p>
          )}
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-200">
              {t("commercialLead.followUpCheckpoints")}
            </p>
            <div className="mt-2 grid gap-2">
              {FOLLOW_UP_CHECKPOINTS.map(({ stage, days }, checkpointIndex) => {
                const checkpoint = lead.follow_up_checkpoints?.find(
                  (item) => item.stage === stage,
                );
                const active = lead.follow_up_stage === stage;
                const currentCheckpointIndex = FOLLOW_UP_CHECKPOINTS.findIndex(
                  (item) => item.stage === lead.follow_up_stage,
                );
                const passedWithoutVerification =
                  !checkpoint &&
                  (currentCheckpointIndex > checkpointIndex ||
                    ["awaiting_decision", "completed", "withdrawn"].includes(
                      lead.follow_up_stage ?? "",
                    ));
                const plannedAt = lead.follow_up_task?.created_at
                  ? new Date(
                      new Date(lead.follow_up_task.created_at).getTime() +
                        days * 24 * 60 * 60 * 1000,
                    )
                  : null;
                const completedBy =
                  checkpoint?.completed_by?.name ??
                  checkpoint?.completed_by?.email ??
                  t("commercialLead.followUpUnknownActor");
                return (
                  <div
                    key={stage}
                    className={cn(
                      "rounded-xl border p-3",
                      checkpoint
                        ? "border-emerald-400/25 bg-emerald-400/[0.06]"
                        : passedWithoutVerification
                          ? "border-amber-400/25 bg-amber-400/[0.05]"
                          : active
                            ? "border-blue-400/30 bg-blue-400/[0.07]"
                            : "border-white/10 bg-black/[0.08]",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border",
                          checkpoint
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                            : passedWithoutVerification
                              ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
                              : active
                                ? "border-blue-400/30 bg-blue-400/10 text-blue-300"
                                : "border-white/10 bg-white/[0.03] text-slate-500",
                        )}
                      >
                        {checkpoint ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : passedWithoutVerification ? (
                          <AlertTriangle className="h-4 w-4" />
                        ) : active ? (
                          <Circle className="h-4 w-4" />
                        ) : (
                          <LockKeyhole className="h-3.5 w-3.5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-100">
                          {t(`commercialLead.followUpStage.${stage}`)}
                        </p>
                        {checkpoint ? (
                          <p className="mt-1 text-xs leading-5 text-emerald-200/80">
                            {t("commercialLead.followUpCheckpointCompleted", {
                              name: completedBy,
                              date: new Intl.DateTimeFormat(dateLocale, {
                                dateStyle: "short",
                                timeStyle: "short",
                              }).format(new Date(checkpoint.completed_at)),
                            })}
                          </p>
                        ) : passedWithoutVerification ? (
                          <p className="mt-1 text-xs leading-5 text-amber-200/80">
                            {t("commercialLead.followUpCheckpointMissing")}
                          </p>
                        ) : active && plannedAt ? (
                          <p className="mt-1 text-xs leading-5 text-slate-400">
                            {t("commercialLead.followUpCheckpointScheduled", {
                              date: new Intl.DateTimeFormat(dateLocale, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              }).format(plannedAt),
                            })}
                          </p>
                        ) : (
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {t("commercialLead.followUpCheckpointLocked")}
                          </p>
                        )}
                      </div>
                    </div>
                    {active && followUpDue && canContribute && !checkpoint ? (
                      <div className="mt-3 border-t border-blue-300/15 pt-3">
                        <label className="flex cursor-pointer items-start gap-2 text-xs leading-5 text-slate-300">
                          <input
                            type="checkbox"
                            checked={followUpVerified}
                            onChange={(event) =>
                              setFollowUpVerified(event.target.checked)
                            }
                            className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/20 accent-primary"
                          />
                          <span>
                            {t("commercialLead.followUpVerificationCheck")}
                          </span>
                        </label>
                        <Button
                          type="button"
                          onClick={recordFollowUpContact}
                          disabled={busy || !followUpVerified}
                          className={cn(LEAD_ACTION_PRIMARY, "mt-3")}
                        >
                          {busy ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MessageCircle className="h-4 w-4" />
                          )}
                          {t("commercialLead.recordFollowUp")}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
      {canContribute && !editing && lead.stage === "awaiting_response" ? (
        <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
          <p className="text-xs leading-5 text-slate-400">
            {t("commercialLead.closeHint")}
          </p>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              onClick={() => void archiveLead("not_closed")}
              disabled={busy}
              className="h-9 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] px-3 text-xs font-semibold text-rose-200 hover:bg-rose-400/10"
            >
              <Archive className="h-4 w-4" />
              {t("commercialLead.archiveNotClosed")}
            </Button>
            <Button
              type="button"
              onClick={confirmClosed}
              disabled={busy}
              className={LEAD_ACTION_PRIMARY}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {t("commercialLead.confirmClosed")}
            </Button>
          </div>
        </div>
      ) : null}
      {lead.stage === "archived" && !editing ? (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-4">
          <Archive className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />
          <div>
            <p className="text-sm font-semibold text-rose-100">
              {t("commercialLead.archivedTitle")}
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {t(
                lead.archive_reason === "not_qualified"
                  ? "commercialLead.archivedNotQualifiedHint"
                  : "commercialLead.archivedNotClosedHint",
              )}
            </p>
          </div>
        </div>
      ) : null}
      {lead.stage === "completed" &&
      !isFollowUpTask &&
      !isContractHandoffTask &&
      !isFinanceContractTask ? (
        <div className="mt-4 rounded-xl border border-blue-400/20 bg-blue-400/[0.055] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-blue-100">
                {t("commercialLead.contractHandoffTitle")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {lead.contract_confirmed_at
                  ? t("commercialLead.contractHandoffFinanceCreated")
                  : t("commercialLead.contractHandoffPending")}
              </p>
            </div>
            {contractHandoffHref ? (
              <Link
                href={contractHandoffHref}
                className={cn(
                  LEAD_ACTION_PRIMARY,
                  "inline-flex shrink-0 items-center gap-2",
                )}
              >
                <ClipboardCheck className="h-4 w-4" />
                {t("commercialLead.openContractHandoff")}
              </Link>
            ) : canContribute ? (
              <Button
                type="button"
                onClick={ensureContractHandoff}
                disabled={busy}
                className={LEAD_ACTION_PRIMARY}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ClipboardCheck className="h-4 w-4" />
                )}
                {t("commercialLead.createContractHandoff")}
              </Button>
            ) : null}
          </div>
          {financeContractHref ? (
            <Link
              href={financeContractHref}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-300 underline decoration-blue-300/40 underline-offset-2 hover:text-blue-200"
            >
              {t("commercialLead.openFinanceContractTask")}
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </div>
      ) : null}
      {isContractHandoffTask &&
      lead.stage === "completed" &&
      !lead.contract_confirmed_at ? (
        <form
          onSubmit={confirmContractHandoff}
          className="mt-4 rounded-2xl border border-blue-400/20 bg-blue-400/[0.045] p-4 sm:p-5"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">
                {t("commercialLead.contractHandoffEyebrow")}
              </p>
              <h3 className="mt-1 text-base font-semibold text-slate-100">
                {t("commercialLead.contractHandoffFormTitle")}
              </h3>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
                {t("commercialLead.contractHandoffFormHint")}
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <EditField label={t("commercialLead.contractCnpj")} required>
              <Input
                required
                inputMode="numeric"
                value={contractForm.cnpj}
                onChange={(event) =>
                  setContractForm((current) => ({
                    ...current,
                    cnpj: formatBrazilianCnpj(event.target.value),
                  }))
                }
                placeholder="00.000.000/0000-00"
                className={LEAD_EDIT_CONTROL}
              />
            </EditField>
            <EditField label={t("commercialLead.contractLegalName")} required>
              <Input
                required
                value={contractForm.legalName}
                onChange={(event) =>
                  setContractForm((current) => ({
                    ...current,
                    legalName: event.target.value,
                  }))
                }
                className={LEAD_EDIT_CONTROL}
              />
            </EditField>
            <EditField label={t("commercialLead.companyType")}>
              <Input
                readOnly
                value={lead.company_type}
                className={cn(
                  LEAD_EDIT_CONTROL,
                  "cursor-default text-slate-300",
                )}
              />
            </EditField>
            <EditField label={t("commercialLead.contractPlan")} required>
              <Input
                required
                value={contractForm.plan}
                onChange={(event) =>
                  setContractForm((current) => ({
                    ...current,
                    plan: event.target.value,
                  }))
                }
                className={LEAD_EDIT_CONTROL}
              />
            </EditField>
            <EditField label={t("commercialLead.contractMonthlyFee")} required>
              <LeadCurrencyInput
                required
                value={contractForm.monthlyFee}
                onChange={(monthlyFee) =>
                  setContractForm((current) => ({ ...current, monthlyFee }))
                }
              />
            </EditField>
            <EditField label={t("commercialLead.ownerEmail")}>
              <Input
                readOnly
                value={lead.owner_email}
                className={cn(
                  LEAD_EDIT_CONTROL,
                  "cursor-default text-slate-300",
                )}
              />
            </EditField>
            <EditField label={t("commercialLead.whatsapp")}>
              <Input
                readOnly
                value={`+55 ${formatBrazilianMobile(lead.whatsapp)}`}
                className={cn(
                  LEAD_EDIT_CONTROL,
                  "cursor-default text-slate-300",
                )}
              />
            </EditField>
            <div className="rounded-xl border border-blue-300/20 bg-blue-400/[0.025] p-3 md:col-span-2 xl:col-span-3">
              <p className="text-[11px] font-medium text-slate-500">
                {t("commercialLead.contractServices")}
                <span className="ml-1 text-rose-300">*</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {COMMERCIAL_CONTRACT_SERVICES.map((service) => {
                  const selected = contractForm.services.includes(service);
                  return (
                    <button
                      key={service}
                      type="button"
                      aria-pressed={selected}
                      onClick={() =>
                        setContractForm((current) => ({
                          ...current,
                          services: selected
                            ? current.services.filter(
                                (item) => item !== service,
                              )
                            : [...current.services, service],
                        }))
                      }
                      className={cn(
                        "min-h-9 rounded-lg border px-3 text-xs font-semibold transition",
                        selected
                          ? "border-blue-300/45 bg-blue-400/15 text-blue-100"
                          : "border-white/10 bg-black/10 text-slate-400 hover:border-blue-300/30 hover:text-slate-200",
                      )}
                    >
                      {service}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 border-t border-blue-300/15 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-slate-400">
              {t("commercialLead.contractFinanceActionHint")}
            </p>
            <Button
              type="submit"
              disabled={busy || !canContribute}
              className={cn(LEAD_ACTION_PRIMARY, "shrink-0")}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              {t("commercialLead.confirmContractAndFinance")}
            </Button>
          </div>
          {financeContractHref ? (
            <Link
              href={financeContractHref}
              className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-300 underline decoration-blue-300/40 underline-offset-2 hover:text-blue-200"
            >
              {t("commercialLead.openFinanceContractTask")}
              <ExternalLink className="h-3 w-3" />
            </Link>
          ) : null}
        </form>
      ) : null}
      {(isContractHandoffTask || isFinanceContractTask) &&
      lead.contract_confirmed_at ? (
        <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.045] p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                {t("commercialLead.financeContractEyebrow")}
              </p>
              <h3 className="mt-1 text-base font-semibold text-slate-100">
                {t("commercialLead.financeContractTitle")}
              </h3>
            </div>
            <span className="inline-flex min-h-8 shrink-0 items-center rounded-lg bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-200">
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              {t("commercialLead.contractDataConfirmed")}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <LeadDatum
              icon={<Building2 className="h-4 w-4" />}
              label={t("commercialLead.contractCnpj")}
              value={lead.contract_cnpj ?? "—"}
            />
            <LeadDatum
              icon={<Building2 className="h-4 w-4" />}
              label={t("commercialLead.contractLegalName")}
              value={lead.contract_legal_name ?? "—"}
            />
            <LeadDatum
              icon={<Building2 className="h-4 w-4" />}
              label={t("commercialLead.companyType")}
              value={lead.company_type}
            />
            <LeadDatum
              icon={<ClipboardCheck className="h-4 w-4" />}
              label={t("commercialLead.contractPlan")}
              value={lead.contract_plan ?? "—"}
            />
            <LeadDatum
              icon={<Wallet className="h-4 w-4" />}
              label={t("commercialLead.contractMonthlyFee")}
              value={
                lead.contract_monthly_fee === null
                  ? "—"
                  : formatBrazilianCurrencyText(lead.contract_monthly_fee)
              }
            />
            <LeadDatum
              icon={<Mail className="h-4 w-4" />}
              label={t("commercialLead.ownerEmail")}
              value={lead.owner_email}
            />
          </dl>
          <div className="mt-3 rounded-xl border border-white/10 bg-black/10 p-3">
            <p className="text-[11px] font-medium text-slate-500">
              {t("commercialLead.contractServices")}
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-100">
              {lead.contract_services?.join(", ") ?? "—"}
            </p>
          </div>
          {isContractHandoffTask && !canOperateContractStages ? (
            <p className="mt-3 border-t border-emerald-300/15 pt-3 text-xs leading-5 text-slate-400">
              {t("commercialLead.contractFinanceLocked")}
            </p>
          ) : null}
        </div>
      ) : null}
      {canOperateContractStages && lead.contract_confirmed_at ? (
        <div className="mt-4 rounded-2xl border border-blue-400/20 bg-blue-400/[0.04] p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-300">
                {t("commercialLead.contractStageEyebrow")}
              </p>
              <p className="mt-1 text-sm font-semibold text-slate-100">
                {financeContractStatus === "done"
                  ? t("commercialLead.contractStageSigned")
                  : financeContractStatus === "in_progress"
                    ? t("commercialLead.contractStageSent")
                    : t("commercialLead.contractStagePreparation")}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-400">
                {financeContractStatus === "done"
                  ? t("commercialLead.contractSignedFolderCreated")
                  : t("commercialLead.contractStageHint")}
              </p>
            </div>
            {financeContractStatus === "todo" ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() => advanceContract("mark_contract_sent")}
                className={cn(LEAD_ACTION_PRIMARY, "shrink-0")}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                {t("commercialLead.confirmContractSent")}
              </Button>
            ) : null}
            {financeContractStatus === "in_progress" ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() => advanceContract("mark_contract_signed")}
                className={cn(LEAD_ACTION_PRIMARY, "shrink-0")}
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {t("commercialLead.confirmContractSigned")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {canContribute &&
      !editing &&
      lead.stage === "completed" &&
      !isFollowUpTask &&
      !isContractHandoffTask &&
      !isFinanceContractTask ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-slate-400">
            {t("commercialLead.reopenHint")}
          </p>
          <Button
            type="button"
            onClick={reopenLead}
            disabled={busy}
            className={cn(LEAD_ACTION_SECONDARY, "shrink-0")}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {t("commercialLead.reopen")}
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function NegotiationEditFields({
  form,
  setForm,
  t,
}: {
  form: NegotiationForm;
  setForm: React.Dispatch<React.SetStateAction<NegotiationForm>>;
  t: ReturnType<typeof useLanguage>["t"];
}) {
  return (
    <>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <EditField
        icon={<Building2 className="h-4 w-4" />}
        label={t("commercialLead.groupUpPlan")}
        required
      >
        <LeadEditSelect
          required
          value={form.groupUpPlan}
          onChange={(event) => {
            const plan = event.target.value as GroupUpPlan | "";
            setForm((current) => ({
              ...current,
              groupUpPlan: plan,
              negotiatedScope: current.negotiatedScope.filter(
                (key) => !key.startsWith("group_up."),
              ),
              ...(plan === "none" ? { groupUpMonthlyFee: "" } : {}),
            }));
          }}
        >
          <option value="" disabled>
            {t("commercialLead.choosePlan")}
          </option>
          {GROUP_UP_PLAN_VALUES.map((plan) => (
            <option key={plan} value={plan}>
              {t(`commercialLead.groupUpPlan.${plan}`)}
            </option>
          ))}
        </LeadEditSelect>
      </EditField>
      <EditField
        icon={<Wallet className="h-4 w-4" />}
        label={t("commercialLead.groupUpMonthlyFee")}
        required={form.groupUpPlan !== "none"}
      >
        <LeadCurrencyInput
          disabled={form.groupUpPlan === "none"}
          required={Boolean(form.groupUpPlan && form.groupUpPlan !== "none")}
          value={form.groupUpMonthlyFee}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              groupUpMonthlyFee: value,
            }))
          }
        />
      </EditField>
      <EditField
        icon={<Building2 className="h-4 w-4" />}
        label={t("commercialLead.upZeroPlan")}
        required
      >
        <LeadEditSelect
          required
          value={form.upZeroPlan}
          onChange={(event) => {
            const plan = event.target.value as UpZeroPlan | "";
            setForm((current) => ({
              ...current,
              upZeroPlan: plan,
              negotiatedScope: current.negotiatedScope.filter(
                (key) => !key.startsWith("up_zero."),
              ),
              ...(plan === "none"
                ? {
                    upZeroMonthlyFee: "",
                    upZeroImplementationFee: "",
                  }
                : {}),
            }));
          }}
        >
          <option value="" disabled>
            {t("commercialLead.choosePlan")}
          </option>
          {UP_ZERO_PLAN_VALUES.map((plan) => (
            <option key={plan} value={plan}>
              {t(`commercialLead.upZeroPlan.${plan}`)}
            </option>
          ))}
        </LeadEditSelect>
      </EditField>
      <EditField
        icon={<Wallet className="h-4 w-4" />}
        label={t("commercialLead.upZeroMonthlyFee")}
        required={form.upZeroPlan !== "none"}
      >
        <LeadCurrencyInput
          disabled={form.upZeroPlan === "none"}
          required={Boolean(form.upZeroPlan && form.upZeroPlan !== "none")}
          value={form.upZeroMonthlyFee}
          onChange={(value) =>
            setForm((current) => ({
              ...current,
              upZeroMonthlyFee: value,
            }))
          }
        />
      </EditField>
        <EditField
          icon={<Wallet className="h-4 w-4" />}
          label={t("commercialLead.upZeroImplementationFee")}
          required={form.upZeroPlan !== "none"}
        >
          <LeadCurrencyInput
            disabled={form.upZeroPlan === "none"}
            required={Boolean(form.upZeroPlan && form.upZeroPlan !== "none")}
            value={form.upZeroImplementationFee}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                upZeroImplementationFee: value,
              }))
            }
          />
        </EditField>
      </div>
      <NegotiatedScopeChecklist form={form} setForm={setForm} t={t} />
    </>
  );
}

function NegotiatedScopeChecklist({
  form,
  setForm,
  t,
  readOnly = false,
}: {
  form: NegotiationForm;
  setForm?: React.Dispatch<React.SetStateAction<NegotiationForm>>;
  t: ReturnType<typeof useLanguage>["t"];
  readOnly?: boolean;
}) {
  if (!form.groupUpPlan || !form.upZeroPlan) return null;
  const items = negotiatedScopeItems(form.groupUpPlan, form.upZeroPlan);
  if (items.length === 0) return null;

  return (
    <fieldset className="mt-4 rounded-xl border border-white/10 bg-black/10 p-3 sm:p-4">
      <legend className="px-1 text-xs font-semibold text-slate-200">
        {t("commercialLead.negotiatedScope")}
      </legend>
      <p className="mb-3 text-xs leading-5 text-slate-400">
        {readOnly
          ? t("commercialLead.negotiatedScopeConfirmed")
          : t("commercialLead.negotiatedScopeHint")}
      </p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const checked = form.negotiatedScope.includes(item.key);
          return (
            <label
              key={item.key}
              className={cn(
                "flex min-h-10 items-start gap-2.5 rounded-lg border px-3 py-2 text-xs leading-5 transition",
                checked
                  ? "border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-100"
                  : "border-white/10 bg-white/[0.025] text-slate-300",
                readOnly ? "cursor-default" : "cursor-pointer hover:border-blue-400/30",
              )}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={readOnly}
                onChange={() =>
                  setForm?.((current) => ({
                    ...current,
                    negotiatedScope: checked
                      ? current.negotiatedScope.filter((key) => key !== item.key)
                      : [...current.negotiatedScope, item.key],
                  }))
                }
                className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-500"
              />
              <span>{t(item.labelKey)}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function LeadDatum({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/10 p-3">
      <dt className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
        {icon}
        {label}
      </dt>
      <dd className="mt-2 break-words text-sm font-semibold text-slate-100">
        {value}
      </dd>
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">
        {value}
      </p>
    </div>
  );
}

function NegotiationDatum({
  label,
  value,
  amount,
}: {
  label: string;
  value: string;
  amount: string | number | null;
}) {
  const monthlyFee =
    amount === null ? null : formatBrazilianCurrencyText(amount);
  return (
    <div className="rounded-xl border border-white/10 bg-black/10 p-3">
      <dt className="text-[11px] font-medium text-slate-500">{label}</dt>
      <dd className="mt-2 text-sm font-semibold text-slate-100">
        {value}
        {monthlyFee ? (
          <span className="ml-2 font-medium text-slate-400">
            · {monthlyFee}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

function LeadCurrencyInput({
  value,
  onChange,
  disabled,
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
}) {
  return (
    <span
      className={`${LEAD_EDIT_CONTROL} flex w-full min-w-0 items-center gap-2 ${
        disabled ? "cursor-not-allowed opacity-60" : ""
      }`}
    >
      <span className="shrink-0 text-slate-400" aria-hidden="true">
        R$
      </span>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="off"
        disabled={disabled}
        required={required}
        value={formatBrazilianCurrencyInteger(value)}
        onChange={(event) =>
          onChange(brazilianCurrencyDigits(event.target.value))
        }
        placeholder="0"
        aria-label="Valor em reais"
        className="h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-sm font-semibold text-slate-100 caret-blue-300 outline-none placeholder:text-slate-600 disabled:cursor-not-allowed"
      />
    </span>
  );
}

function LeadWhatsAppControl({
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
    <span className="flex h-8 min-w-0 items-center rounded-md bg-white/[0.025] transition hover:bg-white/[0.045] focus-within:bg-blue-400/[0.055]">
      <span
        className="flex h-full shrink-0 items-center gap-1.5 border-r border-white/10 px-2.5 text-[11px] font-semibold text-slate-400"
        title={countryLabel}
      >
        <img
          src="https://flagcdn.com/w40/br.png"
          alt=""
          className="h-3 w-[18px] rounded-[2px] object-cover shadow-sm"
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
        className="h-8 min-w-0 rounded-none border-0 bg-transparent px-3 py-0 text-sm font-semibold text-slate-100 caret-blue-300 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </span>
  );
}

function openNativeDateTimePicker(event: React.MouseEvent<HTMLInputElement>) {
  try {
    event.currentTarget.showPicker?.();
  } catch {
    event.currentTarget.focus();
  }
}

function LeadDateTimeControlIcon({
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
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
      />
    </span>
  );
}

function LeadEditSelect({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className="relative block min-w-0">
      <select {...props} className={LEAD_EDIT_SELECT}>
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="upflow-select-chevron pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      />
    </span>
  );
}

function EditField({
  label,
  required,
  icon,
  compact = false,
  children,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Label
      className={
        compact
          ? "block min-w-0 rounded-lg border border-blue-300/20 bg-blue-400/[0.025] px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition hover:border-blue-300/30 hover:bg-blue-400/[0.04] focus-within:border-blue-300/50 focus-within:bg-blue-400/[0.06] focus-within:ring-1 focus-within:ring-blue-300/20"
          : "block min-w-0 rounded-xl border border-blue-300/20 bg-blue-400/[0.025] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] transition hover:border-blue-300/30 hover:bg-blue-400/[0.04] focus-within:border-blue-300/50 focus-within:bg-blue-400/[0.06] focus-within:ring-1 focus-within:ring-blue-300/20"
      }
    >
      <span className="flex items-center gap-2 text-[11px] font-medium text-slate-500">
        {icon}
        <span>
          {label}
          {required ? <span className="ml-1 text-rose-300">*</span> : null}
        </span>
      </span>
      <span className="mt-1.5 block min-w-0">{children}</span>
    </Label>
  );
}
