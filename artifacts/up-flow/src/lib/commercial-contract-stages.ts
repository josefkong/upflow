import { Prisma } from "@prisma/client";

type Db = Prisma.TransactionClient;

export const COMMERCIAL_CONTRACT_STAGE_FIELD_NAME =
  "Upflow Commercial Contract Stage";

export const COMMERCIAL_CONTRACT_STAGES = [
  {
    key: "information",
    name: "Preenchimento de Informações",
    color: "#64748b",
    terminal: false,
  },
  {
    key: "preparation",
    name: "Elaboração de Contrato",
    color: "#3b82f6",
    terminal: false,
  },
  {
    key: "sent",
    name: "Contrato Enviado",
    color: "#f59e0b",
    terminal: false,
  },
  {
    key: "signed",
    name: "Contrato Assinado",
    color: "#22c55e",
    terminal: true,
  },
] as const;

export type CommercialContractStage =
  (typeof COMMERCIAL_CONTRACT_STAGES)[number]["key"];

type CommercialContractStageSnapshot = {
  contract_confirmed_at?: Date | string | null;
  finance_contract_task?: { status: string } | null;
};

export function commercialContractStageFromLead(
  lead: CommercialContractStageSnapshot | null | undefined,
): CommercialContractStage {
  if (lead?.finance_contract_task?.status === "done") return "signed";
  if (lead?.finance_contract_task?.status === "in_progress") return "sent";
  if (lead?.contract_confirmed_at) return "preparation";
  return "information";
}

export function commercialContractStageName(stage: CommercialContractStage) {
  return (
    COMMERCIAL_CONTRACT_STAGES.find((candidate) => candidate.key === stage)
      ?.name ?? COMMERCIAL_CONTRACT_STAGES[0].name
  );
}

export async function ensureCommercialContractProjectModel(
  db: Db,
  input: { workspaceId: string; projectId: string },
) {
  const options = COMMERCIAL_CONTRACT_STAGES.map((stage) => stage.name);
  const existingField = await db.customFieldDefinition.findFirst({
    where: {
      project_id: input.projectId,
      name: COMMERCIAL_CONTRACT_STAGE_FIELD_NAME,
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
          name: COMMERCIAL_CONTRACT_STAGE_FIELD_NAME,
          type: "dropdown",
          options: options as Prisma.InputJsonValue,
          position: 0,
        },
        select: { id: true },
      });

  for (const [stageOrder, stage] of COMMERCIAL_CONTRACT_STAGES.entries()) {
    const existing = await db.workflowStatus.findFirst({
      where: {
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        category: "task",
        key: `commercial-contract-${stage.key}`,
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
          key: `commercial-contract-${stage.key}`,
          ...data,
        },
      });
    }
  }

  const existingTasks = await db.task.findMany({
    where: {
      project_id: input.projectId,
      commercial_contract_handoff: { isNot: null },
    },
    select: {
      id: true,
      commercial_contract_handoff: {
        select: {
          contract_confirmed_at: true,
          finance_contract_task: { select: { status: true } },
        },
      },
    },
  });
  for (const task of existingTasks) {
    const lead = task.commercial_contract_handoff;
    const stage = commercialContractStageFromLead(lead);
    const taskStatus =
      stage === "signed" ? "done" : stage === "information" ? "todo" : "in_progress";
    await Promise.all([
      db.task.update({
        where: { id: task.id },
        data: { status: taskStatus },
      }),
      db.customFieldValue.upsert({
        where: {
          task_id_definition_id: {
            task_id: task.id,
            definition_id: field.id,
          },
        },
        create: {
          task_id: task.id,
          definition_id: field.id,
          value: commercialContractStageName(stage),
        },
        update: { value: commercialContractStageName(stage) },
      }),
    ]);
  }

  return field;
}

export async function setCommercialContractStage(
  db: Db,
  input: {
    workspaceId: string;
    projectId: string;
    taskId: string;
    stage: CommercialContractStage;
  },
) {
  const field = await ensureCommercialContractProjectModel(db, input);
  const taskStatus =
    input.stage === "signed"
      ? ("done" as const)
      : input.stage === "information"
        ? ("todo" as const)
        : ("in_progress" as const);
  await Promise.all([
    db.task.update({
      where: { id: input.taskId },
      data: { status: taskStatus },
    }),
    db.customFieldValue.upsert({
      where: {
        task_id_definition_id: {
          task_id: input.taskId,
          definition_id: field.id,
        },
      },
      create: {
        task_id: input.taskId,
        definition_id: field.id,
        value: commercialContractStageName(input.stage),
      },
      update: { value: commercialContractStageName(input.stage) },
    }),
  ]);
}
