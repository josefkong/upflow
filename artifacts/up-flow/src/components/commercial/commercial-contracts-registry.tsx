"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  CalendarDays,
  Download,
  FileText,
  Loader2,
  Mail,
  Search,
  UserCheck,
  UsersRound,
  UserX,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";

type ContractRegistryItem = {
  id: string;
  name: string;
  legal_name: string | null;
  cnpj: string | null;
  status: string;
  commercial_status: string | null;
  plan_name: string | null;
  contract_value: number | null;
  contract_start_date: string | null;
  billing_email: string | null;
  main_contact_email: string | null;
  phone: string | null;
  whatsapp: string | null;
  owner: { id: string; name: string; email: string } | null;
  contracts: Array<{
    id: string;
    onboarding_id: string;
    file_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    status: string;
    uploaded_at: string;
    uploader: { id: string; name: string; email: string } | null;
  }>;
};

type ContractRegistryResponse = {
  financials_visible: boolean;
  items: ContractRegistryItem[];
  summary: {
    active: number;
    inactive: number;
    total_clients: number;
    total_contracts: number;
    clients_with_contracts: number;
  };
};

type StatusFilter = "all" | "active" | "inactive";

function formatFileSize(bytes: number | null, locale: string) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
    bytes / 1024 ** unitIndex,
  )} ${units[unitIndex]}`;
}

export default function CommercialContractsRegistry({
  projectId,
}: {
  projectId: string;
}) {
  const { language, t } = useLanguage();
  const [data, setData] = useState<ContractRegistryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
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
          const response = await fetch(`/api/commercial/contracts?${params}`, {
            signal: controller.signal,
          });
          const body = (await response.json().catch(() => null)) as
            | ContractRegistryResponse
            | { error?: string }
            | null;
          if (!response.ok || !body || !("items" in body)) {
            throw new Error(
              body && "error" in body && body.error
                ? body.error
                : t("contractRegistry.loadFailed"),
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
                : t("contractRegistry.loadFailed"),
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
  }, [projectId, search, status, t]);

  const summaryCards = useMemo(
    () =>
      [
        {
          key: "total",
          label: t("contractRegistry.totalClients"),
          value: data?.summary.total_clients ?? 0,
          icon: UsersRound,
          className: "text-blue-600 dark:text-blue-300 bg-blue-500/10",
        },
        {
          key: "active",
          label: t("contractRegistry.activeClients"),
          value: data?.summary.active ?? 0,
          icon: UserCheck,
          className: "text-emerald-700 dark:text-emerald-300 bg-emerald-500/10",
        },
        {
          key: "inactive",
          label: t("contractRegistry.inactiveClients"),
          value: data?.summary.inactive ?? 0,
          icon: UserX,
          className: "text-amber-700 dark:text-amber-300 bg-amber-500/10",
        },
        {
          key: "contracts",
          label: t("contractRegistry.storedContracts"),
          value: data?.summary.total_contracts ?? 0,
          icon: FileText,
          className: "text-violet-700 dark:text-violet-300 bg-violet-500/10",
        },
      ].filter((card) => card.key !== "contracts" || data?.financials_visible),
    [data?.financials_visible, data?.summary, t],
  );

  return (
    <section className="space-y-4" aria-labelledby="contract-registry-title">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map(({ key, label, value, icon: Icon, className }) => (
          <article
            key={key}
            className="flex min-h-24 items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4"
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

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h2
            id="contract-registry-title"
            className="text-lg font-bold text-foreground"
          >
            {t("contractRegistry.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("contractRegistry.subtitle")}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <label className="relative min-w-0 flex-1 lg:w-80">
            <span className="sr-only">{t("contractRegistry.searchLabel")}</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("contractRegistry.searchPlaceholder")}
              className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div
            className="grid grid-cols-3 rounded-xl border border-border bg-background p-1"
            aria-label={t("contractRegistry.statusFilter")}
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
                {t(`contractRegistry.filter.${filter}`)}
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
            const contactEmail =
              company.billing_email ?? company.main_contact_email;
            const isActive = company.status === "active";
            return (
              <article
                key={company.id}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm [content-visibility:auto] [contain-intrinsic-size:420px]"
              >
                <div className="flex flex-col gap-4 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/clients/${company.id}`}
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
                              ? "contractRegistry.active"
                              : "contractRegistry.inactive",
                          )}
                        </span>
                      </div>
                      {company.legal_name ? (
                        <p className="mt-1 break-words text-xs text-muted-foreground">
                          {company.legal_name}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {company.cnpj ? (
                          <span>CNPJ: {company.cnpj}</span>
                        ) : null}
                        {company.plan_name ? (
                          <span>
                            {t("contractRegistry.plan")}: {company.plan_name}
                          </span>
                        ) : null}
                        {company.contract_value != null ? (
                          <span>
                            {new Intl.NumberFormat(locale, {
                              style: "currency",
                              currency: "BRL",
                            }).format(company.contract_value)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <Link
                    href={`/clients/${company.id}`}
                    className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground transition hover:border-primary/40 hover:bg-accent"
                  >
                    {t("contractRegistry.openClient")}
                  </Link>
                </div>

                <div className="grid gap-2 border-b border-border px-4 py-3 text-xs text-muted-foreground sm:grid-cols-3 sm:px-5">
                  <span className="flex min-w-0 items-center gap-2">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{contactEmail ?? "—"}</span>
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

                {data.financials_visible ? (
                  <div className="space-y-2 p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-foreground">
                        {t("contractRegistry.contractHistory")}
                      </h3>
                      <span className="text-xs font-semibold text-primary">
                        {company.contracts.length}
                      </span>
                    </div>
                    {company.contracts.length ? (
                      company.contracts.map((contract) => (
                        <div
                          key={contract.id}
                          className="flex flex-col gap-3 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex min-w-0 items-start gap-2.5">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <div className="min-w-0">
                              <p className="break-all text-sm font-semibold text-foreground">
                                {contract.file_name}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {new Intl.DateTimeFormat(locale, {
                                  dateStyle: "medium",
                                  timeStyle: "short",
                                }).format(new Date(contract.uploaded_at))}
                                {" · "}
                                {formatFileSize(contract.size_bytes, locale)}
                              </p>
                            </div>
                          </div>
                          <a
                            href={`/api/commercial/contracts/${contract.id}?project_id=${projectId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3 text-xs font-semibold text-primary transition hover:bg-primary/15"
                          >
                            <Download className="h-3.5 w-3.5" />
                            {t("contractRegistry.openContract")}
                          </a>
                        </div>
                      ))
                    ) : (
                      <p className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                        {t("contractRegistry.noContracts")}
                      </p>
                    )}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border bg-card px-5 py-14 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground/60" />
          <h3 className="mt-4 text-base font-bold text-foreground">
            {t("contractRegistry.emptyTitle")}
          </h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
            {search.trim()
              ? t("contractRegistry.emptySearch")
              : t("contractRegistry.emptyDescription")}
          </p>
        </div>
      )}
    </section>
  );
}
