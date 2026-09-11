import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  commercialFlowProjectKind,
  isCommercialFlowEntryProject,
  isCommercialManagedDownstreamProject,
  isCommercialSystemFlowProject,
} from "../../src/lib/commercial-managed-projects";

const ROOT = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

test("Commercial system projects have one entry point and automatic downstream stages", () => {
  assert.equal(
    commercialFlowProjectKind({
      projectName: "Leads",
      spaceName: "Comercial",
    }),
    "leads",
  );
  assert.equal(
    commercialFlowProjectKind({
      projectName: "Follow-ups",
      spaceName: "Commercial",
    }),
    "follow_up",
  );
  assert.equal(
    commercialFlowProjectKind({
      projectName: "Propostas",
      spaceName: "Comercial",
    }),
    "proposal_archive",
  );
  assert.equal(
    commercialFlowProjectKind({
      projectName: "Contracts & Handoffs",
      spaceName: "Commercial",
    }),
    "contract_handoff",
  );
  assert.equal(
    commercialFlowProjectKind({
      projectName: "Contratos",
      spaceName: "Comercial",
    }),
    "contracts",
  );

  assert.equal(
    isCommercialFlowEntryProject({
      projectName: "Leads",
      spaceName: "Comercial",
    }),
    true,
  );
  assert.equal(
    isCommercialManagedDownstreamProject({
      projectName: "Leads",
      spaceName: "Comercial",
    }),
    false,
  );
  assert.equal(
    isCommercialManagedDownstreamProject({
      projectName: "Contratos e Handoffs",
      spaceName: "Comercial",
    }),
    true,
  );
});

test("future team-managed projects remain free for manual organization", () => {
  assert.equal(
    isCommercialSystemFlowProject({
      projectName: "Organização da Equipe",
      spaceName: "Comercial",
    }),
    false,
  );
  assert.equal(
    isCommercialSystemFlowProject({
      projectName: "Contratos",
      spaceName: "Jurídico",
    }),
    false,
  );
  assert.equal(
    isCommercialSystemFlowProject({
      projectName: "Atendimento ao Cliente",
      spaceName: "Comercial",
    }),
    false,
  );
});

test("UI and API share the Commercial flow creation guard", () => {
  const projectPage = read("src/app/(dashboard)/projects/[id]/page.tsx");
  const createSheet = read("src/components/projects/task-create-sheet.tsx");
  const tasksRoute = read("src/app/api/tasks/route.ts");

  assert.match(projectPage, /isCommercialManagedDownstreamProject/);
  assert.match(projectPage, /!isCommercialManagedDownstream/);
  assert.match(projectPage, /projects\.commercialAutomaticFlowOnly/);
  assert.match(createSheet, /isCommercialSystemFlowProject/);
  assert.match(createSheet, /isFinanceContractMirrorProject/);
  assert.match(tasksRoute, /isCommercialSystemFlowProject/);
  assert.match(tasksRoute, /Novas tarefas devem ser iniciadas no projeto Leads/);
  assert.match(tasksRoute, /Use Adicionar Lead/);
});
