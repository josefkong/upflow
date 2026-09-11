import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { getOnboardingTaskAction, workflowFormKind } from "../../src/lib/onboarding-task-routing";
import type { Task } from "../../src/lib/types";

const ROOT = join(__dirname, "..", "..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("Marketing B2B onboarding uses routed department form tasks", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260702120000_marketing_b2b_onboarding_forms/migration.sql");
  const helper = read("src/lib/onboarding.ts");
  const routing = read("src/lib/onboarding-routing.ts");
  const route = read("src/app/api/onboarding/marketing-b2b-form/[taskId]/route.ts");
  const form = read("src/components/onboarding/marketing-b2b-onboarding-form.tsx");
  const panel = read("src/components/onboarding/client-onboarding-panel.tsx");
  const taskListRoute = read("src/app/api/tasks/route.ts");
  const taskDetailRoute = read("src/app/api/tasks/[id]/route.ts");
  const kanbanBoard = read("src/components/projects/kanban-board.tsx");
  const projectPage = read("src/app/(dashboard)/projects/[id]/page.tsx");
  const translations = read("src/lib/i18n/translations.ts");
  const scheduleDialog = read("src/components/dashboard/schedule-meeting-dialog.tsx");
  const layout = read("src/app/layout.tsx");
  const theme = read("src/app/theme.css");
  const contextualLookup = route.slice(
    route.indexOf("async function loadExistingB2BFormForContext"),
    route.indexOf("async function bindExistingB2BFormToTask"),
  );

  assert.match(schema, /model MarketingB2BOnboardingForm/);
  assert.match(schema, /marketing_b2b_onboarding_form\s+MarketingB2BOnboardingForm\?/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "MarketingB2BOnboardingForm"/);
  assert.match(migration, /UNIQUE INDEX IF NOT EXISTS "MarketingB2BOnboardingForm_task_id_key"/);

  assert.match(helper, /MARKETING_B2B_FORM_SERVICES/);
  assert.match(helper, /MARKETING_B2B_FORM_SERVICES[\s\S]*"Vesti"/);
  assert.match(helper, /isMarketingB2BFormService[\s\S]*key === "vesti"/);
  assert.match(routing, /routeForService[\s\S]*key\.includes\("vesti"\)/);
  assert.match(helper, /isMarketingB2BFormService/);
  assert.match(helper, /resolveMarketingB2BOnboardingProjectId/);
  assert.match(helper, /name: "Onboarding"/);
  assert.match(helper, /Marketing B2B Onboarding/);
  assert.match(helper, /folder_id: clientFolder\.id/);
  assert.match(helper, /b2bFormServices/);
  assert.match(helper, /marketingB2BOnboardingForm\.create/);
  assert.match(helper, /function shouldCreateDedicatedServiceTask\(service: string\)[\s\S]*serviceWorkflowFor\(service\) !== null/);
  assert.match(helper, /const formServiceAlreadyAssigned\s*=\s*b2bFormServiceKeys\.has\(serviceMapKey\)\s*\|\|\s*b2cFormServiceKeys\.has\(serviceMapKey\)/);
  assert.match(helper, /const dedicatedServiceTask = shouldCreateDedicatedServiceTask\(service\)/);
  assert.match(helper, /formServiceAlreadyAssigned && !dedicatedServiceTask/);
  assert.match(helper, /const existingAssignment =[\s\S]*b2bAssignments\.find[\s\S]*b2cAssignments\.find/);
  assert.match(helper, /if \(!existingAssignment\) \{[\s\S]*onboardingServiceAssignment\.create/);
  assert.match(helper, /VESTI_ONBOARDING_WORKFLOW[\s\S]*Criar e validar o UP Dash/);
  assert.match(helper, /VESTI_ONBOARDING_WORKFLOW[\s\S]*CAMPAIGN_STARTED_TASK_TITLE/);
  assert.match(helper, /VESTI_CAMPAIGN_STARTED_AUTOMATION_KEY\s*=\s*"marketing_b2b_vesti_campaign_start"/);
  assert.match(helper, /UP_ZERO_ONBOARDING_WORKFLOW[\s\S]*Treinar o cliente no uso do UP Dash/);
  assert.match(helper, /UP_ZERO_ONBOARDING_WORKFLOW[\s\S]*CAMPAIGN_STARTED_TASK_TITLE/);
  assert.match(helper, /UP_ZERO_CAMPAIGN_STARTED_AUTOMATION_KEY\s*=\s*"marketing_b2b_up_zero_campaign_start"/);
  assert.match(helper, /marketingB2BOnly: true/);
  assert.match(helper, /automation_key: step\.automationKey \?\? null/);
  assert.match(helper, /https:\/\/www\.canva\.com\/folder\/FAHOKHrZriY/);
  assert.match(helper, /for \(const \[stepIndex, step\] of dedicatedWorkflow\.steps\.entries\(\)\)/);
  assert.match(helper, /department: step\.meeting\s*\? "Service Onboarding"/);
  assert.match(helper, /checklist_item_id: workflowItem\.id/);
  assert.match(helper, /syncDedicatedServiceWorkflows/);
  assert.match(helper, /project_id: projectId, company_id: input\.company\.id/);
  assert.match(helper, /export async function syncClientOnboardingServices/);
  assert.match(
    helper,
    /const b2bMeetingTask = await createTask\(\{[\s\S]*?project_id: b2bProjectId,[\s\S]*?title: "Onboarding: schedule Marketing B2B kickoff meeting"/,
  );

  assert.match(route, /values: valuesRef|values: nextValues|marketingB2BOnboardingForm\.update/);
  assert.match(route, /isMissingClientAddressTableError/);
  assert.match(route, /loadCompanyAddresses/);
  assert.match(route, /canSyncAddresses/);
  assert.match(route, /code === "P2021"[\s\S]*ClientAddress/);
  assert.match(route, /ensureBackfilledB2BForm/);
  assert.match(route, /isBackfillableMarketingB2BTaskText/);
  assert.match(route, /loadExistingB2BFormForContext/);
  assert.match(route, /bindExistingB2BFormToTask/);
  assert.match(route, /task_id: input\.taskId/);
  assert.match(route, /checklist_item_id: input\.checklistItemId/);
  assert.match(route, /where: \{ onboarding_id: onboarding\.id \}/);
  assert.match(route, /task_id: task\.id/);
  assert.doesNotMatch(route, /onboarding:\s*\{\s*status/);
  assert.doesNotMatch(contextualLookup, /workspace_id/);
  assert.doesNotMatch(contextualLookup, /company_id/);
  assert.match(route, /onboarding marketing b2b/);
  assert.match(route, /marketing b2b onboarding/);
  assert.match(route, /clientOnboarding\.findFirst/);
  assert.match(route, /clientOnboarding\.create/);
  assert.match(route, /task\?\.company_id \?\? task\?\.project\.company_id/);
  assert.match(route, /onboardingChecklistItem\.findFirst/);
  assert.match(route, /marketingB2BOnboardingForm\.create/);
  assert.match(route, /finalize/);
  assert.match(route, /status: "in_progress"/);
  assert.match(route, /task\.update[\s\S]*status: "done"/);
  assert.match(route, /onboardingChecklistItem\.update[\s\S]*status: "complete"/);
  assert.match(route, /recomputeOnboardingProgress/);
  assert.match(route, /withErrorReporting\("api:onboarding\/marketing-b2b-form:PATCH"/);
  assert.match(route, /canContributeToProject\(auth, form\.task\.project\)/);
  assert.match(route, /syncClientOnboardingServices/);
  assert.match(route, /workflow_sync/);
  const getHandler = route.slice(route.indexOf("async function GET_handler"), route.indexOf("async function POST_handler"));
  const postHandler = route.slice(route.indexOf("async function POST_handler"), route.indexOf("async function PATCH_handler"));
  assert.doesNotMatch(getHandler, /syncClientOnboardingServices/);
  assert.match(postHandler, /syncClientOnboardingServices/);
  assert.match(route, /withErrorReporting\("api:onboarding\/marketing-b2b-form:POST"/);

  assert.match(form, /updateField/);
  assert.match(form, /valuesRef\.current/);
  assert.match(form, /const finalize = async/);
  assert.match(form, /textValue\(values, "brand\.name"\)/);
  assert.match(form, /\["metaAds", "marketingB2B\.access\.metaAds"\]/);
  assert.match(form, /embedded = false/);
  assert.match(form, /loadError/);
  assert.match(form, /useLanguage/);
  assert.match(form, /const b2bFormLabelKeys/);
  assert.match(form, /t\("common\.retry"\)/);
  assert.doesNotMatch(form, /if \(!form\) return null/);
  assert.match(form, /fetch\(`\/api\/onboarding\/marketing-b2b-form\/\$\{taskId\}`,[\s\S]*method: "POST"/);
  assert.match(form, /Checklist repair must never prevent the form itself from opening/);
  assert.match(form, /marketing-b2b-form-shell/);
  assert.match(form, /marketing-b2b-form-card/);
  assert.match(form, /const updateField = \(field: string, value: string\)[\s\S]*setForm\(\(current\) => \(current \? \{ \.\.\.current, values: nextValues \} : current\)\)/);
  assert.match(form, /enterEditMode\(sectionForField\(field\)\)/);
  assert.match(form, /disabled=\{!canEdit\}/);
  assert.doesNotMatch(form, /disabled=\{!canEdit \|\| !editing\}/);
  assert.match(form, /value=\{draft\}/);
  assert.match(form, /const selectId = useId\(\)/);
  assert.match(form, /aria-labelledby=\{labelId\}/);
  assert.match(form, /labelKey: "marketingB2B\.documentRule\.clothingCnae\.label"/);
  assert.match(form, /labelKey: "marketingB2B\.documentRule\.allCnpjs\.label"/);
  assert.match(form, /labelKey: "marketingB2B\.documentRule\.cnpjOrCpf\.label"/);
  assert.match(form, /\["finance", "marketingB2B\.responsible\.finance"\]/);
  assert.match(form, /\["marketing", "marketingB2B\.responsible\.marketing"\]/);
  assert.match(form, /\["manager", "marketingB2B\.responsible\.manager"\]/);
  assert.match(form, /\["crm", "marketingB2B\.responsible\.crm"\]/);
  assert.match(translations, /"marketingB2B\.responsible\.crm": "CRM"/);
  assert.match(form, /\["performance", "marketingB2B\.service\.performance"\]/);
  assert.match(form, /\["upMotion", "marketingB2B\.service\.upMotion"\]/);
  assert.match(form, /\["upZero", "marketingB2B\.service\.upZero"\]/);
  assert.match(form, /\["socialMedia", "marketingB2B\.service\.socialMedia"\]/);
  assert.match(form, /const accessStatusOptions = \[[\s\S]*marketingB2B\.option\.granted[\s\S]*marketingB2B\.option\.notApplicable/);
  assert.match(form, /<Plus className="h-4 w-4" \/>\s*\{t\("marketingB2B\.addAddress"\)\}/);
  assert.match(form, /<Plus className="h-4 w-4" \/>\s*\{t\("marketingB2B\.addCompetitor"\)\}/);
  assert.match(form, /md:grid-cols-\[1fr_1fr_1fr_auto\]/);
  assert.doesNotMatch(form, /label=.*Proposta de valor/);
  assert.doesNotMatch(form, /label=.*Perfil lojista/);
  assert.match(form, /xl:sticky xl:top-5/);
  assert.match(form, /data-testid="b2b-progress-sidebar"/);
  assert.match(form, /xl:max-h-\[calc\(100dvh-2\.5rem\)\]/);
  assert.match(projectPage, /overflow-x-clip/);
  assert.match(form, /onAddTask=\{onAddTask \?\? \(\(\) => setActiveTab\("kanban"\)\)\}/);
  assert.match(form, /label=\{t\(b2bFormLabelKeys\.generalNotes\)\}[\s\S]*optional[\s\S]*helper=\{t\("marketingB2B\.optionalHelper"\)\}/);
  assert.match(form, /label=\{t\(b2bFormLabelKeys\.commercialNotes\)\}[\s\S]*optional[\s\S]*helper=\{t\("marketingB2B\.optionalHelper"\)\}/);
  assert.match(form, /editing \? t\(b2bFormLabelKeys\.saveSection\) : t\(b2bFormLabelKeys\.editSection\)/);
  assert.match(scheduleDialog, /type="date"[\s\S]*value=\{date\}[\s\S]*onChange=/);
  assert.match(layout, /upflow-performance/);
  assert.match(theme, /Performance skin/);
  assert.match(theme, /content-visibility: auto/);
  assert.match(theme, /backdrop-filter: none/);
  assert.match(panel, /marketing_b2b_form/);
  assert.match(panel, /marketingB2BForm\.centralHint/);
  assert.match(panel, /marketingB2BSummary/);
  assert.match(panel, /formTaskId = form\.task_id/);
  assert.match(panel, /formProjectId = form\.task\?\.project_id/);
  assert.match(panel, /marketingB2BForm\.summaryTitle/);
  assert.match(panel, /\?view=form&/);

  assert.match(taskListRoute, /marketing_b2b_onboarding_form/);
  assert.match(taskDetailRoute, /marketing_b2b_onboarding_form/);
  assert.match(kanbanBoard, /MarketingB2BOnboardingForm/);
  assert.match(kanbanBoard, /onOpenTask/);
  assert.match(projectPage, /MarketingB2BOnboardingForm/);
  assert.doesNotMatch(projectPage, /ClientOnboardingPanel/);
  assert.match(projectPage, /viewParam === "list"/);
  assert.match(projectPage, /viewParam === "kanban" \|\| viewParam === "board"/);
  assert.match(projectPage, /\?view=list/);
  assert.match(projectPage, /t\("toolbar\.board"\)/);
  assert.match(projectPage, /t\("toolbar\.list"\)/);
  assert.match(projectPage, /\?view=form&task=/);
  assert.match(projectPage, /embedded[\s\S]*onClose=\{\(\) =>\s*router\.replace\(`[\s\S]*\?view=kanban/);
  assert.match(projectPage, /onAddTask=\{\(\) =>\s*canCreateTasks && setCreateOpen\(\{ status: "todo" \}\)\s*\}/);

  assert.match(translations, /marketingB2BForm\.field\.brandName/);
  assert.match(translations, /marketingB2BForm\.field\.metaAdsAccess/);
  assert.match(translations, /marketingB2BForm\.finalizeAction/);
  assert.match(translations, /marketingB2BForm\.summaryTitle/);
});

test("support onboarding ignores stale initial form loads", () => {
  const form = read("src/components/onboarding/support-onboarding-form.tsx");

  assert.match(
    form,
    /fetch\(`\/api\/onboarding\/support-form\/\$\{taskId\}`, \{ signal \}\)/,
  );
  assert.match(form, /if \(signal\.aborted\) return;/);
  assert.match(form, /const controller = new AbortController\(\);/);
  assert.match(form, /controller\.abort\(\);/);
});

test("Marketing B2B form task opens the form before relation backfill", () => {
  const task = {
    id: "task-b2b-form",
    title: "Marketing B2B onboarding form",
    description:
      "Marketing B2B queue action: complete the client onboarding form. Fields are optional and autosaved.",
    project_id: "project-b2b",
    project: { id: "project-b2b", name: "Teste 01" },
    onboarding_link: {
      id: "checklist-b2b",
      onboarding_id: "onboarding-1",
      company_id: "company-1",
      company_name: "Teste 01",
      department: "Marketing B2B",
      title: "Marketing B2B onboarding form completed",
      status: "pending",
      progress: 18,
      href: "/clients/company-1",
    },
  } as Task;

  assert.equal(workflowFormKind(task), "marketing_b2b");
  assert.deepEqual(getOnboardingTaskAction(task), {
    kind: "form",
    href: "/projects/project-b2b?view=form&task=task-b2b-form",
    formKind: "marketing_b2b",
  });
});

test("explicit onboarding action opens forms without guessing from task copy", () => {
  const task = {
    id: "task-explicit-b2b",
    title: "Client kickoff package",
    description: "A title that intentionally does not say form.",
    project_id: "project-b2b",
    project: { id: "project-b2b", name: "Bang Corporation" },
    onboarding_link: {
      id: "checklist-explicit-b2b",
      onboarding_id: "onboarding-1",
      company_id: "company-1",
      company_name: "Bang Corporation",
      department: "Marketing B2B",
      title: "Client intake",
      status: "pending",
      progress: 18,
      href: "/clients/company-1",
      action: {
        kind: "form",
        form_kind: "marketing_b2b",
        label: "Open Marketing B2B form",
      },
    },
  } as Task;

  assert.equal(workflowFormKind(task), "marketing_b2b");
  assert.deepEqual(getOnboardingTaskAction(task), {
    kind: "form",
    href: "/projects/project-b2b?view=form&task=task-explicit-b2b",
    formKind: "marketing_b2b",
  });
});

test("explicit onboarding action opens meeting scheduler without title matching", () => {
  const task = {
    id: "task-explicit-meeting",
    title: "Client alignment",
    description: "No schedule keyword here.",
    project_id: "project-b2b",
    assignee_id: "00000000-0000-0000-0000-000000000001",
    assignee: { id: "00000000-0000-0000-0000-000000000001", name: "Pedro", email: "pedro@example.com" },
    project: { id: "project-b2b", name: "Bang Corporation" },
    onboarding_link: {
      id: "checklist-explicit-meeting",
      onboarding_id: "onboarding-1",
      company_id: "company-1",
      company_name: "Bang Corporation",
      department: "Marketing B2B",
      title: "Kickoff",
      status: "pending",
      progress: 18,
      href: "/clients/company-1",
      action: {
        kind: "calendar",
        label: "Schedule onboarding meeting",
      },
    },
  } as Task;

  assert.deepEqual(getOnboardingTaskAction(task, "project-b2b"), {
    kind: "calendar",
    href:
      "/calendar?create=meeting&task=task-explicit-meeting&title=Bang+Corporation+-+Marketing+B2B+Onboarding+Meeting&project=project-b2b&description=Client%3A+Bang+Corporation%0ADepartment%3A+Marketing+B2B%0AMeeting+type%3A+Marketing+B2B+Onboarding+Meeting%0AResponsible%3A+Pedro+pedro%40example.com%0AAgenda%3A+align+goals%2C+accesses%2C+communication+rhythm%2C+blockers%2C+and+next+steps.%0ATask+notes%3A+No+schedule+keyword+here.&attendees=00000000-0000-0000-0000-000000000001",
  });
});

test("Marketing B2B department onboarding task opens the form-first route", () => {
  const task = {
    id: "task-b2b-onboarding",
    title: "Onboarding Marketing B2B",
    description: "Complete the department onboarding for this client.",
    project_id: "project-b2b",
    project: { id: "project-b2b", name: "Teste" },
  } as Task;

  assert.equal(workflowFormKind(task), "marketing_b2b");
  assert.deepEqual(getOnboardingTaskAction(task), {
    kind: "form",
    href: "/projects/project-b2b?view=form&task=task-b2b-onboarding",
    formKind: "marketing_b2b",
  });
});

test("UP Zero website configuration stays a Technical Support task for legacy links", () => {
  const task = {
    id: "task-up-zero-configuration",
    title: "Configure UP Zero website",
    description:
      "Technical Support must configure the UP Zero website before Marketing B2B onboarding.",
    project_id: "project-support",
    project: { id: "project-support", name: "Client Channels" },
    onboarding_link: {
      id: "checklist-up-zero",
      onboarding_id: "onboarding-1",
      company_id: "company-1",
      company_name: "Test client",
      department: "Technical Support",
      title: "Configure UP Zero website",
      automation_key: null,
      status: "pending",
      progress: 0,
      href: "/clients/company-1",
    },
  } as Task;

  assert.equal(workflowFormKind(task), null);
  assert.equal(getOnboardingTaskAction(task), null);
});
