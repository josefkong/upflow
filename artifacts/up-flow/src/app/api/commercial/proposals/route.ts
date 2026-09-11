import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-response";
import { canReadProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { isCommercialProposalArchiveProject } from "@/lib/commercial-proposal-archive";
import { withErrorReporting } from "@/lib/with-error-reporting";

async function GET_handler(req: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const projectId = req.nextUrl.searchParams.get("project_id")?.trim();
  if (!projectId) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, workspace_id: auth.currentWorkspaceId ?? "" },
    include: { space: { select: { id: true, name: true } } },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (
    !isCommercialProposalArchiveProject({
      name: project.name,
      spaceName: project.space?.name,
    })
  ) {
    return NextResponse.json({ error: "Project is not a proposal archive" }, { status: 409 });
  }
  if (!(await canReadProject(auth, project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const documents = await prisma.commercialProposalDocument.findMany({
    where: { workspace_id: project.workspace_id },
    orderBy: [{ uploaded_at: "desc" }, { id: "desc" }],
    include: {
      uploader: { select: { id: true, name: true, email: true } },
      commercial_lead: {
        select: {
          id: true,
          stage: true,
          contract_confirmed_at: true,
          proposal_storage_path: true,
          task: {
            select: {
              project: { select: { space_id: true } },
              company: { select: { contract_start_date: true } },
            },
          },
        },
      },
    },
  });

  const folders = new Map<
    string,
    {
      id: string;
      commercial_lead_id: string | null;
      brand_name: string;
      owner_name: string;
      owner_email: string;
      latest_uploaded_at: string;
      contract_date: string | null;
      documents: Array<{
        id: string;
        file_name: string;
        mime_type: string | null;
        size_bytes: number | null;
        uploaded_at: string;
        confirmed_at: string | null;
        removed_from_lead_at: string | null;
        is_current: boolean;
        uploader: { id: string; name: string; email: string } | null;
      }>;
    }
  >();

  for (const document of documents) {
    if (
      project.space_id &&
      document.commercial_lead?.task.project.space_id &&
      document.commercial_lead.task.project.space_id !== project.space_id
    ) {
      continue;
    }
    const folderId =
      document.commercial_lead_id ??
      `${document.owner_email.toLocaleLowerCase()}::${document.brand_name.toLocaleLowerCase()}`;
    const folder = folders.get(folderId) ?? {
      id: folderId,
      commercial_lead_id: document.commercial_lead_id,
      brand_name: document.brand_name,
      owner_name: document.owner_name,
      owner_email: document.owner_email,
      latest_uploaded_at: document.uploaded_at.toISOString(),
      contract_date:
        document.commercial_lead?.task.company?.contract_start_date?.toISOString() ??
        document.commercial_lead?.contract_confirmed_at?.toISOString() ??
        null,
      documents: [],
    };
    folder.documents.push({
      id: document.id,
      file_name: document.file_name,
      mime_type: document.mime_type,
      size_bytes: document.size_bytes,
      uploaded_at: document.uploaded_at.toISOString(),
      confirmed_at: document.confirmed_at?.toISOString() ?? null,
      removed_from_lead_at: document.removed_from_lead_at?.toISOString() ?? null,
      is_current:
        document.commercial_lead?.proposal_storage_path === document.storage_path &&
        !document.removed_from_lead_at,
      uploader: document.uploader,
    });
    folders.set(folderId, folder);
  }

  const items = Array.from(folders.values());
  return NextResponse.json({
    items,
    total_folders: items.length,
    total_documents: items.reduce((total, folder) => total + folder.documents.length, 0),
  });
}

export const GET = withErrorReporting(
  "api:commercial/proposals:GET",
  GET_handler,
);
