"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  Crown,
  Edit3,
  Filter,
  HeartPulse,
  Eye,
  PackageCheck,
  Plus,
  Power,
  RefreshCcw,
  Sparkles,
  Trash2,
  UserRound,
  Loader2,
  Search,
} from "lucide-react";
import Header from "@/components/layout/header";
import CreateCompanyDialog from "@/components/dashboard/create-company-dialog";
import { useLanguage } from "@/components/language-provider";
import { useAppUser } from "@/components/user-provider";
import ClientPinButton from "@/components/clients/client-pin-button";
import { resolveCompanyCreationAccess } from "@/lib/company-creation-access";
import { hasWorkspaceAdminAccess } from "@/lib/client-role-access";
import type { Company } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CreateActionButton } from "@/components/ui/create-action-button";

type ClientCreationMode = "company" | "onboarding";
type ClientSalesChannelFilter = "all" | "wholesale" | "retail" | "both" | "unclassified";
type ClientStatusFilter = "all" | "active" | "inactive";

type ClientCreationAccess = {
  canCreateStandalone: boolean;
  canStartOnboarding: boolean;
};

export default function ClientsPage() {
  const user = useAppUser();
  const { t } = useLanguage();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [creationMode, setCreationMode] = useState<ClientCreationMode | null>(null);
  const [creationAccess, setCreationAccess] = useState<ClientCreationAccess | null>(null);
  const [query, setQuery] = useState("");
  const [salesChannel, setSalesChannel] = useState<ClientSalesChannelFilter>("all");
  const [statusFilter, setStatusFilter] = useState<ClientStatusFilter>("active");
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [pinnedCompanyIds, setPinnedCompanyIds] = useState<Set<string>>(new Set());


  const isWorkspaceAdmin = hasWorkspaceAdminAccess(user);
  const contextCreationAccess = resolveCompanyCreationAccess({
    isWorkspaceAdmin,
    membership: user?.currentRole
      ? {
          role: user.currentRole,
          status: "active",
          departmentName: user.currentDepartmentName,
        }
      : null,
  });
  // Keep a known-positive workspace context visible while the access endpoint
  // catches up after a role or department change. The API still authorizes the
  // action, so this never grants server-side access on its own.
  const canCreateStandalone =
    contextCreationAccess.canCreateStandalone || creationAccess?.canCreateStandalone === true;
  const canStartOnboarding =
    contextCreationAccess.canStartOnboarding || creationAccess?.canStartOnboarding === true;

  useEffect(() => {
    let mounted = true;

    async function loadCreationAccess() {
      try {
        const response = await fetch("/api/companies/access", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as {
          can_create_standalone?: boolean;
          can_start_onboarding?: boolean;
        };
        if (mounted) {
          setCreationAccess({
            canCreateStandalone: data.can_create_standalone === true,
            canStartOnboarding: data.can_start_onboarding === true,
          });
        }
      } catch {
        // The current workspace context remains as a temporary visual fallback.
      }
    }

    void loadCreationAccess();
    window.addEventListener("focus", loadCreationAccess);
    return () => {
      mounted = false;
      window.removeEventListener("focus", loadCreationAccess);
    };
  }, []);

  const loadCompanies = useCallback(async (cursor?: string | null) => {
    const append = Boolean(cursor);
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      setError("");
    }
    try {
      const params = new URLSearchParams({ limit: "24" });
      params.set("include_summary", "false");
      const term = query.trim();
      if (term) params.set("q", term);
      params.set("status", statusFilter);
      if (salesChannel !== "all") params.set("sales_channel", salesChannel);
      if (cursor) params.set("cursor", cursor);
      const [res, pinsRes] = await Promise.all([
        fetch(`/api/companies?${params.toString()}`),
        append ? Promise.resolve(null) : fetch("/api/sidebar-pins"),
      ]);
      if (!res.ok) throw new Error(`${t("clients.couldNotLoad")} (${res.status})`);
      const data = (await res.json()) as { items?: Company[]; nextCursor?: string | null };
      setCompanies((current) => (append ? [...current, ...(data.items ?? [])] : (data.items ?? [])));
      setNextCursor(data.nextCursor ?? null);
      if (pinsRes?.ok) {
        const pins = (await pinsRes.json()) as { items?: Array<{ company_id: string }> };
        setPinnedCompanyIds(new Set((pins.items ?? []).map((pin) => pin.company_id)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("clients.couldNotLoad"));
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [query, salesChannel, statusFilter, t]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void loadCompanies();
    }, query.trim() ? 250 : 0);
    return () => window.clearTimeout(timeout);
  }, [loadCompanies, query, salesChannel, statusFilter]);

  const handlePinnedChange = (companyId: string, pinned: boolean) => {
    setPinnedCompanyIds((current) => {
      const next = new Set(current);
      if (pinned) next.add(companyId);
      else next.delete(companyId);
      return next;
    });
  };

  const deleteCompany = async (company: Company) => {
    if (!window.confirm(t("clients.deleteConfirm", { name: company.name }))) return;

    try {
      const res = await fetch(`/api/companies/${company.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? t("clients.couldNotDelete"));
      }
      toast.success(t("clients.deleted"));
      await loadCompanies();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("clients.couldNotDelete"));
    }
  };

  const updateCompanyStatus = async (
    company: Company,
    nextStatus: Extract<ClientStatusFilter, "active" | "inactive">,
  ) => {
    const isReactivating = nextStatus === "active";
    const confirmationKey = isReactivating
      ? "clients.reactivateConfirm"
      : "clients.deactivateConfirm";
    if (!window.confirm(t(confirmationKey, { name: company.name }))) return;

    try {
      const res = await fetch("/api/companies/" + company.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? t("clients.couldNotUpdateStatus"));
      }
      toast.success(t(isReactivating ? "clients.reactivated" : "clients.deactivated"));
      await loadCompanies();
      window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("clients.couldNotUpdateStatus"));
    }
  };

  return (
    <>
      <Header title={t("clients.title")} />
      <div className="space-y-6 overflow-x-hidden p-4 sm:p-6">
        <section className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-foreground">{t("clients.title")}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {t("clients.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/clients/health"
              className="inline-flex items-center gap-2 rounded-lg border border-blue-400/25 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-500/20 dark:text-blue-100"
            >
              <HeartPulse className="h-4 w-4" />
              {t("clients.healthCenter")}
            </Link>
            <ClientCreationActions
              canCreateStandalone={canCreateStandalone}
              canStartOnboarding={canStartOnboarding}
              standaloneLabel={t("clients.createStandalone")}
              standaloneHint={t("clients.createStandaloneHint")}
              onboardingLabel={t("clients.startOnboarding")}
              onCreateStandalone={() => setCreationMode("company")}
              onStartOnboarding={() => setCreationMode("onboarding")}
            />
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <div
            role="tablist"
            aria-label={t("clients.statusFilter")}
            className="flex h-10 items-center rounded-lg border border-border bg-background p-1 dark:border-blue-200/20 dark:bg-white/5"
          >
            {(["active", "inactive", "all"] as const).map((status) => (
              <button
                key={status}
                type="button"
                role="tab"
                aria-selected={statusFilter === status}
                data-testid={"client-status-filter-" + status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  "h-full rounded-md px-3 text-xs font-semibold transition-colors",
                  statusFilter === status
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {t("clients.status." + status)}
              </button>
            ))}
          </div>
          <label className="relative block min-w-0 max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("clients.searchPlaceholder")}
              className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/15 dark:border-blue-200/20 dark:bg-white/5"
            />
          </label>
          <label className="relative block w-full sm:w-56">
            <span className="sr-only">{t("clients.salesChannelFilter")}</span>
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <select
              value={salesChannel}
              onChange={(event) => setSalesChannel(event.target.value as ClientSalesChannelFilter)}
              aria-label={t("clients.salesChannelFilter")}
              className="h-10 w-full rounded-lg border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none transition focus:border-blue-400/60 focus:ring-2 focus:ring-blue-400/15 dark:border-blue-200/20 dark:bg-white/5"
            >
              <option value="all">{t("clients.salesChannel.all")}</option>
              <option value="wholesale">{t("clients.salesChannel.wholesale")}</option>
              <option value="retail">{t("clients.salesChannel.retail")}</option>
              <option value="both">{t("clients.salesChannel.both")}</option>
              <option value="unclassified">{t("clients.salesChannel.unclassified")}</option>
            </select>
          </label>
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="h-56 animate-pulse rounded-xl bg-muted dark:bg-white/5" />
            ))}
          </div>
        ) : error ? (
          <section className="glass rounded-xl p-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">{t("clients.couldNotLoad")}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => void loadCompanies()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <RefreshCcw className="h-4 w-4" />
                {t("common.retry")}
              </button>
            </div>
          </section>
        ) : companies.length === 0 ? (
          <section className="glass rounded-xl p-10 text-center">
            <Building2 className="mx-auto h-10 w-10 text-muted-foreground" />
            <h3 className="mt-4 text-base font-semibold text-foreground">
              {query.trim()
                ? t("clients.noSearchResults")
                : statusFilter === "inactive"
                  ? t("clients.noInactiveClients")
                  : t("clients.noClients")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {query.trim()
                ? t("clients.searchPlaceholder")
                : statusFilter === "inactive"
                  ? t("clients.noInactiveClientsHint")
                  : t("clients.noClientsHint")}
            </p>
            {!query.trim() && statusFilter !== "inactive" ? (
              <ClientCreationActions
                className="mt-5 justify-center"
                canCreateStandalone={canCreateStandalone}
                canStartOnboarding={canStartOnboarding}
                standaloneLabel={t("clients.createStandalone")}
                standaloneHint={t("clients.createStandaloneHint")}
                onboardingLabel={t("clients.startOnboarding")}
                onCreateStandalone={() => setCreationMode("company")}
                onStartOnboarding={() => setCreationMode("onboarding")}
              />
            ) : null}
          </section>
        ) : (
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {companies.map((company) => {
              const services = company.included_services ?? [];
              const visibleServices = services.slice(0, 2);
              const remainingServices = Math.max(0, services.length - visibleServices.length);
              const manager = managerName(company, t);
              const isInactive = company.status !== "active";

              return (
                <article
                  key={company.id}
                  data-testid="client-card"
                  className="upflow-client-card group relative h-[344px] min-w-0 overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-sm transition-colors hover:border-blue-400/40 hover:bg-accent/40 dark:border-blue-400/25 dark:bg-[#07101f] dark:hover:border-blue-300/50 dark:hover:bg-[#091426]"
                >

                  <div className="relative flex h-full flex-col p-3">
                    <div data-testid="client-card-header" className="flex h-20 min-w-0 shrink-0 items-start justify-between gap-2">
                      <Link href={`/clients/${company.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span className="upflow-client-avatar flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-blue-300/30 bg-gradient-to-br from-blue-600 via-indigo-700 to-blue-950 text-xl font-bold text-white shadow-sm">
                          {company.name.trim().charAt(0).toUpperCase() || "C"}
                        </span>
                        <div className="min-w-0">
                          <p className="upflow-client-muted text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground dark:text-blue-200/50">
                            {t("clients.brandName")}
                          </p>
                          <h3 className="upflow-client-title mt-0.5 truncate text-lg font-bold leading-tight text-foreground dark:text-white">
                            {company.name}
                          </h3>
                          <span
                            className={cn(
                              "mt-1.5 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                              isInactive
                                ? "border-amber-300/25 bg-amber-500/10 text-amber-700 dark:text-amber-200"
                                : "border-emerald-300/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-200",
                            )}
                          >
                            <span className={cn("h-1.5 w-1.5 rounded-full", isInactive ? "bg-amber-400" : "bg-emerald-400")} />
                            {isInactive ? t("clients.status.inactive") : t("clients.status.active")}
                          </span>
                        </div>
                      </Link>

                      <div className="flex shrink-0 items-center gap-1">
                        <ClientPinButton
                          companyId={company.id}
                          companyName={company.name}
                          pinned={pinnedCompanyIds.has(company.id)}
                          onPinnedChange={handlePinnedChange}
                          className="h-8 w-8"
                        />
                        {isWorkspaceAdmin ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void updateCompanyStatus(company, isInactive ? "active" : "inactive")}
                              className={cn(
                                "flex h-8 w-8 items-center justify-center rounded-lg border transition",
                                isInactive
                                  ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-700 hover:border-emerald-300/50 hover:bg-emerald-500/20 dark:text-emerald-300"
                                  : "border-amber-300/20 bg-amber-500/10 text-amber-700 hover:border-amber-300/50 hover:bg-amber-500/20 dark:text-amber-300",
                              )}
                              title={t(isInactive ? "clients.reactivateClient" : "clients.deactivateClient")}
                              aria-label={t(isInactive ? "clients.reactivateClient" : "clients.deactivateClient")}
                              data-testid="client-status-toggle"
                            >
                              <Power className="h-4 w-4" />
                            </button>
                            <Link
                              href={`/clients/${company.id}`}
                              aria-label={t("clients.editClient")}
                              className="upflow-client-action flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:border-blue-300/40 hover:bg-blue-500/10 hover:text-blue-700 dark:border-blue-200/20 dark:bg-white/5 dark:text-blue-100/80 dark:hover:text-white"
                            >
                              <Edit3 className="h-4 w-4" />
                            </Link>
                            <button
                              type="button"
                              onClick={() => deleteCompany(company)}
                              className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-300/20 bg-rose-500/10 text-rose-700 transition hover:border-rose-300/50 hover:bg-rose-500/20 dark:text-rose-300"
                              title={t("clients.deleteClient")}
                              aria-label={t("clients.deleteClient")}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <span
                            data-testid="client-read-only"
                            title={t("clients.manageRestrictedHint")}
                            className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-muted/40 px-2 text-[11px] font-medium text-muted-foreground dark:border-blue-200/20 dark:bg-white/5 dark:text-blue-100/70"
                          >
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            {t("clients.readOnly")}
                          </span>
                        )}
                      </div>
                    </div>

                    <Link href={`/clients/${company.id}`} className="mt-3 flex min-h-0 flex-1 flex-col gap-2.5">
                      <div data-testid="client-card-facts" className="upflow-client-surface grid h-[58px] shrink-0 grid-cols-2 gap-2 rounded-lg border border-border bg-muted/30 p-2.5 dark:border-blue-200/20 dark:bg-white/5">
                        <ClientFact
                          icon={<Building2 className="h-4 w-4" />}
                          label={t("clients.brandType")}
                          value={brandTypeValue(company, t)}
                        />
                        <ClientFact
                          icon={<Crown className="h-4 w-4" />}
                          label={t("clients.contractedPlan")}
                          value={company.plan_name || t("clients.planNotSet")}
                        />
                      </div>

                      <div
                        data-testid="client-plan-services"
                        className="flex h-24 min-w-0 shrink-0 flex-col items-start gap-1.5 overflow-hidden"
                      >
                        <span data-testid="client-plan-services-label" className="flex shrink-0 items-center gap-1.5">
                          <PackageCheck className="h-4 w-4 text-blue-400" />
                          <span className="upflow-client-title text-xs font-bold text-foreground dark:text-white">{t("clients.planServices")}</span>
                        </span>
                        {visibleServices.length > 0 ? (
                          <div data-testid="client-plan-services-list" className="grid w-full min-w-0 grid-cols-2 gap-1.5">
                            {visibleServices.map((service) => (
                              <PlanServiceTile key={service} service={service} />
                            ))}
                            {remainingServices > 0 ? (
                              <span className="upflow-client-service inline-flex h-8 min-w-0 items-center justify-center rounded-lg border border-border bg-muted/30 px-2 py-1 text-xs font-semibold text-muted-foreground dark:border-blue-200/20 dark:bg-white/5 dark:text-blue-100/70">
                                {t("clients.moreServices", { count: remainingServices })}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="upflow-client-surface min-w-0 truncate text-xs text-muted-foreground dark:text-blue-100/50">
                            {t("clients.noIncludedServices")}
                          </span>
                        )}
                      </div>

                      <div data-testid="client-card-manager" className="upflow-client-surface mt-auto flex h-[52px] min-w-0 shrink-0 items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-2 dark:border-blue-200/20 dark:bg-black/10">
                        <span className="upflow-client-mini-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 ring-1 ring-blue-300/10 dark:text-blue-300">
                          <UserRound className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="upflow-client-muted text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground dark:text-blue-200/50">
                            {t("clients.responsibleManager")}
                          </p>
                          <p className="upflow-client-title mt-0.5 truncate text-xs font-bold text-foreground dark:text-white">{manager}</p>
                        </div>
                      </div>
                    </Link>
                  </div>
                </article>
              );
            })}
          </section>
        )}

        <button
          type="button"
          onClick={() => void loadCompanies()}
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
          {t("common.refresh")}
        </button>
        {nextCursor ? (
          <button
            type="button"
            onClick={() => void loadCompanies(nextCursor)}
            disabled={loadingMore}
            className="ml-4 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-semibold text-foreground transition hover:border-blue-400/50 hover:bg-accent disabled:cursor-wait disabled:opacity-60"
          >
            {loadingMore ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            {t("clients.loadMore")}
          </button>
        ) : null}
      </div>

      <CreateCompanyDialog
        open={creationMode !== null}
        onClose={() => setCreationMode(null)}
        mode={creationMode ?? "company"}
        onCreated={(company) => {
          setCreationMode(null);
          window.location.assign(`/clients/${company.id}`);
        }}
      />
    </>
  );
}

function ClientCreationActions({
  className,
  canCreateStandalone,
  canStartOnboarding,
  standaloneLabel,
  standaloneHint,
  onboardingLabel,
  onCreateStandalone,
  onStartOnboarding,
}: {
  className?: string;
  canCreateStandalone: boolean;
  canStartOnboarding: boolean;
  standaloneLabel: string;
  standaloneHint: string;
  onboardingLabel: string;
  onCreateStandalone: () => void;
  onStartOnboarding: () => void;
}) {
  if (!canCreateStandalone && !canStartOnboarding) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {canCreateStandalone ? (
        <button
          type="button"
          onClick={onCreateStandalone}
          aria-label={[standaloneLabel, standaloneHint].join(": ")}
          data-testid="create-standalone-client"
          className={cn(
            "inline-flex h-9 min-h-9 items-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors",
            canStartOnboarding
              ? "border border-border bg-background text-foreground hover:bg-accent"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          <Building2 className="h-4 w-4" />
          <span>{standaloneLabel}</span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              canStartOnboarding ? "bg-blue-500/10 text-blue-700 dark:text-blue-200" : "bg-white/15 text-white/90",
            )}
          >
            {standaloneHint}
          </span>
        </button>
      ) : null}
      {canStartOnboarding ? (
        <CreateActionButton
          onClick={onStartOnboarding}
          aria-label={onboardingLabel}
          data-testid="create-client-onboarding"
        >
          <Sparkles className="h-4 w-4" />
          {onboardingLabel}
        </CreateActionButton>
      ) : null}
    </div>
  );
}

function ClientFact({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 border-border first:border-r first:pr-2 dark:border-blue-200/10">
      <span className="upflow-client-mini-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 ring-1 ring-blue-300/10 dark:text-blue-300">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="upflow-client-muted truncate text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground dark:text-blue-200/50">
          {label}
        </p>
        <p className="upflow-client-title mt-0.5 truncate text-sm font-bold text-foreground dark:text-white">{value}</p>
      </div>
    </div>
  );
}

function PlanServiceTile({ service }: { service: string }) {
  return (
    <span className="upflow-client-service inline-flex h-8 min-w-0 items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2 py-1 text-xs font-semibold text-foreground dark:border-blue-200/20 dark:bg-white/5 dark:text-white">
      <span className="upflow-client-mini-icon flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-500/10 text-[10px] font-bold text-blue-600 ring-1 ring-blue-300/10 dark:text-blue-300">
        {serviceInitials(service)}
      </span>
      <span className={cn("truncate", service.length > 18 && "text-[11px]")}>
        {service}
      </span>
    </span>
  );
}

function serviceInitials(service: string) {
  const normalized = service.trim();
  if (!normalized) return "S";
  const known: Record<string, string> = {
    "meta ads": "M",
    "google ads": "G",
    "tiktok ads": "T",
    "pinterest ads": "P",
    "up motion v.1": "U",
    "up motion v.2": "U",
    "social media": "S",
    "implantacao ia": "AI",
    "up zero": "Z",
  };
  const match = known[normalized.toLowerCase()];
  if (match) return match;
  return normalized
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function brandTypeValue(
  company: Company,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  const raw = company.service_type?.trim();
  if (!raw) return company.industry || t("clients.serviceTypeNotSet");
  const normalized = raw.replace(/\s+/g, "").toUpperCase();
  if (normalized === "B2B" || normalized === "B2C") return normalized;
  return raw;
}

function managerName(
  company: Company,
  t: (key: string, vars?: Record<string, string | number>) => string,
) {
  return (
    company.owner?.name ||
    company.summary?.assigned_members?.[0]?.name ||
    t("clients.ownerNotAssigned")
  );
}
