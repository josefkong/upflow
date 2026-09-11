import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth-response";
import { canContributeToProject } from "@/lib/project-access";
import { prisma } from "@/lib/prisma";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { ensureCommercialLeadProjectModel } from "@/lib/commercial-lead-flow.server";
import { commercialLeadStageName } from "@/lib/commercial-lead-stages";
import { queueGoogleCalendarEventSyncInTransaction, processGoogleCalendarSyncJob } from "@/lib/google-calendar";
import { notifyCalendarEventAssignees } from "@/lib/calendar-notifications";
import { notifyTaskAssignee } from "@/lib/task-assignment-notifications";
import { sendCommercialLeadPresentationEmails } from "@/lib/commercial-lead-email";
import { recordActivity } from "@/lib/activity";
import { logError } from "@/lib/log-error";
import { COMMERCIAL_LEAD_REVENUE_VALUES } from "@/lib/commercial-lead-revenue";
import { formatBrazilianMobile, isBrazilianMobile } from "@/lib/brazilian-mobile";

const LeadSchema = z
  .object({
    project_id: z.string().uuid(),
    brand_name: z.string().trim().min(1).max(160),
    owner_name: z.string().trim().min(1).max(160),
    owner_email: z.string().trim().email().max(320),
    instagram: z.string().trim().min(1).max(160).transform((value) => value.replace(/^@+/, "").replace(/\s+/g, "")),
    monthly_revenue: z.coerce.number().refine(
      (value) => COMMERCIAL_LEAD_REVENUE_VALUES.includes(value as (typeof COMMERCIAL_LEAD_REVENUE_VALUES)[number]),
      "Selecione uma faixa de faturamento válida.",
    ),
    whatsapp: z
      .string()
      .trim()
      .refine(isBrazilianMobile, "Informe um WhatsApp no formato DD XXXXX-XXXX.")
      .transform(formatBrazilianMobile),
    presentation_starts_at: z.string().datetime().optional().nullable(),
    presentation_ends_at: z.string().datetime().optional().nullable(),
    assignee_id: z.string().uuid(),
    company_type: z.enum(["B2B", "B2C", "Ambos"]),
    observations: z.string().trim().max(20_000).optional().nullable(),
  })
  .superRefine((value, context) => {
    const hasStart = Boolean(value.presentation_starts_at);
    const hasEnd = Boolean(value.presentation_ends_at);
    if (hasStart !== hasEnd) {
      context.addIssue({ code: "custom", path: ["presentation_ends_at"], message: "Informe o início e o fim da apresentação." });
    }
    if (value.presentation_starts_at && value.presentation_ends_at) {
      const start = new Date(value.presentation_starts_at);
      const end = new Date(value.presentation_ends_at);
      if (end <= start) {
        context.addIssue({ code: "custom", path: ["presentation_ends_at"], message: "O término deve ser posterior ao início." });
      }
    }
  });

function isLeadsProject(project: { name: string; space: { name: string } | null }) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return normalize(project.name) === "leads" && normalize(project.space?.name ?? "") === "comercial";
}

async function POST_handler(req: NextRequest) {
  const authResult = await requireAuth();
  if (!authResult.ok) return authResult.response;
  const auth = authResult.auth;
  if (!auth.currentWorkspaceId) return NextResponse.json({ error: "No active workspace" }, { status: 400 });

  const parsed = LeadSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados do lead inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const project = await prisma.project.findFirst({
    where: { id: input.project_id, workspace_id: auth.currentWorkspaceId },
    select: { id: true, workspace_id: true, owner_id: true, space_id: true, name: true, space: { select: { name: true } } },
  });
  if (!project || !isLeadsProject(project)) {
    return NextResponse.json({ error: "Use a lista Leads do Espaço Comercial." }, { status: 400 });
  }
  if (!(await canContributeToProject(auth, project))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const assignee = await prisma.workspaceMember.findFirst({
    where: { workspace_id: project.workspace_id, user_id: input.assignee_id, status: "active" },
    select: { user: { select: { id: true, name: true, email: true } } },
  });
  if (!assignee) return NextResponse.json({ error: "Selecione um colaborador ativo." }, { status: 400 });

  const startsAt = input.presentation_starts_at ? new Date(input.presentation_starts_at) : null;
  const endsAt = input.presentation_ends_at ? new Date(input.presentation_ends_at) : null;
  const stage = startsAt ? "presentation_scheduled" as const : "lead" as const;
  const created = await prisma.$transaction(async (tx) => {
    const field = await ensureCommercialLeadProjectModel(tx, { workspaceId: project.workspace_id, projectId: project.id });
    const position = await tx.task.count({ where: { project_id: project.id } });
    const task = await tx.task.create({
      data: {
        title: input.brand_name,
        description: input.observations || null,
        status: startsAt ? "in_progress" : "todo",
        priority: "medium",
        project_id: project.id,
        assignee_id: input.assignee_id,
        due_date: startsAt,
        position,
        custom_field_values: { create: { definition_id: field.id, value: commercialLeadStageName(stage) } },
      },
      include: { assignee: { select: { id: true, name: true, email: true } }, project: { select: { id: true, name: true } } },
    });
    const event = startsAt && endsAt
      ? await tx.calendarEvent.create({
          data: {
            workspace_id: project.workspace_id,
            title: `Apresentação — ${input.brand_name}`,
            description: null,
            type: "client_call",
            starts_at: startsAt,
            ends_at: endsAt,
            timezone: "America/Sao_Paulo",
            created_by: input.assignee_id,
            project_id: project.id,
            task_id: task.id,
            space_id: project.space_id,
            responsible_user_id: input.assignee_id,
            google_meet_requested: true,
            priority: "high",
            attendees: { create: { user_id: input.assignee_id } },
            reminders: { create: [{ minutes_before: 1440 }, { minutes_before: 30 }] },
          },
        })
      : null;
    const lead = await tx.commercialLead.create({
      data: {
        workspace_id: project.workspace_id,
        task_id: task.id,
        presentation_event_id: event?.id ?? null,
        brand_name: input.brand_name,
        owner_name: input.owner_name,
        owner_email: input.owner_email,
        instagram: input.instagram,
        monthly_revenue: input.monthly_revenue,
        whatsapp: input.whatsapp,
        notes: input.observations || "",
        presentation_starts_at: startsAt,
        presentation_ends_at: endsAt,
        assignee_id: input.assignee_id,
        company_type: input.company_type,
        observations: input.observations || null,
        stage,
        created_by: auth.prismaUser.id,
      },
    });
    const googleJobId = event ? await queueGoogleCalendarEventSyncInTransaction(tx, event.id) : null;
    return { task, lead, event, googleJobId };
  });

  await notifyTaskAssignee({ taskId: created.task.id, userId: input.assignee_id, workspaceId: project.workspace_id, data: { source: "commercial_lead_created", lead_id: created.lead.id } });
  if (created.event) {
    await notifyCalendarEventAssignees({ event: created.event, attendeeIds: [input.assignee_id], actor: auth.prismaUser });
    after(async () => {
      if (created.googleJobId) await processGoogleCalendarSyncJob(created.googleJobId).catch((error) => logError("commercial-lead:google-sync", error, { lead_id: created.lead.id }));
      await sendCommercialLeadPresentationEmails({
        eventId: created.event!.id,
        recipients: [
          { email: input.owner_email, name: input.owner_name },
          { email: assignee.user.email, name: assignee.user.name },
        ],
        brandName: input.brand_name,
        startsAt: startsAt!,
        endsAt: endsAt!,
      }).catch((error) => logError("commercial-lead:presentation-email", error, { lead_id: created.lead.id }));
    });
  }
  await recordActivity({
    workspace_id: project.workspace_id,
    actor_id: auth.prismaUser.id,
    type: "commercial_lead_created",
    entity_type: "commercial_lead",
    entity_id: created.lead.id,
    project_id: project.id,
    task_id: created.task.id,
    metadata: { brand_name: input.brand_name, stage, assignee_id: input.assignee_id, company_type: input.company_type },
  });

  return NextResponse.json({ ...created.task, commercial_lead: created.lead }, { status: 201 });
}

export const POST = withErrorReporting("api:commercial/leads:POST", POST_handler);
