import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { isClientsRegistryProject } from "../../src/lib/client-space-structure";
import { localizeProjectName } from "../../src/lib/i18n/project-name-translations";

const ROOT = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

test("Clients is one localized automatic registry in every Space", () => {
  assert.equal(isClientsRegistryProject({ projectName: "Clients" }), true);
  assert.equal(isClientsRegistryProject({ projectName: "Clientes" }), true);
  assert.equal(isClientsRegistryProject({ projectName: "Leads" }), false);
  assert.equal(localizeProjectName("Clients", "pt-BR"), "Clientes");

  const structure = read("src/lib/client-space-structure.ts");
  const departmentSpaces = read("src/lib/department-spaces.ts");
  assert.match(structure, /spaces\.map/);
  assert.match(structure, /name: CLIENTS_PROJECT_NAME/);
  assert.match(departmentSpaces, /ensureWorkspaceClientsProjects/);
});

test("signing a contract exposes one shared virtual folder inside every Clients project", () => {
  const structure = read("src/lib/client-space-structure.ts");
  const handoff = read("src/lib/commercial-contract-handoff.ts");
  const registry = read("src/app/api/clients-registry/route.ts");
  const component = read("src/components/clients/client-space-registry.tsx");

  assert.doesNotMatch(structure, /db\.folder\.create/);
  assert.doesNotMatch(structure, /kind: "client"/);
  assert.match(structure, /virtual folder/);
  assert.match(registry, /contract_start_date: \{ not: null \}/);
  assert.doesNotMatch(component, /\/folders\//);
  assert.match(
    handoff,
    /markCommercialContractSigned[\s\S]*ensureWorkspaceClientDirectories\(db/,
  );
});

test("client contract values are redacted outside Commercial and Finance", () => {
  const access = read("src/lib/client-financial-access.ts");
  const registry = read("src/app/api/clients-registry/route.ts");
  const contracts = read("src/app/api/commercial/contracts/route.ts");
  const download = read("src/app/api/commercial/contracts/[id]/route.ts");
  const companies = read("src/app/api/companies/route.ts");
  const company = read("src/app/api/companies/[id]/route.ts");
  const companyReport = read("src/app/api/companies/[id]/report/route.ts");
  const dashboard = read("src/app/api/dashboard/route.ts");
  const dashboardSummary = read("src/app/api/dashboard/summary/route.ts");
  const spaceDashboard = read("src/app/api/spaces/[id]/dashboard/route.ts");

  assert.match(access, /isCommercialOrSalesDepartmentName/);
  assert.match(access, /isFinanceDepartmentName/);
  assert.doesNotMatch(access, /isWorkspaceAdminFor/);
  assert.match(access, /contract_value: null/);
  assert.doesNotMatch(registry, /contract_value/);
  assert.match(contracts, /contracts: canViewFinancials/);
  assert.match(download, /canViewClientFinancials/);
  assert.match(companies, /redactClientFinancials/);
  assert.match(companies, /includesFinancialData/);
  assert.match(company, /redactClientFinancials/);
  assert.match(company, /canViewClientFinancialsInContext/);
  assert.match(company, /CLIENTS_REGISTRY_CONTEXT_PARAM/);
  assert.match(company, /updatesFinancialData/);
  assert.match(companyReport, /redactClientFinancials/);
  assert.match(dashboard, /financials_visible: financialsVisible/);
  assert.match(dashboardSummary, /financials_visible: financialsVisible/);
  assert.match(spaceDashboard, /financials_visible: financialsVisible/);
});

test("Clients registry has a dedicated responsive folder interface", () => {
  const page = read("src/app/(dashboard)/projects/[id]/page.tsx");
  const component = read("src/components/clients/client-space-registry.tsx");

  assert.match(page, /isClientsRegistryProject/);
  assert.match(page, /ClientSpaceRegistry projectId=\{id\}/);
  assert.match(component, /sm:grid-cols-3/);
  assert.match(component, /xl:grid-cols-2/);
  assert.match(component, /clientsRegistry\.contractedServices/);
  assert.match(component, /content-visibility:auto/);
  assert.match(component, /clientsRegistry\.openFolder/);
  assert.match(component, /data-testid="create-complete-client"/);
  assert.match(component, /mode="complete"/);
  assert.match(component, /can_create_complete_client/);
  assert.match(component, /context_project_id/);
  assert.doesNotMatch(component, /contract_value/);
  assert.doesNotMatch(component, /WalletCards/);
});

test("Clients project context never broadens financial visibility", () => {
  const access = read("src/lib/client-financial-access.ts");
  const detail = read("src/app/(dashboard)/clients/[id]/page.tsx");
  const report = read("src/app/api/companies/[id]/report/route.ts");

  assert.match(access, /void contextProjectId/);
  assert.match(access, /return canViewClientFinancials/);
  assert.match(detail, /company\.financials_visible/);
  assert.match(detail, /context_project_id/);
  assert.match(report, /canViewClientFinancialsInContext/);
});

test("sidebar Clients navigation resolves to the logged-in user's department project", () => {
  const resolver = read("src/lib/client-navigation.ts");
  const layout = read("src/app/(dashboard)/layout.tsx");
  const sidebar = read("src/components/layout/sidebar.tsx");
  const rail = read("src/components/layout/sidebar/rail.tsx");
  const panelNav = read("src/components/layout/sidebar/panel-nav.tsx");

  assert.match(resolver, /departmentName/);
  assert.match(resolver, /leader_id: input\.userId/);
  assert.match(resolver, /getDepartmentSpacePreset/);
  assert.match(resolver, /`\/projects\/\$\{targetProject\.id\}`/);
  assert.match(layout, /resolveClientsNavigationHref/);
  assert.match(layout, /clientsHref=\{clientsHref\}/);
  assert.match(sidebar, /clientsHref=\{clientsHref\}/);
  assert.match(rail, /resolvePrimaryNavHref/);
  assert.match(panelNav, /resolvePrimaryNavHref\(item, clientsHref\)/);
});
