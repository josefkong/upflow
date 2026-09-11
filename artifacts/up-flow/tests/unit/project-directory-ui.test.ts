import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string) {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("project index renders progressive Space and Project navigation", () => {
  const page = read("src/app/(dashboard)/projects/page.tsx");
  const board = read("src/components/projects/personal-workspace-board.tsx");
  const projectPage = read("src/app/(dashboard)/projects/[id]/page.tsx");
  const pageContent = read("src/components/layout/page-content.ts");
  const pathBreadcrumbs = read("src/components/projects/project-path-breadcrumbs.tsx");

  assert.match(page, /<PersonalWorkspaceBoard \/>/);
  assert.match(board, /DirectoryFolderCard/);
  assert.match(board, /ProjectCard/);
  assert.match(board, /Breadcrumbs/);
  assert.match(board, /ProjectPathBreadcrumbs/);
  assert.match(board, /backHref="\/"/);
  assert.match(board, /backHref=\{parentHref\}/);
  assert.match(board, /projects\.drilldown\.backToPreviousLevel/);
  assert.match(pathBreadcrumbs, /index === 0 \? "pr-2" : "px-2"/);
  assert.match(board, /PAGE_CONTENT_CLASS/);
  assert.match(projectPage, /PAGE_CONTENT_CLASS/);
  assert.match(board, /PAGE_HEADER_CARD_CLASS/);
  assert.match(projectPage, /PAGE_HEADER_CARD_CLASS/);
  assert.match(pageContent, /px-4 py-6 sm:px-6 lg:px-8/);
  assert.match(pageContent, /rounded-2xl border border-border bg-card\/55/);
  assert.match(projectPage, /ProjectPathBreadcrumbs/);
  assert.match(projectPage, /projects\.drilldown\.eyebrow/);
  assert.doesNotMatch(projectPage, /-mx-2 mb-6 rounded-2xl/);
  assert.doesNotMatch(projectPage, /bg-card\/80 p-4 shadow-sm sm:p-6/);
  assert.match(board, /scope\.type === "spaces"/);
  assert.match(board, /scope\.type === "folder"/);
  assert.match(board, /href=\{`\/projects\/\$\{project\.id\}`\}/);
  assert.doesNotMatch(board, /DragDropContext/);
  assert.doesNotMatch(page, /grid-cols-3/);
});

test("project navigation is progressive, shareable, and folder-aware", () => {
  const board = read("src/components/projects/personal-workspace-board.tsx");
  const projectPage = read("src/app/(dashboard)/projects/[id]/page.tsx");

  assert.match(board, /useSearchParams/);
  assert.match(board, /router\.replace/);
  assert.match(board, /\/api\/projects\/my-work/);
  assert.match(board, /searchParams\.get\("scope"\)/);
  assert.match(board, /params\.set\("scope"/);
  assert.match(board, /folderDescendants/);
  assert.match(board, /folderHasLinkedProject/);
  assert.match(board, /taskCountByProject/);
  assert.match(board, /getCachedJson<WorkResponse>/);
  assert.match(board, /prefetchProjectPage/);
  assert.match(projectPage, /peekCachedJson<Project>/);
  assert.match(board, /grid-cols-2/);
  assert.match(board, /focus-visible:ring-2/);
});

test("my-work endpoint returns only tasks linked to the current user", () => {
  const route = read("src/app/api/projects/my-work/route.ts");

  assert.match(route, /assignee_id: userId/);
  assert.match(route, /followers: \{ some: \{ user_id: userId \} \}/);
  assert.match(route, /readableProjectWhere\(auth, workspaceId\)/);
  assert.match(route, /workflow_managed/);
  assert.match(route, /project_members/);
});

test("directory translations cover English and Portuguese category labels", () => {
  const translations = read("src/lib/i18n/translations.ts");

  assert.match(translations, /"projects\.tab\.clients": "Clients"/);
  assert.match(translations, /"projects\.tab\.operations": "Operational queues"/);
  assert.match(translations, /"projects\.tab\.clients": "Clientes"/);
  assert.match(translations, /"projects\.tab\.operations": "Filas operacionais"/);
  assert.match(translations, /"projects\.myWork\.title": "Tasks by Spaces and Projects"/);
  assert.match(translations, /"projects\.myWork\.title": "Tarefas por Espaços e Projetos"/);
  assert.match(translations, /"projects\.drilldown\.spacesTitle": "Spaces"/);
  assert.match(translations, /"projects\.drilldown\.spacesTitle": "Espaços"/);
  assert.match(translations, /"projects\.drilldown\.backToDashboard": "Voltar ao Dashboard"/);
  assert.match(translations, /"projects\.drilldown\.backToPreviousLevel": "Voltar ao Nível Anterior"/);
  assert.match(translations, /"sidebar\.searchSpacesAndProjects": "Encontrar espaços e projetos\.\.\."/);
  assert.match(translations, /"projects\.createProject": "Criar Projeto"/);
  assert.match(translations, /"sidebar\.newProjectTitle": "Criar Projeto"/);
  assert.match(translations, /"space\.docsCreateProject": "Criar Projeto"/);
  assert.doesNotMatch(translations, /"(?:projects\.createProject|sidebar\.newProjectTitle|space\.docsCreateProject)": "Criar projeto"/);
});
