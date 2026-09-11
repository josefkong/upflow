import assert from "node:assert/strict";
import test from "node:test";

import { buildClientOnboardingSectorFolders } from "../../src/lib/client-onboarding-sector-folders";

function checklistItem(input: {
  id: string;
  department: string;
  status: string;
  projectId: string;
  spaceName: string;
  completedAt?: string | null;
}) {
  return {
    id: input.id,
    department: input.department,
    status: input.status,
    required: true,
    completed_at: input.completedAt ?? null,
    task: {
      id: `task-${input.id}`,
      project_id: input.projectId,
      project: {
        id: input.projectId,
        name: "Onboarding",
        space: { id: `space-${input.id}`, name: input.spaceName },
      },
    },
  };
}

test("a client sector folder is released only after all required sector steps finish", () => {
  const folders = buildClientOnboardingSectorFolders([
    checklistItem({
      id: "commercial-1",
      department: "Comercial",
      status: "complete",
      projectId: "project-commercial",
      spaceName: "Comercial",
      completedAt: "2026-09-08T12:00:00.000Z",
    }),
    checklistItem({
      id: "support-1",
      department: "Suporte Técnico",
      status: "complete",
      projectId: "project-support",
      spaceName: "Suporte Técnico",
    }),
    checklistItem({
      id: "support-2",
      department: "Suporte Técnico",
      status: "in_progress",
      projectId: "project-support",
      spaceName: "Suporte Técnico",
    }),
  ]);

  assert.deepEqual(
    folders.map((folder) => folder.key),
    ["commercial"],
  );
  assert.equal(folders[0]?.project_id, "project-commercial");
  assert.equal(folders[0]?.task_count, 1);
});

test("department is inferred from the owning project space when needed", () => {
  const folders = buildClientOnboardingSectorFolders([
    checklistItem({
      id: "design-1",
      department: "Etapa de identidade visual",
      status: "complete",
      projectId: "project-design",
      spaceName: "Creative & Design",
      completedAt: "2026-09-09T10:00:00.000Z",
    }),
  ]);

  assert.equal(folders[0]?.key, "creative_design");
  assert.equal(folders[0]?.completed_at, "2026-09-09T10:00:00.000Z");
});
