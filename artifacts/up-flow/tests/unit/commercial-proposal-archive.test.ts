import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ROOT = join(__dirname, "..", "..");
const read = (file: string) => readFileSync(join(ROOT, file), "utf8");

test("proposal uploads are preserved as versioned archive documents", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260825153000_add_commercial_proposal_archive/migration.sql",
  );
  const confirmationMigration = read(
    "prisma/migrations/20260825154500_backfill_commercial_proposal_confirmation/migration.sql",
  );
  const proposalRoute = read(
    "src/app/api/commercial/leads/[id]/proposal/route.ts",
  );

  assert.match(schema, /model CommercialProposalDocument/);
  assert.match(schema, /storage_path\s+String\s+@unique/);
  assert.match(migration, /INSERT INTO "CommercialProposalDocument"/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE "CommercialProposalDocument"/);
  assert.match(confirmationMigration, /lead\."stage" IN \('awaiting_response', 'completed'\)/);
  assert.match(proposalRoute, /commercialProposalDocument\.create/);
  assert.match(proposalRoute, /removed_from_lead_at: now/);
  assert.match(proposalRoute, /preserved_in_proposal_archive: true/);
  assert.doesNotMatch(proposalRoute, /if \(previousBucket/);
});

test("Propostas is a secure automatic folder archive instead of a task board", () => {
  const page = read("src/app/(dashboard)/projects/[id]/page.tsx");
  const component = read(
    "src/components/commercial/commercial-proposal-archive.tsx",
  );
  const listRoute = read("src/app/api/commercial/proposals/route.ts");
  const downloadRoute = read("src/app/api/commercial/proposals/[id]/route.ts");
  const tasksRoute = read("src/app/api/tasks/route.ts");
  const archiveHelper = read("src/lib/commercial-proposal-archive.ts");

  assert.match(page, /isCommercialProposalArchiveProject/);
  assert.match(page, /<CommercialProposalArchive projectId=\{id\}/);
  assert.match(component, /grid-cols-1[\s\S]*sm:grid-cols-2[\s\S]*xl:grid-cols-3/);
  assert.match(component, /proposalArchive\.openFolder/);
  assert.match(component, /api\/commercial\/proposals\/\$\{document\.id\}/);
  assert.match(listRoute, /canReadProject/);
  assert.match(listRoute, /commercialProposalDocument\.findMany/);
  assert.match(listRoute, /const folders = new Map/);
  assert.match(downloadRoute, /canReadProject/);
  assert.match(downloadRoute, /createSignedUrl\(document\.storage_path, 60/);
  assert.match(tasksRoute, /isCommercialSystemFlowProject/);
  assert.match(tasksRoute, /Novas tarefas devem ser iniciadas no projeto Leads/);
  assert.match(archiveHelper, /projectName === "proposals"/);
  assert.match(archiveHelper, /spaceName === "commercial"/);
});
