import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("login exposes Google as the only production sign-in method", () => {
  const page = read("src/app/login/page.tsx");
  const passwordRoute = read("src/app/api/auth/login/route.ts");

  assert.match(page, /\/api\/auth\/google\?next=/);
  assert.match(page, /Continuar com Google/);
  assert.doesNotMatch(page, /type="password"/);
  assert.doesNotMatch(page, /\/auth\/forgot/);
  assert.match(page, /process\.env\.NODE_ENV !== "production"/);
  assert.match(page, /\/api\/auth\/local-login/);
  assert.match(passwordRoute, /GOOGLE_SIGN_IN_REQUIRED/);
  assert.doesNotMatch(passwordRoute, /signInWithPassword/);
});

test("Google login uses PKCE callback and requests offline Calendar access", () => {
  const connect = read("src/app/api/auth/google/route.ts");
  const callback = read("src/app/auth/callback/route.ts");
  const middleware = read("src/middleware.ts");

  assert.match(connect, /signInWithOAuth/);
  assert.match(connect, /provider: "google"/);
  assert.match(connect, /GOOGLE_CALENDAR_SCOPES\.join\(" "\)/);
  assert.match(connect, /access_type: "offline"/);
  assert.match(connect, /prompt: "consent"/);
  assert.match(callback, /exchangeCodeForSession/);
  assert.match(callback, /connectGoogleCalendarFromSupabaseSession/);
  assert.match(middleware, /pathname === "\/auth\/callback"/);
});

test("the server rejects legacy sessions that were not authenticated by Google", () => {
  const helper = read("src/lib/auth-helpers.ts");
  const middleware = read("src/middleware.ts");
  const googleAuth = read("src/lib/google-auth.ts");

  assert.match(googleAuth, /hasGoogleIdentityProvider/);
  assert.match(helper, /hasGoogleIdentityProvider\(user\.app_metadata\)/);
  assert.match(middleware, /hasGoogleIdentityProvider\(got\.data\.user\.app_metadata\)/);
});

test("online scheduling requires the responsible member's Google connection", () => {
  const create = read("src/app/api/calendar/events/route.ts");
  const update = read("src/app/api/calendar/events/[id]/route.ts");
  const google = read("src/lib/google-calendar.ts");

  assert.match(create, /const organizerUserId = body\.responsible_user_id \|\| auth\.prismaUser\.id/);
  assert.match(create, /GOOGLE_CALENDAR_CONNECTION_REQUIRED/);
  assert.match(update, /prepareGoogleCalendarOrganizerChangeInTransaction/);
  assert.match(google, /sendUpdates=all/);
  assert.match(google, /attendees: attendeeEmails\.map/);
});
