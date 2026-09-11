"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  Calendar,
  CheckSquare2,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import NewProjectDialog from "@/components/projects/new-project-dialog";
import { useLanguage } from "@/components/language-provider";
import { useAppUser } from "@/components/user-provider";
import { cn, formatDate } from "@/lib/utils";
import {
  localizeProjectName,
  localizeSpaceName,
} from "@/lib/i18n/project-name-translations";
import type { Folder as FolderType, ProjectKind, Space } from "@/lib/types";

type DirectoryTab = "clients" | "internal" | "operations" | "archived";
type DirectorySort = "name" | "newest" | "due";
type DirectoryView = "list" | "cards";

type DirectoryProject = {
  id: string;
  name: string;
  status: "active" | "archived";
  kind: ProjectKind;
  due_date: string | null;
  created_at: string;
  space_id?: string | null;
  folder_id?: string | null;
  company_id?: string | null;
  space: { id: string; name: string; icon: string | null } | null;
  folder: { id: string; name: string; icon: string | null } | null;
  company: { id: string; name: string } | null;
  totalTaskCount: number;
  openTaskCount: number;
};

type ClientDirectoryItem = {
  type: "client";
  id: string;
  name: string;
  projectCount: number;
  totalTaskCount: number;
  openTaskCount: number;
  projects: DirectoryProject[];
};

type ProjectDirectoryItem = {
  type: "project";
  project: DirectoryProject;
};

type DirectoryResponse = {
  tab: DirectoryTab;
  counts: Record<DirectoryTab, number>;
  items: Array<ClientDirectoryItem | ProjectDirectoryItem>;
  nextCursor: string | null;
  capabilities?: {
    canCreateProject?: boolean;
    canManageProjects?: boolean;
  };
};

const DIRECTORY_TABS: DirectoryTab[] = [
  "clients",
  "internal",
  "operations",
  "archived",
];

function parseTab(value: string | null): DirectoryTab {
  return DIRECTORY_TABS.includes(value as DirectoryTab)
    ? (value as DirectoryTab)
    : "clients";
}

function parseSort(value: string | null): DirectorySort {
  return value === "newest" || value === "due" ? value : "name";
}

function parseView(value: string | null): DirectoryView | null {
  return value === "cards" || value === "list" ? value : null;
}

function flattenProjects(
  items: DirectoryResponse["items"],
): DirectoryProject[] {
  return items.flatMap((item) =>
    item.type === "client" ? item.projects : [item.project],
  );
}

export default function ProjectDirectory() {
  const { t, language } = useLanguage();
  const user = useAppUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const tab = parseTab(searchParams.get("tab"));
  const query = searchParams.get("q")?.trim() ?? "";
  const spaceId = searchParams.get("space")?.trim() ?? "";
  const folderId = searchParams.get("folder")?.trim() ?? "";
  const sort = parseSort(searchParams.get("sort"));
  const requestedView = parseView(searchParams.get("view"));

  const [searchDraft, setSearchDraft] = useState(query);
  const [storedView, setStoredView] = useState<DirectoryView>("list");
  const [data, setData] = useState<DirectoryResponse | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [folders, setFolders] = useState<FolderType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedClients, setExpandedClients] = useState<Set<string>>(
    new Set(),
  );
  const [showNew, setShowNew] = useState(false);
  const [moveProjectId, setMoveProjectId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(
    null,
  );
  const directoryRequestId = useRef(0);
  const urlParamsRef = useRef(searchParams.toString());
  const pendingQueryRef = useRef<string | undefined>(undefined);

  const view = requestedView ?? storedView;
  const viewPreferenceKey = `upflow.projects.view:${user?.currentWorkspaceId ?? "none"}:${user?.id ?? "anonymous"}`;

  const replaceParams = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(urlParamsRef.current);
      for (const [key, value] of Object.entries(updates)) {
        if (!value) next.delete(key);
        else next.set(key, value);
      }
      const suffix = next.toString();
      urlParamsRef.current = suffix;
      router.replace(suffix ? `${pathname}?${suffix}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router],
  );

  useEffect(() => {
    urlParamsRef.current = searchParams.toString();
  }, [searchParams]);

  useEffect(() => {
    if (pendingQueryRef.current === query) {
      pendingQueryRef.current = undefined;
      return;
    }
    setSearchDraft(query);
  }, [query]);

  useEffect(() => {
    if (requestedView || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(viewPreferenceKey);
    if (saved === "cards" || saved === "list") setStoredView(saved);
  }, [requestedView, viewPreferenceKey]);

  useEffect(() => {
    if (searchDraft.trim() === query) return;
    const timer = window.setTimeout(() => {
      const nextQuery = searchDraft.trim();
      pendingQueryRef.current = nextQuery;
      replaceParams({ q: nextQuery || null });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, replaceParams, searchDraft]);

  useEffect(() => {
    Promise.all([
      fetch("/api/spaces?limit=500").then((response) => response.json()),
      fetch("/api/folders?limit=500").then((response) => response.json()),
    ])
      .then(([spacePayload, folderPayload]) => {
        setSpaces((spacePayload as { items?: Space[] }).items ?? []);
        setFolders((folderPayload as { items?: FolderType[] }).items ?? []);
      })
      .catch(() => {
        setSpaces([]);
        setFolders([]);
      });
  }, []);

  const buildDirectoryUrl = useCallback(
    (cursor?: string | null) => {
      const params = new URLSearchParams({ tab, sort, limit: "30" });
      if (query) params.set("q", query);
      if (spaceId) params.set("space", spaceId);
      if (folderId) params.set("folder", folderId);
      if (cursor) params.set("cursor", cursor);
      return `/api/projects/directory?${params.toString()}`;
    },
    [folderId, query, sort, spaceId, tab],
  );

  const loadDirectory = useCallback(
    async (options?: { append?: boolean; cursor?: string | null }) => {
      const requestId = ++directoryRequestId.current;
      const append = Boolean(options?.append);
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setLoadError(false);
        setData(null);
      }
      try {
        const response = await fetch(buildDirectoryUrl(options?.cursor), {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("directory request failed");
        const payload = (await response.json()) as DirectoryResponse;
        if (requestId !== directoryRequestId.current) return;
        setData((current) => {
          if (!append || !current) return payload;
          return {
            ...payload,
            items: [...current.items, ...payload.items],
          };
        });
        if (query && payload.items.some((item) => item.type === "client")) {
          setExpandedClients((current) => {
            const next = new Set(current);
            for (const item of payload.items) {
              if (item.type === "client") next.add(item.id);
            }
            return next;
          });
        }
      } catch {
        if (requestId !== directoryRequestId.current) return;
        if (!append) setLoadError(true);
        else toast.error(t("projects.directoryLoadFailed"));
      } finally {
        if (requestId === directoryRequestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [buildDirectoryUrl, query, t],
  );

  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory, refreshKey]);

  const canCreateProject = data?.capabilities
    ? Boolean(data.capabilities.canCreateProject)
    : Boolean(
        user?.isSuperAdmin ||
        user?.currentRole === "owner" ||
        user?.currentRole === "admin",
      );
  const canManageProjects = Boolean(
    data?.capabilities?.canManageProjects ||
    user?.isSuperAdmin ||
    user?.currentRole === "owner" ||
    user?.currentRole === "admin",
  );

  const visibleFolders = useMemo(
    () =>
      spaceId
        ? folders.filter((folder) => folder.space_id === spaceId)
        : folders,
    [folders, spaceId],
  );
  const selectedProject = useMemo(
    () =>
      moveProjectId && data
        ? (flattenProjects(data.items).find(
            (project) => project.id === moveProjectId,
          ) ?? null)
        : null,
    [data, moveProjectId],
  );

  const setView = (nextView: DirectoryView) => {
    setStoredView(nextView);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(viewPreferenceKey, nextView);
    }
    replaceParams({ view: nextView });
  };

  const clearFilters = () => {
    setSearchDraft("");
    replaceParams({ q: null, space: null, folder: null, sort: null });
  };

  const moveProject = async (
    projectId: string,
    targetSpaceId: string | null,
  ) => {
    try {
      const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ space_id: targetSpaceId, folder_id: null }),
      });
      if (!response.ok) throw new Error();
      toast.success(t("projects.moved"));
      setMoveProjectId(null);
      setRefreshKey((value) => value + 1);
      window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
    } catch {
      toast.error(t("projects.couldNotMove"));
    }
  };

  const deleteProject = async (project: DirectoryProject) => {
    if (deletingProjectId) return;
    if (!window.confirm(t("projects.deleteConfirm", { name: project.name })))
      return;
    setDeletingProjectId(project.id);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error || t("projects.couldNotDelete"));
      }
      toast.success(t("projects.deleted"));
      setRefreshKey((value) => value + 1);
      window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("projects.couldNotDelete"),
      );
    } finally {
      setDeletingProjectId(null);
    }
  };

  const counts = data?.counts ?? {
    clients: 0,
    internal: 0,
    operations: 0,
    archived: 0,
  };
  const hasFilters = Boolean(query || spaceId || folderId || sort !== "name");
  const isEmpty = !loading && !loadError && (data?.items.length ?? 0) === 0;

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <section className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {t("projects.directoryEyebrow")}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">
          {t("projects.directoryTitle")}
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          {t("projects.directorySubtitle")}
        </p>
      </section>

      <div
        className="border-b border-border"
        role="tablist"
        aria-label={t("projects.directoryTabs")}
      >
        <div className="flex gap-1 overflow-x-auto pb-px">
          {DIRECTORY_TABS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={tab === item}
              onClick={() =>
                replaceParams({ tab: item === "clients" ? null : item })
              }
              className={cn(
                "relative flex min-h-11 shrink-0 items-center gap-2 rounded-t-lg px-3 text-sm font-semibold text-muted-foreground transition hover:bg-accent/60 hover:text-foreground",
                tab === item &&
                  "text-primary after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:bg-primary",
              )}
            >
              {t(`projects.tab.${item}`)}
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                {counts[item]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <section className="sticky top-20 z-20 -mx-1 mt-4 rounded-2xl border border-border bg-background/95 p-3 shadow-sm backdrop-blur-xl supports-[backdrop-filter]:bg-background/85">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <span className="sr-only">{t("projects.searchLabel")}</span>
            <input
              value={searchDraft}
              onChange={(event) => setSearchDraft(event.target.value)}
              placeholder={t("projects.searchPlaceholder")}
              className="h-11 w-full rounded-xl border border-input bg-card pl-10 pr-10 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {searchDraft && (
              <button
                type="button"
                onClick={() => setSearchDraft("")}
                aria-label={t("projects.clearSearch")}
                className="absolute right-2 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </label>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:flex">
            <label>
              <span className="sr-only">{t("projects.filterSpace")}</span>
              <select
                value={spaceId}
                onChange={(event) =>
                  replaceParams({
                    space: event.target.value || null,
                    folder: null,
                  })
                }
                className="h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 xl:w-44"
              >
                <option value="">{t("projects.allSpaces")}</option>
                {spaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {localizeSpaceName(space.name, language)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="sr-only">{t("projects.filterFolder")}</span>
              <select
                value={folderId}
                onChange={(event) =>
                  replaceParams({ folder: event.target.value || null })
                }
                className="h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 xl:w-44"
              >
                <option value="">{t("projects.allFolders")}</option>
                {visibleFolders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="col-span-2 sm:col-span-1">
              <span className="sr-only">{t("projects.sortLabel")}</span>
              <select
                value={sort}
                onChange={(event) =>
                  replaceParams({
                    sort:
                      event.target.value === "name" ? null : event.target.value,
                  })
                }
                className="h-11 w-full min-w-0 rounded-xl border border-input bg-card px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 xl:w-40"
              >
                <option value="name">{t("projects.sort.name")}</option>
                <option value="newest">{t("projects.sort.newest")}</option>
                <option value="due">{t("projects.sort.due")}</option>
              </select>
            </label>
          </div>

          <div className="flex items-center justify-between gap-2 xl:justify-start">
            {hasFilters && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <X className="h-4 w-4" /> {t("projects.clearFilters")}
              </button>
            )}
            <div className="ml-auto flex rounded-xl border border-border bg-muted/40 p-1 xl:ml-0">
              <button
                type="button"
                onClick={() => setView("list")}
                aria-label={t("projects.listView")}
                aria-pressed={view === "list"}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition",
                  view === "list" && "bg-card text-foreground shadow-sm",
                )}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView("cards")}
                aria-label={t("projects.cardView")}
                aria-pressed={view === "cards"}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition",
                  view === "cards" && "bg-card text-foreground shadow-sm",
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-4" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <DirectorySkeleton view={view} />
        ) : loadError ? (
          <DirectoryError onRetry={() => void loadDirectory()} />
        ) : isEmpty ? (
          <DirectoryEmpty
            filtered={hasFilters}
            canCreate={canCreateProject}
            onClear={clearFilters}
            onCreate={() => setShowNew(true)}
          />
        ) : tab === "clients" ? (
          <div
            className={cn(
              view === "cards" && "grid items-start gap-4 lg:grid-cols-2",
            )}
          >
            {data?.items.map((item) =>
              item.type === "client" ? (
                <ClientGroup
                  key={item.id}
                  item={item}
                  expanded={expandedClients.has(item.id)}
                  view={view}
                  canManage={canManageProjects}
                  deletingProjectId={deletingProjectId}
                  onToggle={() =>
                    setExpandedClients((current) => {
                      const next = new Set(current);
                      if (next.has(item.id)) next.delete(item.id);
                      else next.add(item.id);
                      return next;
                    })
                  }
                  onMove={setMoveProjectId}
                  onDelete={(project) => void deleteProject(project)}
                />
              ) : null,
            )}
          </div>
        ) : (
          <div
            className={cn(
              view === "list"
                ? "space-y-2"
                : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
            )}
          >
            {data?.items.map((item) =>
              item.type === "project" ? (
                <ProjectRow
                  key={item.project.id}
                  project={item.project}
                  view={view}
                  canManage={canManageProjects}
                  deleting={deletingProjectId === item.project.id}
                  onMove={() => setMoveProjectId(item.project.id)}
                  onDelete={() => void deleteProject(item.project)}
                />
              ) : null,
            )}
          </div>
        )}

        {!loading && data?.nextCursor && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              disabled={loadingMore}
              onClick={() =>
                void loadDirectory({ append: true, cursor: data.nextCursor })
              }
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground transition hover:border-primary/50 hover:bg-accent disabled:opacity-60"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("projects.loadMore")}
            </button>
          </div>
        )}
      </section>

      <NewProjectDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => {
          setShowNew(false);
          toast.success(t("projects.created"));
          setRefreshKey((value) => value + 1);
        }}
      />

      {selectedProject && (
        <MoveProjectDialog
          project={selectedProject}
          spaces={spaces}
          onClose={() => setMoveProjectId(null)}
          onMove={(targetSpaceId) =>
            void moveProject(selectedProject.id, targetSpaceId)
          }
        />
      )}
    </div>
  );
}

function ClientGroup({
  item,
  expanded,
  view,
  canManage,
  deletingProjectId,
  onToggle,
  onMove,
  onDelete,
}: {
  item: ClientDirectoryItem;
  expanded: boolean;
  view: DirectoryView;
  canManage: boolean;
  deletingProjectId: string | null;
  onToggle: () => void;
  onMove: (projectId: string) => void;
  onDelete: (project: DirectoryProject) => void;
}) {
  const { t } = useLanguage();
  return (
    <article
      className={cn(
        "border border-border bg-card",
        view === "list" ? "mb-2 rounded-xl" : "rounded-2xl",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-16 w-full items-center gap-3 rounded-xl px-4 py-3 text-left transition hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold text-foreground">
            {item.name}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {t("projects.clientSummary", {
              projects: item.projectCount,
              open: item.openTaskCount,
              total: item.totalTaskCount,
            })}
          </span>
        </span>
        {expanded ? (
          <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div
          className={cn(
            "border-t border-border p-2",
            view === "cards" && "space-y-2",
          )}
        >
          {item.projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              view="list"
              compact
              canManage={canManage}
              deleting={deletingProjectId === project.id}
              onMove={() => onMove(project.id)}
              onDelete={() => onDelete(project)}
            />
          ))}
        </div>
      )}
    </article>
  );
}

function ProjectRow({
  project,
  view,
  compact = false,
  canManage,
  deleting,
  onMove,
  onDelete,
}: {
  project: DirectoryProject;
  view: DirectoryView;
  compact?: boolean;
  canManage: boolean;
  deleting: boolean;
  onMove: () => void;
  onDelete: () => void;
}) {
  const { t, language } = useLanguage();
  const projectDisplayName = localizeProjectName(project.name, language);
  const context = [
    project.company?.name,
    project.space?.name
      ? localizeSpaceName(project.space.name, language)
      : null,
    project.folder?.name,
  ]
    .filter(Boolean)
    .join(" › ");
  const card = view === "cards";

  return (
    <article
      data-project-id={project.id}
      className={cn(
        "group relative border border-border bg-card transition hover:border-primary/35 hover:shadow-sm focus-within:border-primary/50",
        card ? "rounded-2xl p-4" : "rounded-xl px-3 py-3 sm:px-4",
        compact &&
          "border-transparent bg-transparent hover:bg-accent/50 hover:shadow-none",
        deleting && "pointer-events-none opacity-50",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 gap-3",
          card ? "items-start" : "items-center",
        )}
      >
        <span
          className={cn(
            "hidden shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground sm:inline-flex",
            card ? "h-9 w-9" : "h-8 w-8",
          )}
        >
          <Folder className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Link
              href={`/projects/${project.id}`}
              className="min-w-0 truncate font-semibold text-foreground outline-none transition hover:text-primary focus-visible:rounded focus-visible:ring-2 focus-visible:ring-primary"
              title={projectDisplayName}
            >
              {projectDisplayName}
            </Link>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-bold",
                project.status === "active"
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {t(`projects.status.${project.status}`)}
            </span>
          </div>
          <p
            className="mt-1 truncate text-xs text-muted-foreground"
            title={context || t("projects.noLocation")}
          >
            {context || t("projects.noLocation")}
          </p>
          <div
            className={cn(
              "mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground",
              !card && "sm:mt-1.5",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <CheckSquare2 className="h-3.5 w-3.5" />
              {t("projects.taskProgress", {
                open: project.openTaskCount,
                total: project.totalTaskCount,
              })}
            </span>
            {project.due_date && (
              <span className="inline-flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(project.due_date, language)}
              </span>
            )}
          </div>
        </div>
        {canManage && (
          <details className="relative shrink-0">
            <summary
              aria-label={t("projects.actionsFor", {
                name: projectDisplayName,
              })}
              className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary [&::-webkit-details-marker]:hidden"
            >
              <MoreHorizontal className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 top-11 z-30 min-w-40 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl">
              <button
                type="button"
                onClick={onMove}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-accent"
              >
                <Folder className="h-4 w-4" /> {t("projects.move")}
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" /> {t("common.delete")}
              </button>
            </div>
          </details>
        )}
      </div>
    </article>
  );
}

function DirectorySkeleton({ view }: { view: DirectoryView }) {
  return (
    <div
      className={cn(
        view === "list"
          ? "space-y-2"
          : "grid gap-4 sm:grid-cols-2 xl:grid-cols-3",
      )}
    >
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "animate-pulse rounded-xl border border-border bg-card",
            view === "list" ? "h-20" : "h-36",
          )}
        />
      ))}
    </div>
  );
}

function DirectoryError({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-10 text-center">
      <p className="font-semibold text-foreground">
        {t("projects.directoryLoadFailed")}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        {t("common.retry")}
      </button>
    </div>
  );
}

function DirectoryEmpty({
  filtered,
  canCreate,
  onClear,
  onCreate,
}: {
  filtered: boolean;
  canCreate: boolean;
  onClear: () => void;
  onCreate: () => void;
}) {
  const { t } = useLanguage();
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/50 px-5 py-16 text-center">
      <FolderOpen className="mx-auto h-11 w-11 text-muted-foreground/45" />
      <h2 className="mt-4 font-semibold text-foreground">
        {filtered ? t("projects.noProjectsFound") : t("projects.emptyTab")}
      </h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {filtered ? t("projects.adjustFilters") : t("projects.emptyTabHint")}
      </p>
      {filtered ? (
        <button
          type="button"
          onClick={onClear}
          className="mt-4 rounded-xl border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-accent"
        >
          {t("projects.clearFilters")}
        </button>
      ) : canCreate ? (
        <button
          type="button"
          onClick={onCreate}
          className="mt-4 inline-flex h-9 min-h-9 items-center justify-center rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t("projects.createProject")}
        </button>
      ) : null}
    </div>
  );
}

function MoveProjectDialog({
  project,
  spaces,
  onClose,
  onMove,
}: {
  project: DirectoryProject;
  spaces: Space[];
  onClose: () => void;
  onMove: (spaceId: string | null) => void;
}) {
  const { t, language } = useLanguage();
  const projectDisplayName = localizeProjectName(project.name, language);
  const [target, setTarget] = useState(project.space?.id ?? "");
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("projects.moveProject")}
        className="w-full max-w-sm rounded-2xl border border-border bg-popover p-5 text-popover-foreground shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="font-semibold text-foreground">
          {t("projects.moveProject")}
        </h2>
        <p className="mt-1 truncate text-xs text-muted-foreground">
          {projectDisplayName}
        </p>
        <label className="mt-5 block text-xs font-semibold text-foreground">
          {t("projects.space")}
          <select
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="mt-2 h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          >
            <option value="">{t("common.unassigned")}</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {localizeSpaceName(space.name, language)}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-accent"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() => onMove(target || null)}
            className="min-h-11 flex-1 rounded-xl bg-primary text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            {t("projects.move")}
          </button>
        </div>
      </div>
    </div>
  );
}
