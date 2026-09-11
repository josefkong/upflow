import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import type { User, WorkspaceRole } from "@prisma/client";
import {
  ensureDefaultWorkspace,
  loadMemberships,
  readWorkspaceCookie,
  resolveCurrentWorkspaceId,
  isAdminRole,
  type MembershipLite,
} from "@/lib/workspace";
import { logError } from "@/lib/log-error";
import { TEST_AUTH_COOKIE, verifyTestAuthCookie } from "@/lib/test-auth";
import { normalizeDisplayName } from "@/lib/user-profile";
import { hasGoogleIdentityProvider } from "@/lib/google-auth";

export interface AuthUser {
  supabaseId: string;
  prismaUser: User;
  memberships: MembershipLite[];
  currentWorkspaceId: string;
  currentRole: WorkspaceRole | null;
}

function adminAllowlist(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  const fromEnv = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  if (process.env.NODE_ENV === "production") return [];
  return ["admin@upflow.io"];
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminAllowlist().includes(email.toLowerCase());
}

/**
 * Discriminated result for callers that need to distinguish "no session"
 * (return 401) from "session check / DB lookup failed" (return 503 - the
 * user IS logged in, we just couldn't tell). `getAuthUser()` collapses both
 * back to `null` for legacy call sites; new code should prefer
 * `getAuthResult()`.
 */
export type AuthResult =
  | { kind: "ok"; user: AuthUser }
  | { kind: "anonymous" }
  | { kind: "error"; error: Error };

export async function getAuthResult(): Promise<AuthResult> {
  // Step 1: ask Supabase who the user is. Network/parse failures here are
  // treated as "anonymous" - Supabase already returns `{ data: { user: null } }`
  // for an unauthenticated cookie, so a thrown error is the unusual case and
  // matches the old behavior of "no session" for legacy callers.
  let email: string | null = null;
  let supabaseId: string | null = null;
  let metadataName: string | undefined;

  // Dev/CI-only bypass - see `lib/test-auth.ts`. It requires a signed cookie
  // and is unavailable in deployed environments outside an explicitly marked
  // GitHub Actions production-server test run.
  const cookieStore = await cookies();
  const testEmail = await verifyTestAuthCookie(cookieStore.get(TEST_AUTH_COOKIE)?.value);
  if (testEmail) {
    email = testEmail;
    supabaseId = `test:${testEmail}`;
  } else {
    try {
      const supabase = await createSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      // No session = genuinely anonymous (login screen is correct).
      if (!user?.email) return { kind: "anonymous" };
      // Password and recovery sessions may still exist for accounts created
      // before the Google-only rollout. They are deliberately not valid
      // UpFlow sessions anymore.
      if (!hasGoogleIdentityProvider(user.app_metadata)) {
        return { kind: "anonymous" };
      }
      email = user.email;
      supabaseId = user.id;
      metadataName =
        (user.user_metadata?.full_name as string | undefined) ||
        (user.user_metadata?.name as string | undefined);
    } catch (err) {
      // Supabase could not validate the browser session; log it and let the
      // — the user MAY be logged in, we just can't tell right now. Surface
      // normal anonymous flow send the user back to login.
      logError("auth:supabase-getUser", err);
      return { kind: "anonymous" };
    }
  }

  // Step 2: look up (or, on first sign-in, create) the Prisma user.
  // DB errors here are real outages - surface them to the caller instead of
  // pretending the user is logged out.
  try {
    const wantsAdmin = isAdminEmail(email);
    const displayName = normalizeDisplayName(metadataName, email);

    let prismaUser = await prisma.user.findUnique({ where: { email } });
    if (!prismaUser) {
      // True first sign-in: create the row. Two concurrent first-login
      // requests can both pass the findUnique above and race here - the
      // loser hits a P2002 unique-constraint violation, in which case we
      // simply re-fetch the row the winner just inserted.
      try {
        prismaUser = await prisma.user.create({
          data: {
            email,
            name: displayName,
            role: wantsAdmin ? "admin" : "member",
          },
        });
      } catch (err) {
        const code = (err as { code?: string })?.code;
        if (code === "P2002") {
          prismaUser = await prisma.user.findUnique({ where: { email } });
          if (!prismaUser) throw err;
        } else {
          throw err;
        }
      }
    }

    // Promote to admin if the env allowlist now includes this email.
    if (wantsAdmin && prismaUser.role !== "admin") {
      prismaUser = await prisma.user.update({
        where: { id: prismaUser.id },
        data: { role: "admin" },
      });
    }

    if (prismaUser.name !== displayName && normalizeDisplayName(prismaUser.name, email, prismaUser.phone) !== prismaUser.name) {
      prismaUser = await prisma.user.update({
        where: { id: prismaUser.id },
        data: { name: displayName },
      });
    }

    // Load memberships once for the common path. Only run provisioning when
    // the user has none, which avoids one extra workspaceMember read on every
    // authenticated API request.
    let memberships = await loadMemberships(prismaUser.id);
    if (memberships.length === 0) {
      await ensureDefaultWorkspace(prismaUser.id, prismaUser.name);
      memberships = await loadMemberships(prismaUser.id);
    }
    const currentWorkspaceId = resolveCurrentWorkspaceId(
      memberships,
      await readWorkspaceCookie(),
    );
    const currentRole =
      memberships.find((m) => m.workspace_id === currentWorkspaceId)?.role ?? null;

    return {
      kind: "ok",
      user: {
        supabaseId: supabaseId!,
        prismaUser,
        memberships,
        currentWorkspaceId,
        currentRole,
      },
    };
  } catch (err) {
    logError("auth:db-lookup", err, { email });
    return { kind: "error", error: err as Error };
  }
}

/**
 * Legacy helper: returns the user or `null` for both "anonymous" and
 * "lookup failed". Prefer `getAuthResult()` for new code so DB outages
 * can surface a 503 instead of an incorrect 401.
 */
export async function getAuthUser(): Promise<AuthUser | null> {
  const r = await getAuthResult();
  return r.kind === "ok" ? r.user : null;
}

/** Cross-workspace super-admin (provisioned via ADMIN_EMAILS). */
export function isSuperAdmin(auth: AuthUser): boolean {
  return auth.prismaUser.role === "admin";
}

/** Owner or admin in the currently-active workspace, OR super-admin. */
export function isWorkspaceAdmin(auth: AuthUser): boolean {
  return isSuperAdmin(auth) || isAdminRole(auth.currentRole);
}

/**
 * Owner/admin role check against a specific target workspace (not the
 * caller's active one). Use this for any write that mutates a resource -
 * the relevant role is the role in the resource's workspace, NOT the
 * cookie-selected active workspace.
 */
export function isWorkspaceAdminFor(auth: AuthUser, workspaceId: string): boolean {
  if (isSuperAdmin(auth)) return true;
  const m = auth.memberships.find((mm) => mm.workspace_id === workspaceId);
  return isAdminRole(m?.role);
}

/** True if the user is a member of (or super-admin over) the workspace. */
export function canAccessWorkspace(auth: AuthUser, workspaceId: string): boolean {
  if (isSuperAdmin(auth)) return true;
  return auth.memberships.some((m) => m.workspace_id === workspaceId);
}

/**
 * For list endpoints - returns a Prisma `where` fragment matching all
 * workspaces the user can read from. Super-admin returns `{}` (no filter).
 */
export function workspaceListFilter(auth: AuthUser): { workspace_id?: { in: string[] } } {
  if (isSuperAdmin(auth)) return {};
  return { workspace_id: { in: auth.memberships.map((m) => m.workspace_id) } };
}

/**
 * For list endpoints scoped to the active workspace only (default behavior
 * for sidebar/main UI). Super-admin sees only the active workspace too so
 * the UI stays predictable.
 */
export function currentWorkspaceFilter(auth: AuthUser): { workspace_id: string } {
  return { workspace_id: auth.currentWorkspaceId };
}
