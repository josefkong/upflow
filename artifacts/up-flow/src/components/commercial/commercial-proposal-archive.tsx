"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowUpDown,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  Search,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import { cn } from "@/lib/utils";

type ProposalDocument = {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
  confirmed_at: string | null;
  removed_from_lead_at: string | null;
  is_current: boolean;
  uploader: { id: string; name: string; email: string } | null;
};

type ProposalFolder = {
  id: string;
  commercial_lead_id: string | null;
  brand_name: string;
  owner_name: string;
  owner_email: string;
  latest_uploaded_at: string;
  contract_date: string | null;
  documents: ProposalDocument[];
};

type ProposalArchiveResponse = {
  items: ProposalFolder[];
  total_folders: number;
  total_documents: number;
};

function formatFileSize(bytes: number | null, language: string) {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;
  return `${new Intl.NumberFormat(language, {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  }).format(value)} ${units[unitIndex]}`;
}

export default function CommercialProposalArchive({
  projectId,
}: {
  projectId: string;
}) {
  const { language, t } = useLanguage();
  const [data, setData] = useState<ProposalArchiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"az" | "za" | "contract_date">(
    "az",
  );
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const dateLocale = language === "pt-BR" ? "pt-BR" : "en-US";

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetch(`/api/commercial/proposals?project_id=${projectId}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | ProposalArchiveResponse
          | { error?: string }
          | null;
        if (!response.ok || !body || !("items" in body)) {
          throw new Error(
            body && "error" in body && body.error
              ? body.error
              : t("proposalArchive.loadFailed"),
          );
        }
        if (active) setData(body);
      })
      .catch((loadError) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : t("proposalArchive.loadFailed"),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId, t]);

  const filteredFolders = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const filtered = query
      ? (data?.items ?? []).filter((folder) =>
          [
            folder.brand_name,
            folder.owner_name,
            folder.owner_email,
            ...folder.documents.map((document) => document.file_name),
          ].some((value) => value.toLocaleLowerCase().includes(query)),
        )
      : [...(data?.items ?? [])];
    return filtered.sort((left, right) => {
      if (sortOrder === "contract_date") {
        const leftTime = left.contract_date
          ? new Date(left.contract_date).getTime()
          : Number.NEGATIVE_INFINITY;
        const rightTime = right.contract_date
          ? new Date(right.contract_date).getTime()
          : Number.NEGATIVE_INFINITY;
        return rightTime - leftTime;
      }
      const comparison = left.brand_name.localeCompare(
        right.brand_name,
        dateLocale,
        { sensitivity: "base" },
      );
      return sortOrder === "za" ? -comparison : comparison;
    });
  }, [data?.items, dateLocale, search, sortOrder]);
  const selectedFolder = data?.items.find(
    (folder) => folder.id === selectedFolderId,
  );

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center rounded-2xl border border-border bg-card">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="sr-only">{t("common.loading")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (selectedFolder) {
    return (
      <section className="space-y-4" aria-labelledby="proposal-folder-title">
        <button
          type="button"
          onClick={() => setSelectedFolderId(null)}
          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("proposalArchive.backToFolders")}
        </button>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FolderOpen className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 id="proposal-folder-title" className="break-words text-xl font-bold text-foreground">
                {selectedFolder.brand_name}
              </h2>
              <p className="mt-1 break-words text-sm text-muted-foreground">
                {selectedFolder.owner_name} · {selectedFolder.owner_email}
              </p>
              <p className="mt-2 text-xs font-medium text-primary">
                {selectedFolder.documents.length === 1
                  ? t("proposalArchive.singleDocument")
                  : t("proposalArchive.documentsCount", {
                      count: selectedFolder.documents.length,
                    })}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          {selectedFolder.documents.map((document, index) => (
            <article
              key={document.id}
              className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-all text-sm font-semibold text-foreground">
                      {document.file_name}
                    </h3>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {t("proposalArchive.version", {
                        version: selectedFolder.documents.length - index,
                      })}
                    </span>
                    {document.is_current ? (
                      <span className="rounded-md bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-200">
                        {t("proposalArchive.current")}
                      </span>
                    ) : (
                      <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-200">
                        {t("proposalArchive.archived")}
                      </span>
                    )}
                    {document.confirmed_at ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-200">
                        <CheckCircle2 className="h-3 w-3" />
                        {t("proposalArchive.confirmed")}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {new Intl.DateTimeFormat(dateLocale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(document.uploaded_at))}
                    {" · "}
                    {formatFileSize(document.size_bytes, dateLocale)}
                    {document.uploader?.name
                      ? ` · ${t("proposalArchive.uploadedBy", {
                          name: document.uploader.name,
                        })}`
                      : ""}
                  </p>
                </div>
              </div>
              <a
                href={`/api/commercial/proposals/${document.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-3.5 text-sm font-semibold text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Download className="h-4 w-4" />
                {t("proposalArchive.openFile")}
              </a>
            </article>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4" aria-labelledby="proposal-archive-title">
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Archive className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 id="proposal-archive-title" className="text-lg font-bold text-foreground">
              {t("proposalArchive.title")}
            </h2>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {t("proposalArchive.subtitle")}
            </p>
            <p className="mt-2 text-xs font-medium text-primary">
              {t("proposalArchive.summary", {
                folders: data?.total_folders ?? 0,
                documents: data?.total_documents ?? 0,
              })}
            </p>
          </div>
        </div>
        <div className="grid w-full gap-2 sm:grid-cols-[minmax(0,1fr)_12rem] lg:max-w-2xl">
          <label className="relative block min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">{t("proposalArchive.search")}</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("proposalArchive.search")}
              className="h-11 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="relative block min-w-0">
            <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">{t("proposalArchive.sortLabel")}</span>
            <select
              value={sortOrder}
              onChange={(event) =>
                setSortOrder(
                  event.target.value as "az" | "za" | "contract_date",
                )
              }
              className="h-11 w-full appearance-none rounded-xl border border-border bg-background pl-10 pr-9 text-sm font-medium text-foreground outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
            >
              <option value="az">{t("proposalArchive.sort.az")}</option>
              <option value="za">{t("proposalArchive.sort.za")}</option>
              <option value="contract_date">
                {t("proposalArchive.sort.contractDate")}
              </option>
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              ▾
            </span>
          </label>
        </div>
      </div>

      {filteredFolders.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center">
          <Folder className="h-10 w-10 text-muted-foreground" />
          <h3 className="mt-4 text-base font-semibold text-foreground">
            {t("proposalArchive.emptyTitle")}
          </h3>
          <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">
            {search
              ? t("proposalArchive.emptySearch")
              : t("proposalArchive.emptyDescription")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filteredFolders.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => setSelectedFolderId(folder.id)}
              aria-label={t("proposalArchive.openFolder", {
                brand: folder.brand_name,
              })}
              className={cn(
                "group min-h-44 rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition",
                "hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_18px_45px_rgba(37,99,235,0.12)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary/15">
                  <Folder className="h-6 w-6" />
                </div>
                <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                  {folder.documents.length}
                </span>
              </div>
              <h3 className="mt-5 break-words text-base font-bold text-foreground">
                {folder.brand_name}
              </h3>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                {folder.owner_name}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                {t("proposalArchive.latestUpload", {
                  date: new Intl.DateTimeFormat(dateLocale, {
                    dateStyle: "medium",
                  }).format(new Date(folder.latest_uploaded_at)),
                })}
              </p>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
