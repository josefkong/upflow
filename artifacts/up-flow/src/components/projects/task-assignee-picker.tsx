"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";
import {
  Bell,
  Check,
  ChevronsUpDown,
  Loader2,
  UserCheck,
  UserMinus,
  X,
} from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { TaskAssignee } from "@/lib/types";

export interface TaskAssigneePickerProps {
  value: string;
  users: TaskAssignee[];
  onChange: (value: string) => void;
  disabled?: boolean;
  loading?: boolean;
  label?: string;
  emptyLabel?: string;
  mode?: "create" | "update";
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  /** Trap focus inside the picker when it is opened from another modal. */
  modal?: boolean;
  /** Sends an immediate project-level notification when provided. */
  onNotify?: () => void | Promise<void>;
  notifying?: boolean;
  /** Compact controls rendered beside the clear-assignee button. */
  trailingActions?: ReactNode;
  /** Keeps the primary assignee assigned while allowing it to be changed. */
  showClear?: boolean;
  /** @deprecated Use triggerClassName. Kept for existing task forms. */
  selectClassName?: string;
}

function initialsFor(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return initials || "?";
}

export default function TaskAssigneePicker({
  value,
  users,
  onChange,
  disabled = false,
  loading = false,
  label,
  emptyLabel,
  mode = "create",
  className,
  triggerClassName,
  contentClassName,
  modal = false,
  onNotify,
  notifying = false,
  trailingActions,
  showClear = true,
  selectClassName,
}: TaskAssigneePickerProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const id = useId();
  const triggerId = `${id}-trigger`;
  const listId = `${id}-listbox`;
  const hintId = `${id}-hint`;
  const resolvedLabel = label ?? t("toolbar.assignee");
  const resolvedEmptyLabel = emptyLabel ?? t("common.unassigned");
  const selected = users.find((user) => user.id === value) ?? null;
  const interactionDisabled = disabled || loading;

  const notifyText = onNotify
    ? t("taskAssigneePicker.notifyProjectHint")
    : loading
      ? t("taskAssigneePicker.loading")
      : selected
        ? mode === "create"
          ? t("task.assigneeNotifyOnCreate", { name: selected.name })
          : t("task.assigneeNotifyOnAssignment", { name: selected.name })
        : value
          ? t("taskAssigneePicker.selectedUnavailable")
          : t("task.noAssigneeNotification");

  const closePicker = () => {
    setOpen(false);
    setQuery("");
  };

  const selectAssignee = (nextValue: string) => {
    onChange(nextValue);
    closePicker();
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={triggerId} className="text-sm font-medium text-foreground">
          {resolvedLabel}
        </label>
        {onNotify ? (
          <button
            type="button"
            onClick={() => void onNotify()}
            disabled={interactionDisabled || notifying}
            aria-label={t("taskAssigneePicker.notifyProjectAria")}
            title={t("taskAssigneePicker.notifyProjectAria")}
            className="inline-flex min-h-7 items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary transition hover:border-primary/35 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {notifying ? (
              <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />
            ) : (
              <Bell aria-hidden="true" className="h-3 w-3" />
            )}
            {notifying ? t("taskAssigneePicker.notifying") : t("task.notify")}
          </button>
        ) : selected ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
            <Bell aria-hidden="true" className="h-3 w-3" />
            {t("task.notify")}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            <UserMinus aria-hidden="true" className="h-3 w-3" />
            {t("task.noOwner")}
          </span>
        )}
      </div>

      <div className="flex items-stretch gap-2">
        <Popover
          modal={modal}
          open={open}
          onOpenChange={(nextOpen) => {
            if (interactionDisabled) return;
            setOpen(nextOpen);
            if (!nextOpen) setQuery("");
          }}
        >
          <PopoverTrigger asChild>
            <button
              id={triggerId}
              type="button"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listId}
              aria-describedby={hintId}
              aria-label={`${resolvedLabel}: ${selected?.name ?? resolvedEmptyLabel}`}
              disabled={interactionDisabled}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  event.preventDefault();
                  setOpen(true);
                }
              }}
              className={cn(
                "flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60",
                selectClassName,
                triggerClassName,
              )}
            >
              {loading ? (
                <Loader2 aria-hidden="true" className="h-5 w-5 shrink-0 animate-spin text-muted-foreground" />
              ) : selected ? (
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
                >
                  {initialsFor(selected.name)}
                </span>
              ) : (
                <UserMinus aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
              )}

              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">
                  {loading
                    ? t("taskAssigneePicker.loading")
                    : selected?.name ?? resolvedEmptyLabel}
                </span>
                {selected?.email ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {selected.email}
                  </span>
                ) : null}
              </span>
              <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            className={cn(
              "w-[var(--radix-popover-trigger-width)] min-w-[280px] overflow-hidden p-0",
              contentClassName,
            )}
          >
            <Command>
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder={t("taskAssigneePicker.searchPlaceholder")}
              />
              <CommandList id={listId}>
                <CommandEmpty>
                  {query.trim()
                    ? t("taskAssigneePicker.noMatches", { query: query.trim() })
                    : t("taskAssigneePicker.noMembers")}
                </CommandEmpty>

                {value ? (
                  <>
                    <CommandGroup>
                      <CommandItem
                        value={`${resolvedEmptyLabel} unassigned no owner`}
                        onSelect={() => selectAssignee("")}
                      >
                        <UserMinus aria-hidden="true" className="text-muted-foreground" />
                        <span>{resolvedEmptyLabel}</span>
                      </CommandItem>
                    </CommandGroup>
                    <CommandSeparator />
                  </>
                ) : null}

                {users.length > 0 ? (
                  <CommandGroup heading={t("taskAssigneePicker.activeMembers")}>
                    {users.map((user) => {
                      const isSelected = user.id === selected?.id;
                      return (
                        <CommandItem
                          key={user.id}
                          value={`${user.name} ${user.email} ${user.id}`}
                          onSelect={() => selectAssignee(user.id)}
                          aria-selected={isSelected}
                          className="py-2"
                        >
                          <span
                            aria-hidden="true"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary"
                          >
                            {initialsFor(user.name)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">{user.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {user.email}
                            </span>
                          </span>
                          <Check
                            aria-hidden="true"
                            className={cn("ml-auto", isSelected ? "opacity-100" : "opacity-0")}
                          />
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                ) : null}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {value && showClear ? (
          <button
            type="button"
            onClick={() => onChange("")}
            disabled={interactionDisabled}
            aria-label={t("taskAssigneePicker.clear")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}

        {trailingActions}
      </div>

      <p id={hintId} className="flex items-start gap-1.5 text-xs text-muted-foreground" aria-live="polite">
        {selected ? (
          <UserCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        ) : (
          <UserMinus aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        )}
        <span>{notifyText}</span>
      </p>
    </div>
  );
}
