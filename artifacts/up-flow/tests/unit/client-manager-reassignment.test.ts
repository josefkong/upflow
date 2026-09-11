import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

test("company manager reassignment only accepts active non-guest workspace members", () => {
  const route = readFileSync(join(ROOT, "src/app/api/companies/[id]/route.ts"), "utf8");
  const detailPage = readFileSync(join(ROOT, "src/app/(dashboard)/clients/[id]/page.tsx"), "utf8");
  const translations = readFileSync(join(ROOT, "src/lib/i18n/translations.ts"), "utf8");

  assert.match(route, /owner_id: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(route, /async function validateCompanyOwner/);
  assert.match(route, /workspace_id: workspaceId/);
  assert.match(route, /status: "active"/);
  assert.match(route, /role: \{ not: "guest" \}/);
  assert.match(route, /if \(parsed\.data\.owner_id !== undefined\)/);
  assert.match(route, /Responsible manager must be an active non-guest member of this workspace/);
  assert.match(route, /previous_owner_id: company\.owner_id/);
  assert.match(route, /owner_id: updated\.owner_id/);

  assert.match(detailPage, /useAppUser/);
  assert.match(detailPage, /hasWorkspaceAdminAccess\(user\)/);
  assert.match(detailPage, /const canManageClient = hasWorkspaceAdminAccess\(user\)/);
  assert.match(detailPage, /\/api\/users\?workspace_id=\$\{encodeURIComponent\(company\.workspace_id\)\}/);
  assert.match(detailPage, /workspace_status === "active"\s*&&\s*member\.workspace_role !== "guest"/);
  assert.match(detailPage, /body: JSON\.stringify\(\{ owner_id: managerId \}\)/);
  assert.match(detailPage, /await loadCompany\(\{ silent: true \}\)/);
  assert.match(translations, /"clientDetail\.changeManager": "Alterar responsável"/);
});
