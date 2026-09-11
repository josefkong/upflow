"use client";

import { useEffect, useState } from "react";
import { notFound, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Folder, FolderPlus, List, ListPlus, RefreshCcw } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import Header from "@/components/layout/header";
import { FolderDialog, NewListDialog } from "@/components/layout/sidebar/dialogs";
import type { Folder as FolderT, Project, Space } from "@/lib/types";
import { cn } from "@/lib/utils";

type ContainerList = Pick<Project, "id" | "name">;

interface FolderContainerData {
  folder: FolderT;
  space: Space;
  breadcrumbs: { id: string; name: string; icon: string | null }[];
  children: FolderT[];
  projects: ContainerList[];
}

export default function FolderContainerPage() {
  const { t } = useLanguage();
  const params = useParams();
  const searchParams = useSearchParams();
  const id = (params?.id ?? "") as string;
  const focusedListId = searchParams?.get("list") ?? "";
  const [data, setData] = useState<FolderContainerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFoundState, setNotFoundState] = useState(false);
  const [showNewList, setShowNewList] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);

  const loadData = async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/folders/${id}`);
      if (res.status === 404) {
        setNotFoundState(true);
        return;
      }
      if (!res.ok) {
        throw new Error(t("folder.loadErrorTitle"));
      }
      setData((await res.json()) as FolderContainerData);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("folder.loadErrorTitle"));
    } finally {
      if (!options?.silent) setLoading(false);
    }
  };

  const refreshAfterCreate = () => {
    window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
    loadData({ silent: true });
  };

  useEffect(() => {
    if (!id) return;
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (notFoundState) {
    notFound();
  }

  if (loading) {
    return <FolderSkeleton />;
  }

  if (error || !data) {
    return (
      <>
        <Header title={t("folder.title")} />
        <div className="p-4 sm:p-6">
          <div className="max-w-lg rounded-xl p-4 glass sm:p-6">
            <h2 className="text-lg font-semibold text-foreground">
              {t("folder.loadErrorTitle")}
            </h2>
            <p className="text-sm text-muted-foreground mt-2">
              {t("folder.loadErrorBody")}
            </p>
            <button
              onClick={() => loadData()}
              className="mt-4 inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-medium px-4 py-2 rounded-lg"
            >
              <RefreshCcw className="w-4 h-4" />
              {t("common.retry")}
            </button>
          </div>
        </div>
      </>
    );
  }

  const { folder, space, breadcrumbs, children, projects } = data;
  const isEmpty = children.length === 0 && projects.length === 0;

  return (
    <>
      <Header title={folder.name} />
      <div className="space-y-6 overflow-x-hidden p-4 sm:p-6">
        <section className="rounded-xl p-4 glass sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/15 text-primary flex-shrink-0">
                <Folder className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Link href={`/spaces/${space.id}`} className="hover:text-foreground">
                    {space.name}
                  </Link>
                  {breadcrumbs.map((crumb) => (
                    <span key={crumb.id} className="inline-flex items-center gap-2">
                      <span>/</span>
                      <Link href={`/folders/${crumb.id}`} className="hover:text-foreground">
                        {crumb.name}
                      </Link>
                    </span>
                  ))}
                  <span>{folder.name}</span>
                </div>
                <h2 className="break-words text-2xl font-bold text-foreground">
                  {folder.name}
                </h2>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setShowNewFolder(true)}
                className="inline-flex h-9 min-h-9 items-center gap-2 rounded-xl border border-white/10 px-3.5 text-xs font-semibold text-foreground transition-colors hover:bg-white/10"
              >
                <FolderPlus className="w-4 h-4" />
                {t("folder.newFolder")}
              </button>
              <button
                onClick={() => setShowNewList(true)}
                className="inline-flex h-9 min-h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
              >
                <ListPlus className="w-4 h-4" />
                {t("folder.newList")}
              </button>
            </div>
          </div>
        </section>

        {isEmpty ? (
          <section className="glass rounded-xl p-10 text-center">
            <List className="w-10 h-10 mx-auto text-muted-foreground" />
            <h3 className="mt-4 text-base font-semibold text-foreground">
              {t("folder.emptyTitle")}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("folder.emptyBody")}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                onClick={() => setShowNewFolder(true)}
                className="inline-flex h-9 min-h-9 items-center gap-2 rounded-xl border border-white/10 px-3.5 text-xs font-semibold text-foreground hover:bg-white/10"
              >
                <FolderPlus className="w-4 h-4" />
                {t("folder.newFolder")}
              </button>
              <button
                onClick={() => setShowNewList(true)}
                className="inline-flex h-9 min-h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
              >
                <ListPlus className="w-4 h-4" />
                {t("folder.newList")}
              </button>
            </div>
          </section>
        ) : (
          <div className="space-y-6">
            {children.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">
                  {t("folder.folders")}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {children.map((child) => (
                    <Link
                      key={child.id}
                      href={`/folders/${child.id}`}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3",
                        "hover:bg-white/5 hover:border-white/10 transition-colors",
                      )}
                    >
                      <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 text-primary">
                        <Folder className="w-5 h-5" />
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
                        {child.name}
                      </span>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {projects.length > 0 && (
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase">
                  {t("folder.lists")}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className={cn(
                    "group flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3",
                    "hover:bg-white/5 hover:border-white/10 transition-colors",
                    focusedListId === project.id &&
                      "border-blue-300/35 bg-blue-500/10 shadow-[0_0_22px_rgba(59,130,246,0.16)]",
                  )}
                >
                  <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/5 text-muted-foreground group-hover:text-foreground">
                    <List className="w-5 h-5" />
                  </span>
                  <span className="flex-1 min-w-0 text-sm font-medium text-foreground truncate">
                    {project.name}
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                </Link>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      {showNewFolder && (
        <FolderDialog
          mode="create"
          target={{ kind: "folder", folder }}
          onClose={() => setShowNewFolder(false)}
          onSaved={() => {
            setShowNewFolder(false);
            refreshAfterCreate();
          }}
        />
      )}

      {showNewList && (
        <NewListDialog
          target={{ kind: "folder", folder }}
          onClose={() => setShowNewList(false)}
          onSaved={() => {
            setShowNewList(false);
            refreshAfterCreate();
          }}
        />
      )}
    </>
  );
}

function FolderSkeleton() {
  const { t } = useLanguage();
  return (
    <>
      <Header title={t("folder.title")} />
      <div className="space-y-6 p-4 sm:p-6" role="status" aria-busy="true">
        <span className="sr-only">{t("common.loading")}</span>
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-white/5 animate-pulse" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-40 bg-white/5 rounded animate-pulse" />
              <div className="h-6 w-48 bg-white/5 rounded animate-pulse" />
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 glass rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    </>
  );
}
