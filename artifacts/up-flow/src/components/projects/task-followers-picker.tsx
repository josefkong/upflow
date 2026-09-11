"use client";

import { useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Check, Loader2, Plus, UsersRound, X } from "lucide-react";
import { useLanguage } from "@/components/language-provider";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { TaskAssignee, TaskFollower } from "@/lib/types";

interface TaskFollowersPickerProps {
  followers: TaskFollower[];
  disabled?: boolean;
  onRemove: (follower: TaskFollower) => Promise<void>;
  headerAction?: ReactNode;
}

interface TaskFollowerAddButtonProps {
  followers: TaskFollower[];
  users: TaskAssignee[];
  primaryAssigneeId?: string | null;
  disabled?: boolean;
  onAdd: (user: TaskAssignee) => Promise<void>;
}

function initialsFor(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "?"
  );
}

export function TaskFollowerAddButton({
  followers,
  users,
  primaryAssigneeId,
  disabled = false,
  onAdd,
}: TaskFollowerAddButtonProps) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [addingUserId, setAddingUserId] = useState<string | null>(null);
  const id = useId();
  const listId = `${id}-listbox`;
  const followerIds = useMemo(
    () => new Set(followers.map((follower) => follower.user_id)),
    [followers],
  );
  const availableUsers = users.filter(
    (user) => user.id !== primaryAssigneeId && !followerIds.has(user.id),
  );

  const addFollower = async (user: TaskAssignee) => {
    setAddingUserId(user.id);
    try {
      await onAdd(user);
      setOpen(false);
      setQuery("");
    } finally {
      setAddingUserId(null);
    }
  };

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (disabled || addingUserId) return;
        setOpen(nextOpen);
        if (!nextOpen) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("taskFollowers.add")}
          title={t("taskFollowers.add")}
          aria-expanded={open}
          aria-controls={listId}
          disabled={
            disabled || Boolean(addingUserId) || availableUsers.length === 0
          }
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
        >
          {addingUserId ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Plus aria-hidden="true" className="h-4 w-4" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(340px,calc(100vw-2rem))] overflow-hidden p-0"
      >
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={t("taskFollowers.searchPlaceholder")}
          />
          <CommandList id={listId}>
            <CommandEmpty>
              {query.trim()
                ? t("taskFollowers.noMatches", { query: query.trim() })
                : t("taskFollowers.noMembers")}
            </CommandEmpty>
            <CommandGroup heading={t("taskFollowers.availableMembers")}>
              {availableUsers.map((user) => (
                <CommandItem
                  key={user.id}
                  value={`${user.name} ${user.email} ${user.id}`}
                  disabled={addingUserId === user.id}
                  onSelect={() => void addFollower(user)}
                  className="py-2"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                    {initialsFor(user.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {user.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {user.email}
                    </span>
                  </span>
                  <Check aria-hidden="true" className="h-4 w-4 opacity-0" />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function TaskFollowersPicker({
  followers,
  disabled = false,
  onRemove,
  headerAction,
}: TaskFollowersPickerProps) {
  const { t } = useLanguage();
  const [removingUserId, setRemovingUserId] = useState<string | null>(null);

  const removeFollower = async (follower: TaskFollower) => {
    setRemovingUserId(follower.user_id);
    try {
      await onRemove(follower);
    } finally {
      setRemovingUserId(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {t("taskFollowers.title")}
        </p>
        {headerAction}
      </div>

      {followers.length > 0 ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {followers.map((follower) => (
            <div
              key={follower.id}
              className="flex min-w-0 items-center gap-3 rounded-lg border border-white/10 bg-black/10 px-3 py-2"
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                {initialsFor(follower.user.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-100">
                  {follower.user.name}
                </span>
                <span className="block truncate text-xs text-slate-400">
                  {follower.user.email}
                </span>
              </span>
              <button
                type="button"
                disabled={disabled || removingUserId === follower.user_id}
                onClick={() => void removeFollower(follower)}
                aria-label={t("taskFollowers.remove", {
                  name: follower.user.name,
                })}
                title={t("taskFollowers.remove", { name: follower.user.name })}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-white/5 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {removingUserId === follower.user_id ? (
                  <Loader2
                    aria-hidden="true"
                    className="h-4 w-4 animate-spin"
                  />
                ) : (
                  <X aria-hidden="true" className="h-4 w-4" />
                )}
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <UsersRound
          aria-hidden="true"
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
        />
        <span>{t("taskFollowers.hint")}</span>
      </p>
    </div>
  );
}
