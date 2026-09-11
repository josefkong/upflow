import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const ROOT = join(__dirname, "..", "..");

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

test("departments persist an optional leader with a safe foreign key", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260805120000_add_department_leaders/migration.sql",
  );

  assert.match(schema, /leader_id\s+String\?/);
  assert.match(schema, /leader\s+User\?\s+@relation\("DepartmentLeader"/);
  assert.match(schema, /led_departments\s+Department\[\]\s+@relation\("DepartmentLeader"\)/);
  assert.match(schema, /@@index\(\[leader_id\]\)/);
  assert.match(migration, /ADD COLUMN "leader_id" TEXT/);
  assert.match(migration, /ON DELETE SET NULL ON UPDATE CASCADE/);
});

test("department leader updates require an active member of that department", () => {
  const route = read("src/app/api/workspaces/[id]/departments/[depId]/route.ts");

  assert.match(route, /leader_id\?: string \| null/);
  assert.match(route, /workspace_id_user_id/);
  assert.match(route, /membership\.status !== "active"/);
  assert.match(route, /membership\.department_id !== depId/);
  assert.match(route, /Leader must be an active member of this department/);
  assert.match(route, /data\.leader_id = leaderId/);
});

test("Teams cards render the stored leader and expose an admin editor", () => {
  const component = read("src/components/team/team-workspace.tsx");
  const page = read("src/app/(dashboard)/team/page.tsx");
  const overview = read("src/app/api/team/overview/route.ts");

  assert.match(component, /leader: department\.leader \?\? null/);
  assert.match(component, /leaderCandidates:/);
  assert.match(component, /copy\.editLeader/);
  assert.match(component, /onUpdateDepartmentLeader/);
  assert.match(component, /onClick=\{\(event\) => \{ event\.stopPropagation\(\); onToggleLeaderEditor\(\); \}\}/);
  assert.match(component, /disabled=\{savingLeader\}/);
  assert.match(component, /await onUpdateLeader\(event\.target\.value \|\| null\)/);
  assert.match(page, /return updateDepartmentLeader\(departmentId, leaderId\)/);
  assert.match(page, /t\("team\.couldNotUpdateDepartmentLeader"\)/);
  assert.match(overview, /leader_id: true/);
  assert.match(overview, /avatar_url: true/);
});

test("Teams use one card view with independently expandable member panels", () => {
  const component = read("src/components/team/team-workspace.tsx");

  assert.doesNotMatch(component, /type ActiveView/);
  assert.doesNotMatch(component, /function DepartmentDetails/);
  assert.doesNotMatch(component, /function MemberRoster/);
  assert.ok(component.includes("const [expandedTeamKeys, setExpandedTeamKeys]"));
  assert.ok(component.includes("const toggleExpandedTeam = (teamKey: string)"));
  assert.ok(component.includes("membersExpanded={expandedTeamKeys.has(card.key)}"));
  assert.ok(component.includes("onToggleMembers={() => toggleExpandedTeam(card.key)}"));
  assert.ok(component.includes('data-testid="team-members-panel"'));
  assert.ok(component.includes("aria-expanded={membersExpanded}"));
});
