import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isTestLoginEnabled, TEST_AUTH_COOKIE } from "@/lib/test-auth";
import { hasGoogleIdentityProvider } from "@/lib/google-auth";

function signInRedirect(req: NextRequest) {
  const nextPath = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  // Keep the original request only as a relative path inside `next`. This
  // lets a canonical-host re-login resume a protected screen (including the
  // Google Calendar OAuth recovery notice) without accepting external URLs.
  loginUrl.search = "";
  loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApiRoute = pathname.startsWith("/api/");
  const isStatic =
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".");

  if (isStatic || isApiRoute) {
    return NextResponse.next({ request: { headers: req.headers } });
  }

  const isLoginPage = pathname === "/login";
  const isPasswordRecoveryPage =
    pathname === "/auth/reset" || pathname === "/auth/reset/confirm";
  // Public, unauthenticated pages: login + the password-recovery flow +
  // the invite landing page (lets a logged-out invitee click the email
  // link and sign up before joining).
  const isPublicAuthPage =
    isLoginPage ||
    pathname === "/auth/callback" ||
    pathname === "/auth/forgot" ||
    isPasswordRecoveryPage ||
    pathname.startsWith("/invite/");

  let response = NextResponse.next({ request: { headers: req.headers } });
  if (isPasswordRecoveryPage) {
    // The confirmation state and the legacy callback can be bearer values.
    // Never cache or send either one in a later navigation's Referer header.
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
  }
  const cookieMutations: Array<{ name: string; value: string; options?: CookieOptions }> = [];

  // Test-auth controls when this CI-only bypass is available. Middleware only
  // checks the cookie shape; `getAuthResult()` verifies the HMAC in Node.
  const rawTestCookie = req.cookies.get(TEST_AUTH_COOKIE)?.value;
  const testCookieShapeOk =
    isTestLoginEnabled() &&
    Boolean(rawTestCookie) &&
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(rawTestCookie!);
  let user: { email?: string | null; app_metadata?: unknown } | null = testCookieShapeOk
    ? { email: "pending-server-verify" }
    : null;

  if (!user) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    const hasValidSupabaseUrl =
      Boolean(supabaseUrl) && (supabaseUrl!.startsWith("https://") || supabaseUrl!.startsWith("http://"));

    if (hasValidSupabaseUrl && supabaseAnonKey) {
      try {
        const supabase = createServerClient(
          supabaseUrl!,
          supabaseAnonKey,
          {
            cookies: {
              getAll() {
                return req.cookies.getAll().map(({ name, value }) => ({ name, value }));
              },
              setAll(cookiesToSet) {
                for (const { name, value, options } of cookiesToSet) {
                  const opts: CookieOptions = options ?? {};
                  cookieMutations.push({ name, value, options: opts });
                  response.cookies.set({ name, value, ...opts });
                }
              },
            },
          }
        );

        const got = await supabase.auth.getUser();
        user =
          got.data.user && hasGoogleIdentityProvider(got.data.user.app_metadata)
            ? got.data.user
            : null;
      } catch {
        user = null;
      }
    } else if (!isPublicAuthPage) {
      return signInRedirect(req);
    }
  }

  if (!user && !isPublicAuthPage) {
    return signInRedirect(req);
  }

  // Only redirect away from /login when we have a *real* Supabase session.
  // The test-cookie path here is shape-only; if it's stale or forged, the
  // Node-runtime auth check would bounce us back here and we'd loop. So
  // when the bypass path is in play, leave the login page reachable.
  if (user && isLoginPage && !testCookieShapeOk) {
    const homeUrl = req.nextUrl.clone();
    homeUrl.pathname = "/";
    return NextResponse.redirect(homeUrl);
  }

  for (const cookie of cookieMutations) {
    const opts: CookieOptions = cookie.options ?? {};
    response.cookies.set({ name: cookie.name, value: cookie.value, ...opts });
  }

  return response;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
