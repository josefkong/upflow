import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("app shell exposes an English and Portuguese Brazil language toggle", () => {
  const provider = read("src/components/language-provider.tsx");
  const translations = read("src/lib/i18n/translations.ts");
  const header = read("src/components/layout/header.tsx");
  const providers = read("src/components/providers.tsx");

  assert.match(provider, /@\/lib\/i18n\/translations/);
  assert.match(translations, /export type Language = "en" \| "pt-BR"/);
  assert.match(provider, /upflow\.language/);
  assert.match(provider, /document\.documentElement\.lang = language/);
  assert.match(translations, /"language\.portugueseBrazil": "Português \(Brasil\)"/);
  assert.match(translations, /"header\.newProject": "Novo projeto"/);
  assert.match(header, /Languages/);
  assert.match(header, /toggleLanguage/);
  assert.match(header, /language === "en" \? "EN" : "PT"/);
  assert.match(providers, /<LanguageProvider>/);
});

test("sidebar and workspace chrome use translation keys for shared labels", () => {
  const rail = read("src/components/layout/sidebar/rail.tsx");
  const panel = read("src/components/layout/sidebar/panel.tsx");
  const panelNav = read("src/components/layout/sidebar/panel-nav.tsx");
  const workspaceSwitcher = read("src/components/layout/workspace-switcher.tsx");

  assert.match(rail, /labelKey: "nav\.dashboard"/);
  assert.match(
    rail,
    /const panelToggleLabel = t\(panelOpen \? "sidebar\.hide" : "sidebar\.show"\)/,
  );
  assert.match(panelNav, /t\("sidebar\.navigation"\)/);
  assert.match(panel, /t\("sidebar\.searchSpacesAndProjects"\)/);
  assert.match(workspaceSwitcher, /t\("workspace\.new"\)/);
});

test("dashboard and project task surfaces use translation keys", () => {
  const translations = read("src/lib/i18n/translations.ts");
  const dashboard = read("src/app/(dashboard)/page.tsx");
  const taskFocusPanels = read("src/components/dashboard/task-focus-panels.tsx");
  const projectPage = read("src/app/(dashboard)/projects/[id]/page.tsx");
  const toolbar = read("src/components/projects/project-toolbar.tsx");
  const taskSheet = read("src/components/projects/task-create-sheet.tsx");
  const taskTemplates = read("src/components/projects/task-template-fields.tsx");

  assert.match(translations, /"dashboard\.commandCenter": "Centro de Operações da Agência"/);
  assert.match(translations, /"toolbar\.board": "Quadro"/);
  assert.match(translations, /"task\.createTask": "Criar tarefa"/);
  assert.match(translations, /"taskTemplate\.creative\.label": "Criativo \/ Design"/);
  assert.match(translations, /"taskTemplate\.technical_support\.label": "Suporte técnico"/);
  assert.match(dashboard, /t\("dashboard\.commandCenter"\)/);
  assert.match(taskFocusPanels, /t\("dashboard\.todayFocus"\)/);
  assert.match(projectPage, /t\("projects\.addTask"\)/);
  assert.match(toolbar, /t\("toolbar\.board"\)/);
  assert.match(toolbar, /t\("toolbar\.searchTasks"\)/);
  assert.match(taskSheet, /t\("task\.createTask"\)/);
  assert.doesNotMatch(taskSheet, /task\.detailsCover/);
  assert.match(taskTemplates, /t\("taskTemplate\.type"\)/);
});

test("core rollout surfaces are wired to the language provider", () => {
  const translations = read("src/lib/i18n/translations.ts");
  const dashboard = read("src/app/(dashboard)/page.tsx");
  const calendar = read("src/app/(dashboard)/calendar/page.tsx");
  const clients = read("src/app/(dashboard)/clients/page.tsx");
  const createCompanyDialog = read("src/components/dashboard/create-company-dialog.tsx");
  const projects = read("src/app/(dashboard)/projects/page.tsx");
  const projectDirectory = read("src/components/projects/project-directory.tsx");
  const customFields = read("src/components/projects/custom-fields-manager.tsx");
  const team = read("src/app/(dashboard)/team/page.tsx");
  const time = read("src/app/(dashboard)/time/page.tsx");
  const inviteDialog = read("src/components/dashboard/invite-dialog.tsx");
  const teamInvitePanels = read("src/components/team/team-invite-panels.tsx");
  const scheduleDialog = read("src/components/dashboard/schedule-meeting-dialog.tsx");
  const errorPage = read("src/app/error.tsx");
  const notFoundPage = read("src/app/not-found.tsx");

  assert.match(translations, /"calendar\.manage": "Gerenciar"/);
  assert.match(translations, /"clients\.responsibleManager": "Gestor responsável"/);
  assert.match(translations, /"clients\.healthCenter": "Central de saúde"/);
  assert.match(translations, /"companyDialog\.title": "Criar empresa"/);
  assert.match(translations, /"companyDialog\.responsibleDepartment": "Departamento responsável"/);
  assert.match(translations, /"companyDialog\.serviceType\.paidMedia": "Mídia paga"/);
  assert.match(translations, /"projects\.deleteProject": "Excluir projeto"/);
  assert.match(translations, /"customFields\.existingFields": "Campos existentes"/);
  assert.match(translations, /"team\.membersTitle": "Membros da equipe"/);
  assert.match(translations, /"time\.weeklyHours": "Horas da semana"/);
  assert.match(translations, /"invite\.mode": "Modo do convite"/);
  assert.match(translations, /"error\.pageTitle": "Esta página não carregou"/);

  assert.match(dashboard, /t\("dashboard\.noTrackedTime"\)/);
  assert.match(dashboard, /t\("dashboard\.todayMeetings"\)/);
  assert.match(dashboard, /t\("dashboard\.lastActions"\)/);
  assert.match(calendar, /useLanguage/);
  assert.match(calendar, /t\("calendar\.quickCreateShort"\)/);
  assert.match(calendar, /Intl\.DateTimeFormat\(language/);
  assert.match(clients, /t\("clients\.planNotSet"\)/);
  assert.match(clients, /t\("clients\.responsibleManager"\)/);
  assert.match(clients, /t\("clients\.healthCenter"\)/);
  assert.match(clients, /t\("clients\.deleteConfirm"/);
  assert.match(createCompanyDialog, /useLanguage/);
  assert.match(createCompanyDialog, /t\("companyDialog\.standaloneTitle"\)/);
  assert.match(createCompanyDialog, /t\("companyDialog\.responsibleDepartment"\)/);
  assert.match(createCompanyDialog, /t\(option\.labelKey\)/);
  assert.match(createCompanyDialog, /optionLabel\(service, serviceOptions, t\)/);
  assert.match(projects, /t\("projects\.title"\)/);
  assert.match(projectDirectory, /t\("projects\.directoryTitle"\)/);
  assert.match(projectDirectory, /t\("projects\.deleteConfirm"/);
  assert.match(projectDirectory, /t\("projects\.moveProject"\)/);
  assert.match(customFields, /useLanguage/);
  assert.match(customFields, /t\("customFields\.existingFields"\)/);
  assert.match(customFields, /t\(item\.labelKey\)/);
  assert.match(team, /t\("team\.membersTitle"\)/);
  assert.match(team, /t\("team\.searchMembers"\)/);
  assert.match(time, /t\("time\.title"\)/);
  assert.match(time, /t\("time\.weeklyHours"\)/);
  assert.match(inviteDialog, /t\("invite\.mode"\)/);
  assert.match(inviteDialog, /inviteErrorHint\(error\.code, t\)/);
  assert.match(team, /t\("invite\.realUsersTitle"\)/);
  assert.match(teamInvitePanels, /t\("invite\.testerWorkspaceTitle"\)/);
  assert.match(scheduleDialog, /t\("calendar\.scheduleMeeting"\)/);
  assert.match(errorPage, /t\("error\.pageTitle"\)/);
  assert.match(notFoundPage, /t\("error\.notFoundTitle"\)/);
});

test("English and Portuguese catalogues expose the same translation keys", () => {
  const source = read("src/lib/i18n/translations.ts");
  const [english, portuguese] = source.split('  "pt-BR": {');
  const translationKeys = (catalogue: string) =>
    [...catalogue.matchAll(/^\s+"([^"]+)":/gm)].map((match) => match[1]).sort();

  assert.ok(portuguese, "Portuguese catalogue should be present");
  assert.deepEqual(translationKeys(english), translationKeys(portuguese));
});
