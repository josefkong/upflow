import { after, NextRequest, NextResponse } from "next/server";

import { getAuthResult } from "@/lib/auth-helpers";
import {
  getGoogleAuthLoginErrorUrl,
  getGoogleAuthOrigin,
} from "@/lib/google-auth";
import {
  connectGoogleCalendarFromSupabaseSession,
  syncGoogleCalendarAgenda,
} from "@/lib/google-calendar";
import { logError } from "@/lib/log-error";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { withErrorReporting } from "@/lib/with-error-reporting";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function privateRedirect(url: URL) {
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

async function GET_handler(req: NextRequest) {
  const origin = getGoogleAuthOrigin(req);
  const next = safeInternalPath(req.nextUrl.searchParams.get("next"));
  if (!origin) {
    return NextResponse.json(
      { error: "Google sign-in is not configured" },
      { status: 503 },
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  if (!code || code.length > 8_192 || req.nextUrl.searchParams.has("error")) {
    return privateRedirect(getGoogleAuthLoginErrorUrl(origin, "callback", next));
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const session = data.session;
  if (error || !session?.user.email) {
    logError(
      "auth:google-callback:exchange",
      error ?? new Error("Google OAuth callback did not create a Supabase session"),
    );
    return privateRedirect(getGoogleAuthLoginErrorUrl(origin, "callback", next));
  }

  const auth = await getAuthResult();
  if (auth.kind !== "ok") {
    await supabase.auth.signOut().catch(() => undefined);
    return privateRedirect(getGoogleAuthLoginErrorUrl(origin, "account", next));
  }

  const calendarConnection = await connectGoogleCalendarFromSupabaseSession({
    workspaceId: auth.user.currentWorkspaceId,
    userId: auth.user.prismaUser.id,
    authenticatedEmail: session.user.email,
    accessToken: session.provider_token ?? null,
    refreshToken: session.provider_refresh_token ?? null,
  });

  if (calendarConnection.ok) {
    after(() =>
      syncGoogleCalendarAgenda({
        workspaceId: auth.user.currentWorkspaceId,
        userId: auth.user.prismaUser.id,
      }).catch((syncError) =>
        logError("auth:google-callback:agenda-sync", syncError),
      ),
    );
  } else {
    logError(
      "auth:google-callback:calendar",
      new Error("Google sign-in succeeded but Calendar authorization was not persisted"),
      { user_id: auth.user.prismaUser.id, workspace_id: auth.user.currentWorkspaceId },
    );
  }

  const target = new URL(next, origin);
  if (!calendarConnection.ok && target.pathname === "/calendar") {
    target.searchParams.set("google_calendar", "error");
  }
  return privateRedirect(target);
}

export const GET = withErrorReporting("auth/google-callback:GET", GET_handler);
