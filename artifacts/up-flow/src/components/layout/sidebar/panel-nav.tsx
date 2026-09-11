"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronsUp, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";
import {
  isPrimaryNavItemActive,
  primaryNav,
  resolvePrimaryNavHref,
} from "@/components/layout/sidebar/rail";
import { formatInboxPendingBadge } from "@/lib/inbox-pending-count";

interface PanelNavProps {
  pathname: string;
  clientsHref: string;
  onNavigate?: () => void;
  onCreateSpace: () => void;
  onCollapseAll: () => void;
  canManageWorkspace: boolean;
  pinnedContent?: ReactNode;
  inboxPendingCount?: number;
}

export function PanelNav({
  pathname,
  clientsHref,
  onNavigate,
  onCreateSpace,
  onCollapseAll,
  canManageWorkspace,
  pinnedContent,
  inboxPendingCount = 0,
}: PanelNavProps) {
  const { t } = useLanguage();
  return (
    <>
      <div className="px-4 pb-1 pt-[12.5px]">
        <p className="text-[9px] uppercase tracking-[0.2em] text-blue-200/45">
          {t("sidebar.navigation")}
        </p>
      </div>
      <nav
        data-testid="sidebar-panel-navigation"
        className="flex flex-col gap-1.5 px-2 pb-2"
      >
        {primaryNav.map((item) => {
          const Icon = item.icon;
          const label = t(item.labelKey) || item.label;
          const href = resolvePrimaryNavHref(item, clientsHref);
          const active = isPrimaryNavItemActive(pathname, item, clientsHref);
          return (
            <Link
              key={item.href}
              href={href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-11 shrink-0 items-center gap-2 overflow-hidden rounded-xl px-3 text-xs font-semibold outline-none transition-all focus-visible:ring-2 focus-visible:ring-primary/60",
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
                  "relative h-3.5 w-3.5",
                  active && "drop-shadow-[0_0_8px_rgba(147,197,253,0.8)]",
                )}
              />
              <span className="relative truncate">{label}</span>
              {item.href === "/inbox" && inboxPendingCount > 0 ? (
                <span
                  data-testid="sidebar-panel-inbox-count"
                  aria-label={t("sidebar.inboxPendingCount", {
                    count: inboxPendingCount,
                  })}
                  className={cn(
                    "relative ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums",
                    active
                      ? "bg-white/20 text-white"
                      : "bg-rose-500/15 text-rose-500 dark:text-rose-300",
                  )}
                >
                  {formatInboxPendingBadge(inboxPendingCount)}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
      {pinnedContent ? <div className="px-2 pb-2">{pinnedContent}</div> : null}
      {canManageWorkspace ? (
        <>
          <div className="mx-3 border-t border-blue-300/10" />
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <p className="text-[9px] uppercase tracking-[0.2em] text-blue-200/45">
              {t("sidebar.spaces")}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onCollapseAll}
                aria-label={t("sidebar.collapseAll")}
                title={t("sidebar.collapseAll")}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-white/10 hover:text-foreground hover:shadow-[0_0_16px_rgba(59,130,246,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <ChevronsUp className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onCreateSpace}
                aria-label={t("sidebar.newSpace")}
                title={t("sidebar.newSpace")}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-white/10 hover:text-foreground hover:shadow-[0_0_16px_rgba(59,130,246,0.12)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
