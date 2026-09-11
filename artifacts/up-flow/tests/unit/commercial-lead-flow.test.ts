import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  COMMERCIAL_LEAD_STAGES,
  commercialLeadStageFromName,
} from "../../src/lib/commercial-lead-stages";
import {
  negotiatedScopeItems,
  validateCommercialLeadNegotiation,
} from "../../src/lib/commercial-lead-negotiation";
import {
  COMMERCIAL_FOLLOW_UP_STAGES,
  COMMERCIAL_FOLLOW_UP_PROJECT_NAME,
  commercialFollowUpTaskTitle,
  commercialFollowUpDueAt,
  isCommercialFollowUpProject,
  nextCommercialFollowUpStage,
  normalizeCommercialFollowUpTaskTitle,
} from "../../src/lib/commercial-follow-up";
import { isFinanceContractMirrorProject } from "../../src/lib/commercial-contract-mirror";

const ROOT = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

test("commercial lead stages preserve the requested order", () => {
  assert.deepEqual(
    COMMERCIAL_LEAD_STAGES.map((stage) => stage.name),
    [
      "Lead",
      "Agendamento da Apresentação",
      "Apresentação Realizada",
      "Qualificação",
      "Envio da Proposta",
      "Aguardando Resposta",
      "Concluído",
      "Arquivados",
    ],
  );
  assert.equal(
    commercialLeadStageFromName("Aguardando Resposta"),
    "awaiting_response",
  );
});

test("commercial cadence uses Follow Up while accepting legacy project names", () => {
  assert.equal(COMMERCIAL_FOLLOW_UP_PROJECT_NAME, "Follow Up");
  assert.equal(
    commercialFollowUpTaskTitle("Vionix"),
    "Follow Up Comercial — Vionix",
  );
  assert.equal(
    normalizeCommercialFollowUpTaskTitle("Follow-up Comercial — Vionix"),
    "Follow Up Comercial — Vionix",
  );
  assert.equal(
    isCommercialFollowUpProject({
      name: "Follow-ups",
      spaceName: "Comercial",
    }),
    true,
  );
});

test("lead creation validates required data and schedules calendar plus email delivery", () => {
  const route = read("src/app/api/commercial/leads/route.ts");
  const form = read(
    "src/components/commercial/commercial-lead-create-sheet.tsx",
  );
  assert.match(route, /brand_name: z\.string\(\)\.trim\(\)\.min\(1\)/);
  assert.match(route, /owner_email: z\.string\(\)\.trim\(\)\.email\(\)/);
  assert.match(route, /monthly_revenue: z\.coerce\.number\(\)/);
  assert.match(route, /COMMERCIAL_LEAD_REVENUE_VALUES/);
  assert.doesNotMatch(form, /commercialLead\.notes/);
  assert.match(form, /aria-hidden="true"[\s\S]*?>[\s\S]*?@[\s\S]*?<\/span>/);
  assert.match(form, /COMMERCIAL_LEAD_REVENUE_TIERS\.map/);
  assert.match(form, /hours \* 60 \+ minutes \+ 60/);
  assert.match(form, /showPicker/);
  assert.match(form, /FORM_DATE_TIME_CONTROL/);
  assert.match(form, /upflow-date-time-input/);
  assert.match(form, /formatBrazilianMobile/);
  assert.match(form, /flagcdn\.com\/w40\/br\.png/);
  assert.match(route, /isBrazilianMobile/);
  assert.match(route, /google_meet_requested: true/);
  assert.match(route, /sendCommercialLeadPresentationEmails/);
  assert.match(route, /commercialLeadStageName\(stage\)/);
});

test("lead registration can be edited without duplicating presentation events", () => {
  const route = read("src/app/api/commercial/leads/[id]/route.ts");
  const panel = read("src/components/commercial/commercial-lead-panel.tsx");

  assert.match(route, /action: z\.literal\("update_details"\)/);
  assert.match(route, /COMMERCIAL_LEAD_REVENUE_VALUES/);
  assert.match(route, /workspaceMember\.findFirst/);
  assert.match(
    route,
    /lead\.presentation_event_id\s*\? await tx\.calendarEvent\.update/,
  );
  assert.match(route, /if \(!event && startsAt && endsAt\)/);
  assert.match(route, /title: input\.brand_name/);
  assert.match(route, /assignee_id: input\.assignee_id/);
  assert.match(route, /type: "commercial_lead_updated"/);
  assert.match(panel, /commercialLead\.editRecord/);
  assert.match(panel, /action: "update_details"/);
  assert.match(panel, /COMMERCIAL_LEAD_REVENUE_TIERS\.map/);
  assert.match(panel, /hours \* 60 \+ minutes \+ 60/);
  assert.match(panel, /upflow-date-time-input/);
  assert.match(panel, /presentationHistoryLocked/);
  assert.match(panel, /form=\{editFormId\}/);
  assert.match(panel, /focus-within:border-blue-400\/35/);
  assert.match(panel, /icon=\{<Building2/);
  assert.match(panel, /appearance-none[^"]*pl-3 pr-12/);
  assert.match(panel, /className="pointer-events-none absolute right-3/);
  assert.match(panel, /border border-blue-300\/20 bg-blue-400\/\[0\.025\]/);
  assert.match(panel, /caret-blue-300/);
  assert.match(panel, /<LeadCurrencyInput/);
  assert.match(panel, /formatBrazilianCurrencyInteger/);
  assert.match(panel, /brazilianCurrencyDigits/);
  assert.match(panel, /LEAD_ACTION_SECONDARY/);
  assert.doesNotMatch(
    panel,
    /<form[^>]*rounded-xl border border-blue-400\/20 bg-blue-400\/\[0\.04\] p-4/,
  );
  const taskPanel = read("src/components/projects/task-detail-sheet.tsx");
  assert.match(
    taskPanel,
    /<CommercialLeadPanel[\s\S]*loadTaskDetails\(\);[\s\S]*onChanged\?\.\(\);/,
  );
  assert.match(taskPanel, /const isCommercialWorkflowTask = Boolean\(/);
  assert.match(taskPanel, /data-testid=[\s\S]*commercial-task-activity/);
  assert.match(
    taskPanel,
    /isCommercialWorkflowTask \? \([\s\S]*renderActivitySection\(\)[\s\S]*: \([\s\S]*role="tablist"/,
  );
});

test("scheduled presentations expose and retry Google Meet synchronization inside the task", () => {
  const taskRoute = read("src/app/api/tasks/[id]/route.ts");
  const leadRoute = read("src/app/api/commercial/leads/[id]/route.ts");
  const panel = read("src/components/commercial/commercial-lead-panel.tsx");
  const types = read("src/lib/types.ts");

  assert.match(taskRoute, /presentation_event:[\s\S]*meeting_url: true/);
  assert.match(
    taskRoute,
    /google_calendar_links:[\s\S]*google_event_url: true/,
  );
  assert.match(
    taskRoute,
    /google_calendar_sync_jobs:[\s\S]*operation: "upsert"/,
  );
  assert.match(taskRoute, /getGoogleCalendarConnectionStatus/);
  assert.match(taskRoute, /presentation_integration:/);
  assert.match(leadRoute, /action: z\.literal\("retry_presentation_sync"\)/);
  assert.match(
    leadRoute,
    /queueGoogleCalendarEventSync\(event\.id, \{ force: true \}\)/,
  );
  assert.match(leadRoute, /processGoogleCalendarSyncJob\(jobId\)/);
  assert.match(panel, /data-testid="commercial-lead-google-meet"/);
  assert.match(panel, /commercialLead\.joinGoogleMeet/);
  assert.match(panel, /commercialLead\.copyMeetingLink/);
  assert.match(panel, /commercialLead\.openGoogleCalendar/);
  assert.match(panel, /commercialLead\.retryMeetingSync/);
  assert.match(panel, /sm:flex-row/);
  assert.match(types, /presentation_integration:/);
});

test("presentation confirmation automation also runs while localhost is open without duplicating cron alerts", () => {
  const pulse = read("src/app/api/commercial/automations/pulse/route.ts");
  const automation = read("src/lib/commercial-lead-automation.ts");
  const header = read("src/components/layout/header.tsx");

  assert.match(pulse, /requireAuth/);
  assert.match(pulse, /requireCurrentWorkspace/);
  assert.match(pulse, /runCommercialLeadAutomations/);
  assert.match(pulse, /Cache-Control/);
  assert.match(header, /COMMERCIAL_AUTOMATION_PULSE_INTERVAL_MS/);
  assert.match(header, /\/api\/commercial\/automations\/pulse/);
  assert.match(header, /visibilitychange/);
  assert.match(
    header,
    /commercial_lead_presentation_confirmation[\s\S]*Confirme se a apresentação/,
  );
  assert.match(
    automation,
    /commercialLead\.updateMany\([\s\S]*presentation_confirmation_requested_at: null/,
  );
  assert.match(automation, /if \(claimed\.count === 0\) continue/);
  assert.match(automation, /presentationConfirmations \+= 1/);
});

test("proposal confirmation creates one linked Follow Up task with a controlled cadence", () => {
  const proposal = read("src/app/api/commercial/leads/[id]/proposal/route.ts");
  const leadActions = read("src/app/api/commercial/leads/[id]/route.ts");
  const customFields = read("src/app/api/tasks/[id]/custom-fields/route.ts");
  const automation = read("src/lib/commercial-lead-automation.ts");
  const panel = read("src/components/commercial/commercial-lead-panel.tsx");
  assert.match(
    leadActions,
    /action: z\.literal\("save_negotiation_checklist"\)/,
  );
  assert.match(leadActions, /group_up_plan: z\.enum\(GROUP_UP_PLAN_VALUES\)/);
  assert.match(leadActions, /up_zero_plan: z\.enum\(UP_ZERO_PLAN_VALUES\)/);
  assert.match(leadActions, /stage: "qualification"/);
  assert.match(leadActions, /stage: "proposal_sending"/);
  assert.doesNotMatch(leadActions, /Checklist de Envio da Proposta/);
  assert.match(leadActions, /taskId: lead\.task_id/);
  const cadence = read("src/lib/commercial-follow-up.ts");
  const tasksRoute = read("src/app/api/tasks/route.ts");
  assert.match(proposal, /createCommercialFollowUpTask/);
  assert.match(proposal, /removeCommercialFollowUpTask/);
  assert.match(proposal, /stage: "awaiting_response"/);
  assert.match(proposal, /async function PATCH_handler/);
  assert.match(proposal, /commercial_lead_proposal_confirmed/);
  assert.match(proposal, /async function GET_handler/);
  assert.match(proposal, /createSignedUrl/);
  assert.match(proposal, /async function DELETE_handler/);
  assert.match(proposal, /proposal_storage_path: null/);
  assert.match(proposal, /followUpTaskId: lead\.follow_up_task_id/);
  assert.match(proposal, /stage: "proposal_sending"/);
  assert.match(panel, /proposalReviewCheck/);
  assert.match(panel, /proposalConfirmFile/);
  assert.match(panel, /proposalReplace/);
  assert.match(panel, /proposalRemove/);
  assert.match(panel, /proposalOpen/);
  assert.match(
    customFields,
    /etapas do fluxo Comercial avançam automaticamente/,
  );
  assert.match(leadActions, /action: z\.literal\("confirm_closed"\)/);
  assert.match(leadActions, /stage: "completed"/);
  assert.match(automation, /follow_up_notification_sent_at: null/);
  assert.match(automation, /commercial_lead_follow_up_due/);
  assert.match(cadence, /parent_id: input\.parentTaskId/);
  assert.match(cadence, /COMMERCIAL_FOLLOW_UP_PROJECT_NAME = "Follow Up"/);
  assert.match(cadence, /const candidates = await db\.project\.findMany/);
  assert.match(cadence, /left\._count\.tasks \* 100/);
  assert.match(cadence, /left\._count\.workflow_statuses \* 10/);
  assert.match(cadence, /Follow Up Comercial/);
  assert.match(cadence, /follow_up_task_id: task\.id/);
  const taskDelete = read("src/lib/task-delete.ts");
  assert.match(taskDelete, /commercialLead\.findMany/);
  assert.match(taskDelete, /follow_up_task_id: \{ not: null \}/);
  assert.match(cadence, /Primeiro Contato · D\+3/);
  assert.match(cadence, /Segundo Contato · D\+7/);
  assert.match(cadence, /Terceiro Contato · D\+14/);
  assert.match(cadence, /name: "Desistência"/);
  assert.match(leadActions, /action: z\.literal\("record_follow_up"\)/);
  assert.match(panel, /commercialLead\.recordFollowUp/);
  assert.match(panel, /followUpHref/);
  assert.match(
    panel,
    /lead\.stage === "awaiting_response" &&[\s\S]*?\(isFollowUpTask \|\| followUpHref\)/,
  );
  assert.match(panel, /href=\{followUpHref!\}/);
  assert.match(panel, /\?task=\$\{lead\.follow_up_task_id\}/);
  const taskDetailsRoute = read("src/app/api/tasks/[id]/route.ts");
  assert.match(
    taskDetailsRoute,
    /follow_up_task: \{ select: \{ id: true, project_id: true, created_at: true \} \}/,
  );
  assert.match(taskDetailsRoute, /commercial_lead_follow_up_recorded/);
  assert.match(taskDetailsRoute, /follow_up_checkpoints: followUpCheckpoints/);
  assert.match(leadActions, /tx\.activityEvent\.create/);
  assert.match(panel, /FOLLOW_UP_CHECKPOINTS/);
  assert.match(panel, /followUpVerificationCheck/);
  assert.match(panel, /followUpCheckpointCompleted/);
  assert.match(panel, /disabled=\{busy \|\| !followUpVerified\}/);
  assert.match(tasksRoute, /isCommercialSystemFlowProject/);
  assert.match(
    tasksRoute,
    /Novas tarefas devem ser iniciadas no projeto Leads/,
  );
  assert.match(automation, /presentation_confirmation_requested_at/);
  assert.match(automation, /lead\.task\.followers/);
});

test("a mistakenly closed Lead can be reopened without losing proposal history", () => {
  const route = read("src/app/api/commercial/leads/[id]/route.ts");
  const followUp = read("src/lib/commercial-follow-up.ts");
  const stageFlow = read("src/lib/commercial-lead-flow.server.ts");
  const panel = read("src/components/commercial/commercial-lead-panel.tsx");

  assert.match(route, /action: z\.literal\("reopen_after_close"\)/);
  assert.match(route, /if \(lead\.stage !== "completed"\)/);
  assert.match(route, /proposal_storage_path/);
  assert.match(route, /reopenCommercialFollowUp/);
  assert.match(route, /createCommercialFollowUpTask/);
  assert.match(route, /stage: "awaiting_response"/);
  assert.match(route, /type: "commercial_lead_reopened"/);
  assert.match(route, /proposal_preserved: true/);
  assert.match(followUp, /export async function reopenCommercialFollowUp/);
  assert.match(followUp, /commercialFollowUpStageName\("awaiting_decision"\)/);
  assert.match(
    stageFlow,
    /closed_at: input\.stage === "completed" \? new Date\(\) : null/,
  );
  assert.match(panel, /commercialLead\.reopenConfirm/);
  assert.match(panel, /action: "reopen_after_close"/);
  assert.match(panel, /lead\.stage === "completed"/);
  assert.match(panel, /commercialLead\.reopen/);
});

test("closing a Lead creates one contract handoff and confirmation creates one Finance child", () => {
  const schema = read("prisma/schema.prisma");
  const route = read("src/app/api/commercial/leads/[id]/route.ts");
  const workflow = read("src/lib/commercial-contract-handoff.ts");
  const panel = read("src/components/commercial/commercial-lead-panel.tsx");
  const taskRoute = read("src/app/api/tasks/[id]/route.ts");
  const customFieldRoute = read(
    "src/app/api/tasks/[id]/custom-fields/route.ts",
  );
  const taskListRoute = read("src/app/api/tasks/route.ts");
  const taskDelete = read("src/lib/task-delete.ts");

  assert.match(schema, /contract_handoff_task_id\s+String\?\s+@unique/);
  assert.match(schema, /finance_contract_task_id\s+String\?\s+@unique/);
  assert.match(route, /createCommercialContractHandoffTask/);
  assert.match(route, /action: z\.literal\("confirm_contract_handoff"\)/);
  assert.match(route, /confirmCommercialContractHandoff/);
  assert.match(route, /removeCommercialContractWorkflow/);
  assert.match(workflow, /route: "commercial"/);
  assert.match(workflow, /parent_id: input\.lead\.task_id/);
  assert.match(
    workflow,
    /const financeProject = await resolveFinanceContractMirrorProject/,
  );
  assert.match(workflow, /parent_id: input\.lead\.contract_handoff_task_id/);
  assert.match(workflow, /finance_contract_task_id: financeTask\.id/);
  assert.match(panel, /commercialLead\.contractHandoffFormTitle/);
  assert.match(panel, /formatBrazilianCnpj/);
  assert.match(panel, /COMMERCIAL_CONTRACT_SERVICES\.map/);
  assert.match(panel, /commercialLead\.confirmContractAndFinance/);
  assert.match(panel, /commercialLead\.contractFinanceLocked/);
  assert.match(panel, /const canOperateContractStages = Boolean/);
  assert.match(
    panel,
    /lead\.can_advance_contract &&[\s\S]*isContractHandoffTask \|\| isFinanceContractTask/,
  );
  assert.match(
    panel,
    /canOperateContractStages && lead\.contract_confirmed_at/,
  );
  assert.match(panel, /isContractHandoffTask && !canOperateContractStages/);
  assert.match(panel, /md:grid-cols-2 xl:grid-cols-3/);
  assert.match(route, /canAdvanceCommercialContract/);
  assert.match(route, /isUpFlowAdmin: isSuperAdmin\(auth\)/);
  assert.doesNotMatch(route, /isWorkspaceAdminFor/);
  assert.match(
    route,
    /Somente a equipe Financeira ou um Administrador do UP Flow pode avançar este contrato/,
  );
  assert.match(
    route,
    /Esta solicitação já foi enviada\. Somente o Financeiro ou um Administrador do UP Flow pode continuar/,
  );
  assert.match(taskRoute, /commercial_contract_handoff/);
  assert.match(taskRoute, /commercial_finance_contract/);
  assert.match(taskRoute, /can_advance_contract: canAdvanceContract/);
  assert.match(taskRoute, /isUpFlowAdmin: isSuperAdmin\(auth\)/);
  assert.match(
    taskRoute,
    /oldTask\.commercial_contract_handoff \|\|\s*oldTask\.commercial_finance_contract/,
  );
  assert.match(
    customFieldRoute,
    /task\.commercial_contract_handoff \|\| task\.commercial_finance_contract/,
  );
  assert.match(workflow, /resolveFinanceContractMirrorProject/);
  assert.doesNotMatch(
    workflow,
    /const financeProjectId = await resolveOnboardingTaskProjectId[\s\S]*?route: "finance"/,
  );
  assert.match(workflow, /project_id: financeProject\.id/);
  assert.match(taskListRoute, /isFinanceContractMirrorProject/);
  assert.match(
    taskListRoute,
    /where\.commercial_contract_handoff = \{ isNot: null \}/,
  );
  assert.match(taskListRoute, /repairMissingCommercialFinanceContractTasks/);
  assert.match(taskListRoute, /commercialContractStageFromLead/);
  assert.match(
    taskRoute,
    /fluxo automático e não pode ser apagada manualmente/,
  );
  assert.match(
    taskListRoute,
    /projeto espelha as solicitações de Contratos e Handoffs do Comercial/,
  );
  assert.match(workflow, /data: \{ status: "in_progress" \}/);
  assert.match(taskDelete, /where: \{ parent_id: \{ in: frontier \} \}/);
  assert.equal(
    isFinanceContractMirrorProject({
      projectName: "Contracts & Handoffs",
      spaceName: "Finance",
    }),
    true,
  );
  assert.equal(
    isFinanceContractMirrorProject({
      projectName: "Contratos e Handoffs",
      spaceName: "Financeiro",
    }),
    true,
  );
  assert.equal(
    isFinanceContractMirrorProject({
      projectName: "Contracts & Handoffs",
      spaceName: "Comercial",
    }),
    false,
  );
});

test("follow-up cadence balances three contacts across fourteen days", () => {
  assert.deepEqual(
    COMMERCIAL_FOLLOW_UP_STAGES.map((stage) => stage.name),
    [
      "Primeiro Contato · D+3",
      "Segundo Contato · D+7",
      "Terceiro Contato · D+14",
      "Aguardando Decisão",
      "Concluído",
      "Desistência",
    ],
  );
  assert.equal(nextCommercialFollowUpStage("first_contact"), "second_contact");
  assert.equal(nextCommercialFollowUpStage("second_contact"), "final_contact");
  assert.equal(
    nextCommercialFollowUpStage("final_contact"),
    "awaiting_decision",
  );
  const confirmedAt = new Date("2026-08-24T12:00:00.000Z");
  assert.equal(
    commercialFollowUpDueAt(confirmedAt, "first_contact")?.toISOString(),
    "2026-08-27T12:00:00.000Z",
  );
  assert.equal(
    commercialFollowUpDueAt(confirmedAt, "second_contact")?.toISOString(),
    "2026-08-31T12:00:00.000Z",
  );
  assert.equal(
    commercialFollowUpDueAt(confirmedAt, "final_contact")?.toISOString(),
    "2026-09-07T12:00:00.000Z",
  );
});

test("lead meetings include followers and kanban stages reject manual dragging", () => {
  const route = read("src/app/api/commercial/leads/[id]/route.ts");
  const followers = read("src/app/api/tasks/[id]/followers/route.ts");
  const board = read("src/components/projects/kanban-board.tsx");
  const detail = read("src/components/projects/task-detail-sheet.tsx");
  const list = read("src/components/projects/list-view.tsx");

  assert.match(route, /teamUserIds/);
  assert.match(route, /recipients:[\s\S]*lead\.task\.followers/);
  assert.match(followers, /calendarEventAttendee\.upsert/);
  assert.match(followers, /follower-presentation-email/);
  assert.match(board, /task\.automaticMovementOnly/);
  assert.doesNotMatch(board, /reorder-tasks/);
  assert.match(detail, /disabled[\s\S]*task\.automaticMovementOnly/);
  assert.match(list, /disabled[\s\S]*task\.automaticMovementOnly/);
});

test("qualification gates negotiation and archives Leads without creating duplicate tasks", () => {
  const route = read("src/app/api/commercial/leads/[id]/route.ts");
  const panel = read("src/components/commercial/commercial-lead-panel.tsx");
  const negotiationMigration = read(
    "prisma/migrations/20260821170000_add_commercial_lead_negotiation_checklist/migration.sql",
  );
  const qualificationMigration = read(
    "prisma/migrations/20260904120000_add_commercial_lead_qualification/migration.sql",
  );
  const workflowRoute = read("src/app/api/workflow-statuses/route.ts");

  assert.match(route, /action: z\.literal\("qualify_lead"\)/);
  assert.match(route, /action: z\.literal\("archive_lead"\)/);
  assert.match(
    route,
    /lead\.stage !== "qualification"[\s\S]*!lead\.qualified_at/,
  );
  assert.match(route, /removeCommercialFollowUpTask/);
  assert.match(route, /commercial_lead_negotiation_checklist/);
  assert.match(route, /negotiation_checklist_completed_at: new Date\(\)/);
  assert.doesNotMatch(route, /tx\.task\.create\(/);
  assert.match(panel, /commercialLead\.qualificationTitle/);
  assert.match(panel, /archiveLead\("not_qualified"\)/);
  assert.match(panel, /archiveLead\("not_closed"\)/);
  assert.match(panel, /commercialLead\.negotiationChecklist/);
  assert.match(panel, /id=\{negotiationFormId\}[\s\S]*noValidate/);
  assert.match(panel, /GROUP_UP_PLAN_VALUES\.map/);
  assert.match(panel, /UP_ZERO_PLAN_VALUES\.map/);
  assert.match(panel, /sm:grid-cols-2/);
  assert.match(negotiationMigration, /"group_up_plan" TEXT/);
  assert.match(negotiationMigration, /"up_zero_monthly_fee" DECIMAL\(14, 2\)/);
  assert.match(qualificationMigration, /"qualified_at" TIMESTAMP\(3\)/);
  assert.match(qualificationMigration, /"archive_reason" TEXT/);
  assert.match(workflowRoute, /ensureCommercialLeadProjectModel/);
});

test("lead details and completed negotiation use one unified editor", () => {
  const route = read("src/app/api/commercial/leads/[id]/route.ts");
  const panel = read("src/components/commercial/commercial-lead-panel.tsx");

  assert.match(
    route,
    /action: z\.literal\("update_details"\)[\s\S]*?negotiation: z/,
  );
  assert.match(route, /negotiation_updated: Boolean\(negotiation\?\.ok\)/);
  assert.match(route, /await prisma\.\$transaction/);
  assert.match(panel, /form=\{editFormId\}/);
  assert.match(
    panel,
    /lead\.negotiation_checklist_completed_at[\s\S]*?<NegotiationEditFields/,
  );
  assert.match(panel, /negotiation: includesNegotiation/);
  assert.doesNotMatch(panel, /setEditingNegotiation/);
  assert.doesNotMatch(panel, /commercialLead\.editNegotiation/);
  assert.match(panel, /sm:grid-cols-2/);
});

test("negotiation requires a positive monthly fee for each selected plan", () => {
  assert.deepEqual(
    validateCommercialLeadNegotiation({
      groupUpPlan: "starter",
      groupUpMonthlyFee: null,
      upZeroPlan: "none",
      upZeroMonthlyFee: 500,
      upZeroImplementationFee: null,
      negotiatedScope: negotiatedScopeItems("starter", "none").map(
        (item) => item.key,
      ),
    }),
    { ok: false, field: "group_up_monthly_fee" },
  );
  assert.deepEqual(
    validateCommercialLeadNegotiation({
      groupUpPlan: "growth",
      groupUpMonthlyFee: 3500,
      upZeroPlan: "elite",
      upZeroMonthlyFee: 1800,
      upZeroImplementationFee: 750,
      negotiatedScope: negotiatedScopeItems("growth", "elite").map(
        (item) => item.key,
      ),
    }),
    {
      ok: true,
      data: {
        groupUpPlan: "growth",
        groupUpMonthlyFee: 3500,
        upZeroPlan: "elite",
        upZeroMonthlyFee: 1800,
        upZeroImplementationFee: 750,
        negotiatedScope: negotiatedScopeItems("growth", "elite").map(
          (item) => item.key,
        ),
      },
    },
  );
  assert.deepEqual(
    validateCommercialLeadNegotiation({
      groupUpPlan: "none",
      groupUpMonthlyFee: 500,
      upZeroPlan: "none",
      upZeroMonthlyFee: 500,
      upZeroImplementationFee: 500,
      negotiatedScope: [],
    }),
    {
      ok: true,
      data: {
        groupUpPlan: "none",
        groupUpMonthlyFee: null,
        upZeroPlan: "none",
        upZeroMonthlyFee: null,
        upZeroImplementationFee: null,
        negotiatedScope: [],
      },
    },
  );
});

test("lead proposal storage remains private and server scoped", () => {
  const migration = read(
    "prisma/migrations/20260820170808_commercial_lead_flow/migration.sql",
  );
  const proposal = read("src/app/api/commercial/leads/[id]/proposal/route.ts");
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE "CommercialLead" FROM anon, authenticated/,
  );
  assert.match(proposal, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(proposal, /upsert: false/);
});
