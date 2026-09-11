# UP Flow Deployment Checklist

Use this checklist before every production deployment. UP Flow is an internal operations system, so deploys must protect production data and avoid partial schema/app mismatches.

The `itsvitinhoin/upflow` repository is currently public. Move the source to a private repository or organization before internal launch, then confirm the Vercel Git connection still has access.

## 1. Required Vercel Production Environment

Confirm these variables exist in the Vercel `Production` environment:

- `DATABASE_URL`: Supabase pooler Postgres connection string for application runtime.
- `DIRECT_URL`: direct Supabase Postgres connection string for Prisma migrations. This must be a Postgres URL, not the Supabase HTTPS project URL.
- `NEXT_PUBLIC_SUPABASE_URL`: Supabase project URL.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Supabase public anon key.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role key for admin invite/account flows. Never expose this client-side.
- `APP_URL`: canonical public app URL, for example `https://upflow-mocha.vercel.app`.
- `RESEND_API_KEY`: Resend API key for transactional invite/password emails.
- `EMAIL_FROM`: verified sender, for example `Up Flow <no-reply@yourdomain.com>`.
- `CRON_SECRET`: random shared secret used by production cron endpoints.
- `SENTRY_DSN`: server-side error tracking DSN.
- `NEXT_PUBLIC_SENTRY_DSN`: browser error tracking DSN.
- `TASK_ASSETS_BUCKET`: optional Supabase Storage bucket name for task cover images. Defaults to `task-assets`.

Also confirm these values do not contain placeholders such as `[YOUR-PASSWORD]`.
For production rate limiting, configure either `REDIS_URL` or both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Identity and invitation endpoints fail closed when the shared store is unavailable.

Create a private Supabase Storage bucket named `task-assets` unless `TASK_ASSETS_BUCKET` points to a different private bucket. Task cover image uploads store an internal object reference in Postgres and are served by a short-lived, authorized URL.

## 2. Supabase Auth URL Configuration

In **Supabase Dashboard → Authentication → URL Configuration**:

1. Set **Site URL** to the same canonical HTTPS origin as `APP_URL`.
2. Add the exact Google PKCE callback to **Redirect URLs**: `https://your-production-domain/auth/callback`.
3. Keep preview and localhost URLs separate from the canonical production URL. Do not point `APP_URL` at a preview deployment.
4. Enable the Google provider with the same OAuth Web client ID and secret used by the Calendar integration.
5. Add the Supabase project callback, `https://YOUR-PROJECT.supabase.co/auth/v1/callback`, to the Google Cloud OAuth client's Authorized redirect URIs.
6. After the Google login smoke test passes, disable the Supabase Email provider. UpFlow accepts Google-authenticated sessions only.

If either callback is missing, Google sign-in can fail before the member returns to UpFlow. See [`google-only-authentication.md`](./google-only-authentication.md) for the complete local and production setup.

## 3. Supabase Security Gate

Before the first production deployment of this release:

1. In Supabase Dashboard, disable the Data API for public application tables. UP Flow uses Prisma and server-side APIs, not browser database queries.
2. Apply the Prisma migration that enables RLS and revokes `anon` and `authenticated` access to public tables.
3. With the public anon key, make anonymous REST probes for at least `Task`, `User`, and `Workspace`. Every probe must return access denied and never return rows.
4. Set `task-assets` private. Run the asset migration dry run, then apply it before changing bucket visibility:

   ```bash
   pnpm storage:migrate-task-covers
   pnpm storage:migrate-task-covers -- --apply
   ```

5. Verify an admin and a member can load an assigned task cover, while an unauthenticated request and a user in another workspace cannot.

## 4. Secret Rotation

Rotate and update Vercel if any secret was pasted into chat, logs, screenshots, or shared documents:

- Supabase database password.
- Supabase service role key.
- Resend API key.
- Any Vercel tokens or deploy credentials.

After rotation, redeploy and confirm `/admin/health` is green.

## 5. Rehearse and Run Migrations Before Redeploy

Run in this order:

1. Back up production and run a full migration rehearsal against a disposable staging database:

   ```bash
   pnpm db:migrate:status
   pnpm db:migrate:deploy
   ```

2. Check the staging query plans for dashboard and substring search. The search queries must use the new trigram indexes rather than sequential scans at representative pilot volume.

3. If the release changes how records are classified (including the `Project.kind`
   directory migration), place the app in a brief read-only window before applying
   the migration. Block every project/client lifecycle mutation during this window:
   project and client create/update/delete, onboarding starts or edits, template
   application, and department-default provisioning. Keep the window in place until
   the new app bundle is serving production. This prevents the previous app version
   from writing rows with the new column's fallback value between migration and
   redeploy.

4. Wait for the `Test` GitHub Actions workflow on the exact `main` commit to pass. Automatic Vercel Git deployments are disabled by design.

5. In GitHub, configure the `production` environment with these secrets:

   - `UPFLOW_PRODUCTION_DIRECT_URL`: direct Postgres connection URL used only by Prisma migration jobs.
   - `VERCEL_TOKEN`: a Vercel token allowed to deploy the `upflow` project.

6. Dispatch the `Controlled Production Release` workflow from `main`. Complete the staging confirmation only after the staging rehearsal and smoke test pass. The workflow verifies CI, migrates production, deploys the reviewed commit, and probes `/api/health`. Never run arbitrary Prisma migrations during a Vercel build.

7. End the read-only window when one was required, resume lifecycle mutations, then confirm health:

   - `GET /api/health` returns `status: "ok"`.
   - `/admin/health` shows `Ready for internal rollout`.

Do not reverse this order when the commit contains Prisma schema changes.

## 6. Post-Deploy Smoke Test

After Vercel is ready, validate:

- Login succeeds.
- Logout succeeds.
- Dashboard loads without a generic error boundary.
- Team page loads members for the active workspace.
- Create a temporary Space, folder, list, and task.
- Upload a task cover image and confirm it appears on the board card after reload.
- Confirm an expired or resent invite cannot be accepted, and a valid invite works only for its intended email.
- Request a password reset for a test user, open a fresh link, set a new password, and sign in with it.
- Confirm `/api/health` reports Redis plus both server and browser error tracking as ready.
- Assign a task and confirm notification creation.
- Create and delete a Calendar event.
- Create and delete a client note/contact.
- Start and stop a time entry.

Clean up temporary records after the smoke test.

## 7. Go / No-Go

Go only when:

- `/api/health` is healthy.
- `/admin/health` is ready.
- Final acceptance test passes.
- At least one admin can complete invite, task, calendar, client, and time tracking flows in production.
- A database backup and Vercel rollback target are recorded for this release.

No-go when:

- Production database is unreachable.
- Migration history is behind the app bundle.
- Supabase Data API/RLS or private Storage checks are unverified.
- Invite email cannot be delivered by Resend.
- Task image storage bucket is public, missing, or not readable through authorized access.
- A high or moderate production dependency advisory remains.
- The source repository remains public.
- Logout/login fails.
- Workspace isolation or role permissions fail.
