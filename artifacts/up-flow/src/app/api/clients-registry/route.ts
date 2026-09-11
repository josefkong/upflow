import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-response";
import { isClientsRegistryProject } from "@/lib/client-space-structure";
import { canReadProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { withErrorReporting } from "@/lib/with-error-reporting";

const SUPPORTED_STATUS_FILTERS = new Set(["all", "active", "inactive"]);

async function GET_handler(req: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const workspaceId = auth.currentWorkspaceId ?? "";
  const projectId = req.nextUrl.searchParams.get("project_id")?.trim();
  const status = req.nextUrl.searchParams.get("status")?.trim() || "all";
  const query = req.nextUrl.searchParams.get("q")?.trim() || "";

  if (!projectId) {
    return NextResponse.json(
      { error: "project_id is required" },
      { status: 400 },
    );
  }
  if (!SUPPORTED_STATUS_FILTERS.has(status)) {
    return NextResponse.json(
      { error: "Unsupported status filter" },
      { status: 400 },
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspace_id: workspaceId },
    include: { space: { select: { id: true, name: true } } },
  });
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (!isClientsRegistryProject({ projectName: project.name })) {
    return NextResponse.json(
      { error: "Project is not a Clients registry" },
      { status: 409 },
    );
  }
  if (!(await canReadProject(auth, project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const companyWhere = {
    workspace_id: workspaceId,
    contract_start_date: { not: null },
    ...(status === "active"
      ? { status: "active" }
      : status === "inactive"
        ? { status: { in: ["inactive", "archived"] } }
        : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { legal_name: { contains: query, mode: "insensitive" as const } },
            { plan_name: { contains: query, mode: "insensitive" as const } },
            { service_type: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [companies, active, inactive] = await Promise.all([
    prisma.company.findMany({
      where: companyWhere,
      orderBy: [{ status: "asc" }, { name: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        status: true,
        service_type: true,
        plan_name: true,
        included_services: true,
        contract_start_date: true,
        owner: { select: { id: true, name: true, email: true } },
      },
    }),
    prisma.company.count({
      where: {
        workspace_id: workspaceId,
        contract_start_date: { not: null },
        status: "active",
      },
    }),
    prisma.company.count({
      where: {
        workspace_id: workspaceId,
        contract_start_date: { not: null },
        status: { in: ["inactive", "archived"] },
      },
    }),
  ]);

  return NextResponse.json({
    items: companies.map((company) => ({
      ...company,
      contract_start_date: company.contract_start_date?.toISOString() ?? null,
    })),
    summary: {
      active,
      inactive,
      total_clients: active + inactive,
    },
  });
}

export const GET = withErrorReporting("api:clients-registry:GET", GET_handler);
