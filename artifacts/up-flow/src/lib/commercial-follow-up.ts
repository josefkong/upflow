import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

export const COMMERCIAL_FOLLOW_UP_FIELD_NAME =
  "Upflow Commercial Follow-up Stage";
export const COMMERCIAL_FOLLOW_UP_PROJECT_NAME = "Follow Up";

const COMMERCIAL_FOLLOW_UP_PROJECT_ALIASES = [
  COMMERCIAL_FOLLOW_UP_PROJECT_NAME,
  "Follow-up",
  "Follow-ups",
] as const;

export const COMMERCIAL_FOLLOW_UP_STAGES = [
  {
    key: "first_contact",
    name: "Primeiro Contato · D+3",
    color: "#f59e0b",
    terminal: false,
  },
  {
    key: "second_contact",
    name: "Segundo Contato · D+7",
    color: "#3b82f6",
    terminal: false,
  },
  {
    key: "final_contact",
    name: "Terceiro Contato · D+14",
    color: "#8b5cf6",
    terminal: false,
  },
  {
    key: "awaiting_decision",
    name: "Aguardando Decisão",
    color: "#ec4899",
    terminal: false,
  },
  {
    key: "completed",
    name: "Concluído",
    color: "#22c55e",
    terminal: true,
  },
  {
    key: "withdrawn",
    name: "Desistência",
    color: "#ef4444",
    terminal: true,
  },
] as const;

export type CommercialFollowUpStage =
  (typeof COMMERCIAL_FOLLOW_UP_STAGES)[number]["key"];

type LeadSummary = {
  brandName: string;
  ownerName: string;
  ownerEmail: string;
  instagram: string;
  monthlyRevenue: string | number | Prisma.Decimal;
  whatsapp: string;
  companyType: string;
  observations?: string | null;
};

const cadenceDays: Partial<Record<CommercialFollowUpStage, number>> = {
  first_contact: 3,
  second_contact: 7,
  final_contact: 14,
};

export function commercialFollowUpStageName(stage: CommercialFollowUpStage) {
  return (
    COMMERCIAL_FOLLOW_UP_STAGES.find((item) => item.key === stage)?.name ??
    COMMERCIAL_FOLLOW_UP_STAGES[0].name
  );
}

export function isCommercialFollowUpStage(
  value: string | null | undefined,
): value is CommercialFollowUpStage {
  return COMMERCIAL_FOLLOW_UP_STAGES.some((item) => item.key === value);
}

export function nextCommercialFollowUpStage(
  stage: CommercialFollowUpStage,
): CommercialFollowUpStage | null {
  if (stage === "first_contact") return "second_contact";
  if (stage === "second_contact") return "final_contact";
  if (stage === "final_contact") return "awaiting_decision";
  return null;
}

export function commercialFollowUpDueAt(
  proposalConfirmedAt: Date,
  stage: CommercialFollowUpStage,
) {
  const days = cadenceDays[stage];
  if (!days) return null;
  return new Date(proposalConfirmedAt.getTime() + days * 24 * 60 * 60 * 1000);
}

export function isCommercialFollowUpProject(input: {
  name?: string | null;
  spaceName?: string | null;
}) {
  return (
    COMMERCIAL_FOLLOW_UP_PROJECT_ALIASES.some(
      (name) =>
        name.toLocaleLowerCase() === input.name?.trim().toLocaleLowerCase(),
    ) &&
    input.spaceName?.trim().toLocaleLowerCase() === "comercial"
  );
}

export function commercialFollowUpTaskTitle(brandName: string) {
  return `Follow Up Comercial — ${brandName}`;
}

export function normalizeCommercialFollowUpTaskTitle(title: string) {
  return title.replace(
    /^Follow(?:[\s-]?Up)s?\s+Comercial\b/i,
    "Follow Up Comercial",
  );
}

export function commercialFollowUpDescription(input: LeadSummary) {
  const instagram = input.instagram.replace(/^@+/, "");
  return [
    "Cadastro de origem · Projeto Leads",
    `Marca: ${input.brandName}`,
    `Proprietário: ${input.ownerName}`,
    `E-mail: ${input.ownerEmail}`,
    `Instagram: @${instagram}`,
    `WhatsApp: +55 ${input.whatsapp}`,
    `Faturamento mensal: R$ ${Number(input.monthlyRevenue).toLocaleString("pt-BR")}`,
    `Empresa: ${input.companyType}`,
    input.observations ? `Observações: ${input.observations}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

async function ensureFollowUpProject(
  db: Db,
  input: {
    workspaceId: string;
    spaceId: string | null;
    ownerId: string;
  },
) {
  const candidates = await db.project.findMany({
    where: {
      workspace_id: input.workspaceId,
      space_id: input.spaceId,
      name: {
        in: [...COMMERCIAL_FOLLOW_UP_PROJECT_ALIASES],
        mode: "insensitive",
      },
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: {
      id: true,
      name: true,
      _count: {
        select: {
          tasks: true,
          custom_fields: true,
          workflow_statuses: true,
        },
      },
    },
  });
  const existing = candidates.sort((left, right) => {
    const leftScore =
      left._count.tasks * 100 +
      left._count.workflow_statuses * 10 +
      left._count.custom_fields;
    const rightScore =
      right._count.tasks * 100 +
      right._count.workflow_statuses * 10 +
      right._count.custom_fields;
    return rightScore - leftScore;
  })[0];
  if (existing) {
    if (existing.name === COMMERCIAL_FOLLOW_UP_PROJECT_NAME) {
      return { id: existing.id };
    }
    return db.project.update({
      where: { id: existing.id },
      data: { name: COMMERCIAL_FOLLOW_UP_PROJECT_NAME },
      select: { id: true },
    });
  }

  const lastProject = await db.project.findFirst({
    where: {
      workspace_id: input.workspaceId,
      space_id: input.spaceId,
      folder_id: null,
    },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  return db.project.create({
    data: {
      name: COMMERCIAL_FOLLOW_UP_PROJECT_NAME,
      description:
        "Cadência comercial automática vinculada às propostas enviadas pelo projeto Leads.",
      kind: "operational_queue",
      workspace_id: input.workspaceId,
      owner_id: input.ownerId,
      space_id: input.spaceId,
      position: (lastProject?.position ?? -1) + 1,
    },
    select: { id: true },
  });
}

export async function ensureCommercialFollowUpModel(
  db: Db,
  input: {
    workspaceId: string;
    projectId: string;
  },
) {
  const options = COMMERCIAL_FOLLOW_UP_STAGES.map((stage) => stage.name);
  const existingField = await db.customFieldDefinition.findFirst({
    where: {
      project_id: input.projectId,
      name: COMMERCIAL_FOLLOW_UP_FIELD_NAME,
    },
    select: { id: true },
  });
  const field = existingField
    ? await db.customFieldDefinition.update({
        where: { id: existingField.id },
        data: { type: "dropdown", options: options as Prisma.InputJsonValue },
        select: { id: true },
      })
    : await db.customFieldDefinition.create({
        data: {
          project_id: input.projectId,
          name: COMMERCIAL_FOLLOW_UP_FIELD_NAME,
          type: "dropdown",
          options: options as Prisma.InputJsonValue,
          position: 0,
        },
        select: { id: true },
      });

  for (const [stageOrder, stage] of COMMERCIAL_FOLLOW_UP_STAGES.entries()) {
    const existing = await db.workflowStatus.findFirst({
      where: {
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        category: "task",
        key: `commercial-follow-up-${stage.key}`,
      },
      select: { id: true },
    });
    const data = {
      name: stage.name,
      stage_order: stageOrder,
      color: stage.color,
      terminal: stage.terminal,
      active: true,
    };
    if (existing) {
      await db.workflowStatus.update({ where: { id: existing.id }, data });
    } else {
      await db.workflowStatus.create({
        data: {
          workspace_id: input.workspaceId,
          project_id: input.projectId,
          category: "task",
          key: `commercial-follow-up-${stage.key}`,
          ...data,
        },
      });
    }
  }
  return field;
}

export async function createCommercialFollowUpTask(
  db: Db,
  input: {
    leadId: string;
    parentTaskId: string;
    workspaceId: string;
    leadsProjectOwnerId: string;
    spaceId: string | null;
    assigneeId: string;
    followerIds: string[];
    summary: LeadSummary;
    now: Date;
  },
) {
  const followUpProject = await ensureFollowUpProject(db, {
    workspaceId: input.workspaceId,
    spaceId: input.spaceId,
    ownerId: input.leadsProjectOwnerId,
  });
  const field = await ensureCommercialFollowUpModel(db, {
    workspaceId: input.workspaceId,
    projectId: followUpProject.id,
  });
  const stage: CommercialFollowUpStage = "first_contact";
  const dueAt = commercialFollowUpDueAt(input.now, stage);
  const lead = await db.commercialLead.findUnique({
    where: { id: input.leadId },
    select: { follow_up_task_id: true },
  });
  const taskData = {
    title: commercialFollowUpTaskTitle(input.summary.brandName),
    description: commercialFollowUpDescription(input.summary),
    status: "todo" as const,
    priority: "high" as const,
    project_id: followUpProject.id,
    assignee_id: input.assigneeId,
    parent_id: input.parentTaskId,
    due_date: dueAt,
  };
  const task = lead?.follow_up_task_id
    ? await db.task.update({
        where: { id: lead.follow_up_task_id },
        data: taskData,
        select: { id: true, project_id: true, created_at: true },
      })
    : await db.task.create({
        data: {
          ...taskData,
          position: await db.task.count({
            where: { project_id: followUpProject.id },
          }),
        },
        select: { id: true, project_id: true, created_at: true },
      });

  await db.taskFollower.deleteMany({ where: { task_id: task.id } });
  const followerIds = Array.from(
    new Set(input.followerIds.filter((userId) => userId !== input.assigneeId)),
  );
  if (followerIds.length > 0) {
    await db.taskFollower.createMany({
      data: followerIds.map((user_id) => ({ task_id: task.id, user_id })),
      skipDuplicates: true,
    });
  }
  await db.customFieldValue.upsert({
    where: {
      task_id_definition_id: {
        task_id: task.id,
        definition_id: field.id,
      },
    },
    create: {
      task_id: task.id,
      definition_id: field.id,
      value: commercialFollowUpStageName(stage),
    },
    update: { value: commercialFollowUpStageName(stage) },
  });
  await db.commercialLead.update({
    where: { id: input.leadId },
    data: {
      follow_up_task_id: task.id,
      follow_up_stage: stage,
      follow_up_count: 0,
      next_follow_up_at: dueAt,
      follow_up_notification_sent_at: null,
    },
  });
  await db.recurringTaskRule.updateMany({
    where: {
      workspace_id: input.workspaceId,
      task_id: input.parentTaskId,
    },
    data: { active: false },
  });
  return { task, stage, dueAt };
}

export async function removeCommercialFollowUpTask(
  db: Db,
  input: {
    leadId: string;
    parentTaskId: string;
    followUpTaskId?: string | null;
    workspaceId: string;
  },
) {
  if (input.followUpTaskId) {
    await db.task.deleteMany({ where: { id: input.followUpTaskId } });
  }
  await db.task.deleteMany({
    where: {
      parent_id: input.parentTaskId,
      OR: [
        { title: { startsWith: "Follow-up da Proposta" } },
        { title: { startsWith: "Follow Up da Proposta" } },
      ],
    },
  });
  await db.commercialLead.update({
    where: { id: input.leadId },
    data: {
      follow_up_task_id: null,
      follow_up_stage: null,
      follow_up_count: 0,
      next_follow_up_at: null,
      follow_up_notification_sent_at: null,
    },
  });
  await db.recurringTaskRule.updateMany({
    where: {
      workspace_id: input.workspaceId,
      task_id: input.parentTaskId,
    },
    data: { active: false },
  });
}

export async function advanceCommercialFollowUp(
  db: Db,
  input: {
    leadId: string;
    followUpTaskId: string;
    workspaceId: string;
    projectId: string;
    currentStage: CommercialFollowUpStage;
    proposalConfirmedAt: Date;
    now: Date;
  },
) {
  const nextStage = nextCommercialFollowUpStage(input.currentStage);
  if (!nextStage) return null;
  const field = await ensureCommercialFollowUpModel(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  });
  const targetDueAt = commercialFollowUpDueAt(
    input.proposalConfirmedAt,
    nextStage,
  );
  const dueAt =
    targetDueAt && targetDueAt > input.now ? targetDueAt : targetDueAt ? input.now : null;
  await Promise.all([
    db.task.update({
      where: { id: input.followUpTaskId },
      data: {
        status: nextStage === "completed" ? "done" : "in_progress",
        due_date: dueAt,
      },
    }),
    db.customFieldValue.upsert({
      where: {
        task_id_definition_id: {
          task_id: input.followUpTaskId,
          definition_id: field.id,
        },
      },
      create: {
        task_id: input.followUpTaskId,
        definition_id: field.id,
        value: commercialFollowUpStageName(nextStage),
      },
      update: { value: commercialFollowUpStageName(nextStage) },
    }),
    db.commercialLead.update({
      where: { id: input.leadId },
      data: {
        follow_up_stage: nextStage,
        follow_up_count: { increment: 1 },
        next_follow_up_at: dueAt,
        follow_up_notification_sent_at: null,
      },
    }),
  ]);
  return { stage: nextStage, dueAt };
}

export async function completeCommercialFollowUp(
  db: Db,
  input: {
    leadId: string;
    followUpTaskId: string;
    workspaceId: string;
    projectId: string;
  },
) {
  const field = await ensureCommercialFollowUpModel(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  });
  await Promise.all([
    db.task.update({
      where: { id: input.followUpTaskId },
      data: { status: "done", due_date: null },
    }),
    db.customFieldValue.upsert({
      where: {
        task_id_definition_id: {
          task_id: input.followUpTaskId,
          definition_id: field.id,
        },
      },
      create: {
        task_id: input.followUpTaskId,
        definition_id: field.id,
        value: commercialFollowUpStageName("completed"),
      },
      update: { value: commercialFollowUpStageName("completed") },
    }),
    db.commercialLead.update({
      where: { id: input.leadId },
      data: {
        follow_up_stage: "completed",
        next_follow_up_at: null,
        follow_up_notification_sent_at: null,
      },
    }),
  ]);
}

export async function reopenCommercialFollowUp(
  db: Db,
  input: {
    leadId: string;
    followUpTaskId: string;
    workspaceId: string;
    projectId: string;
  },
) {
  const field = await ensureCommercialFollowUpModel(db, {
    workspaceId: input.workspaceId,
    projectId: input.projectId,
  });
  await Promise.all([
    db.task.update({
      where: { id: input.followUpTaskId },
      data: { status: "in_progress", due_date: null },
    }),
    db.customFieldValue.upsert({
      where: {
        task_id_definition_id: {
          task_id: input.followUpTaskId,
          definition_id: field.id,
        },
      },
      create: {
        task_id: input.followUpTaskId,
        definition_id: field.id,
        value: commercialFollowUpStageName("awaiting_decision"),
      },
      update: { value: commercialFollowUpStageName("awaiting_decision") },
    }),
    db.commercialLead.update({
      where: { id: input.leadId },
      data: {
        follow_up_stage: "awaiting_decision",
        next_follow_up_at: null,
        follow_up_notification_sent_at: null,
      },
    }),
  ]);
}
