import { NextRequest, NextResponse } from "next/server";

import {
  getGoogleAuthCallbackUrl,
  getGoogleAuthLoginErrorUrl,
  getGoogleAuthOrigin,
} from "@/lib/google-auth";
import { GOOGLE_CALENDAR_SCOPES } from "@/lib/google-calendar";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withErrorReporting } from "@/lib/with-error-reporting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function GET_handler(req: NextRequest) {
  const limit = await checkRateLimit(req, {
    windowMs: 60_000,
    max: 12,
    key: "google-sign-in",
    requireSharedStore: true,
  });
  if (!limit.ok) return rateLimitResponse(limit);

  const origin = getGoogleAuthOrigin(req);
  if (!origin) {
    return NextResponse.json(
      { error: "Google sign-in is not configured" },
      { status: 503 },
    );
  }

  const next = safeInternalPath(req.nextUrl.searchParams.get("next"));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: getGoogleAuthCallbackUrl(origin, next).toString(),
      scopes: GOOGLE_CALENDAR_SCOPES.join(" "),
      queryParams: {
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
      },
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(getGoogleAuthLoginErrorUrl(origin, "provider", next));
  }

  const response = NextResponse.redirect(data.url);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export const GET = withErrorReporting("api:auth/google:GET", GET_handler);
