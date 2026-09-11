import { Prisma } from "@prisma/client";
import {
  COMMERCIAL_LEAD_STAGE_FIELD_NAME,
  COMMERCIAL_LEAD_STAGES,
  commercialLeadStageName,
  type CommercialLeadStage,
} from "@/lib/commercial-lead-stages";

type Db = Prisma.TransactionClient;

export async function ensureCommercialLeadProjectModel(
  db: Db,
  input: { workspaceId: string; projectId: string },
) {
  const options = COMMERCIAL_LEAD_STAGES.map((stage) => stage.name);
  const existingField = await db.customFieldDefinition.findFirst({
    where: { project_id: input.projectId, name: COMMERCIAL_LEAD_STAGE_FIELD_NAME },
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
          name: COMMERCIAL_LEAD_STAGE_FIELD_NAME,
          type: "dropdown",
          options: options as Prisma.InputJsonValue,
          position: 0,
        },
        select: { id: true },
      });

  for (const [stageOrder, stage] of COMMERCIAL_LEAD_STAGES.entries()) {
    const existing = await db.workflowStatus.findFirst({
      where: {
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        category: "task",
        key: `commercial-lead-${stage.key}`,
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
          key: `commercial-lead-${stage.key}`,
          ...data,
        },
      });
    }
  }

  return field;
}

export async function setCommercialLeadStage(
  db: Db,
  input: { leadId: string; taskId: string; projectId: string; workspaceId: string; stage: CommercialLeadStage },
) {
  const field = await ensureCommercialLeadProjectModel(db, input);
  const taskStatus = ["completed", "archived"].includes(input.stage)
    ? "done"
    : input.stage === "lead"
      ? "todo"
      : "in_progress";
  const stageName = commercialLeadStageName(input.stage);

  await Promise.all([
    db.commercialLead.update({
      where: { id: input.leadId },
      data: {
        stage: input.stage,
        closed_at: input.stage === "completed" ? new Date() : null,
      },
    }),
    db.task.update({ where: { id: input.taskId }, data: { status: taskStatus } }),
    db.customFieldValue.upsert({
      where: { task_id_definition_id: { task_id: input.taskId, definition_id: field.id } },
      create: { task_id: input.taskId, definition_id: field.id, value: stageName },
      update: { value: stageName },
    }),
  ]);
}
