import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}

test("persistent approval workflow models and APIs exist", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read("prisma/migrations/20260626140000_persistent_operations_models/migration.sql");
  const collection = read("src/app/api/approvals/route.ts");
  const item = read("src/app/api/approvals/[id]/route.ts");
  const helper = read("src/lib/approval-workflow.ts");

  assert.match(schema, /model ApprovalRequest/);
  assert.match(schema, /model ApprovalEvent/);
  assert.match(schema, /approval_status\s+String\s+@default\("draft"\)/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "ApprovalRequest"/);
  assert.match(migration, /ALTER TABLE "Task"[\s\S]*"approval_status"/);
  assert.match(collection, /syncEntityApprovalState/);
  assert.match(collection, /approval_request_created/);
  assert.match(item, /approval_request_updated/);
  assert.match(helper, /entityType === "task"/);
  assert.match(helper, /entityType === "doc"/);
  assert.match(helper, /entityType === "project"/);
});

test("custom workflow statuses are workspace and project scoped", () => {
  const schema = read("prisma/schema.prisma");
  const route = read("src/app/api/workflow-statuses/route.ts");

  assert.match(schema, /model WorkflowStatus/);
  assert.match(schema, /@@unique\(\[workspace_id, project_id, category, key\]\)/);
  assert.match(route, /category: z\s*\.enum\(\["task", "doc", "report", "campaign", "deliverable"\]\)/);
  assert.match(route, /requireWorkspaceAdmin/);
  assert.match(route, /workflow_status_upserted/);
});

test("report history is persisted as first-class client report records", () => {
  const schema = read("prisma/schema.prisma");
  const reportRoute = read("src/app/api/companies/[id]/report/route.ts");
  const actionsRoute = read("src/app/api/companies/[id]/report/actions/route.ts");
  const page = read("src/app/(dashboard)/clients/[id]/report/page.tsx");

  assert.match(schema, /model ClientReport/);
  assert.match(actionsRoute, /prisma\.\$transaction/);
  assert.match(actionsRoute, /clientReport\.create/);
  assert.match(actionsRoute, /clientReport\.update/);
  assert.match(actionsRoute, /approved_at/);
  assert.match(actionsRoute, /sent_at/);
  assert.match(actionsRoute, /archived_at/);
  assert.match(reportRoute, /report_history/);
  assert.match(page, /t\("report\.history"\)/);
});

test("automation scheduler records durable run history", () => {
  const schema = read("prisma/schema.prisma");
  const runner = read("src/lib/automation-runner.ts");
  const cron = read("src/app/api/cron/automations/route.ts");
  const vercel = read("vercel.json");

  assert.match(schema, /model AutomationRun/);
  assert.match(runner, /automationRun[\s\S]*create/);
  assert.match(runner, /dedupePrefix/);
  assert.match(cron, /runAutomationRules/);
  assert.match(cron, /CRON_SECRET/);
  assert.match(vercel, /"path": "\/api\/cron\/automations"/);
});

test("operational admin center aggregates rollout risks", () => {
  const route = read("src/app/api/admin/operations/route.ts");
  const page = read("src/app/(dashboard)/admin/operations/page.tsx");

  assert.match(route, /failed_automations/);
  assert.match(route, /approvals_waiting/);
  assert.match(route, /report_approvals_waiting/);
  assert.match(route, /clients_at_risk/);
  assert.match(route, /invite_failures/);
  assert.match(route, /permission_changes_7d/);
  assert.match(page, /t\("adminOps\.heading"\)/);
  assert.match(page, /t\("adminOps\.hardVerification"\)/);
});
