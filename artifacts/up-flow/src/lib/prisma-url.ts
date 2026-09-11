function isSupabasePooler(url: URL): boolean {
  return url.hostname.toLowerCase().endsWith(".pooler.supabase.com");
}

/**
 * Adds Prisma connection options required by the serverless Supabase runtime.
 * Supavisor transaction mode cannot use Prisma prepared statements.
 */
export function toPrismaRuntimeDatabaseUrl(
  rawUrl: string,
  options: { connectionLimit?: number; poolTimeoutSeconds?: number } = {},
): string {
  if (!rawUrl) return "";

  try {
    const url = new URL(rawUrl);
    if (isSupabasePooler(url)) {
      // Supabase's port 5432 pooler uses session mode and reserves one
      // database connection per Prisma client connection. In local Next.js
      // development those sessions survive HMR and can exhaust the small
      // project pool. Runtime traffic belongs on transaction mode (6543),
      // while DIRECT_URL remains untouched for migrations.
      if (url.port === "5432") url.port = "6543";
      url.searchParams.set("pgbouncer", "true");
    }
    if (!url.searchParams.has("connection_limit")) {
      url.searchParams.set(
        "connection_limit",
        String(options.connectionLimit ?? 1),
      );
    }
    if (!url.searchParams.has("pool_timeout")) {
      url.searchParams.set(
        "pool_timeout",
        String(options.poolTimeoutSeconds ?? 20),
      );
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}
