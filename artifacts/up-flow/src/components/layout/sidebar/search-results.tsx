"use client";

import Link from "next/link";
import { Folder, Hash, ListTodo } from "lucide-react";
import type {
  SidebarSearchResult,
  SidebarSearchResultType,
} from "@/lib/sidebar-discovery";
import { useLanguage } from "@/components/language-provider";
import {
  localizeProjectName,
  localizeSpaceName,
} from "@/lib/i18n/project-name-translations";
import { cn } from "@/lib/utils";

function ResultIcon({ type }: { type: SidebarSearchResultType }) {
  if (type === "space") return <Hash className="h-4 w-4" />;
  if (type === "folder") return <Folder className="h-4 w-4" />;
  return <ListTodo className="h-4 w-4" />;
}

export function SidebarSearchResults({
  results,
  pathname,
  onNavigate,
}: {
  results: SidebarSearchResult[];
  pathname: string;
  onNavigate?: () => void;
}) {
  const { t, language } = useLanguage();
  return (
    <div
      className="space-y-1"
      role="list"
      aria-label={t("sidebar.searchResults")}
    >
      {results.map((result) => {
        const active = pathname === result.href;
        const displayName =
          result.type === "project"
            ? localizeProjectName(result.name, language)
            : result.type === "space"
              ? localizeSpaceName(result.name, language)
              : result.name;
        const breadcrumb = result.breadcrumb
          .map((segment, index) => {
            if (index === 0) return localizeSpaceName(segment, language);
            return result.type === "project" &&
              index === result.breadcrumb.length - 1
              ? localizeProjectName(segment, language)
              : segment;
          })
          .join(" › ");

        return (
          <Link
            key={`${result.type}:${result.id}`}
            href={result.href}
            onClick={onNavigate}
            role="listitem"
            aria-label={breadcrumb}
            title={breadcrumb}
            className={cn(
              "group flex min-w-0 items-start gap-2.5 rounded-xl border px-2.5 py-2 outline-none transition",
              active
                ? "border-primary/30 bg-primary/10 text-foreground"
                : "border-transparent text-foreground/90 hover:border-border hover:bg-accent/70 focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/50 dark:hover:border-blue-300/10 dark:hover:bg-white/[0.08]",
            )}
          >
            <span
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
                active && "bg-primary/15 text-primary",
              )}
            >
              <ResultIcon type={result.type} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">
                {displayName}
              </span>
              <span className="mt-0.5 block truncate text-[10px] leading-4 text-muted-foreground">
                {breadcrumb}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
