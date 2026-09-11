import assert from "node:assert/strict";
import test from "node:test";
import {
  ONBOARDING_STAGE_FIELD_NAME,
  SHARED_ONBOARDING_EXECUTION_KEYS,
  SHARED_ONBOARDING_SCHEDULING_KEYS,
  SHARED_ONBOARDING_SEQUENTIAL_ENTRY_KEY,
  SHARED_ONBOARDING_STAGES,
  isOnboardingMirrorProject,
  sharedOnboardingItemIsUnlocked,
  sharedOnboardingPhaseIndex,
  sharedOnboardingStageFromItems,
  sharedOnboardingWhatsAppGroupIsComplete,
} from "../../src/lib/onboarding-shared-flow";
import { resolveTaskBoardStatus } from "../../src/lib/task-board-status";
import {
  onboardingStageDepartmentSummary,
  sharedOnboardingStageLabel,
} from "../../src/lib/onboarding-stages";
import type {
  CustomFieldDefinition,
  WorkflowStatus,
} from "../../src/lib/types";

const condition = (key: string, status: string, sortOrder: number) => ({
  id: key,
  automation_key: key,
  department: "Comercial",
  owner_id: "owner-1",
  status,
  sort_order: sortOrder,
});

test("WhatsApp group condition requires identification and participants", () => {
  assert.equal(
    sharedOnboardingWhatsAppGroupIsComplete({
      group_created: true,
      group_name: "Vionix - WhatsApp",
      group_link: "https://chat.whatsapp.com/example",
      internal_participants: ["Pedro", "Stefan"],
      client_participants: ["Cliente"],
    }),
    true,
  );
  assert.equal(
    sharedOnboardingWhatsAppGroupIsComplete({
      group_created: true,
      group_name: "Vionix - WhatsApp",
      group_link: "https://chat.whatsapp.com/example",
      internal_participants: [],
      client_participants: ["Cliente"],
    }),
    false,
  );
});

test("shared onboarding schedules in parallel and then advances sequentially", () => {
  const schedulingSupport = condition(
    SHARED_ONBOARDING_SCHEDULING_KEYS.support,
    "pending",
    10,
  );
  const schedulingPerformance = condition(
    SHARED_ONBOARDING_SCHEDULING_KEYS.performance,
    "pending",
    20,
  );
  const schedulingCreative = condition(
    SHARED_ONBOARDING_SCHEDULING_KEYS.creative,
    "pending",
    30,
  );
  const support = condition(
    SHARED_ONBOARDING_EXECUTION_KEYS.support,
    "pending",
    100,
  );
  const performance = condition(
    SHARED_ONBOARDING_EXECUTION_KEYS.performance,
    "pending",
    200,
  );
  const creative = condition(
    SHARED_ONBOARDING_EXECUTION_KEYS.creative,
    "pending",
    300,
  );
  const all = [
    schedulingSupport,
    schedulingPerformance,
    schedulingCreative,
    support,
    performance,
    creative,
  ];

  assert.equal(
    sharedOnboardingStageFromItems(all).stage,
    "Agendamento dos Onboardings",
  );
  assert.equal(
    sharedOnboardingStageFromItems(
      all.map((item) =>
        item.automation_key.startsWith("shared_onboarding:scheduling:")
          ? { ...item, status: "complete" }
          : item,
      ),
    ).stage,
    "Onboarding de Suporte",
  );
  assert.equal(
    sharedOnboardingStageFromItems(
      all.map((item) =>
        item.automation_key.startsWith("shared_onboarding:scheduling:") ||
        item.automation_key === SHARED_ONBOARDING_EXECUTION_KEYS.support
          ? { ...item, status: "complete" }
          : item,
      ),
    ).stage,
    "Onboarding de Performance",
  );
  assert.equal(
    sharedOnboardingStageFromItems(
      all.map((item) =>
        item.automation_key !== SHARED_ONBOARDING_EXECUTION_KEYS.creative
          ? { ...item, status: "complete" }
          : item,
      ),
    ).stage,
    "Onboarding de Criação",
  );
  assert.equal(
    sharedOnboardingStageFromItems(
      all.map((item) => ({ ...item, status: "complete" })),
    ).complete,
    true,
  );
});

test("departmental Onboarding projects resolve the four-stage board", () => {
  const field: CustomFieldDefinition = {
    id: "field-1",
    project_id: "project-1",
    name: ONBOARDING_STAGE_FIELD_NAME,
    type: "dropdown",
    options: SHARED_ONBOARDING_STAGES.map((stage) => stage.name),
    position: 0,
    created_at: "2026-09-01T00:00:00.000Z",
  };
  const statuses: WorkflowStatus[] = SHARED_ONBOARDING_STAGES.map(
    (stage, index) => ({
      id: stage.key,
      workspace_id: "workspace-1",
      project_id: "project-1",
      space_id: null,
      key: stage.key,
      name: stage.name,
      category: "task",
      stage_order: index,
      color: stage.color,
      terminal: stage.terminal,
      active: true,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    }),
  );
  const board = resolveTaskBoardStatus({
    customFields: [field],
    workflowStatuses: statuses,
    projectId: "project-1",
  });

  assert.equal(board?.kind, "onboarding");
  assert.deepEqual(
    board?.options.map((option) => [option.value, option.taskStatus]),
    [
      ["Agendamento dos Onboardings", "todo"],
      ["Onboarding de Suporte", "in_progress"],
      ["Onboarding de Performance", "in_progress"],
      ["Onboarding de Criação", "done"],
    ],
  );
  assert.equal(
    isOnboardingMirrorProject({
      projectName: "Onboarding",
      onboardingEnabled: true,
      companyId: null,
    }),
    true,
  );
});

test("onboarding stages expose the requested department groups", () => {
  assert.equal(
    onboardingStageDepartmentSummary("Agendamento dos Onboardings"),
    "Suporte + Financeiro · Performance · Criação",
  );
  assert.equal(
    onboardingStageDepartmentSummary("Onboarding de Suporte"),
    "Suporte · Financeiro · Administração",
  );
  assert.equal(
    onboardingStageDepartmentSummary("Onboarding de Performance"),
    "Marketing B2B · Marketing B2C",
  );
  assert.equal(
    onboardingStageDepartmentSummary("Onboarding de Criação"),
    "Criativo e Design · Produção",
  );
  assert.equal(
    sharedOnboardingStageLabel(
      SHARED_ONBOARDING_EXECUTION_KEYS.performance,
    ),
    "Onboarding de Performance",
  );
});

test("future onboarding phases stay locked until every previous condition is complete", () => {
  const items = [
    condition(SHARED_ONBOARDING_SEQUENTIAL_ENTRY_KEY, "pending", 10),
    condition(SHARED_ONBOARDING_SCHEDULING_KEYS.performance, "pending", 20),
    condition(SHARED_ONBOARDING_SCHEDULING_KEYS.creative, "pending", 30),
    condition(SHARED_ONBOARDING_EXECUTION_KEYS.support, "pending", 100),
    condition(SHARED_ONBOARDING_EXECUTION_KEYS.performance, "pending", 200),
    condition(SHARED_ONBOARDING_EXECUTION_KEYS.creative, "pending", 300),
  ];

  assert.equal(
    sharedOnboardingItemIsUnlocked(
      items,
      SHARED_ONBOARDING_SCHEDULING_KEYS.performance,
    ),
    true,
  );
  assert.equal(
    sharedOnboardingItemIsUnlocked(
      items,
      SHARED_ONBOARDING_EXECUTION_KEYS.support,
    ),
    false,
  );
  const withSchedulesComplete = items.map((item) =>
    item.automation_key.startsWith("shared_onboarding:scheduling:")
      ? { ...item, status: "complete" }
      : item,
  );
  assert.equal(
    sharedOnboardingItemIsUnlocked(
      withSchedulesComplete,
      SHARED_ONBOARDING_EXECUTION_KEYS.support,
    ),
    true,
  );
  assert.equal(
    sharedOnboardingPhaseIndex(
      SHARED_ONBOARDING_EXECUTION_KEYS.creative,
    ),
    3,
  );
});
