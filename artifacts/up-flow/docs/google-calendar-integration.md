# Google Calendar integration

UpFlow synchronizes a meeting to the Google Calendar account connected by its
responsible person. Connections are per-user and **one-way**: connecting one
person's account never exposes or modifies another person's Google Calendar.
Google sign-in now obtains this consent automatically; the Calendar page keeps
the connection controls for reconnecting, choosing a calendar, and sync
preferences.

## What the first release syncs

- An UpFlow event is created in the responsible person's selected Google
  Calendar. If no responsible person is selected, the creator is used. Its
  title, notes, location, meeting link, start and end time, time zone, and
  enabled reminders are sent to Google.
- Later edits and duplication are queued against that same Google Calendar
  event. Cancelling or deleting the UpFlow event queues removal of its linked
  Google event. Rapid edits collapse to the newest version so the integration
  does not create duplicate Google events.
- **Sync now** catches up to 250 of that person's eligible events, including
  recent events (up to seven days ago) and future events. It can also be used
  after turning automatic sync off.
- Internal attendees and the selected client's contact email are sent as
  Google attendees. Google delivers invitations and updates from the
  responsible person's calendar.

Google Calendar events are never imported into UpFlow. This keeps a person's
private Google events out of their workspace. The integration also does not
sync Google-side edits back into UpFlow. It writes only to the selected
calendar, except when it removes a linked event from a calendar that was
previously selected after a calendar change.

## Sync delivery, retries, and disconnecting

Automatic event writes use a durable queue: UpFlow records the requested
Google Calendar change before it contacts Google. A temporary Google outage or
expired network request therefore never prevents the UpFlow event itself from
being saved.

- New and edited events are sent immediately when automatic sync is enabled.
  A deletion still queues cleanup of its linked Google event, even if automatic
  sync was later turned off.
- Failed queue items retry with exponential backoff, capped at 24 hours. The
  application also processes a bounded batch of pending work during its daily
  maintenance run. Select **Sync now** to try the current event state again
  without waiting for that maintenance run.
- **Disconnect** clears the stored Google credentials and stops future
  automatic sync. It does not delete Google events that were already created.
  A deletion that was queued before disconnecting remains safely queued and
  can finish after the same account reconnects.
- If Google access is revoked or a refresh token becomes unusable, UpFlow
  disables the connection and asks the person to reconnect. Local UpFlow
  events remain available throughout.

## Google Cloud setup

For the combined Google-only sign-in setup, first follow
[`google-only-authentication.md`](./google-only-authentication.md). The same
OAuth Web client is used by Supabase Auth and the Calendar reconnect flow.

1. In the Google Cloud Console, create or choose a project and enable the
   **Google Calendar API**.
2. Configure the OAuth consent screen. Add the people who will test the app if
   the app is still in Testing mode.
3. Create an OAuth 2.0 **Web application** client.
4. Add this exact Authorized redirect URI to the OAuth client:

   ```text
   https://YOUR-UPFLOW-DOMAIN/api/integrations/google-calendar/callback
   ```

   It must exactly match `GOOGLE_CALENDAR_REDIRECT_URI`, including `https`,
   path, and any trailing slash choice.
   Also add Supabase's callback URI shown in the Google-only authentication
   guide. Both redirects are required.
5. Add the following environment variables to the deployment where you want
   the integration enabled. Keep client secrets out of source control.

   ```text
   GOOGLE_CALENDAR_CLIENT_ID=...
   GOOGLE_CALENDAR_CLIENT_SECRET=...
   GOOGLE_CALENDAR_REDIRECT_URI=https://YOUR-UPFLOW-DOMAIN/api/integrations/google-calendar/callback
   GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY=...
   ```

6. Generate a strong, unique encryption key for
   `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`, for example:

   ```bash
   openssl rand -base64 48
   ```

   Do not rotate this key without a token-migration plan. Rotating it makes
   existing encrypted Google refresh tokens unreadable and affected users will
   need to reconnect.
7. Redeploy the application after saving the variables.

The application requests only identity information needed to display the
connected Google account, Google Calendar event access, and read-only access
to the user's calendar list so they can choose a writable destination. Google
may require OAuth app verification before these scopes can be used broadly
outside test users.

## User workflow

1. Open **Calendar** in UpFlow.
2. In the **Google Calendar** card, select **Connect Google Calendar**.
3. Approve access in Google and return to UpFlow.
4. Choose a writable calendar and save the sync settings.
5. Select **Sync now** for the initial catch-up, then choose whether future
   UpFlow changes should synchronize automatically.
6. Select **Disconnect** to stop future automatic sync. Existing Google
   events remain in Google Calendar.

## Operational checks

- If the Google Calendar card says configuration is unavailable, verify all
  four environment variables are set for that deployment and that the redirect
  URI is exact.
- A completed connection must return both a new refresh token and a verified
  Google account subject. If Google does not return both, the existing
  connection is left unchanged and the user should reconnect after reviewing
  the Google consent screen.
- A Google sync failure never prevents an UpFlow event from being saved. The
  connection card shows that attention is needed and the person can use
  **Sync now** or reconnect their Google account.
- Keep the existing daily `/api/cron/due-soon` schedule and `CRON_SECRET`
  configured in production. It processes a small batch of pending Google
  Calendar retry work alongside the application's other daily maintenance.
