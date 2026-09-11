"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Plus,
  Trash2,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import InviteDialog from "@/components/dashboard/invite-dialog";
import { logError } from "@/lib/log-error";
import { getCachedJson, primeCachedJson } from "@/lib/client-cache";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/language-provider";

interface WorkspaceLite {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member" | "guest";
}

interface ListResponse {
  workspaces: WorkspaceLite[];
  current_workspace_id: string;
  current_role: WorkspaceLite["role"] | null;
  is_super_admin?: boolean;
}

export default function WorkspaceSwitcher({
  initialData,
  userName,
  menuPlacement = "bottom",
}: {
  initialData?: ListResponse;
  userName?: string | null;
  menuPlacement?: "top" | "bottom";
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ListResponse | null>(initialData ?? null);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialData) {
      primeCachedJson("workspaces", initialData);
      return;
    }
    getCachedJson<ListResponse>("workspaces", "/api/workspaces", {
      ttlMs: 60_000,
    })
      .then((d) => setData(d))
      .catch((err) => logError("workspace-switcher:load", err));
  }, [initialData]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const current = data?.workspaces.find(
    (w) => w.id === data.current_workspace_id,
  );
  const userDisplayName = userName?.trim() || current?.name || "-";
  const userInitial =
    userDisplayName.trim().charAt(0).toUpperCase() || "U";
  const roleLabel = data?.current_role ?? current?.role ?? "member";
  const canShareCurrent =
    data?.is_super_admin ||
    data?.current_role === "owner" ||
    data?.current_role === "admin";

  function canDeleteWorkspace(workspace: WorkspaceLite) {
    return Boolean(data?.is_super_admin || workspace.role === "owner");
  }

  async function switchTo(id: string) {
    if (!data || id === data.current_workspace_id) {
      setOpen(false);
      return;
    }
    setBusy(true);
    const r = await fetch("/api/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: id }),
    });
    setBusy(false);
    if (!r.ok) {
      toast.error(t("workspace.switchError"));
      return;
    }
    window.location.reload();
  }

  async function createNew() {
    const name = window.prompt(t("workspace.namePrompt"))?.trim();
    if (!name) return;
    setBusy(true);
    const r = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setBusy(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      toast.error(j.error || t("workspace.createError"));
      return;
    }
    const ws = (await r.json()) as { id: string };
    await fetch("/api/workspaces/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: ws.id }),
    });
    window.location.reload();
  }

  async function deleteWorkspace(workspace: WorkspaceLite) {
    if (!data || deletingId) return;
    if (!canDeleteWorkspace(workspace)) {
      toast.error(t("workspace.onlyOwnersCanDelete"));
      return;
    }
    if (data.workspaces.length <= 1 && !data.is_super_admin) {
      toast.error(t("workspace.createAnotherBeforeDelete"));
      return;
    }

    const confirmed = window.confirm(
      [
        t("workspace.deleteConfirmTitle", { name: workspace.name }),
        t("workspace.deleteConfirmBody"),
      ].join("\n\n"),
    );
    if (!confirmed) return;

    setDeletingId(workspace.id);
    try {
      const response = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "DELETE",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || t("workspace.couldNotDelete"));
      }

      toast.success(t("workspace.deleted"));
      if (workspace.id === data.current_workspace_id) {
        window.location.href = "/";
        return;
      }

      const nextData = {
        ...data,
        workspaces: data.workspaces.filter((w) => w.id !== workspace.id),
      };
      setData(nextData);
      primeCachedJson("workspaces", nextData);
    } catch (err) {
      logError("workspace-switcher:delete", err);
      toast.error(err instanceof Error ? err.message : t("workspace.couldNotDelete"));
    } finally {
      setDeletingId(null);
    }
  }

  if (!data) {
    return (
      <div className="upflow-workspace-card mx-3 mb-3 mt-3 overflow-hidden rounded-[18px] border border-border bg-card p-3 text-xs text-muted-foreground shadow-sm dark:border-blue-300/[0.15] dark:bg-[#071024]/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_34px_rgba(37,99,235,0.12)]">
        <div className="h-3 w-20 rounded-full bg-muted dark:bg-white/10" />
        <div className="mt-3 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-500/[0.15]" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-24 rounded-full bg-muted dark:bg-white/10" />
            <div className="h-2 w-16 rounded-full bg-muted/70 dark:bg-white/5" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative mx-3 mb-3 mt-3">
      <div className="upflow-workspace-card group relative overflow-hidden rounded-[20px] border border-border bg-card p-2 shadow-sm backdrop-blur-xl transition-all hover:border-primary/[0.35] hover:bg-accent/60 hover:shadow-md dark:border-blue-300/[0.15] dark:bg-[#071024]/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_16px_42px_rgba(0,0,0,0.24),0_0_34px_rgba(37,99,235,0.12)] dark:hover:border-blue-300/30 dark:hover:bg-[#0a1430]/90 dark:hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_18px_48px_rgba(0,0,0,0.28),0_0_42px_rgba(59,130,246,0.18)]">
        <span className="upflow-workspace-glow pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_8%,rgba(59,130,246,0.24),transparent_34%),radial-gradient(circle_at_100%_0%,rgba(139,92,246,0.18),transparent_28%)]" />
        <span className="pointer-events-none absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-blue-200/[0.35] to-transparent" />
        <p className="relative px-2 pt-1 text-[9px] font-semibold uppercase tracking-[0.22em] text-muted-foreground dark:text-blue-100/[0.55]">
          {t("sidebar.workspace")}
        </p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={busy}
          aria-label={t("workspace.options")}
          aria-expanded={open}
          className="relative mt-1 flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-blue-400/[0.50]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-500 text-sm font-bold text-white shadow-[0_0_24px_rgba(59,130,246,0.42)] ring-1 ring-white/[0.15]">
            {userInitial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold text-foreground dark:text-white">
              {userDisplayName}
            </span>
            <span className="mt-0.5 block truncate text-[11px] capitalize text-muted-foreground dark:text-blue-100/[0.55]">
              {roleLabel}
            </span>
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform dark:text-blue-100/[0.55]",
              open && "rotate-180 text-foreground dark:text-blue-100",
            )}
          />
        </button>
      </div>

      {open && (
        <div
          className={cn(
            "upflow-workspace-menu absolute left-0 right-0 z-50 overflow-hidden rounded-[18px] border border-border bg-popover/95 text-popover-foreground shadow-xl backdrop-blur-xl dark:border-blue-300/20 dark:bg-[#070b18]/95 dark:shadow-[0_24px_70px_rgba(0,0,0,0.55),0_0_42px_rgba(37,99,235,0.18)]",
            menuPlacement === "top" ? "bottom-full mb-2" : "mt-2",
          )}
        >
          <ul className="max-h-64 overflow-y-auto py-1">
            {data.workspaces.map((w) => {
              const active = w.id === data.current_workspace_id;
              const isDeleting = deletingId === w.id;
              const deleteAllowed = canDeleteWorkspace(w);

              return (
                <li key={w.id} className="px-1">
                  <div
                    className={cn(
                      "flex items-center gap-1 rounded-xl transition hover:bg-accent dark:hover:bg-white/[0.15]",
                      active && "bg-primary/10 text-primary dark:bg-blue-500/[0.15] dark:text-blue-100",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => switchTo(w.id)}
                      disabled={busy || isDeleting}
                      className="flex min-w-0 flex-1 items-center justify-between gap-3 px-2 py-2.5 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-[11px] font-bold text-primary ring-1 ring-primary/[0.15] dark:bg-blue-500/[0.15] dark:text-blue-100 dark:ring-blue-300/[0.15]">
                          {w.name.trim().charAt(0).toUpperCase() || "U"}
                        </span>
                        <span className="truncate text-foreground">
                          {w.name}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-[10px] uppercase text-muted-foreground">
                          {w.role}
                        </span>
                        {active && (
                          <Check className="h-3.5 w-3.5 text-primary dark:text-blue-100" />
                        )}
                      </span>
                    </button>
                    {deleteAllowed && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void deleteWorkspace(w);
                        }}
                        disabled={isDeleting}
                        title={t("workspace.deleteNamed", { name: w.name })}
                        aria-label={t("workspace.deleteNamedAria", { name: w.name })}
                        className="mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-red-400/[0.35] text-red-600 transition hover:bg-red-500/10 hover:text-red-700 disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground dark:border-red-400/25 dark:text-red-200 dark:hover:bg-red-500/[0.15] dark:hover:text-red-100 dark:disabled:border-white/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-border dark:border-white/10">
            {canShareCurrent && current && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setInviteOpen(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-primary transition hover:bg-primary/10 hover:text-primary dark:text-blue-100 dark:hover:bg-blue-500/10 dark:hover:text-white"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/[0.15] dark:bg-blue-500/[0.15] dark:text-blue-100 dark:ring-blue-300/[0.15]">
                  <UserPlus className="h-3.5 w-3.5" />
                </span>
                {t("workspace.share")}
              </button>
            )}
            <button
              type="button"
              onClick={createNew}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground dark:hover:bg-white/[0.15]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-700 ring-1 ring-violet-500/20 dark:bg-violet-500/[0.15] dark:text-violet-100 dark:ring-violet-300/[0.15]">
                <Plus className="h-3.5 w-3.5" />
              </span>
              {t("workspace.new")}
            </button>
          </div>
        </div>
      )}

      {current && (
        <InviteDialog
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          title={t("workspace.shareTitle")}
          description={t("workspace.shareDescription", { workspace: current.name })}
          submitLabel={t("invite.submitDefault")}
          successLabel={t("invite.successDefault")}
          workspaceId={current.id}
          defaultRole="member"
          defaultMode="workspace_access"
          hideMode
        />
      )}
    </div>
  );
}
