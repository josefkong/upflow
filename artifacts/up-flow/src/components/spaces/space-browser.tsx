"use client";

import Link from "next/link";
import { ArrowRight, Folder, FolderPlus, List, ListPlus } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import Header from "@/components/layout/header";
import type { ContainerList } from "@/components/spaces/space-page-types";
import type { Folder as FolderT } from "@/lib/types";
import { cn } from "@/lib/utils";

export function BrowseTab({
  empty,
  rootFolders,
  projects,
  focusedProjectId,
  canManageStructure,
  onNewFolder,
  onNewList,
}: {
  empty: boolean;
  rootFolders: FolderT[];
  projects: ContainerList[];
  focusedProjectId?: string;
  canManageStructure: boolean;
  onNewFolder: () => void;
  onNewList: () => void;
}) {
  const { t } = useLanguage();

  if (empty) {
    return (
      <section className="glass rounded-xl p-10 text-center">
        <Folder className="mx-auto h-10 w-10 text-muted-foreground" />
        <h3 className="mt-4 text-base font-semibold text-foreground">
          {t("space.emptyTitle")}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("space.emptyBody")}
        </p>
        {canManageStructure && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button
              onClick={onNewFolder}
              className="inline-flex h-9 min-h-9 items-center gap-2 rounded-xl border border-white/10 px-3.5 text-xs font-semibold text-foreground hover:bg-white/10"
            >
              <FolderPlus className="h-4 w-4" />
              {t("folder.newFolder")}
            </button>
            <button
              onClick={onNewList}
              className="inline-flex h-9 min-h-9 items-center gap-2 rounded-xl bg-primary px-3.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <ListPlus className="h-4 w-4" />
              {t("folder.newList")}
            </button>
          </div>
        )}
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {rootFolders.length > 0 && (
        <ContainerSection title={t("folder.folders")}>
          {rootFolders.map((folder) => (
            <ContainerTile
              key={folder.id}
              href={`/folders/${folder.id}`}
              icon={<Folder className="h-5 w-5" />}
              name={folder.name}
            />
          ))}
        </ContainerSection>
      )}

      {projects.length > 0 && (
        <ContainerSection title={t("folder.lists")}>
          {projects.map((project) => (
            <ContainerTile
              key={project.id}
              href={`/projects/${project.id}`}
              icon={<List className="h-5 w-5" />}
              name={project.name}
              active={focusedProjectId === project.id}
            />
          ))}
        </ContainerSection>
      )}
    </div>
  );
}

export function DashboardSkeleton() {
  const { t } = useLanguage();

  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">{t("space.loadingDashboard")}</span>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl bg-white/5" />
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-white/5" />
        ))}
      </div>
    </div>
  );
}

export function ContainerSkeleton({ title }: { title: string }) {
  const { t } = useLanguage();

  return (
    <>
      <Header title={title} />
      <div className="space-y-6 p-4 sm:p-6" role="status" aria-busy="true">
        <span className="sr-only">{t("common.loading")}</span>
        <div className="glass rounded-xl p-5">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 animate-pulse rounded-lg bg-white/5" />
            <div className="flex-1 space-y-2">
              <div className="h-6 w-48 animate-pulse rounded bg-white/5" />
              <div className="h-3 w-36 animate-pulse rounded bg-white/5" />
            </div>
          </div>
        </div>
        <DashboardSkeleton />
      </div>
    </>
  );
}

function ContainerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase text-muted-foreground">
        {title}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function ContainerTile({
  href,
  icon,
  name,
  active = false,
}: {
  href: string;
  icon: React.ReactNode;
  name: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-3 rounded-lg border border-white/5 bg-white/[0.02] px-4 py-3",
        "transition-colors hover:border-white/10 hover:bg-white/5",
        active &&
          "border-blue-300/35 bg-blue-500/10 shadow-[0_0_22px_rgba(59,130,246,0.16)]",
      )}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-muted-foreground group-hover:text-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {name}
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
    </Link>
  );
}
