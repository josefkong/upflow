import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const teamWorkspace = readFileSync(
  join(process.cwd(), "src/components/team/team-workspace.tsx"),
  "utf8",
);

test("team metric-card titles follow localized title casing", () => {
  assert.match(teamWorkspace, /totalMembers: "Total Members"/);
  assert.match(teamWorkspace, /pendingInvites: "Pending Invites"/);
  assert.match(teamWorkspace, /activeTeams: "Active Teams"/);

  assert.match(teamWorkspace, /totalMembers: "Total de Membros"/);
  assert.match(teamWorkspace, /pendingInvites: "Convites Pendentes"/);
  assert.match(teamWorkspace, /activeTeams: "Equipes Ativas"/);
});

test("team metric cards reserve equal title and value rows at every breakpoint", () => {
  assert.match(
    teamWorkspace,
    /grid h-12 w-40 min-w-0 shrink content-center grid-rows-\[1rem_1\.75rem\]/,
  );
  assert.match(
    teamWorkspace,
    /line-clamp-1 flex h-4 min-w-0 items-center text-xs font-medium leading-4/,
  );
  assert.match(teamWorkspace, /flex h-7 min-w-0 items-end gap-2/);
  assert.match(teamWorkspace, /line-clamp-2 min-w-0/);
});

test("team metrics keep the icon left and vertically center the copy at every breakpoint", () => {
  assert.match(teamWorkspace, /items-center justify-start gap-3\.5/);
  assert.doesNotMatch(teamWorkspace, /justify-(?:center|end) gap-3\.5/);
  assert.match(teamWorkspace, /h-12 w-40 min-w-0 shrink content-center/);
});

test("team metric cards only use four columns when their copy cannot overlap", () => {
  assert.match(
    teamWorkspace,
    /grid gap-3 \[grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,15rem\),1fr\)\)\]/,
  );
  assert.match(teamWorkspace, /line-clamp-1 flex h-4 min-w-0 items-center/);
});
