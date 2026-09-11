import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  TEST_AUTH_COOKIE,
  isTestLoginEnabled,
  signTestAuthCookie,
} from "@/lib/test-auth";
import { withErrorReporting } from "@/lib/with-error-reporting";
import { logError } from "@/lib/log-error";

async function tryDevPasswordLogin(email: string, password: string) {
  if (!isTestLoginEnabled()) return null;

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { email: true, password_hash: true },
    });
    if (!user?.password_hash) return null;

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 },
      );
    }

    const signed = await signTestAuthCookie(user.email);
    if (!signed) return null;

    const res = NextResponse.json({ ok: true });
    res.cookies.set({
      name: TEST_AUTH_COOKIE,
      value: signed,
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60,
    });
    return res;
  } catch (err) {
    logError("api:auth/login:dev-password", err, { email });
    return NextResponse.json(
      {
        error:
          "Local development login is enabled, but the database is not reachable.",
      },
      { status: 503 },
    );
  }
}

async function POST_handler(req: NextRequest) {
  const rl = await checkRateLimit(req, {
    windowMs: 60_000,
    max: 10,
    key: "login",
    requireSharedStore: true,
  });
  if (!rl.ok) return rateLimitResponse(rl);
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
    }

    const devLogin = await tryDevPasswordLogin(email, password);
    if (devLogin) return devLogin;

    return NextResponse.json(
      {
        error: "Password sign-in is disabled. Continue with Google.",
        code: "GOOGLE_SIGN_IN_REQUIRED",
      },
      { status: 410 },
    );
  } catch (err) {
    // Forward the real exception (stack, cause) to the tracker BEFORE we
    // serialize a generic 500 to the client. Without this, on-call would
    // only see the wrapper's synthetic "responded 500" marker — useful for
    // counting incidents, useless for root-cause.
    logError("api:auth/login:POST", err);
    return NextResponse.json({ error: "Login is temporarily unavailable" }, { status: 500 });
  }
}
export const POST = withErrorReporting("api:auth/login:POST", POST_handler);
