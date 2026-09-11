"use client";

import type { Ref } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  LayoutGrid,
  Users,
  Clock,
  Inbox,
  Calendar,
  DoorOpen,
  Kanban,
  Building2,
  Activity,
  ClipboardCheck,
  HelpCircle,
  LogOut,
  PanelLeftOpen,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { cn, getInitials } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import type { AppUser } from "@/lib/types";
import { formatInboxPendingBadge } from "@/lib/inbox-pending-count";

export interface NavItem {
  href: string;
  label: string;
  labelKey: string;
  icon: LucideIcon;
}

export const primaryNav: NavItem[] = [
  {
    href: "/",
    label: "Dashboard",
    labelKey: "nav.dashboard",
    icon: LayoutGrid,
  },
  { href: "/inbox", label: "Inbox", labelKey: "nav.inbox", icon: Inbox },
  {
    href: "/calendar",
    label: "Calendar",
    labelKey: "nav.calendar",
    icon: Calendar,
  },
  {
    href: "/projects",
    label: "Projects",
    labelKey: "nav.projects",
    icon: Kanban,
  },
  {
    href: "/clients",
    label: "Clients",
    labelKey: "nav.clients",
    icon: Building2,
  },
  {
    href: "/onboarding",
    label: "Onboarding",
    labelKey: "nav.onboarding",
    icon: ClipboardCheck,
  },
  { href: "/team", label: "Team", labelKey: "nav.team", icon: Users },
  {
    href: "/time",
    label: "Time Tracking",
    labelKey: "nav.timeTracking",
    icon: Clock,
  },
  {
    href: "/sala-de-reuniao",
    label: "Meeting Room",
    labelKey: "nav.meetingRoom",
    icon: DoorOpen,
  },
  {
    href: "/activity",
    label: "Activity",
    labelKey: "nav.activity",
    icon: Activity,
  },
];

interface RailProps {
  user: AppUser;
  clientsHref: string;
  pathname: string | null;
  panelOpen: boolean;
  inboxPendingCount?: number;
  panelId?: string;
  showPanelToggle?: boolean;
  toggleRef?: Ref<HTMLButtonElement>;
  onTogglePanel: () => void;
  onSignOut: () => void;
  onNavigate?: () => void;
}

function isActiveHref(pathname: string | null, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || (pathname?.startsWith(href + "/") ?? false);
}

export function resolvePrimaryNavHref(item: NavItem, clientsHref: string) {
  return item.labelKey === "nav.clients" ? clientsHref : item.href;
}

export function isPrimaryNavItemActive(
  pathname: string | null,
  item: NavItem,
  clientsHref: string,
) {
  const clientsActive =
    isActiveHref(pathname, "/clients") ||
    (clientsHref !== "/clients" && isActiveHref(pathname, clientsHref));

  if (item.labelKey === "nav.clients") return clientsActive;
  if (item.href === "/projects" && clientsActive) return false;
  return isActiveHref(pathname, item.href);
}

export function Rail({
  user,
  clientsHref,
  pathname,
  panelOpen,
  inboxPendingCount = 0,
  panelId,
  showPanelToggle = true,
  toggleRef,
  onTogglePanel,
  onSignOut,
  onNavigate,
}: RailProps) {
  const { t } = useLanguage();

  return (
    <div
      data-testid="sidebar-rail"
      className="upflow-sidebar-panel relative flex h-full w-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-sm dark:border-blue-300/10 dark:bg-[#050816] dark:shadow-[inset_-1px_0_0_rgba(96,165,250,0.06)]"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_8%,rgba(59,130,246,0.16),transparent_32%),radial-gradient(circle_at_95%_34%,rgba(139,92,246,0.12),transparent_28%)]" />
      <div className="pointer-events-none absolute right-0 top-0 h-full w-px bg-gradient-to-b from-blue-400/30 via-violet-400/[0.35] to-transparent" />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center pb-[10px] pt-[18px]">
        {showPanelToggle && (
          <div className="flex h-11 w-full shrink-0 items-center justify-center">
            <button
              ref={toggleRef}
              type="button"
              data-testid="sidebar-panel-toggle"
              onClick={onTogglePanel}
              title={panelOpen ? t("sidebar.hide") : t("sidebar.show")}
              aria-label={panelOpen ? t("sidebar.hide") : t("sidebar.show")}
              aria-controls={panelId}
              aria-expanded={panelOpen}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background/70 text-muted-foreground shadow-sm outline-none transition-all hover:border-sky-400/40 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60 dark:border-white/10 dark:bg-white/[0.15] dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] dark:hover:bg-sky-400/10"
            >
              <PanelLeftOpen className="h-5 w-5" />
              <span className="sr-only">
                {panelOpen ? t("sidebar.hide") : t("sidebar.show")}
              </span>
            </button>
          </div>
        )}
        <div
          data-testid="sidebar-rail-brand"
          className="flex h-11 w-full shrink-0 items-center justify-center"
        >
          <Link
            href="/"
            onClick={onNavigate}
            className="flex h-11 w-11 items-center justify-center rounded-xl outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-primary/60"
            aria-label="Up Flow"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1 shadow-[0_4px_16px_rgba(0,0,0,0.24)]">
              <Image
                src="/assets/UP_LOGO_1778594851568.png"
                alt="Up Flow"
                width={36}
                height={36}
                className="h-full w-full object-contain"
                priority
              />
            </span>
          </Link>
        </div>

        <nav
          data-testid="sidebar-rail-navigation"
          className="flex min-h-0 w-full flex-1 flex-col items-center gap-1.5 overflow-y-auto overscroll-contain px-1 py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {primaryNav.map((item) => {
            const { label, labelKey, icon: Icon } = item;
            const href = resolvePrimaryNavHref(item, clientsHref);
            const active = isPrimaryNavItemActive(pathname, item, clientsHref);
            const translatedLabel = t(labelKey) || label;
            const isInbox = href === "/inbox";
            const pendingLabel = t("sidebar.inboxPendingCount", {
              count: inboxPendingCount,
            });
            const accessibleLabel =
              isInbox && inboxPendingCount > 0
                ? `${translatedLabel}, ${pendingLabel}`
                : translatedLabel;
            return (
              <Link
                key={href}
                href={href}
                onClick={onNavigate}
                title={accessibleLabel}
                aria-label={accessibleLabel}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/60",
                  active
                    ? "bg-gradient-to-r from-blue-600/55 to-violet-600/32 text-white shadow-[0_0_30px_rgba(37,99,235,0.28),inset_0_1px_0_rgba(255,255,255,0.14)] ring-1 ring-blue-300/20"
                    : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground hover:shadow-[0_0_22px_rgba(139,92,246,0.12)]",
                )}
              >
                {active && (
                  <>
                    <span className="absolute inset-0 bg-[radial-gradient(circle_at_15%_50%,rgba(96,165,250,0.24),transparent_42%)]" />
                    <span className="absolute left-0 h-6 w-0.5 rounded-full bg-sky-300 shadow-[0_0_14px_rgba(59,130,246,0.9)]" />
                  </>
                )}
                <Icon
                  className={cn(
                    "relative h-3.5 w-3.5 shrink-0",
                    active && "drop-shadow-[0_0_8px_rgba(147,197,253,0.8)]",
                  )}
                />
                {isInbox && inboxPendingCount > 0 ? (
                  <span
                    data-testid="sidebar-rail-inbox-count"
                    aria-hidden="true"
                    className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white shadow-[0_0_10px_rgba(244,63,94,0.45)]"
                  >
                    {formatInboxPendingBadge(inboxPendingCount)}
                  </span>
                ) : null}
                <span data-testid="sidebar-rail-item-label" className="sr-only">
                  {translatedLabel}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-1 flex w-full shrink-0 flex-col items-center gap-1.5 border-t border-blue-300/10 px-1 pt-1.5">
          <Link
            href="/settings"
            onClick={onNavigate}
            aria-label={t("sidebar.settings")}
            title={t("sidebar.settings")}
            className={cn(
              "relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl text-muted-foreground outline-none transition-all hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60",
              isActiveHref(pathname, "/settings") &&
                "bg-gradient-to-r from-blue-600/55 to-violet-600/32 text-white shadow-[0_0_30px_rgba(37,99,235,0.28),inset_0_1px_0_rgba(255,255,255,0.14)] ring-1 ring-blue-300/20",
            )}
          >
            {isActiveHref(pathname, "/settings") && (
              <>
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_15%_50%,rgba(96,165,250,0.24),transparent_42%)]" />
                <span className="absolute left-0 h-6 w-0.5 rounded-full bg-sky-300 shadow-[0_0_14px_rgba(59,130,246,0.9)]" />
              </>
            )}
            <Settings2 className="relative h-3.5 w-3.5" />
            <span className="sr-only">{t("sidebar.settings")}</span>
          </Link>
          <button
            onClick={onSignOut}
            aria-label={t("sidebar.signOut")}
            title={t("sidebar.signOut")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground outline-none transition-all hover:bg-rose-500/15 hover:text-rose-100 focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="sr-only">{t("sidebar.signOut")}</span>
          </button>
          <Link
            href="/docs"
            onClick={onNavigate}
            aria-label={t("sidebar.help")}
            title={t("sidebar.help")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground outline-none transition-all hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            <span className="sr-only">{t("sidebar.help")}</span>
          </Link>
          <Link
            href="/settings"
            onClick={onNavigate}
            aria-label={user.name || user.email || "User"}
            title={user.name || user.email || "User"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl outline-none transition-colors hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-primary/60"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-[11px] bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-500 text-[9px] font-bold text-white shadow-[0_0_20px_rgba(59,130,246,0.34)] ring-1 ring-white/[0.15]">
              {getInitials(user.name || user.email || "U")}
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
