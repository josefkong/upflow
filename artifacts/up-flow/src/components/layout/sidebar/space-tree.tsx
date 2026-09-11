"use client";

import Link from "next/link";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  Plus,
  MoreHorizontal,
  Pencil,
  UserPlus,
  Trash2,
  Copy,
  EyeOff,
} from "lucide-react";
import type { DraggableProvidedDragHandleProps } from "@hello-pangea/dnd";
import type { Project, Space, Folder as FolderT } from "@/lib/types";
import { ProjectRow } from "@/components/layout/sidebar/project-row";
import { useLanguage } from "@/components/language-provider";
import { localizeSpaceName } from "@/lib/i18n/project-name-translations";
import { cn } from "@/lib/utils";
import { prefetchSpacePage } from "@/lib/space-page-cache";

const MAX_VISIBLE_CHILDREN = 8;

export interface NodeHandlers {
  collapsed: Record<string, boolean>;
  toggleCollapse: (id: string) => void;
  menuOpenId: string | null;
  setMenuOpenId: (updater: (id: string | null) => string | null) => void;
  pathname: string;
  onNavigate?: () => void;
  canManageWorkspace: boolean;
  loadPanel: (options?: { force?: boolean; query?: string }) => void;
  setMoveTarget: (p: Project) => void;
  setRenameTarget: (s: Space) => void;
  setCreateFolderTarget: (
    v: { kind: "space"; space: Space } | { kind: "folder"; folder: FolderT },
  ) => void;
  setRenameFolderTarget: (f: FolderT) => void;
  setCreateListFor: (
    v: { kind: "space"; space: Space } | { kind: "folder"; folder: FolderT },
  ) => void;
  setShareTarget: (s: Space) => void;
  handleHideSpace: (s: Space) => void;
  handleDeleteSpace: (s: Space) => void;
  handleDeleteFolder: (f: FolderT) => void;
  handleDuplicateFolder: (f: FolderT) => void;
}

interface SpaceNodeProps extends NodeHandlers {
  space: Space;
  dragHandleProps?: DraggableProvidedDragHandleProps | null;
  looseLists: Project[];
  foldersBySpace: FolderT[];
  childFoldersByParent: (id: string) => FolderT[];
  projectsByFolder: (id: string) => Project[];
  isSearching: boolean;
}

interface ProjectRowsProps {
  items: Project[];
  pathname: string;
  onNavigate?: () => void;
  canManageWorkspace: boolean;
  loadPanel: (options?: { force?: boolean; query?: string }) => void;
  setMoveTarget: (project: Project) => void;
}

function ProjectRows({
  items,
  pathname,
  onNavigate,
  canManageWorkspace,
  loadPanel,
  setMoveTarget,
}: ProjectRowsProps) {
  return (
    <div className="space-y-1 rounded-xl">
      {items.map((project) => (
        <ProjectRow
          key={project.id}
          project={project}
          href={`/projects/${project.id}`}
          onMove={() => setMoveTarget(project)}
          onNavigate={onNavigate}
          onDeleted={() => loadPanel({ force: true })}
          onDuplicated={() => loadPanel({ force: true })}
          isActive={pathname === `/projects/${project.id}`}
          canManageWorkspace={canManageWorkspace}
        />
      ))}
    </div>
  );
}

export function SpaceNode({
  space: sp,
  dragHandleProps,
  looseLists,
  foldersBySpace: spaceFolders,
  childFoldersByParent,
  projectsByFolder,
  isSearching,
  collapsed,
  toggleCollapse,
  menuOpenId,
  setMenuOpenId,
  pathname,
  onNavigate,
  canManageWorkspace,
  loadPanel,
  setMoveTarget,
  setRenameTarget,
  setCreateFolderTarget,
  setRenameFolderTarget,
  setCreateListFor,
  setShareTarget,
  handleHideSpace,
  handleDeleteSpace,
  handleDeleteFolder,
  handleDuplicateFolder,
}: SpaceNodeProps) {
  const { t, language } = useLanguage();
  const spaceDisplayName = localizeSpaceName(sp.name, language);
  const isCollapsed = !!collapsed[sp.id];
  const menuOpen = menuOpenId === sp.id;
  const isActive = pathname === `/spaces/${sp.id}`;
  const badgeCount = sp.flow_task_count ?? sp.pending_todo_count ?? 0;
  const badgeLabel = t(
    sp.flow_task_count !== undefined
      ? "sidebar.flowTaskCount"
      : "sidebar.pendingTodoCount",
    { count: badgeCount },
  );
  return (
    <div className="rounded-2xl">
      <div
        className={cn(
          "group relative flex items-center gap-1 overflow-visible rounded-2xl border px-1.5 py-1.5 transition-all",
          isActive
            ? "border-primary/30 bg-gradient-to-r from-primary/[0.55] via-violet-500/10 to-primary/5 shadow-sm dark:border-blue-300/30 dark:from-blue-600/[0.55] dark:via-violet-600/20 dark:to-blue-500/10 dark:shadow-[0_0_30px_rgba(37,99,235,0.24),inset_0_1px_0_rgba(255,255,255,0.12)]"
            : "border-transparent bg-muted/25 hover:border-border hover:bg-accent/70 dark:bg-white/[0.15] dark:hover:border-blue-300/[0.15] dark:hover:bg-white/[0.15] dark:hover:shadow-[0_0_24px_rgba(59,130,246,0.10)]",
        )}
      >
        {isActive && (
          <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_22%_50%,rgba(96,165,250,0.22),transparent_42%)]" />
        )}
        <button
          onClick={() => toggleCollapse(sp.id)}
          aria-label={t(
            isCollapsed ? "sidebar.expandSpace" : "sidebar.collapseSpace",
            { name: spaceDisplayName },
          )}
          aria-expanded={!isCollapsed}
          title={t(
            isCollapsed ? "sidebar.expandSpace" : "sidebar.collapseSpace",
            { name: spaceDisplayName },
          )}
          className="relative z-10 flex h-7 w-6 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:text-blue-100/[0.55] dark:hover:bg-white/10"
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
        {dragHandleProps ? (
          <span
            {...dragHandleProps}
            aria-label={t("sidebar.reorderSpace", { name: spaceDisplayName })}
            title={t("sidebar.reorderSpace", { name: spaceDisplayName })}
            className={cn(
              "relative z-10 flex h-8 w-8 flex-shrink-0 cursor-grab touch-none items-center justify-center rounded-xl text-base leading-none ring-1 transition active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              isActive
                ? "bg-blue-500/20 ring-blue-300/25 shadow-[0_0_18px_rgba(59,130,246,0.22)]"
                : "bg-muted/50 ring-border hover:ring-primary/40 dark:bg-white/[0.15] dark:ring-white/10",
            )}
          >
            {sp.icon || "UP"}
          </span>
        ) : (
          <span
            className={cn(
              "relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl text-base leading-none ring-1",
              isActive
                ? "bg-blue-500/20 ring-blue-300/25 shadow-[0_0_18px_rgba(59,130,246,0.22)]"
                : "bg-muted/50 ring-border dark:bg-white/[0.15] dark:ring-white/10",
            )}
          >
            {sp.icon || "UP"}
          </span>
        )}
        <Link
          href={`/spaces/${sp.id}`}
          onClick={onNavigate}
          onPointerEnter={() => void prefetchSpacePage(sp.id)}
          onFocus={() => void prefetchSpacePage(sp.id)}
          className={cn(
            "relative z-10 min-w-0 flex-1 rounded-xl px-1.5 py-1.5 text-left text-xs font-semibold truncate outline-none transition-colors",
            isActive
              ? "text-foreground"
              : "text-foreground/90 hover:text-foreground focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-primary/60 dark:focus-visible:bg-white/10",
          )}
        >
          {spaceDisplayName}
        </Link>
        <span
          aria-label={badgeLabel}
          title={badgeLabel}
          className={cn(
            "relative z-10 ml-1 flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] font-semibold tabular-nums",
            badgeCount > 0
              ? isActive
                ? "bg-amber-300/20 text-amber-950 ring-1 ring-amber-200/35 dark:bg-amber-300/[0.18] dark:text-amber-100 dark:ring-amber-200/25"
                : "bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20 dark:bg-amber-300/[0.14] dark:text-amber-100 dark:ring-amber-200/20"
              : isActive
                ? "bg-primary/10 text-primary ring-1 ring-primary/20 dark:bg-blue-400/[0.15] dark:text-blue-100 dark:ring-blue-300/25"
                : "bg-muted text-muted-foreground dark:bg-white/[0.15]",
          )}
        >
          {badgeCount}
        </span>
        <div
          className="relative z-20 flex flex-shrink-0 items-center"
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpenId((id) => (id === sp.id ? null : sp.id));
            }}
            aria-label={t("sidebar.actionsFor", { name: spaceDisplayName })}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            data-menu-trigger
            className="relative z-10 flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/10"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-popover/95 text-xs text-popover-foreground shadow-xl backdrop-blur-xl dark:border-blue-300/10 dark:bg-[#080d1d]/95 dark:text-foreground dark:shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
            >
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpenId(() => null);
                  handleHideSpace(sp);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent dark:hover:bg-white/5"
              >
                <EyeOff className="w-3 h-3" /> {t("sidebar.hideSpace")}
              </button>
              {canManageWorkspace && (
                <>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpenId(() => null);
                      setCreateListFor({ kind: "space", space: sp });
                    }}
                    className="w-full flex items-center gap-2 border-t border-border px-3 py-2 text-left hover:bg-accent dark:border-white/5 dark:hover:bg-white/5"
                  >
                    <Plus className="w-3 h-3" /> {t("sidebar.newProject")}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpenId(() => null);
                      setCreateFolderTarget({ kind: "space", space: sp });
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent dark:hover:bg-white/5"
                  >
                    <Folder className="w-3 h-3" /> {t("folder.newFolder")}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpenId(() => null);
                      setRenameTarget(sp);
                    }}
                    className="w-full flex items-center gap-2 border-t border-border px-3 py-2 text-left hover:bg-accent dark:border-white/5 dark:hover:bg-white/5"
                  >
                    <Pencil className="w-3 h-3" /> {t("common.rename")}
                  </button>
                  <button
                    role="menuitem"
                    onClick={() => {
                      setMenuOpenId(() => null);
                      handleDeleteSpace(sp);
                    }}
                    className="w-full flex items-center gap-2 border-t border-border px-3 py-2 text-left text-upflow-danger hover:bg-upflow-danger/10 dark:border-white/5"
                  >
                    <Trash2 className="w-3 h-3" /> {t("common.delete")}
                  </button>
                </>
              )}
              <button
                role="menuitem"
                onClick={() => {
                  setMenuOpenId(() => null);
                  setShareTarget(sp);
                }}
                className="w-full flex items-center gap-2 border-t border-border px-3 py-2 text-left hover:bg-accent dark:border-white/5 dark:hover:bg-white/5"
              >
                <UserPlus className="w-3 h-3" /> {t("space.shareSpace")}
              </button>
            </div>
          )}
        </div>
      </div>

      {!isCollapsed && (
        <div className="ml-6 mt-1.5 space-y-1 border-l border-border pl-3 dark:border-blue-300/10">
          {spaceFolders.length === 0 && looseLists.length === 0 && (
            <p
              className={cn(
                "rounded-xl border border-border/70 bg-muted/25 px-2 py-1.5 text-[11px] text-muted-foreground/70 italic dark:border-white/5 dark:bg-white/[0.15]",
                !isActive && !isSearching && "hidden",
              )}
            >
              {t("sidebar.noFoldersOrProjects")}
            </p>
          )}
          {spaceFolders.map((f) => (
            <FolderNode
              key={f.id}
              folder={f}
              items={projectsByFolder(f.id)}
              collapsed={collapsed}
              toggleCollapse={toggleCollapse}
              menuOpenId={menuOpenId}
              setMenuOpenId={setMenuOpenId}
              pathname={pathname}
              onNavigate={onNavigate}
              canManageWorkspace={canManageWorkspace}
              loadPanel={loadPanel}
              setMoveTarget={setMoveTarget}
              childFoldersByParent={childFoldersByParent}
              projectsByFolder={projectsByFolder}
              isSearching={isSearching}
              setCreateFolderTarget={setCreateFolderTarget}
              setRenameFolderTarget={setRenameFolderTarget}
              setCreateListFor={setCreateListFor}
              handleDeleteFolder={handleDeleteFolder}
              handleDuplicateFolder={handleDuplicateFolder}
            />
          ))}
          <ProjectRows
            items={looseLists}
            pathname={pathname}
            onNavigate={onNavigate}
            canManageWorkspace={canManageWorkspace}
            loadPanel={loadPanel}
            setMoveTarget={setMoveTarget}
          />
        </div>
      )}
    </div>
  );
}

interface FolderNodeProps {
  folder: FolderT;
  items: Project[];
  childFoldersByParent: (id: string) => FolderT[];
  projectsByFolder: (id: string) => Project[];
  collapsed: Record<string, boolean>;
  toggleCollapse: (id: string) => void;
  menuOpenId: string | null;
  setMenuOpenId: (updater: (id: string | null) => string | null) => void;
  pathname: string;
  onNavigate?: () => void;
  canManageWorkspace: boolean;
  loadPanel: (options?: { force?: boolean; query?: string }) => void;
  setMoveTarget: (p: Project) => void;
  isSearching: boolean;
  setCreateFolderTarget: (
    v: { kind: "space"; space: Space } | { kind: "folder"; folder: FolderT },
  ) => void;
  setRenameFolderTarget: (f: FolderT) => void;
  setCreateListFor: (
    v: { kind: "space"; space: Space } | { kind: "folder"; folder: FolderT },
  ) => void;
  handleDeleteFolder: (f: FolderT) => void;
  handleDuplicateFolder: (f: FolderT) => void;
}

export function FolderNode({
  folder: f,
  items,
  collapsed,
  toggleCollapse,
  menuOpenId,
  setMenuOpenId,
  pathname,
  onNavigate,
  canManageWorkspace,
  loadPanel,
  setMoveTarget,
  childFoldersByParent,
  projectsByFolder,
  isSearching,
  setCreateFolderTarget,
  setRenameFolderTarget,
  setCreateListFor,
  handleDeleteFolder,
  handleDuplicateFolder,
}: FolderNodeProps) {
  const { t } = useLanguage();
  const fCollapsed = !!collapsed[f.id];
  const fMenuOpen = menuOpenId === f.id;
  const isActive = pathname === `/folders/${f.id}`;
  const childFolders = childFoldersByParent(f.id);
  const directChildCount = childFolders.length + items.length;
  return (
    <div className="rounded-xl">
      <div
        className={cn(
          "group relative flex items-center gap-1 overflow-visible rounded-xl border px-1.5 py-1 transition-all",
          isActive
            ? "border-primary/25 bg-primary/10 text-foreground shadow-sm dark:border-blue-300/25 dark:bg-blue-500/[0.15] dark:shadow-[0_0_20px_rgba(59,130,246,0.16)]"
            : "border-transparent hover:border-border hover:bg-accent/70 dark:hover:border-blue-300/[0.15] dark:hover:bg-white/[0.15]",
        )}
      >
        {isActive && (
          <span className="pointer-events-none absolute inset-y-1 left-0 w-0.5 rounded-full bg-blue-300 shadow-[0_0_12px_rgba(96,165,250,0.8)]" />
        )}
        <button
          onClick={() => toggleCollapse(f.id)}
          aria-label={t(
            fCollapsed ? "sidebar.expandFolder" : "sidebar.collapseFolder",
            { name: f.name },
          )}
          aria-expanded={!fCollapsed}
          title={t(
            fCollapsed ? "sidebar.expandFolder" : "sidebar.collapseFolder",
            { name: f.name },
          )}
          className="relative z-10 flex h-6 w-5 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/10"
        >
          {fCollapsed ? (
            <ChevronRight className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
        <Link
          href={`/folders/${f.id}`}
          onClick={onNavigate}
          className={cn(
            "relative z-10 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left text-xs font-medium outline-none transition-colors",
            isActive
              ? "text-foreground"
              : "text-foreground/[0.85] hover:text-foreground focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-primary/60 dark:focus-visible:bg-white/10",
          )}
        >
          <Folder
            className={cn(
              "h-3.5 w-3.5 flex-shrink-0",
              isActive
                ? "text-primary dark:text-blue-200"
                : "text-muted-foreground",
            )}
          />
          <span className="truncate">{f.name}</span>
        </Link>
        {fCollapsed && directChildCount > 0 && (
          <span className="relative z-10 ml-1 whitespace-nowrap rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground dark:bg-white/[0.15]">
            {directChildCount}
          </span>
        )}
        {canManageWorkspace && (
          <div
            className="relative z-20 flex flex-shrink-0 items-center"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpenId((id) => (id === f.id ? null : f.id));
              }}
              aria-label={t("sidebar.actionsFor", { name: f.name })}
              aria-haspopup="menu"
              aria-expanded={fMenuOpen}
              data-menu-trigger
              className="relative z-10 flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/10"
            >
              <MoreHorizontal className="w-3 h-3" />
            </button>
            {fMenuOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-xl border border-border bg-popover/95 text-xs text-popover-foreground shadow-xl backdrop-blur-xl dark:border-blue-300/10 dark:bg-[#080d1d]/95 dark:text-foreground dark:shadow-[0_18px_50px_rgba(0,0,0,0.35)]"
              >
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpenId(() => null);
                    setCreateListFor({ kind: "folder", folder: f });
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-accent dark:hover:bg-white/5"
                >
                  <Plus className="w-3 h-3" /> {t("sidebar.newProject")}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpenId(() => null);
                    setCreateFolderTarget({ kind: "folder", folder: f });
                  }}
                  className="w-full flex items-center gap-2 border-t border-border px-3 py-2 text-left hover:bg-accent dark:border-white/5 dark:hover:bg-white/5"
                >
                  <Folder className="w-3 h-3" /> {t("folder.newFolder")}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpenId(() => null);
                    setRenameFolderTarget(f);
                  }}
                  className="w-full flex items-center gap-2 border-t border-border px-3 py-2 text-left hover:bg-accent dark:border-white/5 dark:hover:bg-white/5"
                >
                  <Pencil className="w-3 h-3" /> {t("common.rename")}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpenId(() => null);
                    handleDuplicateFolder(f);
                  }}
                  className="w-full flex items-center gap-2 border-t border-border px-3 py-2 text-left hover:bg-accent dark:border-white/5 dark:hover:bg-white/5"
                >
                  <Copy className="w-3 h-3" /> {t("common.duplicate")}
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    setMenuOpenId(() => null);
                    handleDeleteFolder(f);
                  }}
                  className="w-full flex items-center gap-2 border-t border-border px-3 py-2 text-left text-upflow-danger hover:bg-upflow-danger/10 dark:border-white/5"
                >
                  <Trash2 className="w-3 h-3" /> {t("common.delete")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      {!fCollapsed && (
        <div className="ml-5 mt-1 space-y-1 border-l border-border pl-3 dark:border-blue-300/10">
          {childFolders.length === 0 && items.length === 0 ? (
            <p
              className={cn(
                "rounded-xl border border-border/70 bg-muted/25 px-2 py-1 text-[11px] text-muted-foreground/70 italic dark:border-white/5 dark:bg-white/[0.15]",
                !isActive && !isSearching && "hidden",
              )}
            >
              {t("sidebar.noFoldersOrProjects")}
            </p>
          ) : (
            <>
              {childFolders.map((child) => (
                <FolderNode
                  key={child.id}
                  folder={child}
                  items={projectsByFolder(child.id)}
                  childFoldersByParent={childFoldersByParent}
                  projectsByFolder={projectsByFolder}
                  isSearching={isSearching}
                  collapsed={collapsed}
                  toggleCollapse={toggleCollapse}
                  menuOpenId={menuOpenId}
                  setMenuOpenId={setMenuOpenId}
                  pathname={pathname}
                  onNavigate={onNavigate}
                  canManageWorkspace={canManageWorkspace}
                  loadPanel={loadPanel}
                  setMoveTarget={setMoveTarget}
                  setCreateFolderTarget={setCreateFolderTarget}
                  setRenameFolderTarget={setRenameFolderTarget}
                  setCreateListFor={setCreateListFor}
                  handleDeleteFolder={handleDeleteFolder}
                  handleDuplicateFolder={handleDuplicateFolder}
                />
              ))}
              <ProjectRows
                items={items}
                pathname={pathname}
                onNavigate={onNavigate}
                canManageWorkspace={canManageWorkspace}
                loadPanel={loadPanel}
                setMoveTarget={setMoveTarget}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface UnassignedNodeProps {
  items: Project[];
  collapsed: Record<string, boolean>;
  toggleCollapse: (id: string) => void;
  pathname: string;
  onNavigate?: () => void;
  loadPanel: (options?: { force?: boolean; query?: string }) => void;
  setMoveTarget: (p: Project) => void;
  isSearching: boolean;
  canManageWorkspace: boolean;
}

export function UnassignedNode({
  items,
  collapsed,
  toggleCollapse,
  pathname,
  onNavigate,
  loadPanel,
  setMoveTarget,
  isSearching,
  canManageWorkspace,
}: UnassignedNodeProps) {
  const { t } = useLanguage();
  const id = "__unassigned__";
  const isCollapsed = !!collapsed[id];
  const visibleItems = isSearching
    ? items
    : items.slice(0, MAX_VISIBLE_CHILDREN);
  const hiddenCount = items.length - visibleItems.length;
  return (
    <div className="mt-3 rounded-2xl border border-border/80 bg-muted/25 p-1.5 dark:border-white/[0.15] dark:bg-white/[0.15]">
      <div className="flex items-center gap-1 rounded-xl px-1 py-1 transition-colors hover:bg-accent/70 dark:hover:bg-white/[0.15]">
        <button
          onClick={() => toggleCollapse(id)}
          aria-label={t(
            isCollapsed
              ? "sidebar.expandUnassignedProjects"
              : "sidebar.collapseUnassignedProjects",
          )}
          aria-expanded={!isCollapsed}
          title={
            isCollapsed
              ? t("sidebar.expandUnassignedProjects")
              : t("sidebar.collapseUnassignedProjects")
          }
          className="flex h-7 w-6 flex-shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/10"
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
        <Folder className="h-3.5 w-3.5 text-muted-foreground" />
        <button
          onClick={() => toggleCollapse(id)}
          className="min-w-0 flex-1 truncate rounded-lg px-1.5 py-1.5 text-left text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:bg-accent focus-visible:ring-2 focus-visible:ring-primary/60 dark:focus-visible:bg-white/10"
        >
          {t("sidebar.unassigned")}
        </button>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground dark:bg-white/[0.15]">
          {items.length}
        </span>
      </div>
      {!isCollapsed && (
        <div className="ml-6 mt-1 space-y-1 border-l border-border pl-3 dark:border-blue-300/10">
          {items.length === 0 ? (
            <p className="rounded-xl border border-border/70 bg-muted/25 px-2 py-1.5 text-[11px] italic text-muted-foreground/70 dark:border-white/5 dark:bg-white/[0.15]">
              {t("sidebar.nothingHere")}
            </p>
          ) : (
            visibleItems.map((project) => (
              <ProjectRow
                key={project.id}
                project={project}
                onMove={() => setMoveTarget(project)}
                onNavigate={onNavigate}
                onDeleted={() => loadPanel({ force: true })}
                onDuplicated={() => loadPanel({ force: true })}
                isActive={pathname === `/projects/${project.id}`}
                canManageWorkspace={canManageWorkspace}
              />
            ))
          )}
          {hiddenCount > 0 && (
            <Link
              href="/projects"
              onClick={onNavigate}
              className="block rounded-xl border border-primary/[0.35] bg-primary/[0.15] px-2 py-1.5 text-[11px] font-medium text-primary hover:bg-primary/10 dark:border-blue-300/10 dark:text-blue-200 dark:hover:bg-blue-500/10"
            >
              {t("sidebar.viewAllProjects", { count: hiddenCount })}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
