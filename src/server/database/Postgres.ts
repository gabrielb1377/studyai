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
    const classification = classifyPostgresError(error);
    console.error("[PostgreSQL Health Failure]", {
      category: classification.category,
      code: classification.code,
      name: classification.name,
      message: classification.messageSummary,
      timestamp: new Date().toISOString(),
    });

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


function classifyPostgresError(error: unknown): {
  category: string;
  code?: string;
  name?: string;
  messageSummary: string;
} {
  if (!(error instanceof Error)) {
    return {
      category: "unknown",
      messageSummary: String(error ?? "Unknown error"),
    };
  }

  const err = error as Error & { code?: string; errno?: string | number; syscall?: string };
  const code = err.code ?? (err.errno ? String(err.errno) : undefined);
  const name = err.name;
  const message = err.message.toLowerCase();

  const sanitizedMessage = err.message
    .replace(/postgres:\/\/[^@\s]+@[^\s]+/gi, "[REDACTED_URL]")
    .replace(/postgresql:\/\/[^@\s]+@[^\s]+/gi, "[REDACTED_URL]")
    .replace(/password=[^\s&]+/gi, "password=[REDACTED]")
    .replace(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g, "[IP]");

  let category = "connection";

  if (
    code === "ENOTFOUND" ||
    code === "EAI_AGAIN" ||
    message.includes("enotfound") ||
    message.includes("getaddrinfo")
  ) {
    category = "dns";
  } else if (
    code === "28P01" ||
    code === "28000" ||
    message.includes("password authentication failed") ||
    message.includes("auth")
  ) {
    category = "authentication";
  } else if (
    code === "3D000" ||
    (message.includes("database") && message.includes("does not exist"))
  ) {
    category = "database_not_found";
  } else if (
    code === "ETIMEDOUT" ||
    message.includes("timeout") ||
    message.includes("timed out")
  ) {
    category = "timeout";
  } else if (
    code === "ECONNREFUSED" ||
    code === "ECONNRESET" ||
    message.includes("connection refused") ||
    message.includes("reset")
  ) {
    category = "connection_refused_or_reset";
  } else if (
    message.includes("ssl") ||
    message.includes("tls") ||
    message.includes("certificate") ||
    message.includes("self signed") ||
    name.includes("TLSSocket")
  ) {
    category = "tls_ssl";
  }

  return {
    category,
    ...(code ? { code } : {}),
    ...(name ? { name } : {}),
    messageSummary: sanitizedMessage.length > 200 ? sanitizedMessage.slice(0, 200) + "..." : sanitizedMessage,
  };
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

