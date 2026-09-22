import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | undefined;
let initialized: Promise<void> | undefined;

export function hasPostgres() {
  return Boolean(process.env.DATABASE_URL);
}

export function postgresPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não foi configurada.");
  pool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    ssl: process.env.DATABASE_SSL === "false" ? false : process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });
  return pool;
}

export async function initializePostgres() {
  if (!hasPostgres()) return;
  initialized ??= readFile(path.join(process.cwd(), "src/server/database/schema.sql"), "utf8")
    .then((sql) => postgresPool().query(sql))
    .then(() => undefined)
    .catch((error) => { initialized = undefined; throw error; });
  await initialized;
}

export async function query<T extends QueryResultRow>(text: string, values: unknown[] = []) {
  await initializePostgres();
  return postgresPool().query<T>(text, values);
}

export async function transaction<T>(operation: (client: PoolClient) => Promise<T>) {
  await initializePostgres();
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

