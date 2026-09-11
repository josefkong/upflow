import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { TEST_AUTH_COOKIE } from "../../src/lib/test-auth";

const envNames = ["NODE_ENV", "TEST_LOGIN_TOKEN", "ADMIN_EMAILS"] as const;

function snapshotEnv() {
  return Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const name of envNames) {
    const value = snapshot[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

async function importFreshRoute() {
  const routePath = require.resolve("../../src/app/api/auth/local-login/route");
  delete require.cache[routePath];
  return import("../../src/app/api/auth/local-login/route");
}

function localRequest(origin = "http://localhost:3000") {
  return new NextRequest("http://localhost:3000/api/auth/local-login", {
    method: "POST",
    headers: { origin, host: "localhost:3000", "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@example.com" }),
  });
}

test("creates a signed local admin session in development", async () => {
  const env = snapshotEnv();
  process.env.NODE_ENV = "development";
  process.env.TEST_LOGIN_TOKEN = "local-test-token";
  process.env.ADMIN_EMAILS = "admin@example.com";

  try {
    const { POST } = await importFreshRoute();
    const response = await POST(localRequest());

    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie") ?? "", new RegExp(`^${TEST_AUTH_COOKIE}=`));
  } finally {
    restoreEnv(env);
  }
});

test("does not expose local login in production", async () => {
  const env = snapshotEnv();
  process.env.NODE_ENV = "production";
  process.env.TEST_LOGIN_TOKEN = "local-test-token";
  process.env.ADMIN_EMAILS = "admin@example.com";

  try {
    const { POST } = await importFreshRoute();
    const response = await POST(localRequest());
    assert.equal(response.status, 404);
  } finally {
    restoreEnv(env);
  }
});

test("rejects requests from a non-loopback origin", async () => {
  const env = snapshotEnv();
  process.env.NODE_ENV = "development";
  process.env.TEST_LOGIN_TOKEN = "local-test-token";
  process.env.ADMIN_EMAILS = "admin@example.com";

  try {
    const { POST } = await importFreshRoute();
    const response = await POST(localRequest("https://malicious.example"));
    assert.equal(response.status, 404);
  } finally {
    restoreEnv(env);
  }
});
