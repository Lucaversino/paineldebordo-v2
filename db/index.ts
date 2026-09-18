import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __painelSql: ReturnType<typeof postgres> | undefined;
}

function getClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL não configurada. Use a Connection string do Supabase (preferencialmente Supavisor Transaction Pooler) nas variáveis da Vercel.",
    );
  }

  if (!globalThis.__painelSql) {
    globalThis.__painelSql = postgres(connectionString, {
      prepare: false,
      max: 3,
      idle_timeout: 12,
      connect_timeout: 7,
      max_lifetime: 600,
    });
  }
  return globalThis.__painelSql;
}

export function getDb() {
  return drizzle(getClient(), { schema });
}
