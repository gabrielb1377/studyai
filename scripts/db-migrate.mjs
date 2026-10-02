import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL?.trim();

if (!connectionString) {
  console.error("DATABASE_URL não foi configurada; a migração foi cancelada.");
  process.exit(1);
}

const ssl = process.env.DATABASE_SSL === "false"
  ? false
  : process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
    : undefined;

const pool = new Pool({
  connectionString,
  max: 1,
  ssl,
  connectionTimeoutMillis: 10_000,
});

try {
  const schema = await readFile(path.join(process.cwd(), "src/server/database/schema.sql"), "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(schema);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  console.log("Schema PostgreSQL atualizado com sucesso.");
} catch (error) {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN";
  console.error(`Não foi possível atualizar o schema PostgreSQL (${code}).`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
