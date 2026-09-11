"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { logError } from "@/lib/log-error";
import type { Project, Space, Folder as FolderT } from "@/lib/types";
import BrazilianDateInput from "@/components/ui/brazilian-date-input";
import { useLanguage } from "@/components/language-provider";
import { localizeSpaceName } from "@/lib/i18n/project-name-translations";

type FolderTarget =
  | { kind: "space"; space: Space }
  | { kind: "folder"; folder: FolderT };

function folderPath(folder: FolderT, folders: FolderT[]) {
  const byId = new Map(folders.map((item) => [item.id, item]));
  const names = [folder.name];
  let cursor = folder.parent_id ? byId.get(folder.parent_id) : null;
  while (cursor) {
    names.unshift(cursor.name);
    cursor = cursor.parent_id ? byId.get(cursor.parent_id) : null;
  }
  return names.join(" / ");
}

function broadcastSidebarRefresh() {
  window.dispatchEvent(new CustomEvent("upflow:sidebar-refresh"));
}

async function readApiError(res: Response, fallback: string) {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

const ICONS = ["📦", "🚀", "🎨", "💼", "🛠️", "🌱", "🔬", "📈", "💡", "🗂️"];

export function SpaceDialog({
  mode,
  space,
  onClose,
  onSaved,
}: {
  mode: "create" | "rename";
  space?: Space;
  onClose: () => void;
  onSaved: (space: Space) => void;
}) {
  const [name, setName] = useState(space?.name ?? "");
  const [icon, setIcon] = useState(space?.icon ?? ICONS[0]);
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const url =
        mode === "create" ? "/api/spaces" : `/api/spaces/${space!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), icon }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(
            res,
            mode === "create"
              ? t("sidebarDialog.couldNotCreateSpace")
              : t("sidebarDialog.couldNotRenameSpace"),
          ),
        );
      }
      const saved = (await res.json()) as Space;
      toast.success(
        mode === "create"
          ? t("sidebarDialog.spaceCreated")
          : t("sidebarDialog.spaceRenamed"),
      );
      broadcastSidebarRefresh();
      onSaved(saved);
    } catch (err) {
      logError("sidebar:space-dialog", err, { mode });
      toast.error(
        err instanceof Error
          ? err.message
          : t("sidebarDialog.couldNotSaveSpace"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-sm overflow-y-auto rounded-2xl p-4 glass-strong sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-foreground">
            {mode === "create"
              ? t("sidebar.newSpace")
              : t("sidebarDialog.renameSpace")}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <label className="block text-xs font-medium text-foreground mb-1.5">
          {t("common.name")}
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("sidebarDialog.spaceNamePlaceholder")}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring dark:border-white/10 dark:bg-white/5"
        />
        <label className="block text-xs font-medium text-foreground mt-4 mb-1.5">
          {t("common.icon")}
        </label>
        <div className="flex flex-wrap gap-1.5">
          {ICONS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIcon(i)}
              className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center text-lg transition-colors",
                icon === i
                  ? "bg-primary/25 ring-2 ring-primary/60"
                  : "bg-muted/60 hover:bg-muted dark:bg-white/5 dark:hover:bg-white/10",
              )}
            >
              {i}
            </button>
          ))}
        </div>
        <div className="mt-6 grid gap-2 sm:flex">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2 text-sm text-foreground hover:bg-accent dark:border-white/10 dark:hover:bg-white/10"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium py-2 rounded-lg"
          >
            {mode === "create" ? t("common.create") : t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

export function MoveProjectDialog({
  project,
  spaces,
  folders,
  onClose,
  onSaved,
}: {
  project: Project;
  spaces: Space[];
  folders: FolderT[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t, language } = useLanguage();
  const initial = project.folder_id
    ? `folder:${project.folder_id}`
    : project.space_id
      ? `space:${project.space_id}`
      : "";
  const [target, setTarget] = useState<string>(initial);
  const [loading, setLoading] = useState(false);

  const save = async () => {
    setLoading(true);
    try {
      let space_id: string | null = null;
      let folder_id: string | null = null;
      if (target.startsWith("folder:")) {
        folder_id = target.slice("folder:".length);
        const f = folders.find((x) => x.id === folder_id);
        space_id = f?.space_id ?? null;
      } else if (target.startsWith("space:")) {
        space_id = target.slice("space:".length);
      }
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ space_id, folder_id }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, t("sidebar.moveProjectError")));
      }
      toast.success(t("sidebar.projectMoved"));
      broadcastSidebarRefresh();
      onSaved();
    } catch (err) {
      logError("sidebar:move-project-dialog", err, { id: project.id });
      toast.error(
        err instanceof Error ? err.message : t("sidebar.moveProjectError"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-sm overflow-y-auto rounded-2xl p-4 glass-strong sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {t("sidebar.moveProject")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {project.name}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <label className="block text-xs font-medium text-foreground mb-1.5">
          {t("common.destination")}
        </label>
        <select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring dark:border-white/10 dark:bg-white/5"
        >
          <option value="">— {t("sidebar.unassigned")} —</option>
          {spaces.map((sp) => {
            const fs = folders.filter((f) => f.space_id === sp.id);
            return (
              <optgroup
                key={sp.id}
                label={`${sp.icon || "🗂️"} ${localizeSpaceName(sp.name, language)}`}
              >
                <option value={`space:${sp.id}`}>
                  ↳ {t("sidebarDialog.directlyInSpace")}
                </option>
                {fs.map((f) => (
                  <option key={f.id} value={`folder:${f.id}`}>
                    📁 {folderPath(f, folders)}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <div className="mt-6 grid gap-2 sm:flex">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2 text-sm text-foreground hover:bg-accent dark:border-white/10 dark:hover:bg-white/10"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={save}
            disabled={loading}
            className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium py-2 rounded-lg"
          >
            {t("common.move")}
          </button>
        </div>
      </div>
    </div>
  );
}

export function FolderDialog({
  mode,
  target,
  folder,
  onClose,
  onSaved,
}: {
  mode: "create" | "rename";
  target?: FolderTarget;
  folder?: FolderT;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(folder?.name ?? "");
  const [loading, setLoading] = useState(false);
  const { t, language } = useLanguage();
  const space =
    target?.kind === "space"
      ? target.space
      : target?.kind === "folder"
        ? { id: target.folder.space_id, name: target.folder.name, icon: null }
        : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const url =
        mode === "create" ? "/api/folders" : `/api/folders/${folder!.id}`;
      const method = mode === "create" ? "POST" : "PATCH";
      const body =
        mode === "create"
          ? {
              name: name.trim(),
              space_id:
                target!.kind === "space"
                  ? target!.space.id
                  : target!.folder.space_id,
              parent_id: target!.kind === "folder" ? target!.folder.id : null,
            }
          : { name: name.trim() };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(
            res,
            mode === "create"
              ? t("sidebarDialog.couldNotCreateFolder")
              : t("sidebarDialog.couldNotRenameFolder"),
          ),
        );
      }
      toast.success(
        mode === "create"
          ? t("sidebarDialog.folderCreated")
          : t("sidebarDialog.folderRenamed"),
      );
      broadcastSidebarRefresh();
      onSaved();
    } catch (err) {
      logError("sidebar:folder-dialog", err, { mode });
      toast.error(
        err instanceof Error
          ? err.message
          : t("sidebarDialog.couldNotSaveFolder"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-sm overflow-y-auto rounded-2xl p-4 glass-strong sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {mode === "create"
                ? t("folder.newFolder")
                : t("sidebarDialog.renameFolder")}
            </h3>
            {mode === "create" && target && space && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {t("common.inLocation", {
                  location: `${space.icon || "🗂️"} ${localizeSpaceName(space.name, language)}`,
                })}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <label className="block text-xs font-medium text-foreground mb-1.5">
          {t("common.name")}
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("sidebarDialog.folderNamePlaceholder")}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring dark:border-white/10 dark:bg-white/5"
        />
        <div className="mt-6 grid gap-2 sm:flex">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2 text-sm text-foreground hover:bg-accent dark:border-white/10 dark:hover:bg-white/10"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium py-2 rounded-lg"
          >
            {mode === "create" ? t("common.create") : t("common.save")}
          </button>
        </div>
      </form>
    </div>
  );
}

export function NewListDialog({
  target,
  onClose,
  onSaved,
}: {
  target: { kind: "space"; space: Space } | { kind: "folder"; folder: FolderT };
  onClose: () => void;
  onSaved: (project: Project) => void;
}) {
  const router = useRouter();
  const { t, language } = useLanguage();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const base = {
        name: name.trim(),
        description: description.trim() || null,
        due_date: dueDate || null,
      };
      const body =
        target.kind === "space"
          ? { ...base, space_id: target.space.id }
          : {
              ...base,
              space_id: target.folder.space_id,
              folder_id: target.folder.id,
            };
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, t("sidebar.createProjectError")),
        );
      }
      const created = (await res.json()) as Project;
      toast.success(t("sidebar.projectCreated"));
      broadcastSidebarRefresh();
      onSaved(created);
      router.push(`/projects/${created.id}`);
    } catch (err) {
      logError("sidebar:new-list-dialog", err);
      toast.error(
        err instanceof Error ? err.message : t("sidebar.createProjectError"),
      );
    } finally {
      setLoading(false);
    }
  };

  const locationLabel =
    target.kind === "space"
      ? `${target.space.icon || "🗂️"} ${localizeSpaceName(target.space.name, language)}`
      : `📁 ${target.folder.name}`;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        className="max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] max-w-sm overflow-y-auto rounded-2xl p-4 glass-strong sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-foreground">
              {t("sidebar.newProjectTitle")}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {t("common.inLocation", { location: locationLabel })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <label className="block text-xs font-medium text-foreground mb-1.5">
          {t("common.name")}
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("projects.projectNamePlaceholder")}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring dark:border-white/10 dark:bg-white/5"
        />
        <label className="block text-xs font-medium text-foreground mt-3 mb-1.5">
          {t("common.description")}{" "}
          <span className="text-muted-foreground font-normal">
            ({t("common.optional")})
          </span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder={t("sidebar.projectDescriptionPlaceholder")}
          className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring dark:border-white/10 dark:bg-white/5"
        />
        <label className="block text-xs font-medium text-foreground mt-3 mb-1.5">
          {t("projects.dueDate")}{" "}
          <span className="text-muted-foreground font-normal">
            ({t("common.optional")})
          </span>
        </label>
        <BrazilianDateInput
          value={dueDate}
          onChange={setDueDate}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring dark:border-white/10 dark:bg-white/5"
        />
        <div className="mt-6 grid gap-2 sm:flex">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-border py-2 text-sm text-foreground hover:bg-accent dark:border-white/10 dark:hover:bg-white/10"
          >
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            className="flex-1 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium py-2 rounded-lg"
          >
            {t("common.create")}
          </button>
        </div>
      </form>
    </div>
  );
}
