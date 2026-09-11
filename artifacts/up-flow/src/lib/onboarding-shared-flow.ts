import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  LEGACY_SHARED_ONBOARDING_STAGES,
  SHARED_ONBOARDING_STAGES,
  type SharedOnboardingStage,
} from "@/lib/onboarding-stages";

export {
  SHARED_ONBOARDING_STAGES,
  type SharedOnboardingStage,
} from "@/lib/onboarding-stages";

type Db = typeof prisma | Prisma.TransactionClient;

export const ONBOARDING_STAGE_FIELD_NAME = "Etapa do Onboarding";
export const SHARED_ONBOARDING_TASK_AUTOMATION_KEY = "shared_onboarding:task";
export const SHARED_ONBOARDING_SEQUENTIAL_ENTRY_KEY =
  "shared_onboarding:scheduling:01:support-finance-admin";

export const SHARED_ONBOARDING_SCHEDULING_KEYS = {
  support: SHARED_ONBOARDING_SEQUENTIAL_ENTRY_KEY,
  performance: "shared_onboarding:scheduling:02:performance",
  creative: "shared_onboarding:scheduling:03:creative",
} as const;

export const SHARED_ONBOARDING_EXECUTION_KEYS = {
  support: "shared_onboarding:support:01:complete",
  performance: "shared_onboarding:performance:01:complete",
  creative: "shared_onboarding:creative:01:complete",
} as const;

const PHASE_PREFIXES = [
  {
    prefix: "shared_onboarding:scheduling:",
    stage: "Agendamento dos Onboardings",
  },
  {
    prefix: "shared_onboarding:support:",
    stage: "Onboarding de Suporte",
  },
  {
    prefix: "shared_onboarding:performance:",
    stage: "Onboarding de Performance",
  },
  {
    prefix: "shared_onboarding:creative:",
    stage: "Onboarding de Criação",
  },
] as const satisfies ReadonlyArray<{
  prefix: string;
  stage: SharedOnboardingStage;
}>;

function normalized(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function isOnboardingMirrorProject(input: {
  projectName?: string | null;
  onboardingEnabled?: boolean | null;
  companyId?: string | null;
}) {
  return (
    normalized(input.projectName) === "onboarding" &&
    input.onboardingEnabled === true &&
    !input.companyId
  );
}

export function isSharedOnboardingAutomationKey(
  value: string | null | undefined,
) {
  return value === SHARED_ONBOARDING_TASK_AUTOMATION_KEY;
}

export function sharedOnboardingPhaseIndex(value: string | null | undefined) {
  const index = PHASE_PREFIXES.findIndex((phase) =>
    value?.startsWith(phase.prefix),
  );
  return index >= 0 ? index : null;
}

export function sharedOnboardingItemIsUnlocked(
  items: Array<{
    automation_key?: string | null;
    status?: string | null;
    sort_order?: number | null;
  }>,
  automationKey: string | null | undefined,
) {
  const targetPhase = sharedOnboardingPhaseIndex(automationKey);
  if (targetPhase === null) return true;

  const phaseItems = items
    .filter(
      (item) =>
        item.automation_key !== SHARED_ONBOARDING_TASK_AUTOMATION_KEY &&
        sharedOnboardingPhaseIndex(item.automation_key) !== null,
    )
    .map((item) => ({
      ...item,
      phase: sharedOnboardingPhaseIndex(item.automation_key)!,
    }));
  const currentPhase = PHASE_PREFIXES.findIndex((_, phase) =>
    phaseItems.some(
      (item) => item.phase === phase && item.status !== "complete",
    ),
  );

  return currentPhase >= 0 && targetPhase === currentPhase;
}

function hasRecordedParticipants(value: unknown) {
  return (
    Array.isArray(value) &&
    value.some(
      (participant) =>
        typeof participant === "string" && participant.trim().length > 0,
    )
  );
}

export function sharedOnboardingWhatsAppGroupIsComplete(input: {
  group_created?: boolean | null;
  group_name?: string | null;
  group_link?: string | null;
  internal_participants?: unknown;
  client_participants?: unknown;
}) {
  return Boolean(
    input.group_created &&
    input.group_name?.trim() &&
    input.group_link?.trim() &&
    hasRecordedParticipants(input.internal_participants) &&
    hasRecordedParticipants(input.client_participants),
  );
}

export async function ensureOnboardingProjectStageModel(
  db: Db,
  input: { workspaceId: string; projectId: string },
) {
  const options = SHARED_ONBOARDING_STAGES.map((stage) => stage.name);
  const fieldLookup = {
    where: {
      project_id: input.projectId,
      name: ONBOARDING_STAGE_FIELD_NAME,
    },
    select: { id: true, type: true, options: true },
  } as const;
  const initialField = await db.customFieldDefinition.findFirst(fieldLookup);
  const initialStatuses = await db.workflowStatus.findMany({
    where: {
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      category: "task",
      key: {
        in: [
          ...SHARED_ONBOARDING_STAGES.map((stage) => stage.key),
          ...LEGACY_SHARED_ONBOARDING_STAGES.map((stage) => stage.key),
        ],
      },
    },
    select: {
      key: true,
      name: true,
      stage_order: true,
      color: true,
      terminal: true,
      active: true,
    },
  });
  const fieldOptions = Array.isArray(initialField?.options)
    ? initialField.options.filter(
        (option): option is string => typeof option === "string",
      )
    : [];
  const stageModelIsCurrent =
    initialField?.type === "dropdown" &&
    fieldOptions.length === options.length &&
    fieldOptions.every((option, index) => option === options[index]) &&
    SHARED_ONBOARDING_STAGES.every((stage, index) => {
      const status = initialStatuses.find(
        (candidate) => candidate.key === stage.key,
      );
      return (
        status?.name === stage.name &&
        status.stage_order === index &&
        status.color === stage.color &&
        status.terminal === stage.terminal &&
        status.active
      );
    }) &&
    LEGACY_SHARED_ONBOARDING_STAGES.every(
      (stage) =>
        !initialStatuses.some(
          (status) => status.key === stage.key && status.active,
        ),
    );
  if (initialField && stageModelIsCurrent) {
    return { fieldId: initialField.id };
  }

  // The project page loads tasks, fields and statuses concurrently. Lock the
  // project only when a repair is required so routine reads stay fast.
  await db.$queryRaw`SELECT "id" FROM "Project" WHERE "id" = ${input.projectId} FOR UPDATE`;
  const existingField = await db.customFieldDefinition.findFirst(fieldLookup);

  let fieldId = existingField?.id ?? null;
  const addsSchedulingStage =
    existingField &&
    Array.isArray(existingField.options) &&
    !existingField.options.includes("Agendamento dos Onboardings");
  if (existingField) {
    await db.customFieldDefinition.update({
      where: { id: existingField.id },
      data: {
        type: "dropdown",
        options: options as Prisma.InputJsonValue,
      },
    });
  } else {
    const lastField = await db.customFieldDefinition.findFirst({
      where: { project_id: input.projectId },
      orderBy: { position: "desc" },
      select: { position: true },
    });
    const field = await db.customFieldDefinition.create({
      data: {
        project_id: input.projectId,
        name: ONBOARDING_STAGE_FIELD_NAME,
        type: "dropdown",
        options: options as Prisma.InputJsonValue,
        position: (lastField?.position ?? -1) + 1,
      },
      select: { id: true },
    });
    fieldId = field.id;
  }

  for (const legacyStage of LEGACY_SHARED_ONBOARDING_STAGES) {
    await db.$executeRaw`
      UPDATE "CustomFieldValue"
      SET "value" = to_jsonb(${legacyStage.replacement}::text),
          "updated_at" = NOW()
      WHERE "definition_id" = ${fieldId}
        AND "value" = to_jsonb(${legacyStage.name}::text)
    `;
  }

  if (addsSchedulingStage) {
    await db.$executeRaw`
      UPDATE "CustomFieldValue"
      SET "value" = to_jsonb('Agendamento dos Onboardings'::text),
          "updated_at" = NOW()
      WHERE "definition_id" = ${fieldId}
        AND "value" = to_jsonb('Onboarding de Suporte'::text)
    `;
  }

  for (const [index, stage] of SHARED_ONBOARDING_STAGES.entries()) {
    const existingStatus = await db.workflowStatus.findFirst({
      where: {
        workspace_id: input.workspaceId,
        project_id: input.projectId,
        category: "task",
        key: stage.key,
      },
      select: { id: true },
    });
    const data = {
      name: stage.name,
      stage_order: index,
      color: stage.color,
      terminal: stage.terminal,
      active: true,
    };
    if (existingStatus) {
      await db.workflowStatus.update({
        where: { id: existingStatus.id },
        data,
      });
    } else {
      await db.workflowStatus.create({
        data: {
          ...data,
          workspace_id: input.workspaceId,
          project_id: input.projectId,
          key: stage.key,
          category: "task",
        },
      });
    }
  }

  await db.workflowStatus.updateMany({
    where: {
      workspace_id: input.workspaceId,
      project_id: input.projectId,
      category: "task",
      key: {
        in: LEGACY_SHARED_ONBOARDING_STAGES.map((stage) => stage.key),
      },
    },
    data: { active: false },
  });

  return { fieldId: fieldId! };
}

type PhaseChecklistItem = {
  id: string;
  automation_key: string | null;
  department: string;
  owner_id: string | null;
  status: string;
  sort_order: number;
};

export function sharedOnboardingStageFromItems(items: PhaseChecklistItem[]) {
  const phaseItems = PHASE_PREFIXES.map((phase) => ({
    ...phase,
    items: items
      .filter((item) => item.automation_key?.startsWith(phase.prefix))
      .sort((left, right) => left.sort_order - right.sort_order),
  }));
  const currentPhase =
    phaseItems.find((phase) =>
      phase.items.some((item) => item.status !== "complete"),
    ) ?? phaseItems.at(-1)!;
  const nextItem =
    currentPhase.items.find((item) => item.status !== "complete") ?? null;
  const allConditions = phaseItems.flatMap((phase) => phase.items);
  const complete =
    allConditions.length > 0 &&
    allConditions.every((item) => item.status === "complete");

  return {
    stage: currentPhase.stage,
    nextItem,
    complete,
  };
}

/**
 * Keeps the one logical client task synchronized across every departmental
 * Onboarding board. Each board owns its field definition, while every value
 * points to the same Task row and therefore to the same canonical workflow.
 */
export async function syncSharedOnboardingTaskStage(
  db: Db,
  onboardingId: string,
) {
  const sharedItem = await db.onboardingChecklistItem.findFirst({
    where: {
      onboarding_id: onboardingId,
      automation_key: SHARED_ONBOARDING_TASK_AUTOMATION_KEY,
    },
    select: { id: true, task_id: true, completed_at: true },
  });
  if (!sharedItem?.task_id) return null;

  const onboarding = await db.clientOnboarding.findUnique({
    where: { id: onboardingId },
    select: {
      workspace_id: true,
      checklist_items: {
        where: {
          automation_key: { startsWith: "shared_onboarding:" },
        },
        select: {
          id: true,
          automation_key: true,
          department: true,
          owner_id: true,
          status: true,
          sort_order: true,
        },
      },
    },
  });
  if (!onboarding) return null;

  const phase = sharedOnboardingStageFromItems(
    onboarding.checklist_items.filter(
      (item) => item.automation_key !== SHARED_ONBOARDING_TASK_AUTOMATION_KEY,
    ),
  );
  const mirrorProjects = await db.project.findMany({
    where: {
      workspace_id: onboarding.workspace_id,
      company_id: null,
      onboarding_enabled: true,
      name: { equals: "Onboarding", mode: "insensitive" },
    },
    orderBy: [{ position: "asc" }, { created_at: "asc" }, { id: "asc" }],
    select: { id: true },
  });

  const projectIds = mirrorProjects.map((project) => project.id);
  const expectedOptions = SHARED_ONBOARDING_STAGES.map((stage) => stage.name);
  let stageFields = await db.customFieldDefinition.findMany({
    where: {
      project_id: { in: projectIds },
      name: ONBOARDING_STAGE_FIELD_NAME,
    },
    select: { id: true, project_id: true, type: true, options: true },
  });
  const validProjectIds = new Set(
    stageFields.flatMap((field) => {
      const fieldOptions = Array.isArray(field.options)
        ? field.options.filter(
            (option): option is string => typeof option === "string",
          )
        : [];
      return field.type === "dropdown" &&
        fieldOptions.length === expectedOptions.length &&
        fieldOptions.every((option, index) => option === expectedOptions[index])
        ? [field.project_id]
        : [];
    }),
  );
  const projectsNeedingRepair = mirrorProjects.filter(
    (project) => !validProjectIds.has(project.id),
  );
  for (const project of projectsNeedingRepair) {
    await ensureOnboardingProjectStageModel(db, {
      workspaceId: onboarding.workspace_id,
      projectId: project.id,
    });
  }
  if (projectsNeedingRepair.length > 0) {
    stageFields = await db.customFieldDefinition.findMany({
      where: {
        project_id: { in: projectIds },
        name: ONBOARDING_STAGE_FIELD_NAME,
      },
      select: { id: true, project_id: true, type: true, options: true },
    });
  }
  const definitionIds = stageFields.map((field) => field.id);
  await db.customFieldValue.updateMany({
    where: {
      task_id: sharedItem.task_id,
      definition_id: { in: definitionIds },
    },
    data: { value: phase.stage },
  });
  await db.customFieldValue.createMany({
    data: definitionIds.map((definitionId) => ({
      task_id: sharedItem.task_id!,
      definition_id: definitionId,
      value: phase.stage,
    })),
    skipDuplicates: true,
  });

  await Promise.all([
    db.task.update({
      where: { id: sharedItem.task_id },
      data: {
        status: phase.complete
          ? "done"
          : phase.stage === "Agendamento dos Onboardings"
            ? "todo"
            : "in_progress",
        assignee_id: phase.nextItem?.owner_id ?? null,
      },
    }),
    db.onboardingChecklistItem.update({
      where: { id: sharedItem.id },
      data: {
        department: phase.nextItem?.department ?? "Onboarding",
        owner_id: phase.nextItem?.owner_id ?? null,
        status: phase.complete ? "complete" : "in_progress",
        completed_at: phase.complete
          ? (sharedItem.completed_at ?? new Date())
          : null,
      },
    }),
  ]);

  return {
    taskId: sharedItem.task_id,
    stage: phase.stage,
    complete: phase.complete,
    nextOwnerId: phase.nextItem?.owner_id ?? null,
  };
}
