import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  BASELINE_CONFIRMATION,
  STAGING_REF,
  assertManifestMatchesCurrentMigrations,
  assertStagingDatabaseTarget,
  classifyMigrationHistory,
  getFrozenMarketingB2BForeignKeyErrors,
  getExpectedAppTableNames,
  getLocalMigrations,
  getPostBaselineSalesChannelObjects,
  readBaselineManifest,
} = require("../../scripts/staging-prisma-baseline.cjs") as {
  BASELINE_CONFIRMATION: string;
  STAGING_REF: string;
  assertManifestMatchesCurrentMigrations: (
    manifest: unknown,
    migrations: unknown,
    options: { exact: boolean },
  ) => void;
  assertStagingDatabaseTarget: (
    env: Record<string, string | undefined>,
    manifest?: unknown,
  ) => unknown;
  classifyMigrationHistory: (
    rows: Array<Record<string, unknown>>,
    expectedMigrations: Array<string | { name: string; sha256?: string }>,
    options?: { allowLaterMigrations?: boolean },
  ) => { errors: string[]; isValid: boolean; isComplete: boolean; missingMigrationNames: string[] };
  getFrozenMarketingB2BForeignKeyErrors: (
    rows: Array<Record<string, unknown>>,
  ) => string[];
  getExpectedAppTableNames: () => string[];
  getLocalMigrations: () => Array<{ name: string; sha256: string }>;
  getPostBaselineSalesChannelObjects: (
    row: Record<string, unknown> | undefined,
  ) => string[];
  readBaselineManifest: () => {
    source_commit: string;
    staging_project_ref: string;
    production_project_ref: string;
    migrations: Array<{ name: string; sha256: string }>;
    required_extensions: string[];
  };
};

const baselineWorkflow = readFileSync(
  new URL("../../../../.github/workflows/baseline-staging.yml", import.meta.url),
  "utf8",
);
const baselineScript = readFileSync(
  new URL("../../scripts/staging-prisma-baseline.cjs", import.meta.url),
  "utf8",
);
const deployMigrationsScript = readFileSync(
  new URL("../../scripts/deploy-migrations.cjs", import.meta.url),
  "utf8",
);
const manifest = readBaselineManifest();

function completeRow(migration_name: string, checksum = "a".repeat(64)) {
  return {
    migration_name,
    checksum,
    finished_at: new Date("2026-07-27T00:00:00.000Z"),
    rolled_back_at: null,
  };
}

function frozenMarketingB2BForeignKeys() {
  return [
    {
      constraint_name: "MarketingB2BOnboardingForm_workspace_id_fkey",
      columns: ["workspace_id"],
      referenced_table_name: "Workspace",
      referenced_columns: ["id"],
      on_delete: "CASCADE",
      on_update: "CASCADE",
    },
    {
      constraint_name: "MarketingB2BOnboardingForm_onboarding_id_fkey",
      columns: ["onboarding_id"],
      referenced_table_name: "ClientOnboarding",
      referenced_columns: ["id"],
      on_delete: "CASCADE",
      on_update: "CASCADE",
    },
    {
      constraint_name: "MarketingB2BOnboardingForm_checklist_item_id_fkey",
      columns: ["checklist_item_id"],
      referenced_table_name: "OnboardingChecklistItem",
      referenced_columns: ["id"],
      on_delete: "CASCADE",
      on_update: "CASCADE",
    },
    {
      constraint_name: "MarketingB2BOnboardingForm_task_id_fkey",
      columns: ["task_id"],
      referenced_table_name: "Task",
      referenced_columns: ["id"],
      on_delete: "CASCADE",
      on_update: "CASCADE",
    },
    {
      constraint_name: "MarketingB2BOnboardingForm_company_id_fkey",
      columns: ["company_id"],
      referenced_table_name: "Company",
      referenced_columns: ["id"],
      on_delete: "CASCADE",
      on_update: "CASCADE",
    },
    {
      constraint_name: "MarketingB2BOnboardingForm_project_id_fkey",
      columns: ["project_id"],
      referenced_table_name: "Project",
      referenced_columns: ["id"],
      on_delete: "CASCADE",
      on_update: "CASCADE",
    },
    {
      constraint_name: "MarketingB2BOnboardingForm_completed_by_fkey",
      columns: ["completed_by"],
      referenced_table_name: "User",
      referenced_columns: ["id"],
      on_delete: "SET NULL",
      on_update: "CASCADE",
    },
  ];
}

function stagingEnvironment(overrides: Record<string, string | undefined> = {}) {
  const stagingRef = "rkfwtfwbhpydmhpqghlq";
  return {
    DATABASE_URL: `postgresql://postgres:example@db.${stagingRef}.supabase.co:5432/postgres?sslmode=require`,
    DIRECT_URL: `postgresql://postgres:example@db.${stagingRef}.supabase.co:5432/postgres?sslmode=require`,
    ...overrides,
  };
}

test("the frozen baseline prefix matches the reviewed migration tree", () => {
  const localMigrations = getLocalMigrations();
  const laterMigration = { name: "20269999999999_later_feature", sha256: "f".repeat(64) };

  assert.equal(manifest.migrations.length, 48);
  assertManifestMatchesCurrentMigrations(manifest, localMigrations, { exact: false });
  assert.doesNotThrow(() =>
    assertManifestMatchesCurrentMigrations(manifest, [...localMigrations, laterMigration], { exact: false }),
  );
  assert.throws(() =>
    assertManifestMatchesCurrentMigrations(manifest, [...localMigrations, laterMigration], { exact: true }),
  );
  assert.throws(() => assertManifestMatchesCurrentMigrations(manifest, localMigrations.slice(1), { exact: true }));
  assert.throws(() =>
    assertManifestMatchesCurrentMigrations(
      manifest,
      localMigrations.map((migration, index) =>
        index === 0 ? { ...migration, sha256: "0".repeat(64) } : migration,
      ),
      { exact: true },
    ),
  );
  assert.equal(manifest.staging_project_ref, "rkfwtfwbhpydmhpqghlq");
  assert.equal(manifest.production_project_ref, "axppobjuaddsgzrmolge");
  assert.equal(manifest.source_commit, "3e0987b16e2a4490fae20400a7722728168a5701");
  assert.deepEqual(manifest.required_extensions, ["pgcrypto", "pg_trgm"]);
});

test("the clone guard knows every unmapped application table", () => {
  const tableNames = getExpectedAppTableNames();

  assert.equal(tableNames.length, 62);
  assert.ok(tableNames.includes("GoogleCalendarConnection"));
  assert.ok(tableNames.includes("GoogleCalendarOAuthState"));
  assert.ok(tableNames.includes("GoogleCalendarEventLink"));
  assert.ok(tableNames.includes("GoogleCalendarSyncJob"));
  assert.ok(tableNames.includes("SidebarSpaceHide"));
  assert.ok(tableNames.includes("ProjectMember"));
  assert.ok(tableNames.includes("EquipmentItem"));
  assert.ok(tableNames.includes("TaskFollower"));
  assert.ok(tableNames.includes("User"));
});

test("only the reviewed staging database identity is accepted", () => {
  assert.doesNotThrow(() => assertStagingDatabaseTarget(stagingEnvironment()));
  assert.doesNotThrow(() =>
    assertStagingDatabaseTarget(
      stagingEnvironment({
        DATABASE_URL:
          "postgresql://postgres.rkfwtfwbhpydmhpqghlq:example@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
        DIRECT_URL:
          "postgresql://postgres.rkfwtfwbhpydmhpqghlq:example@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=require",
      }),
    ),
  );
  assert.throws(() =>
    assertStagingDatabaseTarget(
      stagingEnvironment({
        DIRECT_URL: "postgresql://postgres.rkfwtfwbhpydmhpqghlq:example@aws-1-sa-east-1.pooler.supabase.com:6543/postgres",
      }),
    ),
  );
  assert.throws(() =>
    assertStagingDatabaseTarget(
      stagingEnvironment({ UPFLOW_STAGING_PROJECT_REF: "wrongprojectref" }),
    ),
  );
  assert.throws(() =>
    assertStagingDatabaseTarget(
      stagingEnvironment({
        DIRECT_URL: "postgresql://postgres:example@db.axppobjuaddsgzrmolge.supabase.co:5432/postgres?sslmode=require",
        DATABASE_URL: "postgresql://postgres:example@db.axppobjuaddsgzrmolge.supabase.co:5432/postgres?sslmode=require",
      }),
    ),
  );
  assert.throws(() =>
    assertStagingDatabaseTarget(
      stagingEnvironment({ DATABASE_URL: "postgresql://postgres:example@db.rkfwtfwbhpydmhpqghlq.supabase.co:5432/other" }),
    ),
  );
});

test("only a clean ordered baseline prefix may be resumed", () => {
  const expected = [
    { name: "20260000000000_first", sha256: "a".repeat(64) },
    { name: "20260000000001_second", sha256: "b".repeat(64) },
    { name: "20260000000002_third", sha256: "c".repeat(64) },
  ];

  const empty = classifyMigrationHistory([], expected);
  assert.equal(empty.isValid, true);
  assert.equal(empty.isComplete, false);
  assert.deepEqual(empty.missingMigrationNames, expected.map((migration) => migration.name));

  const prefix = classifyMigrationHistory([completeRow(expected[0].name)], expected);
  assert.equal(prefix.isValid, true);
  assert.deepEqual(prefix.missingMigrationNames, [expected[1].name, expected[2].name]);

  assert.equal(
    classifyMigrationHistory([completeRow(expected[1].name, expected[1].sha256)], expected).isValid,
    false,
  );
  assert.equal(
    classifyMigrationHistory([completeRow(expected[0].name, "f".repeat(64))], expected).isValid,
    false,
  );
  assert.equal(
    classifyMigrationHistory(
      [{ ...completeRow(expected[0].name, expected[0].sha256), finished_at: null }],
      expected,
    ).isValid,
    false,
  );
  assert.equal(
    classifyMigrationHistory(
      [{ ...completeRow(expected[0].name, expected[0].sha256), rolled_back_at: new Date() }],
      expected,
    ).isValid,
    false,
  );

  const fullHistory = expected.map((migration) => completeRow(migration.name, migration.sha256));
  const laterHistory = [...fullHistory, completeRow("20260000000003_later", "d".repeat(64))];
  assert.equal(classifyMigrationHistory(laterHistory, expected).isValid, false);
  assert.equal(
    classifyMigrationHistory(laterHistory, expected, { allowLaterMigrations: true }).isValid,
    true,
  );
});

test("the migration-aware catalog gate requires the seven frozen Marketing B2B foreign keys", () => {
  const foreignKeys = frozenMarketingB2BForeignKeys();

  assert.equal(foreignKeys.length, 7);
  assert.deepEqual(getFrozenMarketingB2BForeignKeyErrors(foreignKeys), []);

  const missing = foreignKeys.slice(1);
  assert.match(
    getFrozenMarketingB2BForeignKeyErrors(missing).join("\n"),
    /missing frozen foreign key MarketingB2BOnboardingForm_workspace_id_fkey/,
  );

  const wrongDeleteAction = foreignKeys.map((foreignKey) =>
    foreignKey.constraint_name === "MarketingB2BOnboardingForm_completed_by_fkey"
      ? { ...foreignKey, on_delete: "CASCADE" }
      : foreignKey,
  );
  assert.match(
    getFrozenMarketingB2BForeignKeyErrors(wrongDeleteAction).join("\n"),
    /expected completed_by -> User\(id\), ON DELETE SET NULL, ON UPDATE CASCADE/,
  );

  const wrongReference = foreignKeys.map((foreignKey) =>
    foreignKey.constraint_name === "MarketingB2BOnboardingForm_project_id_fkey"
      ? { ...foreignKey, referenced_table_name: "Company" }
      : foreignKey,
  );
  assert.match(
    getFrozenMarketingB2BForeignKeyErrors(wrongReference).join("\n"),
    /expected project_id -> Project\(id\), ON DELETE CASCADE, ON UPDATE CASCADE/,
  );

  assert.match(
    getFrozenMarketingB2BForeignKeyErrors([
      ...foreignKeys,
      {
        ...foreignKeys[0],
        constraint_name: "MarketingB2BOnboardingForm_unreviewed_fkey",
      },
    ]).join("\n"),
    /unexpected foreign key MarketingB2BOnboardingForm_unreviewed_fkey/,
  );
});

test("the frozen 48-migration baseline refuses post-baseline sales-channel objects", () => {
  assert.deepEqual(
    getPostBaselineSalesChannelObjects({
      has_company_sales_channel: false,
      has_client_sales_channel_enum: false,
    }),
    [],
  );
  assert.deepEqual(
    getPostBaselineSalesChannelObjects({
      has_company_sales_channel: true,
      has_client_sales_channel_enum: false,
    }),
    ["Company.sales_channel"],
  );
  assert.deepEqual(
    getPostBaselineSalesChannelObjects({
      has_company_sales_channel: true,
      has_client_sales_channel_enum: true,
    }),
    ["Company.sales_channel", "ClientSalesChannel enum"],
  );
});

test("the one-time workflow is manual, staging-only, and cannot deploy", () => {
  assert.match(baselineWorkflow, /workflow_dispatch:/);
  assert.match(baselineWorkflow, /refs\/heads\/staging/);
  assert.match(baselineWorkflow, new RegExp(BASELINE_CONFIRMATION));
  assert.match(baselineWorkflow, /environment: staging-bootstrap/);
  assert.match(baselineWorkflow, /UPFLOW_STAGING_BASELINE_MIGRATION_URL/);
  assert.match(baselineWorkflow, /Read the frozen schema source commit/);
  assert.match(baselineWorkflow, /fetch-depth: 0/);
  assert.match(baselineWorkflow, /git merge-base --is-ancestor/);
  assert.match(baselineWorkflow, /steps\.frozen-source\.outputs\.commit/);
  assert.match(baselineWorkflow, /STAGING_PRISMA_BASELINE_SCHEMA_PATH/);
  assert.match(baselineWorkflow, /STAGING_PRISMA_BASELINE_MIGRATIONS_DIRECTORY/);
  assert.doesNotMatch(baselineWorkflow, /UPFLOW_STAGING_MIGRATION_URL/);
  assert.doesNotMatch(baselineWorkflow, /UPFLOW_STAGING_PROJECT_REF/);
  assert.doesNotMatch(baselineWorkflow, /UPFLOW_PRODUCTION_PROJECT_REF/);
  assert.doesNotMatch(baselineWorkflow, /VERCEL/);
  assert.doesNotMatch(baselineWorkflow, /db:migrate:deploy/);
  assert.doesNotMatch(baselineWorkflow, /db:push/);
  assert.doesNotMatch(baselineWorkflow, /migrate reset/);
  assert.equal(STAGING_REF, "refs/heads/staging");
});

test("the history-only script never applies a migration or resets a database", () => {
  assert.match(baselineScript, /getFrozenBaselineSourcePaths/);
  assert.match(baselineScript, /assertFrozenMarketingB2BForeignKeys/);
  assert.match(baselineScript, /assertNoPostBaselineSalesChannelObjects/);
  assert.doesNotMatch(baselineScript, /--from-schema-datamodel/);
  assert.match(baselineScript, /migrate", "resolve", "--schema", frozenSource\.schemaPath, "--applied"/);
  assert.match(baselineScript, /migrate", "status", "--schema", frozenSource\.schemaPath/);
  assert.doesNotMatch(baselineScript, /migrate", "deploy/);
  assert.doesNotMatch(baselineScript, /db push/);
  assert.doesNotMatch(baselineScript, /migrate reset/);
});

test("the retired partial baseline cannot be invoked by the normal migration runner", () => {
  assert.match(deployMigrationsScript, /PRISMA_BASELINE_EXISTING_DB has been retired/);
  assert.doesNotMatch(deployMigrationsScript, /baselineMigrations/);
});
