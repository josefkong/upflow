"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { toast } from "sonner";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { logError } from "@/lib/log-error";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import type { AppUser } from "@/lib/types";
import { Rail } from "@/components/layout/sidebar/rail";
import {
  INBOX_PENDING_COUNT_EVENT,
  type InboxPendingCountDetail,
} from "@/lib/inbox-pending-count";

// The full navigation panel contains the workspace tree, dialogs, and search.
// Code-split it from the rail, while still mounting it after hydration so the
// existing workspace maintenance behavior continues to run.
const Panel = dynamic(() => import("@/components/layout/sidebar/panel"), {
  ssr: false,
  loading: () => <div className="min-h-0 w-[272px]" aria-busy="true" />,
});

interface SidebarProps {
  user: AppUser;
  clientsHref: string;
  workspaces: Array<{
    id: string;
    name: string;
    slug: string;
    role: "owner" | "admin" | "member" | "guest";
  }>;
  initialDesktopSidebarOpen: boolean;
}

const DESKTOP_SIDEBAR_KEY = "upflow.sidebar.desktopOpen.v2";

export default function Sidebar({
  user,
  clientsHref,
  workspaces,
  initialDesktopSidebarOpen,
}: SidebarProps) {
  const { t } = useLanguage();
  const pathname = usePathname() ?? "";
  const [mounted, setMounted] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [inboxPendingCount, setInboxPendingCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] =
    useState(initialDesktopSidebarOpen);
  const [isDesktopViewport, setIsDesktopViewport] = useState(false);
  const desktopSidebarRef = useRef<HTMLElement>(null);
  const desktopToggleRef = useRef<HTMLButtonElement>(null);
  const mobileToggleRef = useRef<HTMLButtonElement>(null);
  const mobileDialogRef = useRef<HTMLElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const mobileBackwardWrapTargetRef = useRef<HTMLElement>(null);
  const lastNavigationFocusRef = useRef<"mobile" | "desktop" | null>(null);
  const closeMobileNavigation = useCallback((restoreFocus = true) => {
    setMobileOpen(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => mobileToggleRef.current?.focus());
    }
  }, []);
  const closeMobileNavigationAfterNavigate = useCallback(
    () => closeMobileNavigation(false),
    [closeMobileNavigation],
  );
  const closeDesktopSidebar = useCallback(() => {
    setDesktopSidebarOpen(false);
    window.requestAnimationFrame(() => desktopToggleRef.current?.focus());
  }, []);
  const toggleDesktopSidebar = useCallback(() => {
    setDesktopSidebarOpen((current) => !current);
    window.requestAnimationFrame(() => desktopToggleRef.current?.focus());
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setInboxPendingCount(0);
    const handlePendingCount = (event: Event) => {
      const detail = (event as CustomEvent<InboxPendingCountDetail>).detail;
      if (!detail || detail.userId !== user.id) return;
      setInboxPendingCount(detail.count);
    };
    window.addEventListener(INBOX_PENDING_COUNT_EVENT, handlePendingCount);
    return () => {
      window.removeEventListener(INBOX_PENDING_COUNT_EVENT, handlePendingCount);
    };
  }, [user.id]);

  useEffect(() => {
    const navigationFor = (target: EventTarget | null) => {
      if (!(target instanceof Node)) return null;
      if (
        target === mobileToggleRef.current ||
        mobileDialogRef.current?.contains(target)
      ) {
        return "mobile" as const;
      }
      if (desktopSidebarRef.current?.contains(target)) {
        return "desktop" as const;
      }
      return null;
    };
    const rememberFocus = (event: FocusEvent) => {
      const navigation = navigationFor(event.target);
      if (navigation) {
        lastNavigationFocusRef.current = navigation;
      } else if (
        event.target !== document.body &&
        event.target !== document.documentElement
      ) {
        lastNavigationFocusRef.current = null;
      }
    };
    const rememberPointer = (event: PointerEvent) => {
      lastNavigationFocusRef.current = navigationFor(event.target);
    };
    document.addEventListener("focusin", rememberFocus);
    document.addEventListener("pointerdown", rememberPointer, true);
    return () => {
      document.removeEventListener("focusin", rememberFocus);
      document.removeEventListener("pointerdown", rememberPointer, true);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;
    try {
      localStorage.setItem(
        DESKTOP_SIDEBAR_KEY,
        desktopSidebarOpen ? "1" : "0",
      );
    } catch {
      // localStorage may be unavailable; the cookie remains the source of truth.
    }
    document.cookie =
      DESKTOP_SIDEBAR_KEY + "=" + (desktopSidebarOpen ? "1" : "0") +
      "; Path=/; Max-Age=31536000; SameSite=Lax";
  }, [desktopSidebarOpen, mounted]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--upflow-desktop-sidebar-width",
      desktopSidebarOpen ? "336px" : "64px",
    );
  }, [desktopSidebarOpen]);

  useEffect(
    () => () => {
      document.documentElement.style.removeProperty(
        "--upflow-desktop-sidebar-width",
      );
    },
    [],
  );

  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const handleViewportChange = () => setIsDesktopViewport(query.matches);
    handleViewportChange();
    query.addEventListener("change", handleViewportChange);
    return () => {
      query.removeEventListener("change", handleViewportChange);
    };
  }, []);

  useEffect(() => {
    if (isDesktopViewport) {
      const mobileNavigationFocused =
        document.activeElement === mobileToggleRef.current ||
        mobileDialogRef.current?.contains(document.activeElement) ||
        lastNavigationFocusRef.current === "mobile";
      if (mobileOpen) setMobileOpen(false);
      if (mobileOpen || mobileNavigationFocused) {
        window.requestAnimationFrame(() => {
          lastNavigationFocusRef.current = null;
          desktopToggleRef.current?.focus();
        });
      }
      return;
    }

    const desktopNavigationFocused =
      desktopSidebarRef.current?.contains(document.activeElement) ||
      lastNavigationFocusRef.current === "desktop";
    if (desktopNavigationFocused) {
      lastNavigationFocusRef.current = null;
      window.requestAnimationFrame(() => mobileToggleRef.current?.focus());
    }
  }, [desktopSidebarOpen, isDesktopViewport, mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;

    mobileCloseRef.current?.focus();

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeMobileNavigation();
        return;
      }

      if (event.key !== "Tab" || !mobileDialogRef.current) return;
      const focusables = mobileDialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        mobileBackwardWrapTargetRef.current = last;
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === mobileBackwardWrapTargetRef.current)
      ) {
        event.preventDefault();
        first.focus();
        mobileBackwardWrapTargetRef.current = null;
      } else {
        mobileBackwardWrapTargetRef.current = null;
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => {
      mobileBackwardWrapTargetRef.current = null;
      document.removeEventListener("keydown", handleKey);
    };
  }, [closeMobileNavigation, mobileOpen]);

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      await supabase.auth.signOut();
      toast.success(t("auth.signedOut"));
      window.location.assign("/login");
    } catch (err) {
      logError("sidebar:sign-out", err);
      toast.error(t("auth.signOutFailed"));
      setSigningOut(false);
    }
  };

  const renderRail = (
    onNavigate?: () => void,
    options: { panelId?: string; showPanelToggle?: boolean } = {},
  ) => (
    <Rail
      user={user}
      clientsHref={clientsHref}
      pathname={pathname}
      panelOpen={desktopSidebarOpen}
      inboxPendingCount={inboxPendingCount}
      panelId={options.panelId}
      showPanelToggle={options.showPanelToggle}
      toggleRef={options.panelId ? desktopToggleRef : undefined}
      onTogglePanel={toggleDesktopSidebar}
      onSignOut={handleSignOut}
      onNavigate={onNavigate}
    />
  );

  if (!mounted) {
    return (
      <aside
        className={cn(
          "hidden flex-shrink-0 md:flex",
          initialDesktopSidebarOpen ? "w-[336px]" : "w-[64px]",
        )}
        aria-hidden="true"
      >
        <div className="flex w-full glass-rail" />
      </aside>
    );
  }

  return (
    <>
      <aside
        ref={desktopSidebarRef}
        id="desktop-sidebar"
        data-testid="desktop-sidebar"
        className={cn(
          "hidden h-dvh min-h-0 flex-shrink-0 overflow-hidden transition-[width] duration-200 ease-out motion-reduce:transition-none md:flex",
          desktopSidebarOpen ? "w-[336px]" : "w-[64px]",
        )}
      >
        <div
          data-testid="desktop-sidebar-rail"
          className="flex min-h-0 w-[64px] min-w-[64px] shrink-0"
        >
          {renderRail(undefined, { panelId: "desktop-sidebar-panel" })}
        </div>
        <div
          id="desktop-sidebar-panel"
          data-testid="desktop-sidebar-panel"
          className={cn(
            "grid min-h-0 shrink-0 overflow-hidden transition-[width,opacity] duration-200 ease-out motion-reduce:transition-none",
            desktopSidebarOpen
              ? "w-[272px] opacity-100"
              : "pointer-events-none w-0 opacity-0",
          )}
          aria-hidden={!desktopSidebarOpen}
          inert={desktopSidebarOpen ? undefined : true}
        >
          <div className="flex min-h-0 w-[272px]">
            <Panel
              pathname={pathname}
              workspaces={workspaces}
              currentWorkspaceId={user.currentWorkspaceId ?? ""}
              currentUserId={user.id}
              currentRole={user.currentRole ?? null}
              clientsHref={clientsHref}
              userName={user.name || user.email}
              isSuperAdmin={user.isSuperAdmin === true}
              active={desktopSidebarOpen && isDesktopViewport}
              onRequestClose={closeDesktopSidebar}
              onSignOut={handleSignOut}
              signingOut={signingOut}
              inboxPendingCount={inboxPendingCount}
            />
          </div>
        </div>
      </aside>


      {!mobileOpen && (
        <div className="fixed left-3 top-3 z-[60] md:hidden">
          <button
            ref={mobileToggleRef}
            onClick={() => setMobileOpen(true)}
            aria-label={t("sidebar.openNavigation")}
            aria-expanded={false}
            aria-controls="mobile-sidebar-dialog"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-lg"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      )}

      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/60 z-40"
            onClick={() => closeMobileNavigation()}
          />
          <aside
            ref={mobileDialogRef}
            id="mobile-sidebar-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("sidebar.navigation")}
            className="fixed left-0 top-0 z-50 flex h-dvh min-h-0 w-[min(100vw,336px)] overflow-hidden border-r border-sidebar-border shadow-2xl md:hidden"
          >
            <button
              ref={mobileCloseRef}
              type="button"
              onClick={() => closeMobileNavigation()}
              aria-label={t("sidebar.closeNavigation")}
              className="absolute left-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/70"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="flex min-h-0 w-[64px]">
              {renderRail(closeMobileNavigationAfterNavigate, {
                showPanelToggle: false,
              })}
            </div>
            <div className="min-h-0 min-w-0 flex-1">
              <Panel
                pathname={pathname}
                workspaces={workspaces}
                currentWorkspaceId={user.currentWorkspaceId ?? ""}
                currentUserId={user.id}
                currentRole={user.currentRole ?? null}
                clientsHref={clientsHref}
                userName={user.name || user.email}
                isSuperAdmin={user.isSuperAdmin === true}
                active
                onNavigate={closeMobileNavigationAfterNavigate}
                onSignOut={handleSignOut}
                signingOut={signingOut}
                inboxPendingCount={inboxPendingCount}
              />
            </div>
          </aside>
        </>
      )}
    </>
  );
}
