"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  FolderOpen,
  Loader2,
  Plus,
  Search,
  UserCheck,
  UsersRound,
  UserX,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { CreateActionButton } from "@/components/ui/create-action-button";
import { cn } from "@/lib/utils";

const CreateCompanyDialog = dynamic(
  () => import("@/components/dashboard/create-company-dialog"),
  { ssr: false },
);

type ClientRegistryItem = {
  id: string;
  name: string;
  status: string;
  service_type: string | null;
  plan_name: string | null;
  included_services: unknown;
  contract_start_date: string | null;
  owner: { id: string; name: string; email: string } | null;
};

type ClientRegistryResponse = {
  items: ClientRegistryItem[];
  summary: { active: number; inactive: number; total_clients: number };
};

type StatusFilter = "all" | "active" | "inactive";

type ClientCreationAccess = {
  canCreateCompleteClient: boolean;
  canViewFinancials: boolean;
};

function servicesFrom(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

export default function ClientSpaceRegistry({
  projectId,
}: {
  projectId: string;
}) {
  const { language, t } = useLanguage();
  const [data, setData] = useState<ClientRegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [creationAccess, setCreationAccess] =
    useState<ClientCreationAccess | null>(null);
  const locale = language === "pt-BR" ? "pt-BR" : "en-US";

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const handle = window.setTimeout(
      async () => {
        setLoading(true);
        setError(null);
        try {
          const params = new URLSearchParams({ project_id: projectId, status });
          if (search.trim()) params.set("q", search.trim());
          const response = await fetch(`/api/clients-registry?${params}`, {
            signal: controller.signal,
          });
          const body = (await response.json().catch(() => null)) as
            | ClientRegistryResponse
            | { error?: string }
            | null;
          if (!response.ok || !body || !("items" in body)) {
            throw new Error(
              body && "error" in body && body.error
                ? body.error
                : t("clientsRegistry.loadFailed"),
            );
          }
          if (active) setData(body);
        } catch (loadError) {
          if (
            active &&
            !(
              loadError instanceof DOMException &&
              loadError.name === "AbortError"
            )
          ) {
            setError(
              loadError instanceof Error
                ? loadError.message
                : t("clientsRegistry.loadFailed"),
            );
          }
        } finally {
          if (active) setLoading(false);
        }
      },
      search.trim() ? 250 : 0,
    );

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [projectId, refreshKey, search, status, t]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/companies/access", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load client access");
        return (await response.json()) as {
          can_create_complete_client?: boolean;
          can_view_financials?: boolean;
        };
      })
      .then((access) =>
        setCreationAccess({
          canCreateCompleteClient:
            access.can_create_complete_client === true,
          canViewFinancials: access.can_view_financials === true,
        }),
      )
      .catch((accessError) => {
        if ((accessError as Error).name !== "AbortError") {
          setCreationAccess({
            canCreateCompleteClient: false,
            canViewFinancials: false,
          });
        }
      });
    return () => controller.abort();
  }, []);

  const summaryCards = useMemo(
    () => [
      {
        key: "total",
        label: t("clientsRegistry.totalClients"),
        value: data?.summary.total_clients ?? 0,
        icon: UsersRound,
        className: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
      },
      {
        key: "active",
        label: t("clientsRegistry.activeClients"),
        value: data?.summary.active ?? 0,
        icon: UserCheck,
        className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      },
      {
        key: "inactive",
        label: t("clientsRegistry.inactiveClients"),
        value: data?.summary.inactive ?? 0,
        icon: UserX,
        className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
      },
    ],
    [data?.summary, t],
  );

  return (
    <section className="space-y-4" aria-labelledby="clients-registry-title">
      <div className="grid gap-3 sm:grid-cols-3">
        {summaryCards.map(({ key, label, value, icon: Icon, className }) => (
          <article
            key={key}
            className="flex min-h-24 items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm"
          >
            <span
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                className,
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-2xl font-bold tabular-nums text-foreground">
                {value}
              </span>
              <span className="block text-xs leading-4 text-muted-foreground">
                {label}
              </span>
            </span>
          </article>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2
            id="clients-registry-title"
            className="text-lg font-bold text-foreground"
          >
            {t("clientsRegistry.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("clientsRegistry.subtitle")}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          {creationAccess?.canCreateCompleteClient ? (
            <CreateActionButton
              type="button"
              onClick={() => setCreateOpen(true)}
              data-testid="create-complete-client"
              className="h-11 shrink-0 px-4"
            >
              <Plus className="h-4 w-4" />
              {t("clientsRegistry.createClient")}
            </CreateActionButton>
          ) : null}
          <label className="relative min-w-0 flex-1 lg:w-80">
            <span className="sr-only">{t("clientsRegistry.searchLabel")}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("clientsRegistry.searchPlaceholder")}
              className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div
            className="grid grid-cols-3 rounded-xl border border-border bg-background p-1"
            aria-label={t("clientsRegistry.statusFilter")}
          >
            {(["all", "active", "inactive"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setStatus(filter)}
                aria-pressed={status === filter}
                className={cn(
                  "min-h-9 rounded-lg px-3 text-xs font-semibold transition",
                  status === filter
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {t(`clientsRegistry.filter.${filter}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-52 items-center justify-center rounded-2xl border border-border bg-card">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="sr-only">{t("common.loading")}</span>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive"
        >
          {error}
        </div>
      ) : data?.items.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {data.items.map((company) => {
            const isActive = company.status === "active";
            const services = servicesFrom(company.included_services);
            const folderHref = `/clients/${company.id}?context_project_id=${encodeURIComponent(projectId)}`;
            return (
              <article
                key={company.id}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:border-primary/40 hover:shadow-md [content-visibility:auto] [contain-intrinsic-size:340px]"
              >
                <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <FolderOpen className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={folderHref}
                          className="break-words text-base font-bold text-foreground hover:text-primary hover:underline"
                        >
                          {company.name}
                        </Link>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                            isActive
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-300",
                          )}
                        >
                          {t(
                            isActive
                              ? "clientsRegistry.active"
                              : "clientsRegistry.inactive",
                          )}
                        </span>
                      </div>
                      <p className="mt-1 break-words text-xs text-muted-foreground">
                        {company.service_type ??
                          t("clientsRegistry.companyTypeMissing")}
                      </p>
                      {company.plan_name ? (
                        <p className="mt-2 break-words text-xs text-muted-foreground">
                          {t("clientsRegistry.plan")}: {company.plan_name}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Link
                    href={folderHref}
                    className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-accent"
                  >
                    {t("clientsRegistry.openFolder")}
                  </Link>
                </div>

                <div className="grid gap-2 border-b border-border px-4 py-3 text-xs text-muted-foreground sm:grid-cols-3 sm:px-5">
                  <span className="flex min-w-0 items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {company.plan_name ?? t("clientsRegistry.planMissing")}
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <UsersRound className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      {company.owner?.name ?? "—"}
                    </span>
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                    <span>
                      {company.contract_start_date
                        ? new Intl.DateTimeFormat(locale, {
                            dateStyle: "medium",
                          }).format(new Date(company.contract_start_date))
                        : "—"}
                    </span>
                  </span>
                </div>

                <div className="space-y-3 p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-foreground">
                      {t("clientsRegistry.contractedServices")}
                    </h3>
                    <span className="text-xs font-semibold text-primary">
                      {services.length}
                    </span>
                  </div>

                  {services.length ? (
                    <div className="flex flex-wrap gap-1.5 rounded-xl border border-border bg-background p-3">
                      {services.map((service) => (
                        <span
                          key={service}
                          className="rounded-full border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground"
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                      {t("clientsRegistry.noContractedServices")}
                    </p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 text-center">
          <FolderOpen className="h-9 w-9 text-muted-foreground" />
          <h3 className="mt-3 text-sm font-semibold text-foreground">
            {t("clientsRegistry.emptyTitle")}
          </h3>
          <p className="mt-1 max-w-md text-xs text-muted-foreground">
            {t("clientsRegistry.emptyDescription")}
          </p>
        </div>
      )}

      <CreateCompanyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        mode="complete"
        financialsVisible={creationAccess?.canViewFinancials === true}
        onCreated={() => {
          setCreateOpen(false);
          setStatus("all");
          setSearch("");
          setRefreshKey((current) => current + 1);
        }}
      />
    </section>
  );
}
