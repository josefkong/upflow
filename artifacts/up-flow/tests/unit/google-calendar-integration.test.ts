import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  GOOGLE_CALENDAR_SCOPES,
  buildGoogleCalendarEventPayload,
  createGoogleCalendarPkceChallenge,
  decryptGoogleCalendarSecret,
  encryptGoogleCalendarSecret,
  getGoogleCalendarBrowserOrigin,
  getGoogleCalendarConfig,
  getGoogleCalendarAuthorizationUrl,
  getGoogleCalendarLoginRecoveryUrl,
  getGoogleCalendarResultUrl,
  isGoogleCalendarCallbackOrigin,
  toGoogleCalendarAgendaEntry,
} from "@/lib/google-calendar";

const ROOT = join(__dirname, "..", "..");
const TEST_ENCRYPTION_KEY = "unit-test-google-calendar-token-encryption-key";
const GOOGLE_CALENDAR_ENV_KEYS = [
  "GOOGLE_CALENDAR_CLIENT_ID",
  "GOOGLE_CALENDAR_CLIENT_SECRET",
  "GOOGLE_CALENDAR_REDIRECT_URI",
  "GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY",
] as const;

function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");
}

function withGoogleCalendarEnv(
  values: Partial<Record<(typeof GOOGLE_CALENDAR_ENV_KEYS)[number], string>>,
  callback: () => void,
) {
  const previous = new Map(
    GOOGLE_CALENDAR_ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  try {
    for (const key of GOOGLE_CALENDAR_ENV_KEYS) {
      const value = values[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    callback();
  } finally {
    for (const key of GOOGLE_CALENDAR_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Google Calendar provider secrets are encrypted with authenticated encryption", () => {
  const secret = "refresh-token-that-must-never-leave-the-server";
  const encrypted = encryptGoogleCalendarSecret(secret, TEST_ENCRYPTION_KEY);

  assert.notEqual(encrypted, secret);
  assert.equal(
    decryptGoogleCalendarSecret(encrypted, TEST_ENCRYPTION_KEY),
    secret,
  );
  const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith("A") ? "B" : "A"}`;
  assert.throws(
    () => decryptGoogleCalendarSecret(tampered, TEST_ENCRYPTION_KEY),
    /could not be decrypted/,
  );
  assert.throws(
    () => decryptGoogleCalendarSecret(encrypted, "a different server-side key"),
    /could not be decrypted/,
  );
});

test("Google OAuth authorization URL uses PKCE, offline access, and only required scopes", () => {
  const verifier = "a".repeat(64);
  const url = new URL(
    getGoogleCalendarAuthorizationUrl({
      config: {
        clientId: "client-id.apps.googleusercontent.com",
        clientSecret: "server-only-client-secret",
        redirectUri:
          "https://staging.example.com/api/integrations/google-calendar/callback",
        tokenEncryptionKey: TEST_ENCRYPTION_KEY,
      },
      state: "state-value-that-is-long-enough-to-be-safe",
      codeChallenge: createGoogleCalendarPkceChallenge(verifier),
    }),
  );

  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://staging.example.com/api/integrations/google-calendar/callback",
  );
  assert.equal(url.searchParams.get("scope"), GOOGLE_CALENDAR_SCOPES.join(" "));
  assert.deepEqual(GOOGLE_CALENDAR_SCOPES, [
    "openid",
    "email",
    "profile",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  ]);
});

test("Google OAuth configuration rejects an interceptable callback URL but allows HTTPS and local loopback", () => {
  const credentials = {
    GOOGLE_CALENDAR_CLIENT_ID: "client-id.apps.googleusercontent.com",
    GOOGLE_CALENDAR_CLIENT_SECRET: "server-only-client-secret",
    GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  };

  withGoogleCalendarEnv(
    {
      ...credentials,
      GOOGLE_CALENDAR_REDIRECT_URI: "http://staging.example.com/callback",
    },
    () => assert.equal(getGoogleCalendarConfig(), null),
  );
  withGoogleCalendarEnv(
    {
      ...credentials,
      GOOGLE_CALENDAR_REDIRECT_URI: "https://staging.example.com/callback",
    },
    () =>
      assert.equal(
        getGoogleCalendarConfig()?.redirectUri,
        "https://staging.example.com/callback",
      ),
  );
  withGoogleCalendarEnv(
    {
      ...credentials,
      GOOGLE_CALENDAR_REDIRECT_URI: "http://127.0.0.1:3000/callback",
    },
    () =>
      assert.equal(
        getGoogleCalendarConfig()?.redirectUri,
        "http://127.0.0.1:3000/callback",
      ),
  );
});

test("Google OAuth requires its configured callback origin and produces canonical recovery links", () => {
  const config = {
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "server-only-client-secret",
    redirectUri:
      "https://www.grupoup-flow.com.br/api/integrations/google-calendar/callback",
    tokenEncryptionKey: TEST_ENCRYPTION_KEY,
  };

  assert.equal(
    isGoogleCalendarCallbackOrigin(
      "https://www.grupoup-flow.com.br/api/integrations/google-calendar/connect",
      config,
    ),
    true,
  );
  assert.equal(
    isGoogleCalendarCallbackOrigin(
      "https://upflow-mocha.vercel.app/api/integrations/google-calendar/connect",
      config,
    ),
    false,
  );

  const result = getGoogleCalendarResultUrl(config, "official_origin_required");
  assert.equal(result.origin, "https://www.grupoup-flow.com.br");
  assert.equal(result.pathname, "/calendar");
  assert.equal(
    result.searchParams.get("google_calendar"),
    "official_origin_required",
  );

  const recovery = getGoogleCalendarLoginRecoveryUrl(
    config,
    "session_required",
  );
  assert.equal(recovery.origin, "https://www.grupoup-flow.com.br");
  assert.equal(recovery.pathname, "/login");
  assert.equal(
    recovery.searchParams.get("next"),
    "/calendar?google_calendar=session_required",
  );
});

test("Google OAuth uses the browser host instead of the local Next.js bind address", () => {
  const browserOrigin = getGoogleCalendarBrowserOrigin(
    "http://0.0.0.0:3000/api/integrations/google-calendar/connect",
    new Headers({ host: "localhost:3000" }),
  );
  const config = {
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "server-only-client-secret",
    redirectUri: "http://localhost:3000/api/integrations/google-calendar/callback",
    tokenEncryptionKey: TEST_ENCRYPTION_KEY,
  };

  assert.equal(browserOrigin, "http://localhost:3000");
  assert.equal(isGoogleCalendarCallbackOrigin(browserOrigin, config), true);
});

test("completed Google OAuth never reuses a prior refresh token and requires a verified subject", () => {
  const source = read("src/lib/google-calendar.ts");

  assert.match(source, /const googleSubject = profile\?\.subject/);
  assert.match(source, /if \(!tokens\.refreshToken \|\| !googleSubject\)/);
  assert.match(
    source,
    /const refreshTokenCiphertext = encryptGoogleCalendarSecret\(\s*tokens\.refreshToken/,
  );
  assert.match(source, /refresh_token_ciphertext:\s*refreshTokenCiphertext/);
  assert.doesNotMatch(source, /existing\?\.refresh_token_ciphertext/);
});

test("Google OAuth callback uses the signed state workspace and fences account replacement", () => {
  const callback = read(
    "src/app/api/integrations/google-calendar/callback/route.ts",
  );
  const connect = read(
    "src/app/api/integrations/google-calendar/connect/route.ts",
  );
  const source = read("src/lib/google-calendar.ts");

  // A person may switch their selected workspace while they are at Google's
  // consent page. The one-time state already binds the intended workspace;
  // only the signed-in user needs to match on callback.
  assert.doesNotMatch(callback, /requireCurrentWorkspace/);
  assert.match(
    callback,
    /completeGoogleCalendarConnect\(\{\s*state,\s*code,\s*userId:/,
  );
  assert.match(
    callback,
    /getGoogleCalendarLoginRecoveryUrl\(config, "session_required"\)/,
  );
  assert.match(callback, /Cache-Control", "private, no-store"/);
  assert.match(connect, /getGoogleCalendarConfig/);
  assert.match(connect, /getGoogleCalendarBrowserOrigin\(req\.url, req\.headers\)/);
  assert.match(connect, /isGoogleCalendarCallbackOrigin\(browserOrigin, config\)/);
  assert.match(
    connect,
    /getGoogleCalendarLoginRecoveryUrl\(config, "official_origin_required"\)/,
  );
  assert.match(source, /oauthState\.workspace_id/);
  assert.match(
    source,
    /lockGoogleCalendarConnectionForSync\(tx, existing\.id\)/,
  );
  assert.match(
    source,
    /revokeGoogleCalendarToken\(saved\.replacedConnection, config\)/,
  );
});

test("Google OAuth host and session recovery notices are localized", () => {
  const calendar = read("src/app/(dashboard)/calendar/page.tsx");
  const translations = read("src/lib/i18n/translations.ts");

  assert.match(calendar, /googleCalendar\.officialOriginRequired/);
  assert.match(calendar, /googleCalendar\.sessionRequired/);
  assert.match(
    translations,
    /"googleCalendar\.officialOriginRequired":\s*"You are now on the official UpFlow address/,
  );
  assert.match(
    translations,
    /"googleCalendar\.sessionRequired":\s*"Your Google authorization could not be completed/,
  );
  assert.match(
    translations,
    /"googleCalendar\.officialOriginRequired":\s*"Agora você está no endereço oficial do UpFlow/,
  );
  assert.match(
    translations,
    /"googleCalendar\.sessionRequired":\s*"Não foi possível concluir a autorização do Google/,
  );
});

test("Google Calendar event sync uses the responsible member as organizer", () => {
  const source = read("src/lib/google-calendar.ts");

  assert.match(source, /async function hasActiveWorkspaceMembership/);
  assert.match(source, /db\.workspaceMember\.findFirst/);
  assert.match(source, /workspace_id:\s*workspaceId/);
  assert.match(source, /user_id:\s*userId/);
  assert.match(source, /status:\s*"active"/);
  assert.match(
    source,
    /const organizerUserId = googleCalendarOrganizerUserId\(event\)/,
  );
  assert.match(source, /event\.responsible_user_id \|\| event\.created_by/);
  assert.match(
    source,
    /hasActiveWorkspaceMembership\(event\.workspace_id, organizerUserId, db\)/,
  );
});

test("Google event payload maps calendar details and invites internal and client attendees", () => {
  const startsAt = new Date("2026-08-04T14:00:00.000Z");
  const payload = buildGoogleCalendarEventPayload({
    id: "event-1",
    workspace_id: "workspace-1",
    created_by: "user-1",
    title: "Client planning meeting",
    description: "Review launch milestones",
    starts_at: startsAt,
    ends_at: null,
    timezone: "America/Sao_Paulo",
    status: "scheduled",
    location: "Meeting Room A",
    meeting_url: "https://meet.example.com/launch",
    attendees: [
      { user: { email: "support@example.com" } },
      { user: { email: "owner@example.com" } },
    ],
    company: {
      main_contact_email: "client@example.com",
      billing_email: null,
      contacts: [],
    },
    reminders: [
      { minutes_before: 15, enabled: true },
      { minutes_before: 15, enabled: true },
      { minutes_before: 60, enabled: true },
      { minutes_before: 60_000, enabled: true },
      { minutes_before: 5, enabled: false },
    ],
  });

  assert.equal(payload.summary, "Client planning meeting");
  assert.equal(
    payload.description,
    "Review launch milestones\n\nhttps://meet.example.com/launch",
  );
  assert.equal(payload.location, "Meeting Room A");
  assert.equal(payload.start.dateTime, startsAt.toISOString());
  assert.equal(payload.start.timeZone, "America/Sao_Paulo");
  assert.equal(payload.end.dateTime, "2026-08-04T15:00:00.000Z");
  assert.deepEqual(payload.reminders?.overrides, [
    { method: "popup", minutes: 15 },
    { method: "popup", minutes: 60 },
  ]);
  assert.deepEqual(payload.extendedProperties.private, {
    upflow_event_id: "event-1",
    upflow_workspace_id: "workspace-1",
    upflow_source: "calendar",
  });
  assert.deepEqual(payload.attendees, [
    { email: "support@example.com" },
    { email: "owner@example.com" },
    { email: "client@example.com" },
  ]);
});

test("Google event payload requests a Meet conference for an online schedule", () => {
  const payload = buildGoogleCalendarEventPayload({
    id: "online-event-1",
    workspace_id: "workspace-1",
    created_by: "user-1",
    title: "Online planning meeting",
    description: null,
    starts_at: new Date("2026-09-04T13:00:00.000Z"),
    ends_at: new Date("2026-09-04T14:30:00.000Z"),
    timezone: "America/Sao_Paulo",
    status: "scheduled",
    location: null,
    meeting_url: null,
    google_meet_requested: true,
    reminders: [],
  });

  assert.equal(payload.start.dateTime, "2026-09-04T13:00:00.000Z");
  assert.equal(payload.end.dateTime, "2026-09-04T14:30:00.000Z");
  assert.deepEqual(payload.conferenceData, {
    createRequest: {
      requestId: "upflow-online-event-1",
      conferenceSolutionKey: { type: "hangoutsMeet" },
    },
  });
});

test("shared Google agenda entries preserve availability without exposing private details", () => {
  const publicEntry = toGoogleCalendarAgendaEntry(
    {
      id: "google-event-public",
      summary: "Client planning",
      start: { dateTime: "2026-08-04T14:00:00.000Z" },
      end: { dateTime: "2026-08-04T15:00:00.000Z" },
      description: "This must never be stored in the shared agenda cache.",
      attendees: [{ email: "private@example.com" }],
      location: "Private room",
      htmlLink: "https://calendar.google.com/private-link",
    },
    "workspace-1",
  );

  assert.deepEqual(publicEntry, {
    google_event_id: "google-event-public",
    title: "Client planning",
    starts_at: new Date("2026-08-04T14:00:00.000Z"),
    ends_at: new Date("2026-08-04T15:00:00.000Z"),
    all_day: false,
    is_private: false,
    source_updated_at: null,
  });
  assert.equal("description" in (publicEntry ?? {}), false);
  assert.equal("attendees" in (publicEntry ?? {}), false);
  assert.equal("location" in (publicEntry ?? {}), false);

  const privateEntry = toGoogleCalendarAgendaEntry(
    {
      id: "google-event-private",
      summary: "Confidential meeting",
      visibility: "private",
      start: { dateTime: "2026-08-04T16:00:00.000Z" },
      end: { dateTime: "2026-08-04T17:00:00.000Z" },
    },
    "workspace-1",
  );
  assert.equal(privateEntry?.title, "Busy");
  assert.equal(privateEntry?.is_private, true);

  assert.equal(
    toGoogleCalendarAgendaEntry(
      {
        id: "transparent-event",
        transparency: "transparent",
        start: { dateTime: "2026-08-04T16:00:00.000Z" },
        end: { dateTime: "2026-08-04T17:00:00.000Z" },
      },
      "workspace-1",
    ),
    null,
  );
  assert.equal(
    toGoogleCalendarAgendaEntry(
      {
        id: "upflow-event",
        summary: "Already represented by an UpFlow event",
        start: { dateTime: "2026-08-04T16:00:00.000Z" },
        end: { dateTime: "2026-08-04T17:00:00.000Z" },
        extendedProperties: {
          private: {
            upflow_source: "calendar",
            upflow_workspace_id: "workspace-1",
          },
        },
      },
      "workspace-1",
    ),
    null,
  );
});

test("Google event payload clears removed text fields and restores Google reminder defaults", () => {
  const payload = buildGoogleCalendarEventPayload({
    id: "event-with-cleared-fields",
    workspace_id: "workspace-1",
    created_by: "user-1",
    title: "Changed event",
    description: "   ",
    starts_at: new Date("2026-08-04T14:00:00.000Z"),
    ends_at: null,
    timezone: null,
    status: "scheduled",
    location: "\n\t",
    meeting_url: null,
    reminders: [
      { minutes_before: 15, enabled: false },
      { minutes_before: 0, enabled: true },
    ],
  });

  // Google PATCH preserves omitted fields. Explicit empty values are required
  // to remove text the user has deleted in UpFlow.
  assert.equal(payload.description, "");
  assert.equal(payload.location, "");
  assert.deepEqual(payload.reminders, { useDefault: true });
});

test("Google event provider IDs stay deterministic across retries and edits", () => {
  const createPayload = (id: string, title: string) =>
    buildGoogleCalendarEventPayload({
      id,
      workspace_id: "workspace-1",
      created_by: "user-1",
      title,
      description: null,
      starts_at: new Date("2026-08-04T14:00:00.000Z"),
      ends_at: null,
      timezone: null,
      status: "scheduled",
      location: null,
      meeting_url: null,
      reminders: [],
    });

  const firstAttempt = createPayload("event-1", "Original title");
  const retryAfterTimeout = createPayload("event-1", "Original title");
  const laterEdit = createPayload("event-1", "Edited title");
  const anotherEvent = createPayload("event-2", "Original title");

  assert.match(firstAttempt.id, /^[a-f0-9]{64}$/);
  assert.equal(firstAttempt.id, retryAfterTimeout.id);
  assert.equal(firstAttempt.id, laterEdit.id);
  assert.notEqual(firstAttempt.id, anotherEvent.id);
});

test("Google event conflict recovery reuses the deterministic provider ID", () => {
  const source = read("src/lib/google-calendar.ts");

  assert.match(
    source,
    /function createGoogleCalendarProviderEventId\(eventId: string\)[\s\S]*?createHash\("sha256"\)[\s\S]*?digest\("hex"\)/,
  );
  assert.match(
    source,
    /if \(!isGoogleConflict\(error\)\) throw error;[\s\S]*?path: googleEventPath\(input\.calendarId, input\.payload\.id\)[\s\S]*?method: "GET"/,
  );
});

test("Google Calendar routes are server-only, authenticated, and workspace scoped", () => {
  const routes = [
    "src/app/api/integrations/google-calendar/connect/route.ts",
    "src/app/api/integrations/google-calendar/calendars/route.ts",
    "src/app/api/integrations/google-calendar/connection/route.ts",
    "src/app/api/integrations/google-calendar/sync/route.ts",
    "src/app/api/integrations/google-calendar/status/route.ts",
    "src/app/api/calendar/shared-agenda/route.ts",
  ];

  for (const route of routes) {
    const source = read(route);
    assert.match(source, /runtime\s*=\s*"nodejs"/);
    assert.match(source, /requireAuth/);
    assert.match(source, /requireCurrentWorkspace/);
    assert.match(source, /withErrorReporting/);
    assert.doesNotMatch(
      source,
      /access_token_ciphertext|refresh_token_ciphertext/,
    );
  }

  const callback = read(
    "src/app/api/integrations/google-calendar/callback/route.ts",
  );
  assert.match(callback, /runtime\s*=\s*"nodejs"/);
  assert.match(callback, /requireAuth/);
  assert.match(callback, /completeGoogleCalendarConnect/);
  assert.match(callback, /withErrorReporting/);
  // OAuth state is the authority for the originating workspace so changing
  // the dashboard workspace during consent does not reject a safe callback.
  assert.doesNotMatch(callback, /requireCurrentWorkspace/);
  assert.doesNotMatch(
    callback,
    /access_token_ciphertext|refresh_token_ciphertext/,
  );
});

test("shared Google agenda is workspace-scoped, sanitized, and visible in the unified calendar", () => {
  const schema = read("prisma/schema.prisma");
  const migration = read(
    "prisma/migrations/20260804090000_add_google_calendar_shared_agenda/migration.sql",
  );
  const route = read("src/app/api/calendar/shared-agenda/route.ts");
  const calendar = read("src/app/(dashboard)/calendar/page.tsx");
  const card = read(
    "src/components/calendar/google-calendar-integration-card.tsx",
  );

  assert.match(schema, /model GoogleCalendarAgendaEntry/);
  assert.match(schema, /share_agenda\s+Boolean\s+@default\(true\)/);
  assert.match(schema, /is_private\s+Boolean\s+@default\(false\)/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(
    migration,
    /REVOKE ALL ON TABLE "GoogleCalendarAgendaEntry" FROM anon, authenticated/,
  );
  assert.match(route, /workspace_id:\s*scope\.workspaceId/);
  assert.match(route, /connection:\s*\{\s*share_agenda:\s*true/);
  assert.match(route, /select:\s*\{[\s\S]*?is_private:\s*true/);
  assert.doesNotMatch(
    route,
    /description|attendees|meeting_url|access_token_ciphertext|refresh_token_ciphertext/,
  );
  assert.match(calendar, /data-testid="unified-calendar"/);
  assert.match(calendar, /data-testid="calendar-source-settings"/);
  assert.match(calendar, /selectedScheduleItems/);
  assert.doesNotMatch(calendar, /data-testid="weekly-team-agenda"/);
  assert.match(calendar, /\/api\/calendar\/shared-agenda/);
  assert.match(card, /googleCalendar\.shareAgenda/);
  assert.match(card, /share_agenda:\s*shareAgenda/);
});

test("Google Calendar recovery UI offers reconnect and disconnect after calendar loading fails", () => {
  const card = read(
    "src/components/calendar/google-calendar-integration-card.tsx",
  );
  const errorBranch = card.slice(
    card.indexOf(") : loadError ? ("),
    card.indexOf(") : status?.ready === false ? ("),
  );

  assert.match(errorBranch, /googleCalendar\.reconnect/);
  assert.match(errorBranch, /onClick=\{connect\}/);
  assert.match(errorBranch, /onClick=\{\(\) => void disconnect\(\)\}/);
});

test("Google Calendar settings are available from the unified calendar source control and show Connect when OAuth is ready", () => {
  const card = read(
    "src/components/calendar/google-calendar-integration-card.tsx",
  );
  const page = read("src/app/(dashboard)/calendar/page.tsx");
  const unavailableBranch = card.slice(
    card.indexOf(") : status?.ready === false ? ("),
    card.indexOf(") : !connected && connection?.last_error ? ("),
  );
  const connectBranch = card.slice(
    card.indexOf(") : !connected ? ("),
    card.indexOf(") : (", card.indexOf(") : !connected ? (")),
  );

  assert.match(page, /data-testid="calendar-source-settings"/);
  assert.match(page, /<GoogleCalendarIntegrationCard className="mt-3" \/>/);
  assert.ok(
    page.indexOf('data-testid="calendar-source-settings"') <
      page.indexOf('data-testid="unified-calendar"'),
    "Google Calendar source settings should appear before the unified month grid",
  );
  assert.doesNotMatch(page, /weekly-team-agenda/);
  assert.match(card, /lg:flex-row lg:items-start lg:justify-between/);
  assert.match(unavailableBranch, /googleCalendar\.configurationTitle/);
  assert.doesNotMatch(unavailableBranch, /onClick=\{connect\}/);
  assert.match(connectBranch, /onClick=\{connect\}/);
  assert.match(connectBranch, /googleCalendar\.connect/);
});

test("ordinary local calendar writes atomically persist upsert jobs and process them after the response", () => {
  const create = read("src/app/api/calendar/events/route.ts");
  const item = read("src/app/api/calendar/events/[id]/route.ts");
  const cancel = read("src/app/api/calendar/events/[id]/cancel/route.ts");
  const duplicate = read("src/app/api/calendar/events/[id]/duplicate/route.ts");

  for (const route of [create, item, duplicate]) {
    assert.match(route, /prisma\.\$transaction\(async \(tx\) => \{/);
    assert.match(
      route,
      /queueGoogleCalendarEventSyncInTransaction\(\s*tx,\s*(?:event|updated|duplicate)\.id,?\s*\)/,
    );
    assert.match(route, /after\(\(\) =>\s*processGoogleCalendarSyncJob\(/);
    assert.doesNotMatch(route, /syncGoogleCalendarEvent\(/);
  }

  assert.match(cancel, /queueGoogleCalendarEventDeletionInTransaction/);
  assert.match(cancel, /after\(\(\) =>\s*processGoogleCalendarSyncJob\(/);
  assert.doesNotMatch(cancel, /queueGoogleCalendarEventSync\(/);
  assert.doesNotMatch(cancel, /syncGoogleCalendarEvent\(/);
});

test("cancellation and deletion persist provider deletion tombstones before local mutation", () => {
  const source = read("src/lib/google-calendar.ts");
  const item = read("src/app/api/calendar/events/[id]/route.ts");
  const cancel = read("src/app/api/calendar/events/[id]/cancel/route.ts");

  assert.match(
    source,
    /export async function queueGoogleCalendarEventDeletionInTransaction\(\s*tx: GoogleCalendarTransaction,\s*eventId: string,\s*\)/,
  );
  assert.match(
    source,
    /await tx\.googleCalendarSyncJob\.updateMany\(\{[\s\S]*?operation: "upsert",[\s\S]*?status: \{ in: \["pending", "failed", "processing"\] \},[\s\S]*?status: "cancelled",[\s\S]*?lease_token: null,[\s\S]*?locked_until: null/,
  );
  assert.match(
    source,
    /await tx\.googleCalendarSyncJob\.upsert\(\{[\s\S]*?operation: "delete",[\s\S]*?google_calendar_id: target\.calendarId,[\s\S]*?google_event_id: target\.googleEventId,[\s\S]*?status: "pending"/,
  );
  assert.match(
    source,
    /export async function deleteCalendarEventWithGoogleTombstones\(eventId: string\)[\s\S]*?prisma\.\$transaction\(async \(tx\) => \{[\s\S]*?queueGoogleCalendarEventDeletionInTransaction\(tx, eventId\)[\s\S]*?await tx\.googleCalendarSyncJob\.deleteMany\(\{[\s\S]*?event_id: eventId,[\s\S]*?operation: "upsert",[\s\S]*?\}\);[\s\S]*?await tx\.calendarEvent\.delete\(\{ where: \{ id: eventId \} \}\)/,
  );

  const normalizedSource = source.replace(/\r\n/g, "\n");
  const deletionStart = normalizedSource.indexOf(
    "export async function deleteCalendarEventWithGoogleTombstones",
  );
  const deletionFunction = normalizedSource.slice(
    deletionStart,
    normalizedSource.indexOf("\n}\n\n/**", deletionStart),
  );
  const tombstoneQueue =
    "queueGoogleCalendarEventDeletionInTransaction(tx, eventId)";
  const upsertRemoval = "await tx.googleCalendarSyncJob.deleteMany({";
  const localDelete =
    "await tx.calendarEvent.delete({ where: { id: eventId } })";
  assert.ok(
    deletionFunction.indexOf(tombstoneQueue) <
      deletionFunction.indexOf(upsertRemoval) &&
      deletionFunction.indexOf(upsertRemoval) <
        deletionFunction.indexOf(localDelete),
    "event deletion must retain delete tombstones, then remove every upsert before the FK can null event_id",
  );
  assert.doesNotMatch(
    deletionFunction,
    /googleCalendarSyncJob\.deleteMany\(\{[\s\S]*?status:/,
    "upsert cleanup must cover completed and cancelled jobs too",
  );

  assert.match(item, /deleteCalendarEventWithGoogleTombstones\(existing\.id\)/);
  assert.doesNotMatch(item, /await prisma\.calendarEvent\.delete\(/);
  assert.match(
    item,
    /for \(const googleCalendarJobId of googleCalendarDeletionJobIds\)[\s\S]*?processGoogleCalendarSyncJob\(googleCalendarJobId\)/,
  );

  const queueCall =
    "queueGoogleCalendarEventDeletionInTransaction(tx, event.id)";
  const localMutation = "await tx.calendarEvent.update";
  assert.match(cancel, /prisma\.\$transaction\(async \(tx\) => \{/);
  assert.match(
    cancel,
    /queueGoogleCalendarEventDeletionInTransaction\(tx, event\.id\)/,
  );
  assert.ok(
    cancel.indexOf(queueCall) < cancel.indexOf(localMutation),
    "a cancellation tombstone must be committed before the local event is marked cancelled",
  );
  assert.match(cancel, /googleCalendarDeletionJobIds = result\.jobIds/);
  assert.match(
    cancel,
    /for \(const googleCalendarJobId of googleCalendarDeletionJobIds\)[\s\S]*?processGoogleCalendarSyncJob\(googleCalendarJobId\)/,
  );
});

test("the worker fences leased jobs and defers inactive-member deletion tombstones", () => {
  const source = read("src/lib/google-calendar.ts");

  assert.match(
    source,
    /const leaseToken = createGoogleCalendarSyncLeaseToken\(\);[\s\S]*?lease_token: leaseToken,[\s\S]*?locked_until: lockUntil/,
  );
  assert.match(
    source,
    /status: "processing",[\s\S]*?locked_until: input\.lockUntil,[\s\S]*?lease_token: input\.leaseToken/,
  );
  assert.match(
    source,
    /if \(!\(await hasActiveWorkspaceMembership\(job\.workspace_id, job\.user_id, tx\)\)\) \{[\s\S]*?return job\.operation === "delete" \? defer\(\) : cancel\(\);\s*\}/,
  );
});

test("manual sync persists its explicit force intent while automatic sync is paused", () => {
  const source = read("src/lib/google-calendar.ts");

  assert.match(
    source,
    /export async function queueGoogleCalendarEventSync\([\s\S]*?options: \{ force\?: boolean \} = \{\}/,
  );
  assert.match(
    source,
    /if \(!connection \|\| \(!connection\.sync_enabled && !options\.force\)\) return null;/,
  );
  assert.equal(
    [...source.matchAll(/force: Boolean\(options\.force\)/g)].length,
    2,
    "both create and update paths must retain force intent",
  );
  assert.match(
    source,
    /syncGoogleCalendarEvent\(job\.event_id, \{[\s\S]*?force: job\.force,[\s\S]*?db: tx,[\s\S]*?connectionId: job\.connection_id/,
  );
  assert.match(
    source,
    /const jobId = await queueGoogleCalendarEventSync\(event\.id, \{ force: true \}\);[\s\S]*?return jobId \? processGoogleCalendarSyncJob\(jobId\) : \("skipped" as const\)/,
  );
});

test("the existing daily maintenance route processes a bounded Google Calendar retry batch", () => {
  const cron = read("src/app/api/cron/due-soon/route.ts");

  assert.match(
    cron,
    /import \{ after, NextRequest, NextResponse \} from "next\/server"/,
  );
  assert.match(cron, /processPendingGoogleCalendarSyncJobs/);
  assert.match(cron, /processPendingGoogleCalendarSyncJobs\(\{ limit: 10 \}\)/);
  assert.match(
    cron,
    /after\(\(\) =>\s*Promise\.all\(\[\s*processPendingGoogleCalendarSyncJobs\(\{ limit: 10 \}\),\s*syncSharedGoogleCalendarAgendas\(\{ limit: 25 \}\)/,
  );
});
