import type { NextRequest } from "next/server";

import { safeInternalPath } from "@/lib/safe-internal-path";

export type GoogleAuthError =
  | "configuration"
  | "provider"
  | "callback"
  | "account"
  | "calendar";

/**
 * A Supabase session is accepted by UpFlow only when Google is one of its
 * verified identity providers. This closes the server-side path for legacy
 * password, magic-link, or recovery sessions after the Google-only rollout.
 */
export function hasGoogleIdentityProvider(appMetadata: unknown) {
  if (!appMetadata || typeof appMetadata !== "object") return false;
  const metadata = appMetadata as {
    provider?: unknown;
    providers?: unknown;
  };
  return (
    metadata.provider === "google" ||
    (Array.isArray(metadata.providers) && metadata.providers.includes("google"))
  );
}

function isLoopbackHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/**
 * OAuth redirects must use a configured canonical origin in production. In
 * local development only, the browser's loopback origin is an acceptable
 * fallback so a missing APP_URL does not silently produce a provider URL for
 * an unrelated Host header.
 */
export function getGoogleAuthOrigin(req: NextRequest) {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:" || (url.protocol === "http:" && isLoopbackHostname(url.hostname))) {
        return url.origin;
      }
    } catch {
      return null;
    }
  }

  if (process.env.NODE_ENV !== "production" && isLoopbackHostname(req.nextUrl.hostname)) {
    return req.nextUrl.origin;
  }
  return null;
}

export function getGoogleAuthCallbackUrl(origin: string, next: string | null | undefined) {
  const callback = new URL("/auth/callback", origin);
  callback.searchParams.set("next", safeInternalPath(next));
  return callback;
}

export function getGoogleAuthLoginErrorUrl(
  origin: string,
  error: GoogleAuthError,
  next?: string | null,
) {
  const url = new URL("/login", origin);
  url.searchParams.set("auth_error", error);
  const safeNext = safeInternalPath(next);
  if (safeNext !== "/") url.searchParams.set("next", safeNext);
  return url;
}
