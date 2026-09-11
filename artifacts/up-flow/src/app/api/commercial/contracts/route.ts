import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-response";
import { isCommercialContractsRegistryProject } from "@/lib/commercial-managed-projects";
import { canReadProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { canViewClientFinancials } from "@/lib/client-financial-access";

const SUPPORTED_STATUS_FILTERS = new Set(["all", "active", "inactive"]);

async function GET_handler(req: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const workspaceId = auth.currentWorkspaceId ?? "";
  const projectId = req.nextUrl.searchParams.get("project_id")?.trim();
  const statusParam = req.nextUrl.searchParams.get("status")?.trim() || "all";
  const query = req.nextUrl.searchParams.get("q")?.trim() || "";

  if (!projectId) {
    return NextResponse.json(
      { error: "project_id is required" },
      { status: 400 },
    );
  }
  if (!SUPPORTED_STATUS_FILTERS.has(statusParam)) {
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
  if (
    !isCommercialContractsRegistryProject({
      projectName: project.name,
      spaceName: project.space?.name,
    })
  ) {
    return NextResponse.json(
      { error: "Project is not a shared contracts registry" },
      { status: 409 },
    );
  }
  if (!(await canReadProject(auth, project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const canViewFinancials = await canViewClientFinancials(auth, workspaceId);

  const [companies, active, inactive, totalContracts, companiesWithContracts] =
    await Promise.all([
      prisma.company.findMany({
        where: {
          workspace_id: workspaceId,
          ...(statusParam !== "all" ? { status: statusParam } : {}),
          ...(query
            ? {
                OR: [
                  { name: { contains: query, mode: "insensitive" } },
                  { legal_name: { contains: query, mode: "insensitive" } },
                  { cnpj: { contains: query, mode: "insensitive" } },
                  { billing_email: { contains: query, mode: "insensitive" } },
                  {
                    main_contact_email: {
                      contains: query,
                      mode: "insensitive",
                    },
                  },
                  { plan_name: { contains: query, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          legal_name: true,
          cnpj: true,
          status: true,
          commercial_status: true,
          plan_name: true,
          contract_value: true,
          contract_start_date: true,
          billing_email: true,
          main_contact_email: true,
          phone: true,
          whatsapp: true,
          owner: { select: { id: true, name: true, email: true } },
          client_contracts: {
            orderBy: [{ uploaded_at: "desc" }, { id: "desc" }],
            select: {
              id: true,
              onboarding_id: true,
              file_name: true,
              mime_type: true,
              size_bytes: true,
              status: true,
              uploaded_at: true,
              uploader: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.company.count({
        where: { workspace_id: workspaceId, status: "active" },
      }),
      prisma.company.count({
        where: { workspace_id: workspaceId, status: "inactive" },
      }),
      prisma.clientContract.count({ where: { workspace_id: workspaceId } }),
      prisma.company.count({
        where: { workspace_id: workspaceId, client_contracts: { some: {} } },
      }),
    ]);

  return NextResponse.json({
    financials_visible: canViewFinancials,
    items: companies.map(({ client_contracts: contracts, ...company }) => ({
      ...company,
      contract_value: canViewFinancials ? company.contract_value : null,
      contract_start_date: company.contract_start_date?.toISOString() ?? null,
      contracts: canViewFinancials
        ? contracts.map((contract) => ({
            ...contract,
            uploaded_at: contract.uploaded_at.toISOString(),
          }))
        : [],
    })),
    summary: {
      active,
      inactive,
      total_clients: active + inactive,
      total_contracts: canViewFinancials ? totalContracts : 0,
      clients_with_contracts: canViewFinancials ? companiesWithContracts : 0,
    },
  });
}

export const GET = withErrorReporting(
  "api:commercial/contracts:GET",
  GET_handler,
);
