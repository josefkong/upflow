import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-response";
import { canReadProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { withErrorReporting } from "@/lib/with-error-reporting";

type RouteContext = { params: Promise<{ id: string }> };

function storageReady() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

async function GET_handler(_req: Request, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;
  const document = await prisma.commercialProposalDocument.findFirst({
    where: { id, workspace_id: auth.currentWorkspaceId ?? "" },
  });
  if (!document) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  const archiveProject = await prisma.project.findFirst({
    where: {
      workspace_id: document.workspace_id,
      OR: [
        { name: { equals: "Propostas", mode: "insensitive" } },
        { name: { equals: "Proposals", mode: "insensitive" } },
      ],
      space: {
        OR: [
          { name: { equals: "Comercial", mode: "insensitive" } },
          { name: { equals: "Commercial", mode: "insensitive" } },
        ],
      },
    },
  });
  if (!archiveProject || !(await canReadProject(auth, archiveProject))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!storageReady()) {
    return NextResponse.json(
      { error: "O armazenamento privado de propostas não está configurado." },
      { status: 503 },
    );
  }

  const { data, error } = await getSupabaseAdminClient()
    .storage.from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 60, { download: document.file_name });
  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: "Não foi possível abrir a proposta." },
      { status: 503 },
    );
  }
  return NextResponse.redirect(data.signedUrl);
}

export const GET = withErrorReporting(
  "api:commercial/proposals/id:GET",
  GET_handler,
);
