import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth-response";
import {
  canContributeToProject,
  canReadProject,
} from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { getSupabaseAdminClient } from "@/lib/supabase-server";
import { setCommercialLeadStage } from "@/lib/commercial-lead-flow.server";
import {
  createCommercialFollowUpTask,
  removeCommercialFollowUpTask,
} from "@/lib/commercial-follow-up";
import { recordActivity } from "@/lib/activity";
import { withErrorReporting } from "@/lib/with-error-reporting";

const BUCKET =
  process.env.COMMERCIAL_PROPOSALS_BUCKET ||
  process.env.CLIENT_CONTRACTS_BUCKET ||
  "client-contracts";
const MAX_BYTES = 20_000_000;
const ALLOWED_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);
type RouteContext = { params: Promise<{ id: string }> };

function cleanFileName(name: string) {
  return (
    name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") ||
    "proposal"
  );
}

async function loadLead(id: string, workspaceId: string) {
  return prisma.commercialLead.findFirst({
    where: { id, workspace_id: workspaceId },
    include: {
      task: {
        include: {
          project: true,
          followers: { select: { user_id: true } },
        },
      },
    },
  });
}

function storageReady() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
}

async function POST_handler(req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;
  const lead = await loadLead(id, auth.currentWorkspaceId ?? "");
  if (!lead)
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!(await canContributeToProject(auth, lead.task.project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["proposal_sending", "awaiting_response"].includes(lead.stage)) {
    return NextResponse.json(
      { error: "Confirme a apresentação antes de anexar a proposta." },
      { status: 409 },
    );
  }
  if (!storageReady()) {
    return NextResponse.json(
      { error: "O armazenamento privado de propostas não está configurado." },
      { status: 503 },
    );
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Selecione o documento da proposta." },
      { status: 400 },
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Envie um arquivo PDF, Word ou Excel." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Use um arquivo de até 20 MB." },
      { status: 400 },
    );
  }

  const path = [
    lead.workspace_id,
    "commercial-leads",
    lead.id,
    `${Date.now()}-${randomUUID()}-${cleanFileName(file.name)}`,
  ].join("/");
  const bytes = Buffer.from(await file.arrayBuffer());
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (error) {
    return NextResponse.json(
      { error: "Não foi possível armazenar a proposta no bucket privado." },
      { status: 503 },
    );
  }

  const previousPath = lead.proposal_storage_path;
  const now = new Date();
  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      if (previousPath) {
        await tx.commercialProposalDocument.updateMany({
          where: { storage_path: previousPath },
          data: { removed_from_lead_at: now },
        });
      }
      await tx.commercialProposalDocument.create({
        data: {
          workspace_id: lead.workspace_id,
          commercial_lead_id: lead.id,
          brand_name: lead.brand_name,
          owner_name: lead.owner_name,
          owner_email: lead.owner_email,
          storage_bucket: BUCKET,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type,
          size_bytes: file.size,
          uploaded_by: auth.prismaUser.id,
          uploaded_at: now,
        },
      });
      await tx.commercialLead.update({
        where: { id: lead.id },
        data: {
          proposal_file_name: file.name,
          proposal_storage_bucket: BUCKET,
          proposal_storage_path: path,
          proposal_mime_type: file.type,
          proposal_size_bytes: file.size,
          proposal_uploaded_by: auth.prismaUser.id,
          proposal_uploaded_at: now,
          next_follow_up_at: null,
        },
      });
      await removeCommercialFollowUpTask(tx, {
        leadId: lead.id,
        parentTaskId: lead.task_id,
        followUpTaskId: lead.follow_up_task_id,
        workspaceId: lead.workspace_id,
      });
      if (lead.proposal_checklist_task_id) {
        await tx.task.update({
          where: { id: lead.proposal_checklist_task_id },
          data: { status: "todo" },
        });
      }
      if (lead.stage !== "proposal_sending") {
        await setCommercialLeadStage(tx, {
          leadId: lead.id,
          taskId: lead.task_id,
          projectId: lead.task.project_id,
          workspaceId: lead.workspace_id,
          stage: "proposal_sending",
        });
      }
      return tx.commercialLead.findUnique({ where: { id: lead.id } });
    });
  } catch (transactionError) {
    await supabase.storage.from(BUCKET).remove([path]);
    throw transactionError;
  }

  await recordActivity({
    workspace_id: lead.workspace_id,
    actor_id: auth.prismaUser.id,
    type: "commercial_lead_proposal_uploaded",
    entity_type: "commercial_lead",
    entity_id: lead.id,
    project_id: lead.task.project_id,
    task_id: lead.task_id,
    metadata: { file_name: file.name, confirmation_required: true },
  });
  return NextResponse.json(updated, { status: 201 });
}

async function PATCH_handler(_req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;
  const lead = await loadLead(id, auth.currentWorkspaceId ?? "");
  if (!lead)
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!(await canContributeToProject(auth, lead.task.project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (lead.stage !== "proposal_sending") {
    return NextResponse.json(
      { error: "A proposta já foi confirmada ou ainda não está pronta." },
      { status: 409 },
    );
  }
  if (!lead.proposal_storage_path || !lead.proposal_file_name) {
    return NextResponse.json(
      { error: "Anexe a proposta correta antes de confirmar o envio." },
      { status: 409 },
    );
  }

  const now = new Date();
  const confirmation = await prisma.$transaction(async (tx) => {
    await tx.commercialProposalDocument.updateMany({
      where: {
        commercial_lead_id: lead.id,
        storage_path: lead.proposal_storage_path!,
      },
      data: { confirmed_at: now, removed_from_lead_at: null },
    });
    if (lead.proposal_checklist_task_id) {
      await tx.task.update({
        where: { id: lead.proposal_checklist_task_id },
        data: { status: "done" },
      });
    }
    const followUp = await createCommercialFollowUpTask(tx, {
      leadId: lead.id,
      parentTaskId: lead.task_id,
      workspaceId: lead.workspace_id,
      leadsProjectOwnerId: lead.task.project.owner_id,
      spaceId: lead.task.project.space_id,
      assigneeId: lead.assignee_id,
      followerIds: lead.task.followers.map((follower) => follower.user_id),
      summary: {
        brandName: lead.brand_name,
        ownerName: lead.owner_name,
        ownerEmail: lead.owner_email,
        instagram: lead.instagram,
        monthlyRevenue: lead.monthly_revenue,
        whatsapp: lead.whatsapp,
        companyType: lead.company_type,
        observations: lead.observations,
      },
      now,
    });
    await setCommercialLeadStage(tx, {
      leadId: lead.id,
      taskId: lead.task_id,
      projectId: lead.task.project_id,
      workspaceId: lead.workspace_id,
      stage: "awaiting_response",
    });
    return {
      updated: await tx.commercialLead.findUnique({ where: { id: lead.id } }),
      followUpTaskId: followUp.task.id,
      nextFollowUp: followUp.dueAt,
    };
  });

  await recordActivity({
    workspace_id: lead.workspace_id,
    actor_id: auth.prismaUser.id,
    type: "commercial_lead_proposal_confirmed",
    entity_type: "commercial_lead",
    entity_id: lead.id,
    project_id: lead.task.project_id,
    task_id: lead.task_id,
    metadata: {
      file_name: lead.proposal_file_name,
      follow_up_task_id: confirmation.followUpTaskId,
      next_follow_up_at: confirmation.nextFollowUp?.toISOString() ?? null,
    },
  });
  return NextResponse.json(confirmation.updated);
}

async function GET_handler(_req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;
  const lead = await loadLead(id, auth.currentWorkspaceId ?? "");
  if (!lead)
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!(await canReadProject(auth, lead.task.project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (
    !lead.proposal_storage_bucket ||
    !lead.proposal_storage_path ||
    !lead.proposal_file_name
  ) {
    return NextResponse.json(
      { error: "Nenhuma proposta está anexada." },
      { status: 404 },
    );
  }
  if (!storageReady()) {
    return NextResponse.json(
      { error: "O armazenamento privado de propostas não está configurado." },
      { status: 503 },
    );
  }
  const { data, error } = await getSupabaseAdminClient()
    .storage.from(lead.proposal_storage_bucket)
    .createSignedUrl(lead.proposal_storage_path, 60, {
      download: lead.proposal_file_name,
    });
  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: "Não foi possível abrir a proposta." },
      { status: 503 },
    );
  }
  return NextResponse.json({
    url: data.signedUrl,
    file_name: lead.proposal_file_name,
    mime_type: lead.proposal_mime_type,
    size_bytes: lead.proposal_size_bytes,
    expires_in: 60,
  });
}

async function DELETE_handler(_req: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  const { id } = await params;
  const lead = await loadLead(id, auth.currentWorkspaceId ?? "");
  if (!lead)
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  if (!(await canContributeToProject(auth, lead.task.project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!["proposal_sending", "awaiting_response"].includes(lead.stage)) {
    return NextResponse.json(
      { error: "A proposta não pode ser removida nesta etapa." },
      { status: 409 },
    );
  }
  if (!lead.proposal_storage_path || !lead.proposal_storage_bucket) {
    return NextResponse.json(
      { error: "Nenhuma proposta está anexada." },
      { status: 404 },
    );
  }

  const storagePath = lead.proposal_storage_path;
  const removedFileName = lead.proposal_file_name;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.commercialProposalDocument.updateMany({
      where: { storage_path: storagePath },
      data: { removed_from_lead_at: new Date() },
    });
    await tx.commercialLead.update({
      where: { id: lead.id },
      data: {
        proposal_file_name: null,
        proposal_storage_bucket: null,
        proposal_storage_path: null,
        proposal_mime_type: null,
        proposal_size_bytes: null,
        proposal_uploaded_by: null,
        proposal_uploaded_at: null,
        next_follow_up_at: null,
      },
    });
    await removeCommercialFollowUpTask(tx, {
      leadId: lead.id,
      parentTaskId: lead.task_id,
      followUpTaskId: lead.follow_up_task_id,
      workspaceId: lead.workspace_id,
    });
    if (lead.proposal_checklist_task_id) {
      await tx.task.update({
        where: { id: lead.proposal_checklist_task_id },
        data: { status: "todo" },
      });
    }
    if (lead.stage !== "proposal_sending") {
      await setCommercialLeadStage(tx, {
        leadId: lead.id,
        taskId: lead.task_id,
        projectId: lead.task.project_id,
        workspaceId: lead.workspace_id,
        stage: "proposal_sending",
      });
    }
    return tx.commercialLead.findUnique({ where: { id: lead.id } });
  });

  await recordActivity({
    workspace_id: lead.workspace_id,
    actor_id: auth.prismaUser.id,
    type: "commercial_lead_proposal_removed",
    entity_type: "commercial_lead",
    entity_id: lead.id,
    project_id: lead.task.project_id,
    task_id: lead.task_id,
    metadata: { file_name: removedFileName, preserved_in_proposal_archive: true },
  });
  return NextResponse.json(updated);
}

export const POST = withErrorReporting(
  "api:commercial/leads/id/proposal:POST",
  POST_handler,
);
export const PATCH = withErrorReporting(
  "api:commercial/leads/id/proposal:PATCH",
  PATCH_handler,
);
export const GET = withErrorReporting(
  "api:commercial/leads/id/proposal:GET",
  GET_handler,
);
export const DELETE = withErrorReporting(
  "api:commercial/leads/id/proposal:DELETE",
  DELETE_handler,
);
