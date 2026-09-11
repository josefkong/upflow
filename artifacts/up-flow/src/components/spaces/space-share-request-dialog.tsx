"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Send, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { useLanguage } from "@/components/language-provider";

interface ShareRequestCollaborator {
  id: string;
  name: string;
  email: string;
  department_name?: string | null;
}

interface SpaceShareRequestDialogProps {
  open: boolean;
  onClose: () => void;
  spaceId: string;
  spaceName: string;
  workspaceId: string;
  currentUserId?: string;
}

export default function SpaceShareRequestDialog({
  open,
  onClose,
  spaceId,
  spaceName,
  workspaceId,
  currentUserId,
}: SpaceShareRequestDialogProps) {
  const { t } = useLanguage();
  const [mounted, setMounted] = useState(false);
  const [collaborators, setCollaborators] = useState<
    ShareRequestCollaborator[]
  >([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [message, setMessage] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoadingUsers(true);
    setLoadError(false);
    setSelectedUserId("");
    setMessage("");

    fetch(
      `/api/users?workspace_id=${encodeURIComponent(workspaceId)}&status=active&limit=500`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("collaborators unavailable");
        const payload = (await response.json()) as {
          items?: ShareRequestCollaborator[];
        };
        setCollaborators(
          (payload.items ?? []).filter((user) => user.id !== currentUserId),
        );
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoadError(true);
        setCollaborators([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingUsers(false);
      });

    return () => controller.abort();
  }, [currentUserId, open, workspaceId]);

  const selectedCollaborator = useMemo(
    () => collaborators.find((user) => user.id === selectedUserId) ?? null,
    [collaborators, selectedUserId],
  );

  if (!open || !mounted) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedCollaborator || submitting) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/spaces/${spaceId}/share-requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collaborator_id: selectedCollaborator.id,
          message: message.trim() || null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        duplicate?: boolean;
      } | null;
      if (!response.ok) {
        throw new Error(payload?.error || t("space.shareRequestFailed"));
      }
      toast.success(
        payload?.duplicate
          ? t("space.shareRequestAlreadyPending")
          : t("space.shareRequestSent"),
      );
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("space.shareRequestFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="glass-strong max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-lg overflow-y-auto rounded-2xl border border-border p-4 shadow-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
              <UserPlus className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-foreground">
                {t("space.shareRequestTitle", { space: spaceName })}
              </h2>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("space.shareRequestDescription")}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="mt-5 block text-xs font-medium text-foreground">
          {t("space.shareRequestCollaborator")}
        </label>
        <div className="relative mt-1.5">
          <select
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            disabled={loadingUsers || loadError}
            className="h-11 w-full appearance-none rounded-xl border border-input bg-card px-3 pr-10 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
          >
            <option value="">
              {loadingUsers
                ? t("common.loading")
                : t("space.shareRequestSelectCollaborator")}
            </option>
            {collaborators.map((collaborator) => (
              <option key={collaborator.id} value={collaborator.id}>
                {collaborator.name} — {collaborator.email}
                {collaborator.department_name
                  ? ` · ${collaborator.department_name}`
                  : ""}
              </option>
            ))}
          </select>
        </div>
        {loadError ? (
          <p className="mt-2 text-xs text-upflow-danger">
            {t("space.shareRequestCollaboratorsFailed")}
          </p>
        ) : null}

        <label className="mt-4 block text-xs font-medium text-foreground">
          {t("space.shareRequestMessage")}
          <span className="ml-1 text-muted-foreground">
            ({t("common.optional")})
          </span>
        </label>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value.slice(0, 500))}
          rows={3}
          placeholder={t("space.shareRequestMessagePlaceholder")}
          className="mt-1.5 w-full resize-none rounded-xl border border-input bg-card px-3 py-2.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20"
        />

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={!selectedCollaborator || submitting || loadingUsers}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {t("space.shareRequestSubmit")}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
