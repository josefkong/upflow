import { NextRequest, NextResponse } from "next/server";
import {
  TEST_AUTH_COOKIE,
  isTestLoginEnabled,
  signTestAuthCookie,
} from "@/lib/test-auth";
import { withErrorReporting } from "@/lib/with-error-reporting";

export const dynamic = "force-dynamic";

function isLoopbackHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function isTrustedLocalRequest(req: NextRequest): boolean {
  if (process.env.NODE_ENV === "production") return false;

  const origin = req.headers.get("origin");
  const host = req.headers.get("host");
  if (!origin || !host) return false;

  try {
    const parsed = new URL(origin);
    const requestOrigin = new URL(`${req.nextUrl.protocol}//${host}`);
    return isLoopbackHost(parsed.hostname) && parsed.origin === requestOrigin.origin;
  } catch {
    return false;
  }
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

async function postHandler(req: NextRequest) {
  if (!isTestLoginEnabled() || !isTrustedLocalRequest(req)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const admins = adminEmails();
  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const requestedEmail = body.email?.trim().toLowerCase();
  const email = requestedEmail && admins.includes(requestedEmail) ? requestedEmail : admins[0];

  if (!email) {
    return NextResponse.json({ error: "Local administrator is not configured" }, { status: 503 });
  }

  const signed = await signTestAuthCookie(email);
  if (!signed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: TEST_AUTH_COOKIE,
    value: signed,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60,
  });
  return response;
}

export const POST = withErrorReporting("api:auth/local-login:POST", postHandler);
