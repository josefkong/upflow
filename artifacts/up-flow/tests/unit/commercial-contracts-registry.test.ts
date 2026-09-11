import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  isCommercialContractsRegistryProject,
  isCommercialSystemFlowProject,
} from "../../src/lib/commercial-managed-projects";
import { localizeProjectName } from "../../src/lib/i18n/project-name-translations";

const ROOT = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

test("Contracts is the read-only Commercial registry and Customer Service stays operational", () => {
  assert.equal(
    isCommercialContractsRegistryProject({
      projectName: "Contratos",
      spaceName: "Financeiro",
    }),
    true,
  );
  assert.equal(
    isCommercialContractsRegistryProject({
      projectName: "Contratos",
      spaceName: "Comercial",
    }),
    true,
  );
  assert.equal(
    isCommercialSystemFlowProject({
      projectName: "Customer Service",
      spaceName: "Commercial",
    }),
    false,
  );
  assert.equal(
    localizeProjectName("Customer Service", "pt-BR"),
    "Atendimento ao Cliente",
  );
});

test("Contracts registry is workspace scoped, permission checked, and uses private downloads", () => {
  const listRoute = read("src/app/api/commercial/contracts/route.ts");
  const downloadRoute = read("src/app/api/commercial/contracts/[id]/route.ts");
  const projectPage = read("src/app/(dashboard)/projects/[id]/page.tsx");
  const mirror = read("src/lib/commercial-contract-mirror.ts");
  const departmentSpaces = read("src/lib/department-spaces.ts");

  assert.match(listRoute, /requireAuth/);
  assert.match(listRoute, /workspace_id: workspaceId/);
  assert.match(listRoute, /canReadProject/);
  assert.match(listRoute, /canViewClientFinancials/);
  assert.match(listRoute, /contract_value: canViewFinancials/);
  assert.match(listRoute, /client_contracts/);
  assert.match(downloadRoute, /createSignedUrl/);
  assert.match(downloadRoute, /canReadProject/);
  assert.match(downloadRoute, /canViewClientFinancials/);
  assert.match(projectPage, /CommercialContractsRegistry/);
  assert.match(
    projectPage,
    /!isCommercialContractsRegistry[\s\S]*!isClientsRegistry/,
  );
  assert.match(mirror, /ensureSharedContractsRegistryProjects/);
  assert.match(mirror, /COMMERCIAL_SPACE_NAMES/);
  assert.match(mirror, /FINANCE_SPACE_NAMES/);
  assert.match(departmentSpaces, /ensureSharedContractsRegistryProjects/);
});

test("Space tree is rendered only for workspace administrators", () => {
  const panel = read("src/components/layout/sidebar/panel.tsx");
  const panelNav = read("src/components/layout/sidebar/panel-nav.tsx");

  assert.match(panel, /data-testid="sidebar-admin-spaces"/);
  assert.match(panel, /canManageWorkspace \? \(/);
  assert.match(panelNav, /\{canManageWorkspace \? \(/);
});

test("signing a Commercial contract starts one shared departmental onboarding flow", () => {
  const handoff = read("src/lib/commercial-contract-handoff.ts");
  const leadRoute = read("src/app/api/commercial/leads/[id]/route.ts");
  const onboarding = read("src/lib/onboarding.ts");
  const departmentSpaces = read("src/lib/department-spaces.ts");
  const spacesRoute = read("src/app/api/spaces/route.ts");

  assert.match(handoff, /createClientOnboardingRecordsForCompany/);
  assert.match(
    handoff,
    /markCommercialContractSigned[\s\S]*createClientOnboardingRecordsForCompany\(db/,
  );
  assert.match(handoff, /source: "commercial_contract_signed"/);
  assert.match(leadRoute, /finishClientOnboardingStart/);
  assert.match(leadRoute, /"commercial_contract_signed"/);
  assert.match(
    onboarding,
    /export async function ensureWorkspaceOnboardingMirrorProjects/,
  );
  assert.match(onboarding, /name: "Onboarding"/);
  assert.match(
    onboarding,
    /every departmental task points to the same[\s\S]*ClientOnboarding checklist/,
  );
  assert.match(
    departmentSpaces,
    /ensureWorkspaceOnboardingMirrorProjects\(prisma, \{[\s\S]*workspaceId,[\s\S]*ownerId/,
  );
  assert.match(spacesRoute, /ensureOnboardingMirrorProjectForSpace\(tx/);
});
