import { NextRequest, NextResponse } from "next/server";
import { requireCurrentWorkspace } from "@/lib/api/scope";
import { requireAuth } from "@/lib/auth-response";
import {
  createGoogleCalendarConnectUrl,
  getGoogleCalendarBrowserOrigin,
  getGoogleCalendarConfig,
  getGoogleCalendarLoginRecoveryUrl,
  isGoogleCalendarCallbackOrigin,
} from "@/lib/google-calendar";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { withErrorReporting } from "@/lib/with-error-reporting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function GET_handler(req: NextRequest) {
  const result = await requireAuth();
  if (!result.ok) return result.response;
  const scope = await requireCurrentWorkspace(result.auth);
  if (!scope.ok) return scope.response;

  const config = getGoogleCalendarConfig();
  if (!config) {
    return NextResponse.json(
      { error: "Google Calendar integration is not configured" },
      { status: 503 },
    );
  }

  // The provider always returns to GOOGLE_CALENDAR_REDIRECT_URI. Do not
  // create an OAuth state from an alias host whose browser session cannot be
  // read on that canonical callback host.
  const browserOrigin = getGoogleCalendarBrowserOrigin(req.url, req.headers);
  if (!isGoogleCalendarCallbackOrigin(browserOrigin, config)) {
    const response = NextResponse.redirect(
      getGoogleCalendarLoginRecoveryUrl(config, "official_origin_required"),
    );
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }

  const limit = await checkRateLimit(req, {
    windowMs: 60_000,
    max: 10,
    key: "google-calendar-connect",
    requireSharedStore: true,
  });
  if (!limit.ok) return rateLimitResponse(limit);

  const authorizationUrl = await createGoogleCalendarConnectUrl({
    workspaceId: scope.workspaceId,
    userId: result.auth.prismaUser.id,
  });
  if (!authorizationUrl) {
    return NextResponse.json(
      { error: "Google Calendar integration is not configured" },
      { status: 503 },
    );
  }

  return NextResponse.redirect(authorizationUrl);
}

export const GET = withErrorReporting(
  "api:integrations/google-calendar/connect:GET",
  GET_handler,
);
