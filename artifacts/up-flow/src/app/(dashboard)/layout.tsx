import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Sidebar from "@/components/layout/sidebar";
import { UserProvider } from "@/components/user-provider";
import type { AppUser } from "@/lib/types";
import { getAuthResult, isSuperAdmin } from "@/lib/auth-helpers";
import { resolveClientsNavigationHref } from "@/lib/client-navigation";
const DESKTOP_SIDEBAR_KEY = "upflow.sidebar.desktopOpen.v2";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authResult = await getAuthResult();
  if (authResult.kind === "anonymous") {
    redirect("/login");
  }
  if (authResult.kind === "error") {
    throw authResult.error;
  }

  const sidebarPreference = (await cookies()).get(DESKTOP_SIDEBAR_KEY)?.value;
  const initialDesktopSidebarOpen = sidebarPreference !== "0";

  const auth = authResult.user;
  const prismaUser = auth.prismaUser;
  const currentMembership = auth.memberships.find(
    (membership) => membership.workspace_id === auth.currentWorkspaceId,
  );

  const user: AppUser = {
    id: prismaUser.id,
    name: prismaUser.name,
    email: prismaUser.email,
    image: prismaUser.avatar_url,
    role: prismaUser.role,
    currentWorkspaceId: auth.currentWorkspaceId,
    currentRole: auth.currentRole,
    currentDepartmentName: currentMembership?.department?.name ?? null,
    isSuperAdmin: isSuperAdmin(auth),
  };

  const workspaces = auth.memberships.map((membership) => ({
    id: membership.workspace.id,
    name: membership.workspace.name,
    slug: membership.workspace.slug,
    role: membership.role,
  }));
  const clientsHref = await resolveClientsNavigationHref({
    workspaceId: auth.currentWorkspaceId,
    userId: prismaUser.id,
    departmentName: currentMembership?.department?.name,
  });

  return (
    <UserProvider user={user}>
      <div className="relative flex h-dvh min-h-dvh overflow-hidden overflow-x-hidden bg-background">
        <div className="relative z-10 flex h-full w-full min-w-0">
          <Sidebar
            user={user}
            workspaces={workspaces}
            clientsHref={clientsHref}
            initialDesktopSidebarOpen={initialDesktopSidebarOpen}
          />
          <main className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
            <div className="relative z-10 min-w-0">{children}</div>
          </main>
        </div>
      </div>
    </UserProvider>
  );
}
