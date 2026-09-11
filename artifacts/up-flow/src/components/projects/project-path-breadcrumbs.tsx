"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type ProjectPathItem = {
  label: string;
  href?: string;
  onClick?: () => void;
  current?: boolean;
};

export default function ProjectPathBreadcrumbs({
  items,
  ariaLabel,
}: {
  items: ProjectPathItem[];
  ariaLabel: string;
}) {
  return (
    <nav
      aria-label={ariaLabel}
      className="flex items-center gap-1 overflow-x-auto text-xs text-muted-foreground"
    >
      {items.map((item, index) => {
        const className = cn(
          "shrink-0 rounded-lg py-1.5 transition hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          index === 0 ? "pr-2" : "px-2",
          item.current && "font-semibold text-foreground",
        );

        return (
          <span key={`${item.label}-${index}`} className="flex shrink-0 items-center gap-1">
            {index > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
            {item.href ? (
              <Link href={item.href} className={className} aria-current={item.current ? "page" : undefined}>
                {item.label}
              </Link>
            ) : item.onClick ? (
              <button
                type="button"
                onClick={item.onClick}
                className={className}
                aria-current={item.current ? "page" : undefined}
              >
                {item.label}
              </button>
            ) : (
              <span className={className} aria-current={item.current ? "page" : undefined}>
                {item.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
