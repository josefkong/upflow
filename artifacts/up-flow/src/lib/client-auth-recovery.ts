export class ApiResponseError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiResponseError";
    this.status = status;
  }
}

export function buildSessionLoginPath(pathname: string, search: string): string {
  const next = `${pathname}${search}`;
  return `/login?${new URLSearchParams({ next }).toString()}`;
}

/**
 * A 401 from an authenticated client request normally means that the page was
 * left open after its server session expired. Recover through the normal login
 * flow instead of reporting an expected auth transition as an application
 * error (which also opens the Next.js development overlay).
 */
export function recoverExpiredSession(error: unknown): boolean {
  if (!(error instanceof ApiResponseError) || error.status !== 401) return false;

  if (typeof window !== "undefined") {
    window.location.replace(
      buildSessionLoginPath(window.location.pathname, window.location.search),
    );
  }
  return true;
}
