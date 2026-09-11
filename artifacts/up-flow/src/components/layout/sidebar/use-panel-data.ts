"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { logError } from "@/lib/log-error";
import { ApiResponseError, recoverExpiredSession } from "@/lib/client-auth-recovery";
import type { Project, Space, Folder as FolderT, SidebarHiddenSpace, SidebarPinnedClient } from "@/lib/types";
import {
  getSidebarStorageKeys,
  type SidebarSearchResult,
} from "@/lib/sidebar-discovery";

const PANEL_CACHE_TTL_MS = 60_000;
const SMART_COLLAPSE_CHILD_LIMIT = 8;
const WORKLOAD_REFRESH_INTERVAL_MS = 60_000;
// Keep this endpoint neutral. Some content blockers treat routes named
// "sidebar" or "navigation" as browser-extension traffic and block them.
const NAVIGATION_ENDPOINT = "/api/workspace-tree";

interface PanelPayload {
  spaces: { items: Space[] };
  projects: { items: Project[] };
  folders: { items: FolderT[] };
  hidden_spaces?: SidebarHiddenSpace[];
  pinned_clients?: SidebarPinnedClient[];
  search_results?: SidebarSearchResult[];
}

interface PanelCacheEntry {
  data: PanelPayload;
  loadedAt: number;
}

const panelCache = new Map<string, PanelCacheEntry>();
const panelRequests = new Map<string, Promise<PanelPayload>>();

function fetchPanelData(scope: string, force = false, query = ""): Promise<PanelPayload> {
  const normalizedQuery = query.trim();
  if (normalizedQuery) {
    return fetch(`${NAVIGATION_ENDPOINT}?q=${encodeURIComponent(normalizedQuery)}&limit=500`).then((r) => {
      if (!r.ok) {
        throw new ApiResponseError(`Sidebar search failed: ${r.status}`, r.status);
      }
      return r.json() as Promise<PanelPayload>;
    });
  }

  const cached = panelCache.get(scope);
  if (!force && cached && Date.now() - cached.loadedAt < PANEL_CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }

  const pending = panelRequests.get(scope);
  if (!force && pending) return pending;

  const request = fetch(NAVIGATION_ENDPOINT)
    .then((r) => {
      if (!r.ok) {
        throw new ApiResponseError(`Sidebar load failed: ${r.status}`, r.status);
      }
      return r.json() as Promise<PanelPayload>;
    })
    .then((data) => {
      panelCache.set(scope, { data, loadedAt: Date.now() });
      return data;
    })
    .finally(() => {
      if (panelRequests.get(scope) === request) panelRequests.delete(scope);
    });

  panelRequests.set(scope, request);
  return request;
}

export function usePanelData(
  pathname: string,
  identity: { workspaceId?: string | null; userId?: string | null },
  options: { enabled?: boolean } = {},
) {
  const enabled = options.enabled !== false;
  const storageKeys = useMemo(
    () =>
      getSidebarStorageKeys({
        workspaceId: identity.workspaceId,
        userId: identity.userId,
      }),
    [identity.userId, identity.workspaceId],
  );
  const loadRequestId = useRef(0);
  const activeQueryRef = useRef("");
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [folders, setFolders] = useState<FolderT[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [hiddenSpaces, setHiddenSpaces] = useState<SidebarHiddenSpace[]>([]);
  const [pinnedClients, setPinnedClients] = useState<SidebarPinnedClient[]>([]);
  const [searchResults, setSearchResults] = useState<SidebarSearchResult[]>([]);
  const [loadingPanel, setLoadingPanel] = useState(true);
  const [panelLoadFailed, setPanelLoadFailed] = useState(false);
  const [collapseState, setCollapseState] = useState<{
    scope: string;
    value: Record<string, boolean>;
  }>({ scope: "", value: {} });
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const collapsed = collapseState.scope === storageKeys.scope ? collapseState.value : {};

  const setCollapsed = useCallback(
    (
      updater:
        | Record<string, boolean>
        | ((current: Record<string, boolean>) => Record<string, boolean>),
    ) => {
      setCollapseState((current) => {
        const currentValue = current.scope === storageKeys.scope ? current.value : {};
        return {
          scope: storageKeys.scope,
          value: typeof updater === "function" ? updater(currentValue) : updater,
        };
      });
    },
    [storageKeys.scope],
  );

  useEffect(() => {
    let nextCollapsed: Record<string, boolean> = {};
    setLoadingPanel(true);
    setSpaces([]);
    setFolders([]);
    setProjects([]);
    setHiddenSpaces([]);
    setPinnedClients([]);
    setSearchResults([]);
    setPanelLoadFailed(false);
    try {
      const rawCollapsed = localStorage.getItem(storageKeys.collapsed);
      if (rawCollapsed) {
        nextCollapsed = JSON.parse(rawCollapsed) as Record<string, boolean>;
      }

      if (!panelCache.has(storageKeys.scope)) {
        const rawSnapshot = localStorage.getItem(storageKeys.snapshot);
        if (rawSnapshot) {
          const snapshot = JSON.parse(rawSnapshot) as PanelPayload;
          if (
            Array.isArray(snapshot?.spaces?.items) &&
            Array.isArray(snapshot?.folders?.items) &&
            Array.isArray(snapshot?.projects?.items)
          ) {
            for (const space of snapshot.spaces.items) {
              if (nextCollapsed[space.id] === undefined) nextCollapsed[space.id] = true;
            }
            panelCache.set(storageKeys.scope, { data: snapshot, loadedAt: 0 });
            setSpaces(snapshot.spaces.items);
            setFolders(snapshot.folders.items);
            setProjects(snapshot.projects.items);
            setHiddenSpaces(snapshot.hidden_spaces ?? []);
            setPinnedClients(snapshot.pinned_clients ?? []);
            setLoadingPanel(false);
          }
        }
      }
      setCollapseState({ scope: storageKeys.scope, value: nextCollapsed });
    } catch {
      setCollapseState({ scope: storageKeys.scope, value: nextCollapsed });
      // localStorage is optional; in-memory state still works.
    }
  }, [storageKeys.collapsed, storageKeys.scope, storageKeys.snapshot]);

  useEffect(() => {
    if (collapseState.scope !== storageKeys.scope) return;
    try {
      localStorage.setItem(storageKeys.collapsed, JSON.stringify(collapseState.value));
    } catch {
      // Persistence is best-effort only.
    }
  }, [collapseState, storageKeys.collapsed, storageKeys.scope]);

  const loadPanel = useCallback(
    (options?: { force?: boolean; query?: string }) => {
      if (!enabledRef.current) return;
      const query = options?.query?.trim() ?? "";
      activeQueryRef.current = query;
      const requestId = ++loadRequestId.current;
      setPanelLoadFailed(false);
      if (query) setSearchResults([]);
      if (query || !panelCache.has(storageKeys.scope)) setLoadingPanel(true);

      fetchPanelData(storageKeys.scope, options?.force === true, query)
        .then((data) => {
          if (!enabledRef.current || requestId !== loadRequestId.current) return;
          const nextSpaces = data.spaces.items ?? [];
          const nextProjects = data.projects.items ?? [];
          const nextFolders = data.folders.items ?? [];
          setSpaces(nextSpaces);
          setProjects(nextProjects);
          setFolders(nextFolders);
          setHiddenSpaces(data.hidden_spaces ?? []);
          setPinnedClients(data.pinned_clients ?? []);
          setSearchResults(data.search_results ?? []);
          setPanelLoadFailed(false);

          if (!query) {
            try {
              localStorage.setItem(storageKeys.snapshot, JSON.stringify(data));
            } catch {
              // Snapshot persistence is best-effort only.
            }
          }

          setCollapsed((current) => {
            const next = { ...current };
            for (const space of nextSpaces) {
              if (next[space.id] === undefined) next[space.id] = true;
            }
            for (const folder of nextFolders) {
              if (next[folder.id] !== undefined) continue;
              const directFolderCount = nextFolders.filter(
                (candidate) => candidate.parent_id === folder.id,
              ).length;
              const directProjectCount = nextProjects.filter(
                (project) => (project.folder_id ?? null) === folder.id,
              ).length;
              if (directFolderCount + directProjectCount > SMART_COLLAPSE_CHILD_LIMIT) {
                next[folder.id] = true;
              }
            }
            return next;
          });
        })
        .catch((err) => {
          if (!enabledRef.current || requestId !== loadRequestId.current) return;
          if (recoverExpiredSession(err)) return;
          setPanelLoadFailed(true);
          logError("sidebar:loadPanel", err);
        })
        .finally(() => {
          if (enabledRef.current && requestId === loadRequestId.current) setLoadingPanel(false);
        });
    },
    [setCollapsed, storageKeys.scope, storageKeys.snapshot],
  );


  useEffect(() => {
    if (!enabled) return;
    // Reopening a collapsed panel reuses a fresh cache or reloads an
    // invalidated one without making the closed sidebar poll in the background.
    loadPanel();
  }, [enabled, loadPanel]);

  useEffect(() => {
    const handler = () => {
      // Do not wake a closed navigation tree just to refresh it. A mutation
      // invalidates its snapshot, and opening the panel fetches the fresh data.
      if (!enabled) {
        panelCache.delete(storageKeys.scope);
        return;
      }
      loadPanel({ force: true });
    };
    window.addEventListener("upflow:sidebar-refresh", handler);
    return () => window.removeEventListener("upflow:sidebar-refresh", handler);
  }, [enabled, loadPanel, storageKeys.scope]);
  useEffect(() => {
    if (!enabled) return;
    const refreshWorkload = () => {
      if (document.visibilityState !== "visible" || activeQueryRef.current) return;
      // The 60 second cache keeps focus changes from producing duplicate
      // workspace-tree requests while still refreshing long-open panels.
      loadPanel();
    };
    const interval = window.setInterval(refreshWorkload, WORKLOAD_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", refreshWorkload);
    document.addEventListener("visibilitychange", refreshWorkload);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWorkload);
      document.removeEventListener("visibilitychange", refreshWorkload);
    };
  }, [enabled, loadPanel]);

  useEffect(() => {
    if (!pathname) return;
    const openIds = new Set<string>();
    const openFolderAncestors = (folderId: string | null | undefined) => {
      let cursor = folderId ? folders.find((folder) => folder.id === folderId) : null;
      while (cursor) {
        openIds.add(cursor.id);
        openIds.add(cursor.space_id);
        cursor = cursor.parent_id
          ? folders.find((folder) => folder.id === cursor?.parent_id)
          : null;
      }
    };

    const folderMatch = pathname.match(/^\/folders\/([^/?#]+)/);
    const projectMatch = pathname.match(/^\/projects\/([^/?#]+)/);
    const spaceMatch = pathname.match(/^\/spaces\/([^/?#]+)/);

    if (folderMatch) {
      const folder = folders.find((candidate) => candidate.id === folderMatch[1]);
      if (folder) openFolderAncestors(folder.id);
    } else if (projectMatch) {
      const project = projects.find((candidate) => candidate.id === projectMatch[1]);
      if (project?.folder_id) openFolderAncestors(project.folder_id);
      if (project?.space_id) openIds.add(project.space_id);
      if (!project?.space_id && !project?.folder_id) openIds.add("__unassigned__");
    } else if (spaceMatch) {
      openIds.add(spaceMatch[1]);
    }

    if (openIds.size === 0) return;
    setCollapsed((current) => {
      let changed = false;
      const next = { ...current };
      for (const id of openIds) {
        if (next[id] === false) continue;
        next[id] = false;
        changed = true;
      }
      return changed ? next : current;
    });
  }, [folders, pathname, projects, setCollapsed]);

  useEffect(() => {
    if (!menuOpenId) return;
    const handle = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target && target.closest('[role="menu"], [data-menu-trigger]')) return;
      setMenuOpenId(null);
    };
    const timer = window.setTimeout(() => document.addEventListener("mousedown", handle), 0);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpenId(null);
    };
    document.addEventListener("keydown", handleKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [menuOpenId]);

  const toggleCollapse = useCallback(
    (id: string) => setCollapsed((current) => ({ ...current, [id]: !current[id] })),
    [setCollapsed],
  );

  const collapseAll = useCallback(
    (ids: string[]) => {
      setCollapsed((current) => {
        const next = { ...current };
        for (const id of ids) next[id] = true;
        return next;
      });
    },
    [setCollapsed],
  );

  const upsertSpace = useCallback(
    (space: Space) => {
      setSpaces((current) => {
        const exists = current.some((item) => item.id === space.id);
        const next = exists
          ? current.map((item) => (item.id === space.id ? space : item))
          : [...current, space].sort((a, b) => {
              const positionDelta = (a.position ?? 0) - (b.position ?? 0);
              return positionDelta !== 0 ? positionDelta : a.name.localeCompare(b.name);
            });
        const cached = panelCache.get(storageKeys.scope);
        if (cached) {
          panelCache.set(storageKeys.scope, {
            ...cached,
            data: {
              ...cached.data,
              spaces: { ...cached.data.spaces, items: next },
            },
          });
        }
        return next;
      });
    },
    [storageKeys.scope],
  );

  const reorderSpaces = useCallback(
    (orderedIds: string[]) => {
      setSpaces((current) => {
        const byId = new Map(current.map((space) => [space.id, space]));
        const ordered = orderedIds
          .map((id) => byId.get(id))
          .filter((space): space is Space => Boolean(space));
        const orderedSet = new Set(ordered.map((space) => space.id));
        const next = [...ordered, ...current.filter((space) => !orderedSet.has(space.id))]
          .map((space, position) => ({ ...space, position }));

        const cached = panelCache.get(storageKeys.scope);
        if (cached) {
          const nextPayload: PanelPayload = {
            ...cached.data,
            spaces: { ...cached.data.spaces, items: next },
          };
          panelCache.set(storageKeys.scope, { ...cached, data: nextPayload });
          try {
            localStorage.setItem(storageKeys.snapshot, JSON.stringify(nextPayload));
          } catch {
            // Snapshot persistence is best-effort only.
          }
        }

        return next;
      });
    },
    [storageKeys.scope, storageKeys.snapshot],
  );

  return {
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
  };
}
