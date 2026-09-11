import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-response";
import { isCommercialContractsRegistryProject } from "@/lib/commercial-managed-projects";
import { canReadProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { canViewClientFinancials } from "@/lib/client-financial-access";

type RouteContext = { params: Promise<{ id: string }> };

async function GET_handler(req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const workspaceId = auth.currentWorkspaceId ?? "";
  const projectId = req.nextUrl.searchParams.get("project_id")?.trim();
  const { id } = await params;

  if (!projectId) {
    return NextResponse.json(
      { error: "project_id is required" },
      { status: 400 },
    );
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspace_id: workspaceId },
    include: { space: { select: { id: true, name: true } } },
  });
  if (
    !project ||
    !isCommercialContractsRegistryProject({
      projectName: project.name,
      spaceName: project.space?.name,
    })
  ) {
    return NextResponse.json(
      { error: "Contracts registry not found" },
      { status: 404 },
    );
  }
  if (!(await canReadProject(auth, project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!(await canViewClientFinancials(auth, workspaceId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const contract = await prisma.clientContract.findFirst({
    where: { id, workspace_id: workspaceId },
    select: {
      file_name: true,
      storage_bucket: true,
      storage_path: true,
    },
  });
  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(contract.storage_bucket)
    .createSignedUrl(contract.storage_path, 60, {
      download: contract.file_name,
    });
  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: "Could not create a private contract download link." },
      { status: 503 },
    );
  }

  return NextResponse.redirect(data.signedUrl);
}

export const GET = withErrorReporting(
  "api:commercial/contracts/id:GET",
  GET_handler,
);
