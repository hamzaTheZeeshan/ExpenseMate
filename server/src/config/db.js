import { PrismaClient } from "@prisma/client";

// Single shared Prisma Client instance for the whole app.
// Never instantiate `new PrismaClient()` anywhere else — always import
// this file. Multiple instances will each open their own connection pool
// against Supabase's pooler and can exhaust available connections quickly,
// especially under dev-server hot reloads.

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;
