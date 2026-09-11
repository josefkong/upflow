import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isSuperAdmin } from "@/lib/auth-helpers";
import { requireAuth } from "@/lib/auth-response";
import { buildPage, parsePagination } from "@/lib/pagination";
import { withErrorReporting } from "@/lib/with-error-reporting";

// Returns every user who shares at least one workspace with the caller, so the
// UI can populate assignee pickers, team views, etc. Super-admins see all
// users in the system.
//
// Optional ?workspace_id= narrows the result to that workspace only (still
// requires the caller to be a member of that workspace, except super-admin).
async function GET_handler(req: NextRequest) {
  const _r = await requireAuth();
  if (!_r.ok) return _r.response;
  const auth = _r.auth;

  const { searchParams } = new URL(req.url);
  const workspaceFilter = searchParams.get("workspace_id");
  const statusFilter = searchParams.get("status");
  const { limit, cursor } = parsePagination(req, { defaultLimit: 200, maxLimit: 500 });

  const superAdmin = isSuperAdmin(auth);
  const membershipStatus =
    statusFilter === "active" || statusFilter === "inactive" ? statusFilter : undefined;

  let where: Prisma.UserWhereInput | undefined;

  if (workspaceFilter) {
    if (!superAdmin && !auth.memberships.some((m) => m.workspace_id === workspaceFilter)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    where = {
      memberships: {
        some: {
          workspace_id: workspaceFilter,
          ...(membershipStatus && { status: membershipStatus }),
        },
      },
    };
  } else if (!superAdmin) {
    const wsIds = auth.memberships.map((m) => m.workspace_id);
    if (wsIds.length === 0) {
      return NextResponse.json({ items: [], nextCursor: null });
    }
    where = {
      memberships: {
        some: {
          workspace_id: { in: wsIds },
          ...(membershipStatus && { status: membershipStatus }),
        },
      },
    };
  } else if (membershipStatus) {
    where = { memberships: { some: { status: membershipStatus } } };
  }
  // super-admin + no filter → no where clause, returns everyone.

  const rows = await prisma.user.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: [{ name: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      avatar_url: true,
      role: true,
      created_at: true,
      _count: { select: { tasks: true, projects: true } },
      memberships: {
        where: workspaceFilter
          ? {
              workspace_id: workspaceFilter,
              ...(membershipStatus && { status: membershipStatus }),
            }
          : superAdmin
            ? membershipStatus
              ? { status: membershipStatus }
              : undefined
            : {
                workspace_id: { in: auth.memberships.map((m) => m.workspace_id) },
                ...(membershipStatus && { status: membershipStatus }),
              },
        select: {
          workspace_id: true,
          role: true,
          status: true,
          department_id: true,
          department: { select: { name: true, color: true, sort_order: true } },
        },
      },
    },
  });

  // Flatten memberships into `workspace_role` (active workspace) + `workspaces` list.
  // `department_id` reflects the membership in the workspace the result is
  // scoped to: the explicit `?workspace_id=` filter if given, otherwise the
  // caller's active workspace.
  const scopedWorkspaceId = workspaceFilter ?? auth.currentWorkspaceId;
  const flattened = rows.map((u) => {
    const activeMembership = u.memberships.find(
      (m) => m.workspace_id === auth.currentWorkspaceId,
    );
    const scopedMembership = u.memberships.find(
      (m) => m.workspace_id === scopedWorkspaceId,
    );
    const { memberships: _mm, ...rest } = u;
    void _mm;
    return {
      ...rest,
      workspace_role: activeMembership?.role ?? null,
      workspace_status: scopedMembership?.status ?? null,
      department_id: scopedMembership?.department_id ?? null,
      department_name: scopedMembership?.department?.name ?? null,
      department_color: scopedMembership?.department?.color ?? null,
      department_sort_order: scopedMembership?.department?.sort_order ?? null,
      workspaces: u.memberships.map((m) => ({
        workspace_id: m.workspace_id,
        role: m.role,
        status: m.status,
        department_id: m.department_id,
      })),
    };
  });

  return NextResponse.json(buildPage(flattened, limit));
}
export const GET = withErrorReporting("api:users:GET", GET_handler);
