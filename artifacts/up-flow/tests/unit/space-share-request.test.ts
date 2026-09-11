import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("space sharing creates an administrator request instead of granting access directly", () => {
  const route = read("src/app/api/spaces/[id]/share-requests/route.ts");
  const dialog = read("src/components/spaces/space-share-request-dialog.tsx");
  const sidebar = read("src/components/layout/sidebar/space-tree.tsx");

  assert.match(route, /source: "space_share_request"/);
  assert.match(route, /role: \{ in: \["owner", "admin"\] \}/);
  assert.match(route, /prisma\.notification\.createMany/);
  assert.doesNotMatch(route, /workspaceMember\.(create|update|upsert)/);
  assert.match(dialog, /\/api\/spaces\/\$\{spaceId\}\/share-requests/);
  assert.match(dialog, /status=active/);
  assert.match(sidebar, /setShareTarget\(sp\)/);
});

test("structural project operations are administrator-only in UI and API", () => {
  const spaceTree = read("src/components/layout/sidebar/space-tree.tsx");
  const projectsRoute = read("src/app/api/projects/route.ts");

  assert.match(spaceTree, /\{canManageWorkspace && \(/);
  assert.match(spaceTree, /setCreateListFor/);
  assert.match(spaceTree, /setCreateFolderTarget/);
  assert.match(spaceTree, /setRenameTarget/);
  assert.match(spaceTree, /handleDeleteSpace/);
  assert.match(projectsRoute, /!isWorkspaceAdminFor\(auth, auth\.currentWorkspaceId\)/);
});

test("Technical Support onboarding no longer recreates Client Channels", () => {
  const onboarding = read("src/lib/onboarding.ts");

  assert.doesNotMatch(onboarding, /projectName: "Client Channels"/);
  assert.match(
    onboarding,
    /support:\s*\{[\s\S]*?spaceName: "Support",[\s\S]*?projectName: "Onboarding"/,
  );
});
