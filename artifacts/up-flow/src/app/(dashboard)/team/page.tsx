"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings2, UserPlus } from "lucide-react";
import Header from "@/components/layout/header";
import { CreateActionButton } from "@/components/ui/create-action-button";
import InviteDialog from "@/components/dashboard/invite-dialog";
import { ManageDepartmentsDialog } from "@/components/team/team-management-dialogs";
import { EmailSetupWarning } from "@/components/team/team-invite-panels";
import TeamWorkspace from "@/components/team/team-workspace";
import { clearCachedJson, getCachedJson } from "@/lib/client-cache";
import type { Department, TeamMember } from "@/lib/types";
import { useLanguage } from "@/components/language-provider";
import {
  COLLAPSE_STORAGE_KEY,
  type EmailStatus,
  type PendingInvite,
  type TeamOverview,
} from "@/components/team/team-page-types";

export default function TeamPage() {
  const { t, language } = useLanguage();
  const router = useRouter();
  const [users, setUsers] = useState<TeamMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [workspace, setWorkspace] = useState<TeamOverview["workspace"]>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [currentRole, setCurrentRole] =
    useState<"owner" | "admin" | "member" | "guest" | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [emailStatus, setEmailStatus] = useState<EmailStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);
  const [cancelingInvite, setCancelingInvite] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [showEmpty, setShowEmpty] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  // Mirrors the server's `isWorkspaceAdmin` semantics: workspace owner/admin
  // OR cross-workspace super-admin can manage departments and assignments.
  const isAdmin =
    isSuperAdmin || currentRole === "owner" || currentRole === "admin";
  const teamMembersTitle = t("team.membersTitle");
  const isPortuguese = language === "pt-BR";

  const loadTeamOverview = useCallback(async (targetWorkspaceId?: string | null) => {
    setLoading(true);
    try {
      const path = targetWorkspaceId
        ? `/api/team/overview?workspace_id=${encodeURIComponent(targetWorkspaceId)}`
        : "/api/team/overview";
      const overview = await getCachedJson<TeamOverview>(
        `team:overview:${targetWorkspaceId || "current"}`,
        path,
        { ttlMs: 0, force: true },
      );
      const wsId: string | null = overview.workspace?.id ?? null;
      setWorkspace(overview.workspace ?? null);
      setWorkspaceId(wsId);
      setCurrentRole(overview.current_role ?? null);
      setIsSuperAdmin(overview.is_super_admin === true);
      setUsers(overview.members ?? []);
      setDepartments(overview.departments ?? []);
    } catch {
      setToast(t("team.couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadPending = useCallback(async () => {
    try {
      const response = await fetch("/api/invites");
      if (!response.ok) return;
      const data = (await response.json()) as PendingInvite[];
      setPending(Array.isArray(data) ? data : []);
    } catch {
      // Pending invitations are supplementary information. The management
      // surface remains available when this read fails.
    }
  }, []);

  const loadEmailStatus = useCallback(async () => {
    try {
      const response = await fetch("/api/email/status");
      if (!response.ok) {
        setEmailStatus(null);
        return;
      }
      setEmailStatus((await response.json()) as EmailStatus);
    } catch {
      setEmailStatus(null);
    }
  }, []);

  const loadDepartments = useCallback(async (wsId: string) => {
    try {
      const response = await fetch(`/api/workspaces/${wsId}/departments`);
      if (!response.ok) return;
      const data = (await response.json()) as { items: Department[] };
      setDepartments(data.items ?? []);
    } catch {
      // The overview data remains visible when a background refresh fails.
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(COLLAPSE_STORAGE_KEY);
      if (!raw) return;
      const keys = JSON.parse(raw) as string[];
      if (Array.isArray(keys)) setCollapsed(new Set(keys));
    } catch {
      // Use the expanded default when local storage cannot be read.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        COLLAPSE_STORAGE_KEY,
        JSON.stringify(Array.from(collapsed)),
      );
    } catch {
      // Collapse preferences are optional.
    }
  }, [collapsed]);

  useEffect(() => {
    void loadTeamOverview();
  }, [loadTeamOverview]);

  useEffect(() => {
    if (!isAdmin || !workspaceId) {
      setEmailStatus(null);
      setPending([]);
      return;
    }
    void Promise.all([loadPending(), loadEmailStatus()]);
  }, [isAdmin, workspaceId, loadEmailStatus, loadPending]);

  function toggleCollapsed(key: string) {
    setCollapsed((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function updateMember(
    userId: string,
    patch: {
      role?: "owner" | "admin" | "member" | "guest";
      status?: "active" | "inactive";
      department_id?: string | null;
    },
  ) {
    if (!workspaceId) return;
    const previous = users.find((user) => user.id === userId);
    if (!previous) return;
    setUsers((current) =>
      current.map((user) =>
        user.id === userId
          ? {
              ...user,
              ...(patch.role && { workspace_role: patch.role }),
              ...(patch.status && { workspace_status: patch.status }),
              ...(patch.department_id !== undefined && { department_id: patch.department_id }),
            }
          : user,
      ),
    );
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw new Error("Failed to update member");
      clearCachedJson("team:overview");
      setToast(t("team.memberUpdated"));
      if (patch.department_id !== undefined) void loadDepartments(workspaceId);
      router.refresh();
    } catch {
      setUsers((current) => current.map((user) => (user.id === userId ? previous : user)));
      setToast(t("team.couldNotUpdateMember"));
    }
  }

  async function updateDepartmentLeader(
    departmentId: string,
    leaderId: string | null,
  ): Promise<boolean> {
    if (!workspaceId) return false;
    const previous = departments;
    const selectedLeader = leaderId
      ? users.find((user) => user.id === leaderId) ?? null
      : null;

    setDepartments((current) =>
      current.map((department) =>
        department.id === departmentId
          ? {
              ...department,
              leader_id: leaderId,
              leader: selectedLeader
                ? {
                    id: selectedLeader.id,
                    name: selectedLeader.name,
                    email: selectedLeader.email,
                    avatar_url: selectedLeader.avatar_url,
                  }
                : null,
            }
          : department,
      ),
    );

    try {
      const response = await fetch(
        `/api/workspaces/${workspaceId}/departments/${departmentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leader_id: leaderId }),
        },
      );
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(t("team.couldNotUpdateDepartmentLeader"));
      }
      const updated = (await response.json()) as Department;
      setDepartments((current) =>
        current.map((department) =>
          department.id === departmentId ? updated : department,
        ),
      );
      clearCachedJson("team:overview");
      setToast(t("team.departmentLeaderUpdated"));
      router.refresh();
      return true;
    } catch (error) {
      setDepartments(previous);
      setToast(
        error instanceof Error && error.message
          ? error.message
          : t("team.couldNotUpdateDepartmentLeader"),
      );
      return false;
    }
  }

  async function removeMember(user: TeamMember) {
    if (!workspaceId) return;
    if (!window.confirm(t("team.removeConfirm", { name: user.name }))) return;
    const previous = users;
    setUsers((current) => current.filter((member) => member.id !== user.id));
    try {
      const response = await fetch(`/api/workspaces/${workspaceId}/members/${user.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to remove member");
      clearCachedJson("team:overview");
      setToast(t("team.memberRemoved"));
      void loadDepartments(workspaceId);
    } catch {
      setUsers(previous);
      setToast(t("team.couldNotRemoveMember"));
    }
  }

  async function resendInvite(invite: PendingInvite) {
    setResending(invite.id);
    setToast(null);
    try {
      const response = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emails: [invite.email],
          role: invite.role,
          ...(invite.workspace?.id ? { workspace_id: invite.workspace.id } : {}),
          ...(invite.tester_invite ? { tester_invite: true } : {}),
        }),
      });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({}))) as { error?: string };
        setToast(json.error || t("team.couldNotResend", { email: invite.email }));
      } else {
        const json = (await response.json()) as { mailed?: number };
        setToast(
          json.mailed && json.mailed > 0
            ? t("team.inviteResent", { email: invite.email })
            : t("team.inviteDeliveryNotConfirmed"),
        );
        void loadPending();
      }
    } catch {
      setToast(t("team.couldNotResend", { email: invite.email }));
    } finally {
      setResending(null);
    }
  }

  async function cancelInvite(invite: PendingInvite) {
    if (!window.confirm(t("team.cancelInviteConfirm", { email: invite.email }))) return;
    setCancelingInvite(invite.id);
    setToast(null);
    try {
      const response = await fetch("/api/invites", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invite.id }),
      });
      const json = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setToast(json.error || t("team.couldNotCancelInvite", { email: invite.email }));
        return;
      }
      setToast(t("team.inviteCanceled", { email: invite.email }));
      void loadPending();
    } catch {
      setToast(t("team.couldNotCancelInvite", { email: invite.email }));
    } finally {
      setCancelingInvite(null);
    }
  }

  return (
    <>
      <Header
        title={teamMembersTitle}
        searchValue={query}
        searchPlaceholder={
          isPortuguese
            ? "Buscar membros, equipes ou departamentos..."
            : "Search members, teams, or departments..."
        }
        searchAriaLabel={t("team.searchMembers")}
        onSearchChange={setQuery}
        onSearchSubmit={() => undefined}
        actions={
          isAdmin && workspaceId ? (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                aria-label={t("team.inviteUsers")}
                className="inline-flex h-9 min-h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm transition hover:border-primary/30 hover:bg-accent"
              >
                <UserPlus className="h-4 w-4 text-blue-200" />
                <span className="hidden lg:inline">{t("team.inviteUsers")}</span>
              </button>
              <CreateActionButton
                onClick={() => setManageOpen(true)}
                aria-label={isPortuguese ? "Criar equipe" : "Create team"}
              >
                <Plus className="h-4 w-4" />
                <span className="hidden lg:inline">{isPortuguese ? "Criar equipe" : "Create team"}</span>
              </CreateActionButton>
              <button
                type="button"
                onClick={() => setManageOpen(true)}
                aria-label={t("team.manageDepartments")}
                className="inline-flex h-9 min-h-9 items-center gap-2 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground shadow-sm transition hover:border-primary/30 hover:bg-accent"
              >
                <Settings2 className="h-4 w-4 text-blue-200" />
                <span className="hidden 2xl:inline">{t("team.manageDepartments")}</span>
              </button>
            </div>
          ) : undefined
        }
      />

      {isAdmin && emailStatus && !emailStatus.ready && (
        <div className="mx-auto w-full max-w-[1420px] px-4 pt-4 sm:px-6 lg:px-8">
          <EmailSetupWarning status={emailStatus} />
        </div>
      )}

      <TeamWorkspace
        users={users}
        departments={departments}
        pending={pending}
        loading={loading}
        query={query}
        showEmpty={showEmpty}
        isAdmin={isAdmin}
        language={language}
        t={t}
        collapsed={collapsed}
        resending={resending}
        cancelingInvite={cancelingInvite}
        onShowEmptyChange={setShowEmpty}
        onToggleCollapsed={toggleCollapsed}
        onUpdateMember={(userId, patch) => {
          void updateMember(userId, patch);
        }}
        onUpdateDepartmentLeader={(departmentId, leaderId) => {
          return updateDepartmentLeader(departmentId, leaderId);
        }}
        onRemoveMember={(user) => {
          void removeMember(user);
        }}
        onResendInvite={(invite) => {
          void resendInvite(invite);
        }}
        onCancelInvite={(invite) => {
          void cancelInvite(invite);
        }}
        onOpenManage={() => setManageOpen(true)}
        roleOptions={
          <>
            <option value="member">{t("common.member")}</option>
            <option value="guest">{t("common.guest")}</option>
            <option value="admin">{t("common.admin")}</option>
            <option value="owner">{t("common.owner")}</option>
          </>
        }
      />

      {toast && (
        <p
          role="status"
          className="fixed bottom-5 right-5 z-50 max-w-sm rounded-xl border border-blue-300/20 bg-[#101b30]/95 px-4 py-3 text-xs text-slate-100 shadow-2xl backdrop-blur"
        >
          {toast}
        </p>
      )}

      {manageOpen && workspaceId && (
        <ManageDepartmentsDialog
          workspaceId={workspaceId}
          departments={departments}
          onClose={() => setManageOpen(false)}
          onChanged={() => {
            clearCachedJson("team:overview");
            void loadDepartments(workspaceId);
          }}
        />
      )}
      <InviteDialog
        open={inviteOpen}
        title={t("invite.realUsersTitle")}
        description={
          workspace?.name
            ? t("invite.realUsersDescription", { workspace: workspace.name })
            : t("invite.realUsersDescription", { workspace: t("invite.currentWorkspace") })
        }
        submitLabel={t("invite.submitDefault")}
        successLabel={t("invite.successDefault")}
        defaultRole="member"
        defaultMode="workspace_access"
        hideRole
        onClose={() => {
          setInviteOpen(false);
          void Promise.all([loadTeamOverview(), loadPending(), loadEmailStatus()]);
        }}
      />
    </>
  );
}
