import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { emailIsConfigured, sendEmail } from "@/lib/email/send";
import { passwordResetEmail } from "@/lib/email/templates";
import { getEmailOrigin, EmailOriginError } from "@/lib/email/origin";
import { logError } from "@/lib/log-error";
import { createPasswordRecoveryStateConfirmationUrl } from "@/lib/supabase/recovery-state";
import { withErrorReporting } from "@/lib/with-error-reporting";

export const runtime = "nodejs";

/**
 * Kick off a password reset.
 *
 * We respond 202 for accepted reset requests so we never reveal whether an
 * address has an account. Custom Resend email is used when fully configured.
 * If that path cannot deliver a usable link, we fall back to Supabase Auth's
 * native recovery email. Infrastructure failures use a generic 503 instead
 * of pretending that a link was sent.
 */
async function POST_handler(req: NextRequest) {
  const rl = await checkRateLimit(req, {
    windowMs: 60_000,
    max: 5,
    key: "forgot",
    requireSharedStore: true,
  });
  if (!rl.ok) return rateLimitResponse(rl);

  const body = (await req.json().catch(() => ({}))) as { email?: string };
  const email = body.email?.trim().toLowerCase();

  const NEUTRAL = NextResponse.json({ status: "accepted" }, { status: 202 });

  if (!email) return NEUTRAL;
  // Cheap shape check; full validation happens at Supabase.
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NEUTRAL;

  let redirectTo: string;
  try {
    redirectTo = `${getEmailOrigin(req)}/auth/reset`;
  } catch (err) {
    // In production with no trusted APP_URL we refuse to build a recovery
    // link from request headers. This is a global configuration failure, not
    // an account-specific response, so tell the UI to retry instead of
    // claiming that an email was sent.
    if (err instanceof EmailOriginError) {
      logError("auth:forgot:origin", err);
      return unavailableResponse();
    }
    throw err;
  }

  const sentCustomEmail = await sendCustomResetEmail(email, redirectTo);
  if (sentCustomEmail) return NEUTRAL;

  const recoveryResult = await sendSupabaseRecoveryEmail(email, redirectTo);
  if (recoveryResult === "rate_limited") {
    return NextResponse.json(
      { error: "Too many password reset requests. Please try again later." },
      { status: 429 },
    );
  }

  if (recoveryResult !== "sent") return unavailableResponse();

  return NEUTRAL;
}

function unavailableResponse() {
  return NextResponse.json(
    { error: "Password reset is temporarily unavailable. Please try again shortly." },
    { status: 503 },
  );
}

async function sendCustomResetEmail(email: string, redirectTo: string): Promise<boolean> {
  // Avoid generating a recovery token that cannot be delivered. Generating
  // one here and immediately asking Supabase to send another can trip Auth's
  // per-user recovery interval, causing the native fallback to return 429.
  if (!emailIsConfigured()) return false;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    logError(
      "auth:forgot:custom-email",
      new Error("SUPABASE_SERVICE_ROLE_KEY not set; using Supabase recovery email fallback"),
    );
    return false;
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    if (
      error ||
      !data?.properties?.hashed_token ||
      data.properties.verification_type !== "recovery"
    ) {
      // This can mean an unknown user, but it can also mean that Supabase
      // rejected the request or the service key is invalid. Let the native
      // recovery endpoint make the account-enumeration-safe decision instead
      // of falsely reporting a successful email.
      logError("auth:forgot:link", error ?? new Error("missing recovery token hash"), { email });
      return false;
    }

    // Do not put Supabase's recovery token in the email. Mail scanners can
    // prefetch and consume one-time links before the recipient clicks. The
    // encrypted state survives email-link tracking and is resolved only after
    // an explicit user action. We deliberately verify the token hash in the
    // browser instead of following the server-generated action link: that
    // avoids a PKCE callback with no originating browser verifier.
    const resetUrl = createPasswordRecoveryStateConfirmationUrl({
      appOrigin: new URL(redirectTo).origin,
      tokenHash: data.properties.hashed_token,
      secret: serviceKey,
    });
    const rendered = passwordResetEmail({
      resetUrl,
      recipientEmail: email,
    });
    const result = await sendEmail({
      to: email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      scope: "auth:forgot",
    });

    if (!result.ok) {
      logError("auth:forgot:custom-email", new Error(result.error ?? "email send failed"), {
        email,
      });
      return false;
    }

    // In development, sendEmail() records the rendered message in the
    // terminal and reports devMode instead of delivering it. That is useful
    // for contributors, but the password-recovery UI explicitly tells the
    // user to check their inbox. Treat the console-only path as undelivered
    // so the native Supabase recovery email gets a chance to send.
    if (result.devMode) return false;

    return true;
  } catch (err) {
    logError("auth:forgot:custom-email", err, { email });
    return false;
  }
}

type SupabaseRecoveryResult = "sent" | "rate_limited" | "failed";

async function sendSupabaseRecoveryEmail(
  email: string,
  redirectTo: string,
): Promise<SupabaseRecoveryResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    logError("auth:forgot:supabase-recovery", new Error("Supabase public auth env is not set"));
    return "failed";
  }

  try {
    const supabase = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      logError("auth:forgot:supabase-recovery", error, { email });
      if (error.status === 429 || error.code === "over_email_send_rate_limit") {
        return "rate_limited";
      }
      return "failed";
    }
    return "sent";
  } catch (err) {
    logError("auth:forgot:supabase-recovery", err, { email });
    return "failed";
  }
}

export const POST = withErrorReporting("api:auth/forgot:POST", POST_handler);
