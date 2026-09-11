"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Folder,
  FolderOpen,
  LayoutDashboard,
  Loader2,
} from "lucide-react";

import { useLanguage } from "@/components/language-provider";
import {
  PAGE_CONTENT_CLASS,
  PAGE_HEADER_CARD_CLASS,
} from "@/components/layout/page-content";
import ProjectPathBreadcrumbs from "@/components/projects/project-path-breadcrumbs";
import { getCachedJson, peekCachedJson } from "@/lib/client-cache";
import { prefetchProjectPage } from "@/lib/project-page-cache";
import { cn } from "@/lib/utils";
import {
  localizeProjectName,
  localizeSpaceName,
} from "@/lib/i18n/project-name-translations";

type WorkSpace = {
  id: string;
  name: string;
  icon: string | null;
  position: number;
};

type WorkFolder = {
  id: string;
  name: string;
  icon: string | null;
  space_id: string;
  parent_id: string | null;
  position: number;
};

type WorkProject = {
  id: string;
  name: string;
  space_id: string | null;
  folder_id: string | null;
  space: { id: string; name: string; icon: string | null } | null;
  folder: {
    id: string;
    name: string;
    icon: string | null;
    parent_id: string | null;
  } | null;
};

type WorkTask = {
  id: string;
  status: "todo" | "in_progress" | "done";
  project: WorkProject;
};

type WorkResponse = {
  spaces: WorkSpace[];
  folders: WorkFolder[];
  projects: WorkProject[];
  tasks: WorkTask[];
};

type Scope =
  | { type: "spaces"; id: null }
  | { type: "space"; id: string }
  | { type: "folder"; id: string };

type Translate = (
  key: string,
  vars?: Record<string, string | number>,
) => string;

const DIRECTORY_CACHE_KEY = "projects:personal-directory";

function projectTaskMeta(t: Translate, projects: number, tasks: number) {
  const projectLabel = t(
    projects === 1
      ? "projects.drilldown.projectCountOne"
      : "projects.drilldown.projectCount",
    { count: projects },
  );
  const taskLabel = t(
    tasks === 1
      ? "projects.drilldown.linkedTaskCountOne"
      : "projects.drilldown.linkedTaskCount",
    { count: tasks },
  );
  return `${projectLabel} · ${taskLabel}`;
}

function projectMeta(t: Translate, open: number, total: number) {
  const openLabel = t("projects.drilldown.openCount", { count: open });
  const taskLabel = t(
    total === 1
      ? "projects.drilldown.linkedTaskCountOne"
      : "projects.drilldown.linkedTaskCount",
    { count: total },
  );
  return `${openLabel} · ${taskLabel}`;
}

function parseScope(value: string | null): Scope {
  if (!value) return { type: "spaces", id: null };
  const [type, id] = value.split(":", 2);
  if (type === "space" && id) return { type, id };
  if (type === "folder" && id) return { type, id };
  return { type: "spaces", id: null };
}

export default function PersonalWorkspaceBoard() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const scope = parseScope(searchParams.get("scope"));
  const [data, setData] = useState<WorkResponse | null>(() =>
    peekCachedJson<WorkResponse>(DIRECTORY_CACHE_KEY),
  );
  const [loading, setLoading] = useState(
    () => !peekCachedJson<WorkResponse>(DIRECTORY_CACHE_KEY),
  );
  const [loadError, setLoadError] = useState(false);

  const loadWork = useCallback(async (force = false) => {
    if (!peekCachedJson<WorkResponse>(DIRECTORY_CACHE_KEY)) setLoading(true);
    setLoadError(false);
    try {
      const nextData = await getCachedJson<WorkResponse>(
        DIRECTORY_CACHE_KEY,
        "/api/projects/my-work",
        { ttlMs: 5_000, force },
      );
      setData(nextData);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWork();
  }, [loadWork]);

  const selectScope = useCallback(
    (next: Scope) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("relation");
      params.delete("q");
      if (next.type === "spaces") params.delete("scope");
      else params.set("scope", `${next.type}:${next.id}`);
      const suffix = params.toString();
      router.replace(suffix ? `${pathname}?${suffix}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const taskCountByProject = useMemo(() => {
    const counts = new Map<string, { total: number; open: number }>();
    for (const task of data?.tasks ?? []) {
      const current = counts.get(task.project.id) ?? { total: 0, open: 0 };
      current.total += 1;
      if (task.status !== "done") current.open += 1;
      counts.set(task.project.id, current);
    }
    return counts;
  }, [data?.tasks]);

  const relevantProjects = useMemo(
    () =>
      (data?.projects ?? []).filter(
        (project) => (taskCountByProject.get(project.id)?.total ?? 0) > 0,
      ),
    [data?.projects, taskCountByProject],
  );

  const folderDescendants = useMemo(() => {
    const children = new Map<string, string[]>();
    for (const folder of data?.folders ?? []) {
      if (!folder.parent_id) continue;
      children.set(folder.parent_id, [
        ...(children.get(folder.parent_id) ?? []),
        folder.id,
      ]);
    }

    const collect = (
      folderId: string,
      visited = new Set<string>(),
    ): Set<string> => {
      if (visited.has(folderId)) return new Set();
      const nextVisited = new Set(visited).add(folderId);
      const result = new Set([folderId]);
      for (const childId of children.get(folderId) ?? []) {
        for (const descendant of collect(childId, nextVisited))
          result.add(descendant);
      }
      return result;
    };

    return new Map(
      (data?.folders ?? []).map((folder) => [folder.id, collect(folder.id)]),
    );
  }, [data?.folders]);

  const folderHasLinkedProject = useCallback(
    (folderId: string) => {
      const descendants =
        folderDescendants.get(folderId) ?? new Set([folderId]);
      return relevantProjects.some((project) =>
        Boolean(project.folder_id && descendants.has(project.folder_id)),
      );
    },
    [folderDescendants, relevantProjects],
  );

  const selectedSpace =
    scope.type === "space"
      ? (data?.spaces.find((space) => space.id === scope.id) ?? null)
      : scope.type === "folder"
        ? (data?.spaces.find(
            (space) =>
              space.id ===
              data?.folders.find((folder) => folder.id === scope.id)?.space_id,
          ) ?? null)
        : null;
  const selectedFolder =
    scope.type === "folder"
      ? (data?.folders.find((folder) => folder.id === scope.id) ?? null)
      : null;

  const folderPath = useMemo(() => {
    if (!selectedFolder || !data) return [];
    const byId = new Map(data.folders.map((folder) => [folder.id, folder]));
    const path: WorkFolder[] = [];
    const visited = new Set<string>();
    let current: WorkFolder | undefined = selectedFolder;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return path;
  }, [data, selectedFolder]);

  if (loading) return <LoadingState />;
  if (loadError) return <ErrorState onRetry={() => void loadWork(true)} />;

  if (scope.type === "spaces") {
    const spaces = (data?.spaces ?? []).filter((space) =>
      relevantProjects.some((project) => project.space_id === space.id),
    );
    return (
      <DirectoryShell
        eyebrow={t("projects.drilldown.eyebrow")}
        title={t("projects.drilldown.spacesTitle")}
        subtitle={t("projects.drilldown.spacesSubtitle")}
        backHref="/"
        backLabel={t("projects.drilldown.backToDashboard")}
        breadcrumbs={
          <ProjectPathBreadcrumbs
            ariaLabel={t("projects.drilldown.breadcrumbs")}
            items={[{ label: t("projects.drilldown.spaces"), current: true }]}
          />
        }
      >
        {spaces.length > 0 ? (
          <FolderGrid>
            {spaces.map((space) => {
              const projects = relevantProjects.filter(
                (project) => project.space_id === space.id,
              );
              const taskCount = projects.reduce(
                (sum, project) =>
                  sum + (taskCountByProject.get(project.id)?.total ?? 0),
                0,
              );
              return (
                <DirectoryFolderCard
                  key={space.id}
                  title={localizeSpaceName(space.name, language)}
                  meta={projectTaskMeta(t, projects.length, taskCount)}
                  onClick={() => selectScope({ type: "space", id: space.id })}
                />
              );
            })}
          </FolderGrid>
        ) : (
          <EmptyState
            title={t("projects.drilldown.emptySpaces")}
            hint={t("projects.drilldown.emptySpacesHint")}
          />
        )}
      </DirectoryShell>
    );
  }

  if (!selectedSpace || (scope.type === "folder" && !selectedFolder)) {
    return (
      <DirectoryShell
        eyebrow={t("projects.drilldown.eyebrow")}
        title={t("projects.drilldown.notFound")}
        subtitle={t("projects.drilldown.notFoundHint")}
        backHref="/projects"
        backLabel={t("projects.drilldown.backToSpaces")}
      >
        <button
          type="button"
          onClick={() => selectScope({ type: "spaces", id: null })}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-accent"
        >
          <ArrowLeft className="h-4 w-4" />{" "}
          {t("projects.drilldown.backToSpaces")}
        </button>
      </DirectoryShell>
    );
  }

  const currentFolderId = selectedFolder?.id ?? null;
  const childFolders = (data?.folders ?? []).filter(
    (folder) =>
      folder.space_id === selectedSpace.id &&
      folder.parent_id === currentFolderId &&
      folderHasLinkedProject(folder.id),
  );
  const directProjects = relevantProjects.filter(
    (project) =>
      project.space_id === selectedSpace.id &&
      project.folder_id === currentFolderId,
  );
  const parentHref = selectedFolder?.parent_id
    ? `/projects?scope=folder:${selectedFolder.parent_id}`
    : selectedFolder
      ? `/projects?scope=space:${selectedSpace.id}`
      : "/projects";
  const parentLabel = selectedFolder
    ? t("projects.drilldown.backToPreviousLevel")
    : t("projects.drilldown.backToSpaces");

  return (
    <DirectoryShell
      eyebrow={t("projects.drilldown.eyebrow")}
      title={selectedFolder?.name ?? selectedSpace.name}
      subtitle={
        selectedFolder
          ? t("projects.drilldown.folderSubtitle")
          : t("projects.drilldown.projectsSubtitle")
      }
      backHref={parentHref}
      backLabel={parentLabel}
      breadcrumbs={
        <Breadcrumbs
          space={selectedSpace}
          folders={folderPath}
          onSpaces={() => selectScope({ type: "spaces", id: null })}
          onSpace={() => selectScope({ type: "space", id: selectedSpace.id })}
          onFolder={(id) => selectScope({ type: "folder", id })}
        />
      }
    >
      {childFolders.length > 0 || directProjects.length > 0 ? (
        <FolderGrid>
          {childFolders.map((folder) => {
            const descendants =
              folderDescendants.get(folder.id) ?? new Set([folder.id]);
            const projects = relevantProjects.filter(
              (project) =>
                project.folder_id && descendants.has(project.folder_id),
            );
            const taskCount = projects.reduce(
              (sum, project) =>
                sum + (taskCountByProject.get(project.id)?.total ?? 0),
              0,
            );
            return (
              <DirectoryFolderCard
                key={folder.id}
                title={folder.name}
                meta={projectTaskMeta(t, projects.length, taskCount)}
                onClick={() => selectScope({ type: "folder", id: folder.id })}
              />
            );
          })}
          {directProjects.map((project) => {
            const count = taskCountByProject.get(project.id) ?? {
              total: 0,
              open: 0,
            };
            return (
              <ProjectCard
                key={project.id}
                project={project}
                displayName={localizeProjectName(project.name, language)}
                meta={projectMeta(t, count.open, count.total)}
                onPrefetch={() => {
                  router.prefetch(`/projects/${project.id}`);
                  void prefetchProjectPage(project.id);
                }}
              />
            );
          })}
        </FolderGrid>
      ) : (
        <EmptyState
          title={t("projects.drilldown.emptyLevel")}
          hint={t("projects.drilldown.emptyLevelHint")}
        />
      )}
    </DirectoryShell>
  );
}

function DirectoryShell({
  eyebrow,
  title,
  subtitle,
  backHref,
  backLabel,
  breadcrumbs,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  backHref: string;
  backLabel: string;
  breadcrumbs?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={PAGE_CONTENT_CLASS}>
      <Link
        href={backHref}
        className="mb-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-semibold text-foreground shadow-sm transition hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        {backLabel}
      </Link>
      {breadcrumbs && <div className="mb-4">{breadcrumbs}</div>}
      <header className={PAGE_HEADER_CARD_CLASS}>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {eyebrow}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {title}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {subtitle}
        </p>
      </header>
      {children}
    </div>
  );
}

function FolderGrid({ children }: { children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 xl:grid-cols-4 2xl:grid-cols-5">
      {children}
    </section>
  );
}

function DirectoryFolderCard({
  title,
  meta,
  onClick,
}: {
  title: string;
  meta: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex min-h-40 flex-col items-center justify-center rounded-2xl border border-border bg-card/70 px-4 py-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="inline-flex h-16 w-20 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary/15">
        <Folder className="h-9 w-9 fill-current/10" />
      </span>
      <span className="mt-4 line-clamp-2 text-sm font-semibold text-foreground">
        {title}
      </span>
      <span className="mt-1 text-[11px] leading-4 text-muted-foreground">
        {meta}
      </span>
    </button>
  );
}

function ProjectCard({
  project,
  displayName,
  meta,
  onPrefetch,
}: {
  project: WorkProject;
  displayName: string;
  meta: string;
  onPrefetch: () => void;
}) {
  return (
    <Link
      href={`/projects/${project.id}`}
      prefetch
      onPointerEnter={onPrefetch}
      onFocus={onPrefetch}
      onTouchStart={onPrefetch}
      className="group flex min-h-40 flex-col items-center justify-center rounded-2xl border border-border bg-card/70 px-4 py-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40 hover:bg-accent/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="inline-flex h-16 w-20 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-400 transition group-hover:bg-violet-500/15">
        <LayoutDashboard className="h-8 w-8" />
      </span>
      <span className="mt-4 line-clamp-2 text-sm font-semibold text-foreground">
        {displayName}
      </span>
      <span className="mt-1 text-[11px] leading-4 text-muted-foreground">
        {meta}
      </span>
    </Link>
  );
}

function Breadcrumbs({
  space,
  folders,
  onSpaces,
  onSpace,
  onFolder,
}: {
  space: WorkSpace;
  folders: WorkFolder[];
  onSpaces: () => void;
  onSpace: () => void;
  onFolder: (id: string) => void;
}) {
  const { t, language } = useLanguage();
  return (
    <ProjectPathBreadcrumbs
      ariaLabel={t("projects.drilldown.breadcrumbs")}
      items={[
        { label: t("projects.drilldown.spaces"), onClick: onSpaces },
        {
          label: localizeSpaceName(space.name, language),
          onClick: onSpace,
          current: folders.length === 0,
        },
        ...folders.map((folder, index) => ({
          label: folder.name,
          onClick: () => onFolder(folder.id),
          current: index === folders.length - 1,
        })),
      ]}
    />
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 px-6 py-14 text-center">
      <FolderOpen className="mx-auto h-10 w-10 text-muted-foreground/70" />
      <p className="mt-3 font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
    </div>
  );
}

function LoadingState() {
  const { t } = useLanguage();
  return (
    <div className="mx-4 my-6 flex min-h-80 items-center justify-center rounded-2xl border border-border bg-card/50 sm:mx-6 lg:mx-8">
      <Loader2 className="mr-2 h-5 w-5 animate-spin text-primary" />
      <span className="text-sm text-muted-foreground">
        {t("common.loading")}
      </span>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useLanguage();
  return (
    <div className="mx-4 my-6 rounded-2xl border border-destructive/30 bg-destructive/5 px-6 py-12 text-center sm:mx-6 lg:mx-8">
      <p className="font-semibold text-foreground">
        {t("projects.myWork.loadFailed")}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
      >
        {t("projects.myWork.tryAgain")}
      </button>
    </div>
  );
}
