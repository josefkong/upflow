"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { toast } from "sonner";
import {
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Crown,
  DollarSign,
  Globe2,
  LayoutGrid,
  Mail,
  Megaphone,
  NotebookText,
  Phone,
  Plus,
  RefreshCcw,
  Rocket,
  Save,
  Sparkles,
  Store,
  Trash2,
  TrendingUp,
  UserRound,
  Users,
  X,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { formatBrazilianCnpj, isBrazilianCnpj } from "@/lib/brazilian-cnpj";
import { formatBrazilianMobile, isBrazilianMobile } from "@/lib/brazilian-mobile";
import { COMMERCIAL_CONTRACT_SERVICES } from "@/lib/commercial-contract";
import { cn } from "@/lib/utils";
import type { Department, SalesChannel, TeamMember } from "@/lib/types";

export type Company = {
  id: string;
  name: string;
  website?: string | null;
  description?: string | null;
  status?: string;
  sales_channel?: SalesChannel | null;
  service_type?: string | null;
  plan_name?: string | null;
  billing_cycle?: string | null;
  included_services?: string[] | null;
  created_at: string;
};

type WorkspaceResponse = {
  current_workspace_id?: string | null;
};

type ClientWizardResponse = {
  company_id: string;
  onboarding_id: string;
  redirect_url: string;
  created_tasks: Array<{ id: string; title: string }>;
  notifications: number;
  missing_mappings: string[];
};

type SelectOption = {
  value: string;
  labelKey: string;
};

const INDUSTRY_OPTIONS: SelectOption[] = [
  { value: "SaaS", labelKey: "companyDialog.industry.saas" },
  { value: "E-commerce", labelKey: "companyDialog.industry.ecommerce" },
  { value: "Local business", labelKey: "companyDialog.industry.localBusiness" },
  { value: "Health", labelKey: "companyDialog.industry.health" },
  { value: "Education", labelKey: "companyDialog.industry.education" },
  { value: "Finance", labelKey: "companyDialog.industry.finance" },
  { value: "Real estate", labelKey: "companyDialog.industry.realEstate" },
  { value: "Other", labelKey: "companyDialog.option.other" },
];
const SERVICE_TYPE_OPTIONS: SelectOption[] = [
  { value: "Paid media", labelKey: "companyDialog.serviceType.paidMedia" },
  { value: "Social media", labelKey: "companyDialog.serviceType.socialMedia" },
  { value: "Creative production", labelKey: "companyDialog.serviceType.creativeProduction" },
  { value: "SEO", labelKey: "companyDialog.serviceType.seo" },
  { value: "Web design", labelKey: "companyDialog.serviceType.webDesign" },
  { value: "Consulting", labelKey: "companyDialog.serviceType.consulting" },
  { value: "Full service", labelKey: "companyDialog.serviceType.fullService" },
  { value: "Other", labelKey: "companyDialog.option.other" },
];
const PLAN_OPTIONS: SelectOption[] = [
  { value: "Starter", labelKey: "companyDialog.plan.starter" },
  { value: "Growth", labelKey: "companyDialog.plan.growth" },
  { value: "Scale", labelKey: "companyDialog.plan.scale" },
  { value: "Enterprise", labelKey: "companyDialog.plan.enterprise" },
  { value: "Project", labelKey: "companyDialog.plan.project" },
  { value: "Retainer", labelKey: "companyDialog.plan.retainer" },
  { value: "Other", labelKey: "companyDialog.option.other" },
];
const BILLING_OPTIONS = [
  { value: "", labelKey: "companyDialog.notSet" },
  { value: "monthly", labelKey: "companyDialog.billing.monthly" },
  { value: "quarterly", labelKey: "companyDialog.billing.quarterly" },
  { value: "annual", labelKey: "companyDialog.billing.annual" },
  { value: "project", labelKey: "companyDialog.billing.perProject" },
];
const SALES_CHANNEL_OPTIONS: Array<{ value: SalesChannel; labelKey: string }> = [
  { value: "WHOLESALE", labelKey: "clients.salesChannel.wholesale" },
  { value: "RETAIL", labelKey: "clients.salesChannel.retail" },
  { value: "BOTH", labelKey: "clients.salesChannel.both" },
];
const SERVICE_OPTIONS: SelectOption[] = [
  { value: "Meta Ads", labelKey: "companyDialog.service.metaAds" },
  { value: "Google Ads", labelKey: "companyDialog.service.googleAds" },
  { value: "TikTok Ads", labelKey: "companyDialog.service.tiktokAds" },
  { value: "Pinterest Ads", labelKey: "companyDialog.service.pinterestAds" },
  { value: "E-Commerce", labelKey: "companyDialog.service.ecommerce" },
  { value: "Vesti", labelKey: "companyDialog.service.vesti" },
  { value: "Nuvemshop", labelKey: "companyDialog.service.nuvemshop" },
  { value: "Google Shopping", labelKey: "companyDialog.service.googleShopping" },
  { value: "Influencers / UGC", labelKey: "companyDialog.service.influencersUgc" },
  { value: "Creative approvals", labelKey: "companyDialog.service.creativeApprovals" },
  { value: "Monthly report", labelKey: "companyDialog.service.monthlyReport" },
  { value: "Social Media", labelKey: "companyDialog.service.socialMedia" },
  { value: "Content calendar", labelKey: "companyDialog.service.contentCalendar" },
  { value: "Video production", labelKey: "companyDialog.service.videoProduction" },
  { value: "Landing page", labelKey: "companyDialog.service.landingPage" },
  { value: "SEO", labelKey: "companyDialog.service.seo" },
  { value: "Email marketing", labelKey: "companyDialog.service.emailMarketing" },
];

const COMPLETE_CLIENT_SERVICE_LABELS: Record<
  (typeof COMMERCIAL_CONTRACT_SERVICES)[number],
  string
> = {
  "Meta Ads": "companyDialog.service.metaAds",
  "Google Ads": "companyDialog.service.googleAds",
  "TikTok Ads": "companyDialog.service.tiktokAds",
  "Pinterest Ads": "companyDialog.service.pinterestAds",
  "Social Media": "companyDialog.service.socialMedia",
  Creative: "companyDialog.service.creative",
  Video: "companyDialog.service.video",
  Website: "companyDialog.service.website",
  "E-Commerce": "companyDialog.service.ecommerce",
  SEO: "companyDialog.service.seo",
  "Email Marketing": "companyDialog.service.emailMarketing",
  "Tracking/Analytics": "companyDialog.service.trackingAnalytics",
  "Influencers / UGC": "companyDialog.service.influencersUgc",
  "Up Zero": "companyDialog.service.upZero",
  "Up Motion": "companyDialog.service.upMotion",
  "Implantação de IA": "companyDialog.service.aiImplementation",
  Suporte: "companyDialog.service.support",
};

const COMPLETE_CLIENT_SERVICE_OPTIONS: SelectOption[] =
  COMMERCIAL_CONTRACT_SERVICES.map((service) => ({
    value: service,
    labelKey: COMPLETE_CLIENT_SERVICE_LABELS[service],
  }));

const BRAND_TYPE_OPTIONS: SelectOption[] = [
  { value: "B2B", labelKey: "companyDialog.brandType.b2b" },
  { value: "B2C", labelKey: "companyDialog.brandType.b2c" },
  { value: "Ambos", labelKey: "commercialLead.companyType.both" },
];

const COMPLETE_CLIENT_PLAN_OPTIONS: SelectOption[] = [
  { value: "Plano Grupo UP — Starter", labelKey: "companyDialog.completePlan.groupUpStarter" },
  { value: "Plano Grupo UP — Growth", labelKey: "companyDialog.completePlan.groupUpGrowth" },
  { value: "Plano UP Zero — Essencial", labelKey: "companyDialog.completePlan.upZeroEssential" },
  { value: "Plano UP Zero — Pro", labelKey: "companyDialog.completePlan.upZeroPro" },
  { value: "Plano UP Zero — Elite", labelKey: "companyDialog.completePlan.upZeroElite" },
  { value: "Plano Grupo UP — Starter + Plano UP Zero — Essencial", labelKey: "companyDialog.completePlan.starterEssential" },
  { value: "Plano Grupo UP — Starter + Plano UP Zero — Pro", labelKey: "companyDialog.completePlan.starterPro" },
  { value: "Plano Grupo UP — Starter + Plano UP Zero — Elite", labelKey: "companyDialog.completePlan.starterElite" },
  { value: "Plano Grupo UP — Growth + Plano UP Zero — Essencial", labelKey: "companyDialog.completePlan.growthEssential" },
  { value: "Plano Grupo UP — Growth + Plano UP Zero — Pro", labelKey: "companyDialog.completePlan.growthPro" },
  { value: "Plano Grupo UP — Growth + Plano UP Zero — Elite", labelKey: "companyDialog.completePlan.growthElite" },
];

const ONBOARDING_PLAN_OPTIONS: SelectOption[] = [
  { value: "Plano Starter", labelKey: "companyDialog.onboardingPlan.starter" },
  { value: "Plano Growth", labelKey: "companyDialog.onboardingPlan.growth" },
  { value: "Plano Performance", labelKey: "companyDialog.onboardingPlan.performance" },
  { value: "Plano Venture", labelKey: "companyDialog.onboardingPlan.venture" },
  { value: "Plano Personalizado", labelKey: "companyDialog.onboardingPlan.custom" },
];

const ONBOARDING_SERVICE_OPTIONS: SelectOption[] = [
  { value: "Meta Ads", labelKey: "companyDialog.service.metaAds" },
  { value: "Google Ads", labelKey: "companyDialog.service.googleAds" },
  { value: "TikTok Ads", labelKey: "companyDialog.service.tiktokAds" },
  { value: "Pinterest Ads", labelKey: "companyDialog.service.pinterestAds" },
  { value: "Vesti", labelKey: "companyDialog.service.vesti" },
  { value: "UP Motion v.1", labelKey: "companyDialog.service.upMotionV1" },
  { value: "UP Motion v.2", labelKey: "companyDialog.service.upMotionV2" },
  { value: "Social Media", labelKey: "companyDialog.service.socialMedia" },
  { value: "Implantacao IA", labelKey: "companyDialog.service.aiImplementation" },
  { value: "UP Zero", labelKey: "companyDialog.service.upZero" },
];

async function readApiError(res: Response, fallback: string) {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

function SelectIcon({ className }: { className?: string }) {
  return <ChevronDown className={cn("upflow-select-chevron pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground dark:text-blue-100/60", className)} />;
}

function getSelectValue(value: string, options: SelectOption[], custom: boolean) {
  if (custom) return "Other";
  if (!value) return "";
  return options.some((option) => option.value === value) ? value : "Other";
}

function optionLabel(
  value: string,
  options: SelectOption[],
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  const option = options.find((item) => item.value === value);
  return option ? t(option.labelKey) : value;
}

function todayInputDate() {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function findBrandDepartmentId(departments: Department[], brandType: string) {
  const target = brandType === "B2C" ? "marketing b2c" : brandType === "B2B" ? "marketing b2b" : "";
  if (!target) return "";
  return departments.find((department) => normalizeLabel(department.name).includes(target))?.id ?? "";
}

function parseCurrencyValue(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export default function CreateCompanyDialog({
  open,
  onClose,
  onCreated,
  mode = "company",
  financialsVisible = false,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (c: Company) => void;
  mode?: "company" | "onboarding" | "complete";
  financialsVisible?: boolean;
}) {
  const { t } = useLanguage();
  const onboardingMode = mode === "onboarding";
  const completeClientMode = mode === "complete";
  const operationalRegistrationMode = onboardingMode || completeClientMode;
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [domain, setDomain] = useState("");
  const [industry, setIndustry] = useState("");
  const [salesChannel, setSalesChannel] = useState<SalesChannel | "">("");
  const [serviceType, setServiceType] = useState("");
  const [planName, setPlanName] = useState("");
  const [customIndustry, setCustomIndustry] = useState(false);
  const [customServiceType, setCustomServiceType] = useState(false);
  const [customPlanName, setCustomPlanName] = useState(false);
  const [billingCycle, setBillingCycle] = useState("");
  const [includedServices, setIncludedServices] = useState<string[]>([]);
  const [servicePick, setServicePick] = useState("");
  const [customService, setCustomService] = useState("");
  const [notes, setNotes] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [expectedStartDate, setExpectedStartDate] = useState(todayInputDate);
  const [contractValue, setContractValue] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoadingOptions(true);
    fetch("/api/workspaces")
      .then((res) => res.json() as Promise<WorkspaceResponse>)
      .then(async (workspace) => {
        if (cancelled) return;
        const currentWorkspaceId = workspace.current_workspace_id ?? null;
        setWorkspaceId(currentWorkspaceId);

        const [usersRes, departmentsRes] = await Promise.all([
          fetch(currentWorkspaceId ? `/api/users?workspace_id=${currentWorkspaceId}&status=active` : "/api/users?status=active"),
          currentWorkspaceId
            ? fetch(`/api/workspaces/${currentWorkspaceId}/departments`)
            : Promise.resolve(null),
        ]);

        if (cancelled) return;
        if (usersRes.ok) {
          const users = (await usersRes.json()) as { items?: TeamMember[] };
          setTeamMembers(users.items ?? []);
        }
        if (departmentsRes?.ok) {
          const departmentData = (await departmentsRes.json()) as { items?: Department[] };
          setDepartments(departmentData.items ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error(t("companyDialog.loadOptionsError"));
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, t]);

  const selectedDepartmentName = useMemo(
    () => departments.find((department) => department.id === departmentId)?.name ?? "",
    [departmentId, departments],
  );

  const filteredAssignees = useMemo(() => {
    if (!departmentId) return teamMembers;
    return teamMembers.filter((member) => member.department_id === departmentId);
  }, [departmentId, teamMembers]);

  useEffect(() => {
    if (assigneeId && filteredAssignees.every((member) => member.id !== assigneeId)) {
      setAssigneeId("");
    }
  }, [assigneeId, filteredAssignees]);

  useEffect(() => {
    if (!onboardingMode || !serviceType || departmentId) return;
    const matchedDepartmentId = findBrandDepartmentId(departments, serviceType);
    if (matchedDepartmentId) setDepartmentId(matchedDepartmentId);
  }, [departmentId, departments, onboardingMode, serviceType]);

  if (!open) return null;

  const dialogTitle = onboardingMode
    ? t("companyDialog.onboardingTitle")
    : completeClientMode
      ? t("companyDialog.completeTitle")
      : t("companyDialog.standaloneTitle");
  const dialogSubtitle = onboardingMode
    ? t("companyDialog.onboardingSubtitle")
    : completeClientMode
      ? t("companyDialog.completeSubtitle")
      : t("companyDialog.standaloneSubtitle");
  const submitLabel = onboardingMode
    ? t("companyDialog.createAndStart")
    : completeClientMode
      ? t("companyDialog.createComplete")
      : t("companyDialog.createStandalone");
  const serviceOptions = completeClientMode
    ? COMPLETE_CLIENT_SERVICE_OPTIONS
    : SERVICE_OPTIONS;

  const addService = (value: string) => {
    const service = value.trim();
    if (!service || includedServices.includes(service)) return;
    setIncludedServices((prev) => [...prev, service]);
    setServicePick("");
    setCustomService("");
  };

  const removeService = (service: string) => {
    setIncludedServices((prev) => prev.filter((item) => item !== service));
  };

  const reset = () => {
    setName("");
    setLegalName("");
    setCnpj("");
    setDomain("");
    setIndustry("");
    setSalesChannel("");
    setServiceType("");
    setPlanName("");
    setCustomIndustry(false);
    setCustomServiceType(false);
    setCustomPlanName(false);
    setBillingCycle("");
    setIncludedServices([]);
    setServicePick("");
    setCustomService("");
    setNotes("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setContactRole("");
    setExpectedStartDate(todayInputDate());
    setContractValue("");
    setDepartmentId("");
    setAssigneeId("");
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error(t("companyDialog.nameRequired"));
      return;
    }
    if (onboardingMode && !serviceType.trim()) {
      toast.error(t("companyDialog.brandTypeRequired"));
      return;
    }
    if (onboardingMode && includedServices.length === 0) {
      toast.error(t("companyDialog.servicesRequired"));
      return;
    }
    if (onboardingMode && !expectedStartDate) {
      toast.error(t("companyDialog.expectedStartRequired"));
      return;
    }
    if (completeClientMode) {
      if (
        !legalName.trim() ||
        !cnpj.trim() ||
        !serviceType.trim() ||
        !planName.trim() ||
        !expectedStartDate ||
        !departmentId ||
        !assigneeId ||
        !contactName.trim() ||
        !contactEmail.trim() ||
        !contactPhone.trim() ||
        includedServices.length === 0
      ) {
        toast.error(t("companyDialog.completeRequired"));
        return;
      }
      if (!isBrazilianCnpj(cnpj)) {
        toast.error(t("companyDialog.cnpjInvalid"));
        return;
      }
      if (!isBrazilianMobile(contactPhone)) {
        toast.error(t("companyDialog.whatsappInvalid"));
        return;
      }
    }
    const parsedContractValue = parseCurrencyValue(contractValue);
    if (parsedContractValue !== null && !Number.isFinite(parsedContractValue)) {
      toast.error(t("companyDialog.contractValueInvalid"));
      return;
    }
    if (
      completeClientMode &&
      financialsVisible &&
      (parsedContractValue === null || parsedContractValue <= 0)
    ) {
      toast.error(t("companyDialog.contractValueRequired"));
      return;
    }
    setSubmitting(true);
    try {
      const website = domain.trim()
        ? /^https?:\/\//i.test(domain.trim())
          ? domain.trim()
          : `https://${domain.trim()}`
        : null;
      const basePayload = {
        name: name.trim(),
        website,
        industry: industry.trim() || null,
        sales_channel: salesChannel || null,
        service_type: serviceType.trim() || null,
        plan_name: planName.trim() || null,
        billing_cycle: billingCycle.trim() || null,
        included_services: includedServices,
        notes: notes.trim() || null,
        description: notes.trim() || null,
        owner_id: operationalRegistrationMode ? assigneeId || null : null,
        contact_name: contactName.trim() || null,
        contact_email: contactEmail.trim() || null,
        contact_phone: contactPhone.trim() || null,
        contact_role: contactRole.trim() || null,
        responsible_department_id: operationalRegistrationMode ? departmentId || null : null,
        responsible_department_name: operationalRegistrationMode ? selectedDepartmentName || null : null,
      };
      const res = await fetch(onboardingMode ? "/api/onboarding/client-wizard" : "/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          onboardingMode
            ? {
                ...basePayload,
                expected_start_date: expectedStartDate,
                closing_date: null,
                initial_notes: notes.trim() || null,
                responsible_salesperson_id: assigneeId || null,
                contract_value: parsedContractValue,
              }
            : {
                ...basePayload,
                // Creating a client is deliberately separate from starting its onboarding workflow.
                start_onboarding: false,
                complete_registration: completeClientMode,
                legal_name: completeClientMode ? legalName.trim() : null,
                cnpj: completeClientMode ? formatBrazilianCnpj(cnpj) : null,
                contract_start_date: completeClientMode
                  ? expectedStartDate
                  : null,
                contract_value:
                  completeClientMode && financialsVisible
                    ? parsedContractValue
                    : null,
                main_contact_email: completeClientMode
                  ? contactEmail.trim()
                  : null,
                billing_email: completeClientMode
                  ? contactEmail.trim()
                  : null,
                phone: completeClientMode
                  ? formatBrazilianMobile(contactPhone)
                  : null,
                whatsapp: completeClientMode
                  ? formatBrazilianMobile(contactPhone)
                  : null,
                commercial_status: completeClientMode ? "active" : null,
              },
        ),
      });
      if (!res.ok) throw new Error(await readApiError(res, t("companyDialog.createFailed")));
      if (onboardingMode) {
        const payload = (await res.json()) as ClientWizardResponse;
        toast.success(t("companyDialog.onboardingStarted", { name: name.trim() }));
        if (payload.missing_mappings.length > 0) {
          toast.message(t("companyDialog.missingMappings", { count: payload.missing_mappings.length }));
        }
        onCreated?.({
          id: payload.company_id,
          name: name.trim(),
          website,
          sales_channel: salesChannel || null,
          service_type: serviceType.trim() || null,
          plan_name: planName.trim() || null,
          billing_cycle: billingCycle.trim() || null,
          included_services: includedServices,
          created_at: new Date().toISOString(),
        });
      } else {
        const company = (await res.json()) as Company;
        toast.success(
          t(
            completeClientMode
              ? "companyDialog.completeCreated"
              : "companyDialog.createdWithoutOnboarding",
            { name: company.name },
          ),
        );
        onCreated?.(company);
      }
      reset();
      onClose();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("companyDialog.createError"));
    } finally {
      setSubmitting(false);
    }
  };

  const saveDraft = async () => {
    if (!name.trim()) {
      toast.error(t("companyDialog.nameRequired"));
      return;
    }
    const parsedContractValue = parseCurrencyValue(contractValue);
    if (parsedContractValue !== null && !Number.isFinite(parsedContractValue)) {
      toast.error(t("companyDialog.contractValueInvalid"));
      return;
    }
    setSubmitting(true);
    try {
      const website = domain.trim()
        ? /^https?:\/\//i.test(domain.trim())
          ? domain.trim()
          : `https://${domain.trim()}`
        : null;
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          website,
          industry: industry.trim() || null,
          sales_channel: salesChannel || null,
          service_type: serviceType.trim() || null,
          plan_name: planName.trim() || null,
          billing_cycle: billingCycle.trim() || null,
          included_services: includedServices,
          contract_value: parsedContractValue,
          notes: notes.trim() || null,
          description: notes.trim() || null,
          owner_id: assigneeId || null,
          contact_name: contactName.trim() || null,
          contact_email: contactEmail.trim() || null,
          contact_phone: contactPhone.trim() || null,
          contact_role: contactRole.trim() || null,
          responsible_department_id: departmentId || null,
          responsible_department_name: selectedDepartmentName || null,
          start_onboarding: false,
        }),
      });
      if (!res.ok) throw new Error(await readApiError(res, t("companyDialog.createFailed")));
      const company = (await res.json()) as Company;
      toast.success(t("companyDialog.draftSaved", { name: company.name }));
      onCreated?.(company);
      reset();
      onClose();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("companyDialog.createError"));
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass =
    "h-16 w-full rounded-2xl border border-border bg-background pl-16 pr-4 text-base text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 dark:border-blue-200/[0.25] dark:bg-[#12192a]/[0.86] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:placeholder:text-blue-100/[0.55] dark:focus:ring-blue-500/70 dark:focus:shadow-[0_0_24px_rgba(59,130,246,0.32)]";
  const textareaClass =
    "min-h-28 w-full rounded-2xl border border-border bg-background py-4 pl-16 pr-14 text-base text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 dark:border-blue-200/[0.25] dark:bg-[#12192a]/[0.86] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] dark:placeholder:text-blue-100/[0.55] dark:focus:ring-blue-500/70 dark:focus:shadow-[0_0_24px_rgba(59,130,246,0.32)]";

  if (onboardingMode) {
    const onboardingInputClass =
      "h-14 w-full rounded-xl border border-border bg-background pl-16 pr-14 text-base text-foreground outline-none transition placeholder:text-muted-foreground focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30 dark:border-blue-200/[0.25] dark:bg-[#08142a]/[0.72] dark:text-white dark:placeholder:text-blue-100/[0.55] dark:focus:border-blue-300 dark:focus:ring-blue-500/75 dark:focus:shadow-[0_0_28px_rgba(59,130,246,0.34)]";
    const onboardingSelectClass = cn(onboardingInputClass, "appearance-none pr-12");
    const availableServices = ONBOARDING_SERVICE_OPTIONS.filter((option) => !includedServices.includes(option.value));

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-xl dark:bg-[#020817]/[0.82] sm:p-6"
        onClick={onClose}
      >
        <form
          onSubmit={submit}
          className="relative my-6 flex max-h-[calc(100dvh-48px)] w-full max-w-6xl flex-col overflow-hidden rounded-[26px] border border-border bg-card text-card-foreground shadow-2xl dark:border-blue-200/[0.25] dark:bg-[radial-gradient(circle_at_16%_8%,rgba(37,99,235,0.32),transparent_28%),radial-gradient(circle_at_88%_0%,rgba(14,165,233,0.18),transparent_34%),linear-gradient(135deg,rgba(10,23,47,0.98),rgba(3,10,24,0.99))] dark:shadow-[0_34px_110px_rgba(0,0,0,0.66),0_0_0_1px_rgba(96,165,250,0.24),inset_0_1px_0_rgba(255,255,255,0.1)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="overflow-y-auto px-5 pb-5 pt-6 sm:px-10 sm:pb-8 sm:pt-9">
            <div className="mb-7 flex items-start justify-between gap-5">
              <div className="flex min-w-0 items-center gap-5">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[24px] border border-blue-400/[0.35] bg-blue-500/[0.15] text-blue-700 shadow-[0_0_24px_rgba(59,130,246,0.2)] dark:border-blue-300/[0.15] dark:bg-blue-500/[0.15] dark:text-blue-100 dark:shadow-[0_0_36px_rgba(59,130,246,0.52),inset_0_1px_0_rgba(255,255,255,0.16)]">
                  <Building2 className="h-10 w-10" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-3xl font-bold tracking-tight text-foreground dark:text-white sm:text-4xl">
                    {t("companyDialog.onboardingTitle")}
                  </h2>
                  <p className="mt-2 max-w-2xl text-base text-muted-foreground dark:text-blue-100/70">
                    {t("companyDialog.onboardingBrief")}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted/50 text-muted-foreground transition hover:bg-muted hover:text-foreground dark:border-blue-100/20 dark:bg-white/[0.15] dark:text-blue-100/70 dark:hover:bg-white/[0.15] dark:hover:text-white"
                aria-label={t("companyDialog.close")}
              >
                <X className="h-7 w-7" />
              </button>
            </div>

            <div className="mb-3 flex justify-end">
              <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-5 py-2 text-sm font-semibold text-blue-700 shadow-sm dark:border-blue-300/20 dark:text-blue-200 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                <Sparkles className="h-4 w-4" />
                {t("companyDialog.newClient")}
              </span>
            </div>

            <div className="space-y-4">
              <OnboardingSection icon={<Store className="h-5 w-5" />} title={t("companyDialog.brandData")}>
                <div className="grid gap-5 lg:grid-cols-2">
                  <OnboardingField label={t("companyDialog.brandName")} required>
                    <div className="relative">
                      <FieldIcon icon={<Building2 className="h-5 w-5" />} />
                      <input
                        autoFocus
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder={t("companyDialog.brandNamePlaceholder")}
                        className={onboardingInputClass}
                      />
                    </div>
                  </OnboardingField>

                  <OnboardingField label={t("companyDialog.brandType")} required>
                    <div className="relative">
                      <FieldIcon icon={<Users className="h-5 w-5" />} />
                      <select
                        value={serviceType}
                        onChange={(e) => {
                          const value = e.target.value;
                          setServiceType(value);
                          setIndustry(value || "");
                          const matchedDepartmentId = findBrandDepartmentId(departments, value);
                          setDepartmentId(matchedDepartmentId);
                        }}
                        className={onboardingSelectClass}
                      >
                        <option value="">{t("companyDialog.brandTypePlaceholder")}</option>
                        {BRAND_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                        ))}
                      </select>
                      <SelectIcon />
                    </div>
                  </OnboardingField>

                  <OnboardingField label={t("clients.salesChannel.label")}>
                    <div className="relative">
                      <FieldIcon icon={<Store className="h-5 w-5" />} />
                      <select
                        value={salesChannel}
                        onChange={(e) => setSalesChannel(e.target.value as SalesChannel | "")}
                        className={onboardingSelectClass}
                      >
                        <option value="">{t("clients.salesChannel.unclassified")}</option>
                        {SALES_CHANNEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                        ))}
                      </select>
                      <SelectIcon />
                    </div>
                  </OnboardingField>
                </div>
              </OnboardingSection>

              <OnboardingSection icon={<Crown className="h-5 w-5" />} title={t("companyDialog.planSection")}>
                <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.95fr)]">
                  <OnboardingField label={t("companyDialog.contractedPlan")}>
                    <div className="relative">
                      <FieldIcon icon={<Crown className="h-5 w-5" />} />
                      <select
                        value={planName}
                        onChange={(e) => setPlanName(e.target.value)}
                        className={onboardingSelectClass}
                      >
                        <option value="">{t("companyDialog.planPlaceholder")}</option>
                        {ONBOARDING_PLAN_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                        ))}
                      </select>
                      <SelectIcon />
                    </div>
                  </OnboardingField>

                  <div className="rounded-2xl border border-border bg-blue-500/5 p-5 dark:border-blue-200/[0.25] dark:bg-blue-950/[0.15]">
                    <div className="flex items-center gap-3 text-sm font-semibold text-blue-700 dark:text-blue-300">
                      <Sparkles className="h-4 w-4" />
                      {t("companyDialog.availablePlans")}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-muted-foreground dark:text-blue-100/[0.55]">
                      {ONBOARDING_PLAN_OPTIONS.map((option) => t(option.labelKey)).join("  •  ")}
                    </p>
                  </div>
                </div>
              </OnboardingSection>

              <OnboardingSection icon={<LayoutGrid className="h-5 w-5" />} title={t("companyDialog.servicesFinancial")}>
                <div className="space-y-5">
                  <OnboardingField label={t("companyDialog.planServices")} required>
                    <div className="relative">
                      <FieldIcon icon={<Plus className="h-5 w-5" />} />
                      <select
                        value={servicePick}
                        onChange={(e) => {
                          setServicePick(e.target.value);
                          if (e.target.value) addService(e.target.value);
                        }}
                        className={onboardingSelectClass}
                      >
                        <option value="">{t("companyDialog.planServicesPlaceholder")}</option>
                        {availableServices.map((option) => (
                          <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                        ))}
                      </select>
                      <SelectIcon />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {includedServices.map((service) => (
                        <span
                          key={service}
                          className="inline-flex max-w-full items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-700 dark:border-blue-300/[0.15] dark:text-blue-100"
                        >
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-300" />
                          <span className="truncate">{optionLabel(service, ONBOARDING_SERVICE_OPTIONS, t)}</span>
                          <button
                            type="button"
                            onClick={() => removeService(service)}
                            aria-label={t("companyDialog.removeService", { service: optionLabel(service, ONBOARDING_SERVICE_OPTIONS, t) })}
                            className="rounded-full text-blue-700/60 transition hover:text-foreground dark:text-blue-100/[0.55] dark:hover:text-white"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ))}
                      {includedServices.length === 0 && (
                        <span className="text-sm text-muted-foreground dark:text-blue-100/[0.55]">{t("companyDialog.noServices")}</span>
                      )}
                    </div>
                  </OnboardingField>

                  <OnboardingField label={t("companyDialog.negotiatedMonthlyFee")}>
                    <div className="relative">
                      <span className="absolute left-0 top-0 flex h-14 w-16 items-center justify-center rounded-l-xl border-r border-blue-200/[0.25] text-base font-bold text-blue-300">
                        R$
                      </span>
                      <input
                        inputMode="decimal"
                        value={contractValue}
                        onChange={(e) => setContractValue(e.target.value)}
                        placeholder={t("companyDialog.negotiatedMonthlyFeePlaceholder")}
                        className={cn(onboardingInputClass, "pl-20")}
                      />
                    </div>
                  </OnboardingField>
                </div>
              </OnboardingSection>
            </div>
          </div>

          <div className="grid gap-4 border-t border-border bg-muted/30 px-5 py-5 dark:border-blue-200/[0.25] dark:bg-[#071226]/[0.74] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:px-10">
            <button
              type="button"
              onClick={saveDraft}
              disabled={submitting || !name.trim()}
              className="inline-flex h-14 items-center justify-center gap-3 rounded-xl border border-border bg-background text-base font-semibold text-foreground transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-[0.45] dark:border-blue-100/[0.35] dark:bg-white/[0.15] dark:hover:bg-white/[0.15]"
            >
              <Save className="h-5 w-5" />
              {t("companyDialog.saveDraft")}
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim() || !serviceType.trim() || includedServices.length === 0}
              className="inline-flex h-14 items-center justify-center gap-3 rounded-xl border border-blue-300/[0.15] bg-blue-600 text-base font-bold text-white shadow-[0_0_34px_rgba(59,130,246,0.48),inset_0_1px_0_rgba(255,255,255,0.22)] transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-[0.45]"
            >
              <Rocket className="h-5 w-5" />
              {submitting ? t("common.creating") : t("companyDialog.createAndStart")}
            </button>
          </div>

          {!workspaceId && (
            <p className="px-10 pb-4 text-center text-xs text-muted-foreground dark:text-blue-100/[0.55]">
              {t("companyDialog.teamOptionsUnavailable")}
            </p>
          )}
        </form>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/60 p-4 backdrop-blur-md dark:bg-[#020617]/[0.72] sm:p-6"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="relative my-6 max-h-[calc(100dvh-48px)] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-border bg-card p-6 text-card-foreground shadow-2xl dark:border-blue-200/[0.25] dark:bg-[radial-gradient(circle_at_20%_0%,rgba(37,99,235,0.23),transparent_30%),linear-gradient(135deg,rgba(15,23,42,0.98),rgba(2,8,23,0.98))] dark:shadow-[0_32px_90px_rgba(0,0,0,0.62),0_0_0_1px_rgba(96,165,250,0.22),inset_0_1px_0_rgba(255,255,255,0.08)] sm:p-9 lg:p-12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-8 flex items-start justify-between gap-5">
          <div className="flex min-w-0 items-center gap-5">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-amber-300/[0.35] bg-amber-400/10 text-upflow-warning shadow-[0_0_32px_rgba(245,158,11,0.22),inset_0_1px_0_rgba(255,255,255,0.1)]">
              <Building2 className="h-9 w-9" />
            </div>
            <div className="min-w-0">
              <h2 className="text-3xl font-bold tracking-tight text-foreground dark:text-white">
                {dialogTitle}
              </h2>
              <p className="mt-2 text-base text-muted-foreground dark:text-blue-100/[0.55]">
                {dialogSubtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-border bg-muted/50 text-muted-foreground transition hover:bg-muted hover:text-foreground dark:border-white/[0.15] dark:bg-white/5 dark:text-blue-100/70 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label={t("companyDialog.close")}
          >
            <X className="h-7 w-7" />
          </button>
        </div>

        <div className="space-y-6">
          <Field label={t("companyDialog.name")} required>
            <div className="relative">
              <FieldIcon icon={<Building2 className="h-5 w-5" />} />
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("companyDialog.namePlaceholder")}
                className={fieldClass}
              />
            </div>
          </Field>

          {completeClientMode ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <Field label={t("companyDialog.legalName")} required>
                <div className="relative">
                  <FieldIcon icon={<Building2 className="h-5 w-5" />} />
                  <input
                    required
                    value={legalName}
                    onChange={(event) => setLegalName(event.target.value)}
                    placeholder={t("companyDialog.legalNamePlaceholder")}
                    className={fieldClass}
                  />
                </div>
              </Field>
              <Field label={t("companyDialog.cnpj")} required>
                <div className="relative">
                  <FieldIcon icon={<NotebookText className="h-5 w-5" />} />
                  <input
                    required
                    inputMode="numeric"
                    value={cnpj}
                    onChange={(event) =>
                      setCnpj(formatBrazilianCnpj(event.target.value))
                    }
                    placeholder="00.000.000/0000-00"
                    className={fieldClass}
                  />
                </div>
              </Field>
            </div>
          ) : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <Field label={t("companyDialog.domain")}>
              <div className="relative">
                <FieldIcon icon={<Globe2 className="h-5 w-5" />} />
                <input
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder={t("companyDialog.domainPlaceholder")}
                  className={fieldClass}
                />
              </div>
            </Field>
            <Field label={t("companyDialog.industry")}>
              <div className="relative">
                <FieldIcon icon={<BriefcaseBusiness className="h-5 w-5" />} />
                <select
                  value={getSelectValue(industry, INDUSTRY_OPTIONS, customIndustry)}
                  onChange={(e) => {
                    const isCustom = e.target.value === "Other";
                    setCustomIndustry(isCustom);
                    setIndustry(isCustom ? "" : e.target.value);
                  }}
                  className={cn(fieldClass, "appearance-none")}
                >
                  <option value="">{t("companyDialog.notSet")}</option>
                  {INDUSTRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                  ))}
                </select>
                <SelectIcon />
              </div>
              {customIndustry && (
                <input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder={t("companyDialog.customIndustryPlaceholder")}
                  className="mt-3 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-blue-400 dark:border-blue-200/[0.25] dark:bg-[#12192a]/[0.86]"
                />
              )}
            </Field>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Field
              label={
                completeClientMode
                  ? t("companyDialog.companyType")
                  : t("companyDialog.serviceType")
              }
              required={completeClientMode}
            >
              <div className="relative">
                <FieldIcon icon={<Megaphone className="h-5 w-5" />} />
                <select
                  required={completeClientMode}
                  value={
                    completeClientMode
                      ? serviceType
                      : getSelectValue(
                          serviceType,
                          SERVICE_TYPE_OPTIONS,
                          customServiceType,
                        )
                  }
                  onChange={(e) => {
                    if (completeClientMode) {
                      setCustomServiceType(false);
                      setServiceType(e.target.value);
                      return;
                    }
                    const isCustom = e.target.value === "Other";
                    setCustomServiceType(isCustom);
                    setServiceType(isCustom ? "" : e.target.value);
                  }}
                  className={cn(fieldClass, "appearance-none")}
                >
                  <option value="">
                    {completeClientMode
                      ? t("companyDialog.brandTypePlaceholder")
                      : t("companyDialog.notSet")}
                  </option>
                  {(completeClientMode
                    ? BRAND_TYPE_OPTIONS
                    : SERVICE_TYPE_OPTIONS
                  ).map((option) => (
                    <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                  ))}
                </select>
                <SelectIcon />
              </div>
              {customServiceType && !completeClientMode && (
                <input
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  placeholder={t("companyDialog.customServiceTypePlaceholder")}
                  className="mt-3 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-blue-400 dark:border-blue-200/[0.25] dark:bg-[#12192a]/[0.86]"
                />
              )}
            </Field>
            <Field label={t("companyDialog.plan")} required={completeClientMode}>
              <div className="relative">
                <FieldIcon icon={<TrendingUp className="h-5 w-5" />} />
                <select
                  required={completeClientMode}
                  value={
                    completeClientMode
                      ? planName
                      : getSelectValue(planName, PLAN_OPTIONS, customPlanName)
                  }
                  onChange={(e) => {
                    if (completeClientMode) {
                      setCustomPlanName(false);
                      setPlanName(e.target.value);
                      return;
                    }
                    const isCustom = e.target.value === "Other";
                    setCustomPlanName(isCustom);
                    setPlanName(isCustom ? "" : e.target.value);
                  }}
                  className={cn(fieldClass, "appearance-none")}
                >
                  <option value="">
                    {completeClientMode
                      ? t("companyDialog.planPlaceholder")
                      : t("companyDialog.notSet")}
                  </option>
                  {(completeClientMode
                    ? COMPLETE_CLIENT_PLAN_OPTIONS
                    : PLAN_OPTIONS
                  ).map((option) => (
                    <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                  ))}
                </select>
                <SelectIcon />
              </div>
              {customPlanName && !completeClientMode && (
                <input
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder={t("companyDialog.customPlanPlaceholder")}
                  className="mt-3 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-blue-400 dark:border-blue-200/[0.25] dark:bg-[#12192a]/[0.86]"
                />
              )}
            </Field>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Field label={t("clients.salesChannel.label")}>
              <div className="relative">
                <FieldIcon icon={<Store className="h-5 w-5" />} />
                <select
                  value={salesChannel}
                  onChange={(e) => setSalesChannel(e.target.value as SalesChannel | "")}
                  className={cn(fieldClass, "appearance-none")}
                >
                  <option value="">{t("clients.salesChannel.unclassified")}</option>
                  {SALES_CHANNEL_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                  ))}
                </select>
                <SelectIcon />
              </div>
            </Field>

            <Field label={t("companyDialog.billingCycle")}>
              <div className="relative">
                <FieldIcon icon={<RefreshCcw className="h-5 w-5" />} />
                <select
                  value={billingCycle}
                  onChange={(e) => setBillingCycle(e.target.value)}
                  className={cn(fieldClass, "appearance-none")}
                >
                  {BILLING_OPTIONS.map((option) => (
                    <option key={option.value || "not-set"} value={option.value}>{t(option.labelKey)}</option>
                  ))}
                </select>
                <SelectIcon />
              </div>
            </Field>
          </div>

          {operationalRegistrationMode && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Field label={t("companyDialog.expectedStart")} required>
                <div className="relative">
                  <FieldIcon icon={<CalendarClock className="h-5 w-5" />} />
                  <input
                    type="date"
                    value={expectedStartDate}
                    onChange={(e) => setExpectedStartDate(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </Field>
              {onboardingMode || financialsVisible ? (
                <Field
                  label={t("companyDialog.contractValue")}
                  required={completeClientMode}
                >
                  <div className="relative">
                    <FieldIcon icon={<DollarSign className="h-5 w-5" />} />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required={completeClientMode}
                      value={contractValue}
                      onChange={(e) => setContractValue(e.target.value)}
                      placeholder={t("companyDialog.contractValuePlaceholder")}
                      className={fieldClass}
                    />
                  </div>
                </Field>
              ) : (
                <div className="flex min-h-16 items-center rounded-2xl border border-border bg-muted/30 px-5 text-sm text-muted-foreground">
                  {t("companyDialog.financialRestricted")}
                </div>
              )}
            </div>
          )}

          {operationalRegistrationMode && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Field
                label={t("companyDialog.responsibleDepartment")}
                required={completeClientMode}
              >
                <div className="relative">
                  <FieldIcon icon={<Users className="h-5 w-5" />} />
                  <select
                    required={completeClientMode}
                    value={departmentId}
                    onChange={(e) => setDepartmentId(e.target.value)}
                    className={cn(fieldClass, "appearance-none")}
                    disabled={loadingOptions}
                  >
                    <option value="">{t("companyDialog.notAssigned")}</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>{department.name}</option>
                    ))}
                  </select>
                  <SelectIcon />
                </div>
              </Field>
              <Field
                label={t("companyDialog.assigneeOwner")}
                required={completeClientMode}
              >
                <div className="relative">
                  <FieldIcon icon={<UserRound className="h-5 w-5" />} />
                  <select
                    required={completeClientMode}
                    value={assigneeId}
                    onChange={(e) => setAssigneeId(e.target.value)}
                    className={cn(fieldClass, "appearance-none")}
                    disabled={loadingOptions}
                  >
                    <option value="">{t("companyDialog.currentAdmin")}</option>
                    {filteredAssignees.map((member) => (
                      <option key={member.id} value={member.id}>{member.name || member.email}</option>
                    ))}
                  </select>
                  <SelectIcon />
                </div>
              </Field>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <Field label={t("companyDialog.clientContact")} required={completeClientMode}>
              <div className="relative">
                <FieldIcon icon={<UserRound className="h-5 w-5" />} />
                <input
                  required={completeClientMode}
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder={t("companyDialog.contactNamePlaceholder")}
                  className={fieldClass}
                />
              </div>
            </Field>
            <Field label={t("companyDialog.email")} required={completeClientMode}>
              <div className="relative">
                <FieldIcon icon={<Mail className="h-5 w-5" />} />
                <input
                  type="email"
                  required={completeClientMode}
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder={t("companyDialog.emailPlaceholder")}
                  className={fieldClass}
                />
              </div>
            </Field>
            <Field label={t("companyDialog.phone")} required={completeClientMode}>
              <div className="relative">
                <FieldIcon icon={<Phone className="h-5 w-5" />} />
                <input
                  required={completeClientMode}
                  value={contactPhone}
                  onChange={(e) =>
                    setContactPhone(
                      completeClientMode
                        ? formatBrazilianMobile(e.target.value)
                        : e.target.value,
                    )
                  }
                  placeholder={t("companyDialog.phonePlaceholder")}
                  className={fieldClass}
                />
              </div>
            </Field>
          </div>

          <Field label={t("companyDialog.contactRole")}>
            <div className="relative">
              <FieldIcon icon={<BriefcaseBusiness className="h-5 w-5" />} />
              <input
                value={contactRole}
                onChange={(e) => setContactRole(e.target.value)}
                placeholder={t("companyDialog.contactRolePlaceholder")}
                className={fieldClass}
              />
            </div>
          </Field>

          <Field
            label={t("companyDialog.includedServices")}
            required={completeClientMode}
          >
            <div className="rounded-2xl border border-border bg-muted/30 p-4 dark:border-blue-200/[0.25] dark:bg-[#12192a]/[0.86]">
              <div
                className={cn(
                  "grid gap-3",
                  !completeClientMode &&
                    "lg:grid-cols-[minmax(0,1fr)_auto]",
                )}
              >
                <div className="relative">
                  <FieldIcon icon={<Sparkles className="h-5 w-5" />} />
                  <select
                    value={servicePick}
                    onChange={(e) => {
                      setServicePick(e.target.value);
                      if (e.target.value && e.target.value !== "custom") addService(e.target.value);
                    }}
                    className={cn(fieldClass, "h-14 appearance-none")}
                  >
                    <option value="">{t("companyDialog.addServicePlaceholder")}</option>
                    {serviceOptions.filter((option) => !includedServices.includes(option.value)).map((option) => (
                      <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                    ))}
                    {!completeClientMode ? (
                      <option value="custom">{t("companyDialog.customServiceOption")}</option>
                    ) : null}
                  </select>
                  <SelectIcon />
                </div>
                {!completeClientMode ? (
                  <button
                    type="button"
                    onClick={() => addService(customService)}
                    disabled={!customService.trim()}
                    className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-blue-400/[0.35] bg-blue-500/10 px-5 text-sm font-semibold text-blue-700 transition hover:bg-blue-500/[0.15] disabled:cursor-not-allowed disabled:opacity-40 dark:text-blue-100 dark:hover:bg-blue-500/20"
                  >
                    <Plus className="h-4 w-4" />
                    {t("common.add")}
                  </button>
                ) : null}
              </div>
              {servicePick === "custom" && !completeClientMode ? (
                <input
                  value={customService}
                  onChange={(e) => setCustomService(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addService(customService);
                    }
                  }}
                  placeholder={t("companyDialog.customServicePlaceholder")}
                  className="mt-3 h-12 w-full rounded-xl border border-border bg-background px-4 text-sm text-foreground outline-none focus:border-blue-400 dark:border-blue-200/[0.25] dark:bg-[#0d1424]"
                />
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                {includedServices.map((service) => (
                  <span
                    key={service}
                    className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1.5 text-sm text-blue-700 dark:border-blue-400/25 dark:text-blue-100"
                  >
                    {optionLabel(service, serviceOptions, t)}
                    <button
                      type="button"
                      onClick={() => removeService(service)}
                      aria-label={t("companyDialog.removeService", { service: optionLabel(service, serviceOptions, t) })}
                      className="rounded-full text-blue-700/60 hover:text-foreground dark:text-blue-100/60 dark:hover:text-white"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
                {includedServices.length === 0 && (
                  <span className="text-sm text-muted-foreground dark:text-blue-100/[0.55]">{t("companyDialog.noServices")}</span>
                )}
              </div>
            </div>
          </Field>

          <Field label={t("companyDialog.notes")}>
            <div className="relative">
              <FieldIcon className="top-5 translate-y-0" icon={<NotebookText className="h-5 w-5" />} />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t("companyDialog.notesPlaceholder")}
                className={textareaClass}
              />
            </div>
          </Field>
        </div>

        <div className="mt-9 grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-16 rounded-2xl border border-border bg-background text-base font-semibold text-foreground transition hover:bg-accent disabled:opacity-40 dark:border-white/[0.15] dark:bg-white/[0.15] dark:hover:bg-white/[0.15]"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={
              submitting ||
              !name.trim() ||
              (onboardingMode &&
                (!expectedStartDate || includedServices.length === 0)) ||
              (completeClientMode &&
                (!legalName.trim() ||
                  !cnpj.trim() ||
                  !serviceType.trim() ||
                  !planName.trim() ||
                  !expectedStartDate ||
                  !departmentId ||
                  !assigneeId ||
                  !contactName.trim() ||
                  !contactEmail.trim() ||
                  !contactPhone.trim() ||
                  includedServices.length === 0 ||
                  (financialsVisible && !contractValue.trim())))
            }
            className="inline-flex h-16 items-center justify-center gap-3 rounded-2xl border border-blue-300/40 bg-primary text-base font-bold text-primary-foreground shadow-[0_0_34px_rgba(59,130,246,0.38),inset_0_1px_0_rgba(255,255,255,0.18)] transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-[0.45]"
          >
            <Sparkles className="h-5 w-5" />
            {submitting ? t("common.creating") : submitLabel}
          </button>
        </div>

        {!workspaceId && (
          <p className="mt-4 text-center text-xs text-muted-foreground dark:text-blue-100/[0.55]">
            {t("companyDialog.teamOptionsUnavailable")}
          </p>
        )}
      </form>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-foreground dark:text-blue-50/[0.85]">
        {label} {required && <span className="text-rose-600 dark:text-rose-300">*</span>}
      </span>
      {children}
    </label>
  );
}

function FieldIcon({
  icon,
  className,
}: {
  icon: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("absolute left-5 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl bg-blue-500/10 text-blue-700 dark:bg-blue-500/[0.15] dark:text-blue-300", className)}>
      {icon}
    </span>
  );
}

function OnboardingSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-muted/30 p-5 shadow-sm dark:border-blue-200/[0.25] dark:bg-[#0b172b]/[0.72] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-4 flex items-center gap-3 text-xl font-bold text-foreground dark:text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl text-blue-700 dark:text-blue-300">
          {icon}
        </span>
        {title}
      </div>
      {children}
    </section>
  );
}

function OnboardingField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-bold text-foreground dark:text-blue-50/[0.85]">
        {label} {required && <span className="text-rose-600 dark:text-rose-300">*</span>}
      </span>
      {children}
    </label>
  );
}
