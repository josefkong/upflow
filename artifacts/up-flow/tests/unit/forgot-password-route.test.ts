import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { readPasswordRecoveryState } from "../../src/lib/supabase/recovery-state";

const authEnvNames = [
  "NODE_ENV",
  "APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "REDIS_URL",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
] as const;

function snapshotEnv() {
  return Object.fromEntries(authEnvNames.map((name) => [name, process.env[name]]));
}

function restoreEnv(snapshot: Record<string, string | undefined>) {
  for (const name of authEnvNames) {
    const value = snapshot[name];
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
}

function configureRecoveryEnv() {
  process.env.NODE_ENV = "development";
  process.env.APP_URL = "https://app.example";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.test";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  delete process.env.REDIS_URL;
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
}

async function importFreshForgotRoute() {
  const rateLimitPath = require.resolve("../../src/lib/rate-limit");
  delete require.cache[rateLimitPath];
  const routePath = require.resolve("../../src/app/api/auth/forgot/route");
  delete require.cache[routePath];
  return import("../../src/app/api/auth/forgot/route");
}

function makeRequest(ip: string) {
  return new NextRequest("https://app.example/api/auth/forgot", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: JSON.stringify({ email: "person@example.com" }),
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

test("falls back to Supabase recovery email when custom token generation fails", async () => {
  const env = snapshotEnv();
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  configureRecoveryEnv();
  process.env.RESEND_API_KEY = "resend-key";
  process.env.EMAIL_FROM = "Up Flow <no-reply@app.example>";

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = requestUrl(input);
    urls.push(url);
    if (url.includes("/auth/v1/admin/generate_link")) {
      return new Response(JSON.stringify({ message: "redirect URL is not allowed" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (url.includes("/auth/v1/recover")) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  try {
    const { POST } = await importFreshForgotRoute();
    const response = await POST(makeRequest("203.0.113.201"));

    assert.equal(response.status, 202);
    assert.ok(urls.some((url) => url.includes("/auth/v1/admin/generate_link")));
    assert.ok(
      urls.some((url) => url.includes("/auth/v1/recover")),
      "a custom-link failure must try Supabase's native recovery email",
    );
  } finally {
    restoreEnv(env);
    globalThis.fetch = originalFetch;
  }
});

test("uses Supabase recovery directly when the custom email backend is not configured", async () => {
  const env = snapshotEnv();
  const originalFetch = globalThis.fetch;
  const urls: string[] = [];
  configureRecoveryEnv();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = requestUrl(input);
    urls.push(url);
    if (url.includes("/auth/v1/recover")) {
      return new Response(JSON.stringify({}), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  try {
    const { POST } = await importFreshForgotRoute();
    const response = await POST(makeRequest("203.0.113.204"));

    assert.equal(response.status, 202);
    assert.ok(
      !urls.some((url) => url.includes("/auth/v1/admin/generate_link")),
      "an undeliverable custom email must not consume a recovery token",
    );
    assert.ok(
      urls.some((url) => url.includes("/auth/v1/recover")),
      "an unconfigured custom email backend must use native recovery",
    );
  } finally {
    restoreEnv(env);
    globalThis.fetch = originalFetch;
  }
});

test("custom recovery email uses an opaque confirmation state instead of a direct recovery token", async () => {
  const env = snapshotEnv();
  const originalFetch = globalThis.fetch;
  configureRecoveryEnv();
  process.env.RESEND_API_KEY = "resend-key";
  process.env.EMAIL_FROM = "Up Flow <no-reply@app.example>";

  const actionLink =
    "https://project.supabase.test/auth/v1/verify?" +
    new URLSearchParams({
      token: "one-time-token",
      type: "recovery",
      redirect_to: "https://app.example/auth/reset",
    });
  const tokenHash = "one-time-token-hash";
  let email: { html?: string; text?: string } | null = null;
  let generateLinkBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    if (url.includes("/auth/v1/admin/generate_link")) {
      generateLinkBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(
        JSON.stringify({
          action_link: actionLink,
          hashed_token: tokenHash,
          verification_type: "recovery",
        }),
        {
        status: 200,
        headers: { "Content-Type": "application/json" },
        },
      );
    }
    if (url === "https://api.resend.com/emails") {
      email = JSON.parse(String(init?.body)) as { html?: string; text?: string };
      return new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  try {
    const { POST } = await importFreshForgotRoute();
    const response = await POST(makeRequest("203.0.113.203"));

    assert.equal(response.status, 202);
    const confirmationUrl = (email?.text ?? "").match(
      /https:\/\/app\.example\/auth\/reset\/confirm\?state=[A-Za-z0-9_-]+/,
    )?.[0];
    assert.ok(confirmationUrl, "email should contain an opaque confirmation URL");
    assert.ok(!email?.html?.includes(actionLink), "email must not expose a direct action link");
    assert.ok(!email?.text?.includes(actionLink), "plaintext fallback must not expose a direct action link");
    assert.ok(!email?.html?.includes(tokenHash), "email must not expose the recovery token hash");
    assert.ok(!email?.text?.includes(tokenHash), "plaintext fallback must not expose the recovery token hash");
    assert.equal(generateLinkBody?.redirect_to, undefined, "custom token generation must not need a redirect URL");
    const state = new URL(confirmationUrl!).searchParams.get("state");
    const payload = readPasswordRecoveryState({ state: state ?? "", secret: "service-role-key" });
    assert.equal(payload?.version, 2);
    assert.equal(payload?.tokenHash, tokenHash);
    assert.equal(payload?.audience, "https://app.example");
    assert.ok((payload?.expiresAt ?? 0) > Math.floor(Date.now() / 1000));
  } finally {
    restoreEnv(env);
    globalThis.fetch = originalFetch;
  }
});

test("reports a generic outage when neither reset-email provider accepts the request", async () => {
  const env = snapshotEnv();
  const originalFetch = globalThis.fetch;
  configureRecoveryEnv();

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ message: "provider unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })) as typeof fetch;

  try {
    const { POST } = await importFreshForgotRoute();
    const response = await POST(makeRequest("203.0.113.202"));

    assert.equal(response.status, 503);
    const body = await response.json();
    assert.match(String(body.error), /temporarily unavailable/i);
  } finally {
    restoreEnv(env);
    globalThis.fetch = originalFetch;
  }
});

test("propagates the Supabase email rate limit to the forgot-password UI", async () => {
  const env = snapshotEnv();
  const originalFetch = globalThis.fetch;
  configureRecoveryEnv();

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = requestUrl(input);
    if (url.includes("/auth/v1/recover")) {
      return new Response(
        JSON.stringify({
          code: "over_email_send_rate_limit",
          message: "email rate limit exceeded",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  try {
    const { POST } = await importFreshForgotRoute();
    const response = await POST(makeRequest("203.0.113.205"));

    assert.equal(response.status, 429);
  } finally {
    restoreEnv(env);
    globalThis.fetch = originalFetch;
  }
});

test("forgot-password UI confirms only the neutral accepted response", () => {
  const page = readFileSync("src/app/auth/forgot/page.tsx", "utf8");
  assert.match(page, /if \(res\.status === 202\)\s*\{[\s\S]*?setSent\(true\)/);
  assert.match(page, /else if \(res\.status === 429\)/);
  assert.match(page, /toast\.error\(t\("auth\.forgot\.requestFailed"\)\)/);
});
