"use client";

import { useEffect, useState, type CSSProperties, type Ref } from "react";
import Link from "next/link";
import Image from "next/image";
import { toast } from "sonner";
import {
  DragDropContext,
  Draggable,
  Droppable,
  type DropResult,
} from "@hello-pangea/dnd";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  LogOut,
  PanelLeftClose,
  Pin,
  Plus,
  Search,
  Settings2,
  Sparkles,
  X,
} from "lucide-react";
import { logError } from "@/lib/log-error";
import type {
  Project,
  Space,
  Folder as FolderT,
  SidebarHiddenSpace,
  SidebarPinnedClient,
} from "@/lib/types";
import SpaceShareRequestDialog from "@/components/spaces/space-share-request-dialog";
import InviteDialog from "@/components/dashboard/invite-dialog";
import WorkspaceSwitcher from "@/components/layout/workspace-switcher";
import { useLanguage } from "@/components/language-provider";
import {
  SpaceDialog,
  MoveProjectDialog,
  FolderDialog,
  NewListDialog,
} from "@/components/layout/sidebar/dialogs";
import { PanelNav } from "@/components/layout/sidebar/panel-nav";
import {
  SpaceNode,
  UnassignedNode,
} from "@/components/layout/sidebar/space-tree";
import { usePanelData } from "@/components/layout/sidebar/use-panel-data";
import { SidebarSearchResults } from "@/components/layout/sidebar/search-results";
import { localizeSpaceName } from "@/lib/i18n/project-name-translations";

interface PanelProps {
  pathname: string;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    role: "owner" | "admin" | "member" | "guest";
  }>;
  currentWorkspaceId: string;
  currentUserId: string;
  currentRole: "owner" | "admin" | "member" | "guest" | null;
  clientsHref: string;
  userName?: string | null;
  isSuperAdmin?: boolean;
  active?: boolean;
  onNavigate?: () => void;
  onRequestClose?: () => void;
  closeButtonRef?: Ref<HTMLButtonElement>;
  closeButtonLabel?: string;
  onSignOut: () => void;
  signingOut?: boolean;
  inboxPendingCount?: number;
}

type CreateFolderTarget =
  | { kind: "space"; space: Space }
  | { kind: "folder"; folder: FolderT };

export default function Panel({
  pathname,
  workspaces,
  currentWorkspaceId,
  currentUserId,
  currentRole,
  clientsHref,
  userName,
  isSuperAdmin = false,
  active = true,
  onNavigate,
  onRequestClose,
  closeButtonRef,
  closeButtonLabel,
  onSignOut,
  signingOut = false,
  inboxPendingCount = 0,
}: PanelProps) {
  const { t, language } = useLanguage();
  const {
    spaces,
    folders,
    projects,
    hiddenSpaces,
    pinnedClients,
    searchResults,
    loadingPanel,
    panelLoadFailed,
    collapsed,
    toggleCollapse,
    menuOpenId,
    setMenuOpenId,
    loadPanel,
    collapseAll,
    upsertSpace,
    reorderSpaces,
  } = usePanelData(
    pathname,
    {
      workspaceId: currentWorkspaceId,
      userId: currentUserId,
    },
    { enabled: active },
  );

  const [showCreate, setShowCreate] = useState(false);
  const [renameTarget, setRenameTarget] = useState<Space | null>(null);
  const [shareTarget, setShareTarget] = useState<Space | null>(null);
  const [moveTarget, setMoveTarget] = useState<Project | null>(null);
  const [createFolderTarget, setCreateFolderTarget] =
    useState<CreateFolderTarget | null>(null);
  const [renameFolderTarget, setRenameFolderTarget] = useState<FolderT | null>(
    null,
  );
  const [createListFor, setCreateListFor] = useState<
    { kind: "space"; space: Space } | { kind: "folder"; folder: FolderT } | null
  >(null);
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [spaceVisibilityChangeId, setSpaceVisibilityChangeId] = useState<
    string | null
  >(null);
  const [unpinningClientId, setUnpinningClientId] = useState<string | null>(
    null,
  );
  const [savingSpaceOrder, setSavingSpaceOrder] = useState(false);
  const normalizedQuery = sidebarQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const canManageWorkspace =
    isSuperAdmin || currentRole === "owner" || currentRole === "admin";

  useEffect(() => {
    if (!active) return;
    const handle = window.setTimeout(
      () => {
        loadPanel({ force: isSearching, query: sidebarQuery.trim() });
      },
      isSearching ? 250 : 0,
    );

    return () => window.clearTimeout(handle);
  }, [active, isSearching, loadPanel, sidebarQuery]);

  const projectsBySpace = (spaceId: string | null) =>
    projects.filter((p) => (p.space_id ?? null) === spaceId);
  const foldersBySpace = (spaceId: string) =>
    folders.filter((f) => f.space_id === spaceId && !f.parent_id);
  const childFoldersByParent = (parentId: string) =>
    folders.filter((f) => f.parent_id === parentId);
  const projectsByFolder = (folderId: string) =>
    projects.filter((p) => (p.folder_id ?? null) === folderId);
  const projectsInSpaceLoose = (spaceId: string) =>
    projects.filter((p) => (p.space_id ?? null) === spaceId && !p.folder_id);

  const handleHideSpace = async (sp: Space) => {
    if (spaceVisibilityChangeId) return;
    setSpaceVisibilityChangeId(sp.id);
    try {
      const res = await fetch(`/api/my-space-hides/${sp.id}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? t("sidebar.couldNotHideSpace"));
      }
      window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
      toast.success(t("sidebar.spaceHidden"));
      loadPanel({ force: true, query: sidebarQuery.trim() });
    } catch (err) {
      logError("sidebar:hide-space", err, { id: sp.id });
      toast.error(
        err instanceof Error ? err.message : t("sidebar.couldNotHideSpace"),
      );
    } finally {
      setSpaceVisibilityChangeId(null);
    }
  };

  const handleShowSpace = async (space: SidebarHiddenSpace) => {
    if (spaceVisibilityChangeId) return;
    setSpaceVisibilityChangeId(space.id);
    try {
      const res = await fetch(`/api/my-space-hides/${space.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? t("sidebar.couldNotShowSpace"));
      }
      window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
      toast.success(t("sidebar.spaceShown"));
      loadPanel({ force: true, query: sidebarQuery.trim() });
    } catch (err) {
      logError("sidebar:show-space", err, { id: space.id });
      toast.error(
        err instanceof Error ? err.message : t("sidebar.couldNotShowSpace"),
      );
    } finally {
      setSpaceVisibilityChangeId(null);
    }
  };

  const handleDeleteSpace = async (sp: Space) => {
    if (
      !confirm(
        t("sidebar.deleteSpaceConfirm", {
          name: localizeSpaceName(sp.name, language),
        }),
      )
    )
      return;
    try {
      const res = await fetch(`/api/spaces/${sp.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("sidebar.spaceDeleted"));
        loadPanel({ force: true });
      } else {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(body?.error ?? t("sidebar.couldNotDeleteSpace"));
      }
    } catch (err) {
      logError("sidebar:delete-space", err, { id: sp.id });
      toast.error(t("sidebar.couldNotDeleteSpace"));
    }
  };

  const handleDeleteFolder = async (f: FolderT) => {
    if (!confirm(t("sidebar.deleteFolderConfirm", { name: f.name }))) return;
    try {
      const res = await fetch(`/api/folders/${f.id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success(t("sidebar.folderDeleted"));
        loadPanel({ force: true });
      } else {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast.error(body?.error ?? t("sidebar.couldNotDeleteFolder"));
      }
    } catch (err) {
      logError("sidebar:delete-folder", err, { id: f.id });
      toast.error(t("sidebar.couldNotDeleteFolder"));
    }
  };

  const handleDuplicateFolder = async (f: FolderT) => {
    try {
      const res = await fetch(`/api/folders/${f.id}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? t("sidebar.couldNotDuplicateFolder"));
      }
      window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
      toast.success(t("sidebar.folderDuplicated"));
      loadPanel({ force: true });
    } catch (err) {
      logError("sidebar:duplicate-folder", err, { id: f.id });
      toast.error(
        err instanceof Error
          ? err.message
          : t("sidebar.couldNotDuplicateFolder"),
      );
    }
  };

  const handleUnpinClient = async (companyId: string) => {
    setUnpinningClientId(companyId);
    try {
      const res = await fetch(`/api/sidebar-pins/${companyId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? t("clientNavigation.unpinFailed"));
      }
      window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
      loadPanel({ force: true, query: sidebarQuery.trim() });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("clientNavigation.unpinFailed"),
      );
    } finally {
      setUnpinningClientId(null);
    }
  };

  const handleSpaceDragEnd = async (result: DropResult) => {
    if (
      !canManageWorkspace ||
      savingSpaceOrder ||
      !result.destination ||
      result.source.index === result.destination.index
    ) {
      return;
    }

    const reordered = [...spaces];
    const [movedSpace] = reordered.splice(result.source.index, 1);
    if (!movedSpace) return;
    reordered.splice(result.destination.index, 0, movedSpace);
    const orderedSpaceIds = reordered.map((space) => space.id);
    reorderSpaces(orderedSpaceIds);
    setSavingSpaceOrder(true);

    try {
      const response = await fetch("/api/spaces/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ordered_space_ids: orderedSpaceIds }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? t("sidebar.couldNotReorderSpaces"));
      }
      window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
      toast.success(t("sidebar.spaceOrderSaved"));
    } catch (error) {
      logError("sidebar:reorder-spaces", error, { orderedSpaceIds });
      toast.error(
        error instanceof Error
          ? error.message
          : t("sidebar.couldNotReorderSpaces"),
      );
      loadPanel({ force: true });
    } finally {
      setSavingSpaceOrder(false);
    }
  };

  const treeHandlers = {
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
    setShareTarget,
    setCreateFolderTarget,
    setRenameFolderTarget,
    setCreateListFor,
    handleHideSpace,
    handleDeleteSpace,
    handleDeleteFolder,
    handleDuplicateFolder,
  };

  const unassignedItems = projectsBySpace(null);

  return (
    <>
      <div
        data-testid="sidebar-panel"
        className="upflow-sidebar-panel relative flex h-full min-h-0 w-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm dark:border-blue-300/10 dark:bg-[#050816] dark:shadow-[inset_-1px_0_0_rgba(96,165,250,0.06)]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_8%,rgba(59,130,246,0.16),transparent_32%),radial-gradient(circle_at_95%_34%,rgba(139,92,246,0.12),transparent_28%)]" />
        <div className="pointer-events-none absolute right-0 top-0 h-full w-px bg-gradient-to-b from-blue-400/30 via-violet-400/[0.35] to-transparent" />
        <div className="relative z-10 flex h-full min-h-0 flex-1 flex-col">
          <div className="flex h-[82px] shrink-0 items-center justify-between border-b border-blue-300/10 px-3">
            <Link
              data-testid="sidebar-panel-brand"
              href="/"
              onClick={onNavigate}
              aria-label="Up Flow"
              className="flex h-11 min-w-0 items-center gap-2 rounded-xl px-1.5 text-sm font-semibold text-foreground outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-primary/60 dark:text-white"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1 shadow-[0_4px_16px_rgba(0,0,0,0.24)]">
                <Image
                  src="/assets/UP_LOGO_1778594851568.png"
                  alt=""
                  width={36}
                  height={36}
                  className="h-full w-full object-contain"
                  priority
                />
              </span>
              <span className="truncate">Up Flow</span>
            </Link>
            {onRequestClose ? (
              <button
                data-testid="sidebar-panel-close"
                ref={closeButtonRef}
                type="button"
                onClick={onRequestClose}
                aria-label={closeButtonLabel ?? t("sidebar.hide")}
                title={closeButtonLabel ?? t("sidebar.hide")}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background/70 text-muted-foreground shadow-sm transition-all hover:border-sky-400/40 hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:border-white/10 dark:bg-white/[0.15] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:hover:bg-sky-400/10"
              >
                <PanelLeftClose className="h-5 w-5" />
              </button>
            ) : (
              <span aria-hidden="true" />
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4 [scrollbar-gutter:stable]">
            <PanelNav
              pathname={pathname}
              clientsHref={clientsHref}
              inboxPendingCount={inboxPendingCount}
              onNavigate={onNavigate}
              onCreateSpace={() => setShowCreate(true)}
              canManageWorkspace={canManageWorkspace}
              onCollapseAll={() =>
                collapseAll([
                  ...spaces.map((space) => space.id),
                  ...folders.map((folder) => folder.id),
                  "__unassigned__",
                ])
              }
              pinnedContent={
                !isSearching ? (
                  <PinnedClientsSection
                    items={pinnedClients}
                    unpinningClientId={unpinningClientId}
                    onUnpin={handleUnpinClient}
                    onNavigate={onNavigate}
                  />
                ) : null
              }
            />

            {canManageWorkspace ? (
              <div
                data-testid="sidebar-admin-spaces"
                className="space-y-1 px-2"
              >
                <div className="upflow-sidebar-sticky sticky top-0 z-20 -mx-2 isolate border-b border-sidebar-border bg-sidebar px-2 pb-2 pt-1 shadow-[0_10px_18px_-12px_rgba(15,23,42,0.55)] dark:border-blue-300/10 dark:bg-[#050816] dark:shadow-[0_12px_22px_-14px_rgba(0,0,0,0.95)]">
                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={sidebarQuery}
                      onChange={(event) => setSidebarQuery(event.target.value)}
                      placeholder={t("sidebar.searchSpacesAndProjects")}
                      className="upflow-sidebar-search h-9 w-full rounded-xl border border-border bg-background pl-8 pr-8 text-xs text-foreground shadow-sm outline-none transition placeholder:text-muted-foreground hover:border-primary/[0.35] focus:border-sky-400/[0.55] focus:ring-2 focus:ring-sky-400/20 dark:border-blue-300/10 dark:bg-[#071024] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_22px_rgba(37,99,235,0.06)] dark:hover:border-blue-300/25"
                    />
                    {sidebarQuery && (
                      <button
                        type="button"
                        onClick={() => setSidebarQuery("")}
                        aria-label={t("sidebar.clearSearch")}
                        className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground dark:hover:bg-white/10"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </label>
                </div>
                {loadingPanel ? (
                  <div className="px-2 py-4 text-xs text-muted-foreground">
                    {t("sidebar.loading")}
                  </div>
                ) : panelLoadFailed ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    <p className="font-semibold text-foreground">
                      {t("sidebar.navigationUnavailable")}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        loadPanel({ force: true, query: sidebarQuery.trim() })
                      }
                      className="mt-3 inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                    >
                      {t("common.retry")}
                    </button>
                  </div>
                ) : (
                  <>
                    {isSearching && searchResults.length > 0 && (
                      <SidebarSearchResults
                        results={searchResults}
                        pathname={pathname}
                        onNavigate={onNavigate}
                      />
                    )}

                    {isSearching && searchResults.length === 0 && (
                      <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                        {t("sidebar.noSearchMatches", {
                          query: sidebarQuery.trim(),
                        })}
                      </div>
                    )}

                    {!isSearching && (
                      <DragDropContext
                        onDragEnd={handleSpaceDragEnd}
                        dragHandleUsageInstructions={t(
                          "sidebar.navigationDragInstructions",
                        )}
                      >
                        <Droppable
                          droppableId="sidebar-spaces"
                          type="SPACE"
                          isDropDisabled={
                            !canManageWorkspace || savingSpaceOrder
                          }
                        >
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              data-testid="sidebar-spaces-droppable"
                              className={
                                snapshot.isDraggingOver
                                  ? "space-y-1 rounded-2xl bg-primary/[0.04]"
                                  : "space-y-1"
                              }
                            >
                              {spaces.map((sp, index) => (
                                <Draggable
                                  key={sp.id}
                                  draggableId={`space:${sp.id}`}
                                  index={index}
                                  isDragDisabled={
                                    !canManageWorkspace || savingSpaceOrder
                                  }
                                >
                                  {(dragProvided, dragSnapshot) => (
                                    <div
                                      ref={dragProvided.innerRef}
                                      {...dragProvided.draggableProps}
                                      style={
                                        dragProvided.draggableProps.style as
                                          | CSSProperties
                                          | undefined
                                      }
                                      data-testid={`sidebar-space-draggable-${sp.id}`}
                                      className={
                                        dragSnapshot.isDragging
                                          ? "relative z-50 opacity-95 drop-shadow-2xl"
                                          : undefined
                                      }
                                    >
                                      <SpaceNode
                                        space={sp}
                                        dragHandleProps={
                                          dragProvided.dragHandleProps
                                        }
                                        looseLists={projectsInSpaceLoose(sp.id)}
                                        foldersBySpace={foldersBySpace(sp.id)}
                                        childFoldersByParent={
                                          childFoldersByParent
                                        }
                                        projectsByFolder={projectsByFolder}
                                        isSearching={false}
                                        {...treeHandlers}
                                      />
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      </DragDropContext>
                    )}

                    {!isSearching && hiddenSpaces.length > 0 && (
                      <HiddenSpacesSection
                        items={hiddenSpaces}
                        changingSpaceId={spaceVisibilityChangeId}
                        onShow={handleShowSpace}
                      />
                    )}

                    {!isSearching &&
                      !(unassignedItems.length === 0 && spaces.length > 0) && (
                        <UnassignedNode
                          items={unassignedItems}
                          collapsed={collapsed}
                          toggleCollapse={toggleCollapse}
                          pathname={pathname}
                          onNavigate={onNavigate}
                          loadPanel={loadPanel}
                          setMoveTarget={setMoveTarget}
                          isSearching={false}
                          canManageWorkspace={canManageWorkspace}
                        />
                      )}

                    {!isSearching &&
                      spaces.length === 0 &&
                      unassignedItems.length === 0 &&
                      hiddenSpaces.length === 0 && (
                        <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                          <p className="font-semibold text-foreground">
                            {t("sidebar.noSpaces")}
                          </p>
                          <p className="mt-2 leading-5">
                            {t("sidebar.noSpacesHint")}
                          </p>
                          {canManageWorkspace ? (
                            <button
                              type="button"
                              onClick={() => setShowCreate(true)}
                              className="mt-3 inline-flex h-8 items-center justify-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90"
                            >
                              {t("sidebar.createFirstSpace")}
                            </button>
                          ) : (
                            <p className="mt-3 rounded-xl border border-primary/20 bg-primary/[0.15] p-2 text-[11px] leading-5 text-muted-foreground dark:border-blue-300/[0.15] dark:text-blue-100/70">
                              {t("sidebar.noSpacesViewOnly")}
                            </p>
                          )}
                        </div>
                      )}

                    {!isSearching &&
                      canManageWorkspace &&
                      (spaces.length > 0 ||
                        unassignedItems.length > 0 ||
                        hiddenSpaces.length > 0) && (
                        <button
                          type="button"
                          onClick={() => setShowCreate(true)}
                          className="group relative mt-3 flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-blue-300/20 bg-gradient-to-br from-blue-600/[0.55] via-violet-600/[0.35] to-fuchsia-500/10 p-3 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_30px_rgba(59,130,246,0.12)] transition-all hover:-translate-y-0.5 hover:border-blue-300/[0.15] hover:shadow-[0_0_36px_rgba(99,102,241,0.22)]"
                        >
                          <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.09),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(168,85,247,0.25),transparent_30%)] opacity-80" />
                          <span className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20 dark:bg-blue-500/[0.15] dark:text-blue-100 dark:ring-blue-300/25">
                            <Plus className="h-4 w-4" />
                          </span>
                          <span className="relative min-w-0">
                            <span className="block text-xs font-semibold text-foreground">
                              {t("sidebar.newSpace")}
                            </span>
                            <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground dark:text-blue-100/[0.55]">
                              {t("sidebar.newSpaceHint")}
                            </span>
                          </span>
                          <Sparkles className="relative ml-auto h-3.5 w-3.5 flex-shrink-0 text-violet-600/70 opacity-70 transition group-hover:opacity-100 dark:text-violet-200/70" />
                        </button>
                      )}
                  </>
                )}
              </div>
            ) : null}
          </div>

          <div
            data-testid="sidebar-profile-footer"
            className="shrink-0 border-t border-blue-300/10 bg-sidebar/95 pb-1 backdrop-blur-md dark:bg-[#050816]/95"
          >
            <WorkspaceSwitcher
              initialData={{
                workspaces,
                current_workspace_id: currentWorkspaceId,
                current_role: currentRole,
                is_super_admin: isSuperAdmin,
              }}
              userName={userName}
              menuPlacement="top"
            />
            <div className="grid grid-cols-2 gap-2 px-3 pb-2">
              <Link
                href="/settings"
                onClick={onNavigate}
                className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-border bg-background/70 px-2 text-[11px] font-semibold text-muted-foreground transition-all hover:border-sky-400/40 hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:border-blue-300/[0.15] dark:bg-white/[0.15] dark:text-blue-100/[0.55] dark:hover:bg-sky-400/10 dark:hover:text-white dark:hover:shadow-[0_0_20px_rgba(59,130,246,0.16)]"
              >
                <Settings2 className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">{t("sidebar.settings")}</span>
              </Link>
              <button
                type="button"
                onClick={onSignOut}
                disabled={signingOut}
                className="inline-flex h-9 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-rose-300/[0.35] bg-rose-500/[0.15] px-2 text-[11px] font-semibold text-rose-700 transition-all hover:border-rose-400/50 hover:bg-rose-500/[0.15] hover:text-rose-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/40 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-300/[0.35] dark:text-rose-100/[0.65] dark:hover:border-rose-300/[0.35] dark:hover:text-white dark:hover:shadow-[0_0_20px_rgba(244,63,94,0.14)]"
              >
                <LogOut className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate">
                  {signingOut ? t("common.loading") : t("sidebar.signOut")}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {showCreate && (
        <SpaceDialog
          mode="create"
          onClose={() => setShowCreate(false)}
          onSaved={(space) => {
            setShowCreate(false);
            setSidebarQuery("");
            upsertSpace(space);
            loadPanel({ force: true });
          }}
        />
      )}

      {renameTarget && (
        <SpaceDialog
          mode="rename"
          space={renameTarget}
          onClose={() => setRenameTarget(null)}
          onSaved={(space) => {
            setRenameTarget(null);
            upsertSpace(space);
            loadPanel({ force: true });
          }}
        />
      )}

      {shareTarget && (
        canManageWorkspace ? (
          <InviteDialog
            open
            onClose={() => setShareTarget(null)}
            title={t("space.shareSpaceTitle", { space: shareTarget.name })}
            description={t("space.shareSpaceDescription", {
              space: shareTarget.name,
              workspace:
                workspaces.find(
                  (workspace) => workspace.id === currentWorkspaceId,
                )?.name || t("invite.currentWorkspace"),
            })}
            submitLabel={t("invite.submitDefault")}
            successLabel={t("invite.successDefault")}
            workspaceId={shareTarget.workspace_id || currentWorkspaceId}
            defaultRole="member"
            defaultMode="workspace_access"
            hideMode
          />
        ) : (
          <SpaceShareRequestDialog
            open
            onClose={() => setShareTarget(null)}
            spaceId={shareTarget.id}
            spaceName={localizeSpaceName(shareTarget.name, language)}
            workspaceId={shareTarget.workspace_id || currentWorkspaceId}
            currentUserId={currentUserId}
          />
        )
      )}

      {moveTarget && (
        <MoveProjectDialog
          project={moveTarget}
          spaces={spaces}
          folders={folders}
          onClose={() => setMoveTarget(null)}
          onSaved={() => {
            setMoveTarget(null);
            loadPanel({ force: true });
          }}
        />
      )}

      {createFolderTarget && (
        <FolderDialog
          mode="create"
          target={createFolderTarget}
          onClose={() => setCreateFolderTarget(null)}
          onSaved={() => {
            setCreateFolderTarget(null);
            loadPanel({ force: true });
          }}
        />
      )}

      {renameFolderTarget && (
        <FolderDialog
          mode="rename"
          folder={renameFolderTarget}
          onClose={() => setRenameFolderTarget(null)}
          onSaved={() => {
            setRenameFolderTarget(null);
            loadPanel({ force: true });
          }}
        />
      )}

      {createListFor && (
        <NewListDialog
          target={createListFor}
          onClose={() => setCreateListFor(null)}
          onSaved={() => {
            setCreateListFor(null);
            loadPanel({ force: true });
          }}
        />
      )}
    </>
  );
}

function HiddenSpacesSection({
  items,
  changingSpaceId,
  onShow,
}: {
  items: SidebarHiddenSpace[];
  changingSpaceId: string | null;
  onShow: (space: SidebarHiddenSpace) => void;
}) {
  const { t, language } = useLanguage();
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-muted/25 p-1.5 dark:border-white/10 dark:bg-white/[0.04]">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition hover:bg-accent hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 dark:hover:bg-white/[0.06]"
      >
        <EyeOff className="h-3.5 w-3.5" />
        <span className="min-w-0 flex-1 truncate">
          {t("sidebar.hiddenSpaces", { count: items.length })}
        </span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
      </button>
      {expanded && (
        <div className="mt-1 space-y-0.5 border-t border-border/70 pt-1 dark:border-white/10">
          {items.map((space) => {
            const displayName = localizeSpaceName(space.name, language);
            return (
              <div
                key={space.id}
                className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-accent dark:hover:bg-white/[0.06]"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] leading-none dark:bg-white/[0.12]">
                  {space.icon || "UP"}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground/85">
                  {displayName}
                </span>
                <button
                  type="button"
                  onClick={() => onShow(space)}
                  disabled={changingSpaceId === space.id}
                  aria-label={t("sidebar.showSpace", { name: displayName })}
                  title={t("sidebar.showSpace", { name: displayName })}
                  className="inline-flex h-6 shrink-0 items-center gap-1 rounded-md border border-border bg-background/70 px-1.5 text-[10px] font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-wait disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.06]"
                >
                  <Eye className="h-3 w-3" />
                  {t("sidebar.restoreSpace")}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PinnedClientsSection({
  items,
  unpinningClientId,
  onUnpin,
  onNavigate,
}: {
  items: SidebarPinnedClient[];
  unpinningClientId: string | null;
  onUnpin: (companyId: string) => void;
  onNavigate?: () => void;
}) {
  const { t } = useLanguage();
  if (items.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-xl border border-blue-300/15 bg-blue-500/[0.06] p-1.5 dark:border-blue-300/10 dark:bg-white/[0.025]">
      <div className="flex items-center gap-2 px-1.5 pb-1.5 pt-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-blue-700/70 dark:text-blue-200/55">
        <Pin className="h-3 w-3" />
        {t("clientNavigation.pinnedClients")}
      </div>
      <div className="space-y-0.5">
        {items.map((pin) => (
          <div
            key={pin.id}
            className="group flex min-w-0 items-center gap-1 rounded-lg pr-1 transition hover:bg-blue-500/10 dark:hover:bg-white/[0.06]"
          >
            <Link
              href={`/clients/${pin.company_id}`}
              onClick={onNavigate}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-bold text-primary dark:bg-blue-400/15 dark:text-blue-100">
                {pin.company.name.trim().charAt(0).toUpperCase() || "C"}
              </span>
              <span className="min-w-0 flex-1 truncate">
                {pin.company.name}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => onUnpin(pin.company_id)}
              disabled={unpinningClientId === pin.company_id}
              aria-label={t("clientNavigation.unpinClient", {
                name: pin.company.name,
              })}
              title={t("clientNavigation.unpinClient", {
                name: pin.company.name,
              })}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 transition hover:bg-rose-500/10 hover:text-rose-600 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-wait disabled:opacity-50 dark:hover:text-rose-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}
