import assert from "node:assert/strict";
import test from "node:test";
import { toPrismaRuntimeDatabaseUrl } from "../../src/lib/prisma-url";

test("enables PgBouncer compatibility for the Supabase transaction pooler", () => {
  const rawUrl =
    "postgresql://postgres.project:example@aws-1-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require";

  const url = new URL(toPrismaRuntimeDatabaseUrl(rawUrl));

  assert.equal(url.searchParams.get("pgbouncer"), "true");
  assert.equal(url.searchParams.get("connection_limit"), "1");
  assert.equal(url.searchParams.get("pool_timeout"), "20");
  assert.equal(url.searchParams.get("sslmode"), "require");
});

test("normalizes the Supabase session pooler to transaction mode", () => {
  const sessionPoolerUrl =
    "postgresql://postgres.project:example@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";
  const directUrl = "postgresql://postgres:example@db.project.supabase.co:5432/postgres";

  const normalizedPoolerUrl = new URL(
    toPrismaRuntimeDatabaseUrl(sessionPoolerUrl),
  );
  assert.equal(normalizedPoolerUrl.port, "6543");
  assert.equal(normalizedPoolerUrl.searchParams.get("pgbouncer"), "true");
  assert.equal(
    new URL(toPrismaRuntimeDatabaseUrl(directUrl)).searchParams.has("pgbouncer"),
    false,
  );
});

test("allows the local Next.js process to use a wider bounded transaction pool", () => {
  const sessionPoolerUrl =
    "postgresql://postgres.project:example@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";
  const url = new URL(
    toPrismaRuntimeDatabaseUrl(sessionPoolerUrl, { connectionLimit: 5 }),
  );

  assert.equal(url.port, "6543");
  assert.equal(url.searchParams.get("pgbouncer"), "true");
  assert.equal(url.searchParams.get("connection_limit"), "5");
  assert.equal(url.searchParams.get("pool_timeout"), "20");
});

test("keeps malformed database URLs unchanged", () => {
  assert.equal(toPrismaRuntimeDatabaseUrl("not-a-database-url"), "not-a-database-url");
});
