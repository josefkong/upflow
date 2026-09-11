import { PrismaClient } from "@prisma/client";
import { toPrismaRuntimeDatabaseUrl } from "@/lib/prisma-url";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function getDatabaseUrl(): string {
  const runtimeUrlOptions =
    process.env.NODE_ENV === "development"
      ? { connectionLimit: 5, poolTimeoutSeconds: 20 }
      : undefined;
  if (process.env.DATABASE_URL) {
    return toPrismaRuntimeDatabaseUrl(
      process.env.DATABASE_URL,
      runtimeUrlOptions,
    );
  }

  if (process.env.PGHOST && process.env.PGUSER && process.env.PGPASSWORD && process.env.PGDATABASE) {
    const port = process.env.PGPORT || "5432";
    return toPrismaRuntimeDatabaseUrl(
      `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${port}/${process.env.PGDATABASE}`,
      runtimeUrlOptions,
    );
  }

  return "";
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    datasources: {
      db: {
        url: getDatabaseUrl(),
      },
    },
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
