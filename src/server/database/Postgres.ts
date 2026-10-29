import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | undefined;

export function hasPostgres(options: { allowMissing?: boolean } = {}) {
  const configured = Boolean(process.env.DATABASE_URL?.trim());
  if (!configured && process.env.NODE_ENV === "production" && !options.allowMissing) {
    throw new Error("Banco de dados não configurado para produção.");
  }
  return configured;
}

export function postgresPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não foi configurada.");
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    ssl: process.env.DATABASE_SSL === "false"
      ? false
      : process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
        : undefined,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return pool;
}

export async function postgresHealth() {
  if (!hasPostgres({ allowMissing: true })) {
    return { available: false, configured: false, schemaReady: false, mode: "memory" as const };
  }

  const startedAt = performance.now();
  try {
    const result = await postgresPool().query<{ schema_ready: boolean }>(
      "SELECT to_regclass('public.users') IS NOT NULL AS schema_ready",
    );
    return {
      available: true,
      configured: true,
      schemaReady: Boolean(result.rows[0]?.schema_ready),
      mode: "postgres" as const,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      available: false,
      configured: true,
      schemaReady: false,
      mode: "postgres" as const,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "PostgreSQL indisponível.",
    };
  }
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  return postgresPool().query<T>(text, values);
}

export async function transaction<T>(operation: (client: PoolClient) => Promise<T>) {
  const client = await postgresPool().connect();
  try {
    await client.query("BEGIN");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

