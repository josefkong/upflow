# Google-only authentication

UpFlow accepts Google as its only user-facing and server-authorized sign-in
method. The same consent also connects that member's Google Calendar. Provider
access and refresh tokens are handled only by the server and stored encrypted.

## Local configuration used by this project

The Google Cloud OAuth client must remain a **Web application** and contain
both exact Authorized redirect URIs:

```text
http://localhost:3000/api/integrations/google-calendar/callback
https://axppobjuaddsgzrmolge.supabase.co/auth/v1/callback
```

The first URI supports the Calendar page's reconnect action. The second is the
Supabase Auth callback used by **Continue with Google**. They are different
parts of the same flow and neither should be removed.

In **Supabase Dashboard → Authentication → Sign In / Providers → Google**:

1. Enable Google.
2. Paste the same Google OAuth Web client ID and client secret used by the
   server-side Calendar integration.
3. Save the provider.

In **Supabase Dashboard → Authentication → URL Configuration**:

1. Set **Site URL** to `http://localhost:3000` for local development.
2. Add `http://localhost:3000/auth/callback` to **Redirect URLs**.
3. Add the production equivalent before deployment, using the exact HTTPS
   origin configured in `APP_URL`.

In **Supabase Dashboard → Authentication → Sign In / Providers**, disable the
Email provider after the Google sign-in smoke test succeeds. The application
already rejects password, magic-link, and recovery sessions server-side; this
dashboard setting also removes the unused provider at the identity layer.

## Google Cloud consent setup

- Enable **Google Calendar API**.
- Keep the OAuth app in **Testing** while configuring it and add each
  collaborator under **Audience → Test users**.
- Configure these scopes under **Data Access**:
  - `openid`
  - `.../auth/userinfo.email`
  - `.../auth/userinfo.profile`
  - `.../auth/calendar.events`
  - `.../auth/calendar.calendarlist.readonly`
- Every collaborator must choose the same Google account as their UpFlow
  invitation email.

## Expected behavior

1. The member selects **Continue with Google**.
2. Google requests identity and Calendar permissions in one consent screen.
3. Supabase creates the UpFlow session through PKCE.
4. UpFlow verifies the Google identity, encrypts the Calendar credentials, and
   associates them with that member in the active workspace.
5. An online meeting is created in the responsible member's Google Calendar.
   The responsible member is the organizer; internal attendees and the client
   receive Google invitations.

If the responsible member has not completed Google Calendar consent, UpFlow
does not create the online meeting and asks that person to connect first.

## Smoke test

1. Sign out of UpFlow and open `http://localhost:3000/login`.
2. Confirm that **Continue with Google** is the only sign-in action.
3. Sign in with a Google test user and approve every requested permission.
4. Open **Calendar** and confirm the same Google email appears as connected.
5. Create an Online meeting with yourself as responsible and another member as
   attendee.
6. Confirm the event appears in the responsible member's Calendar with a Meet
   link and the attendee receives the invitation.
