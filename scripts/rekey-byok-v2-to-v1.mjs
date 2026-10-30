#!/usr/bin/env node
/**
 * Reencripta chaves BYOK de `enc:v2:` para `enc:v1:` antes de um rollback
 * para uma versão que não conhece o envelope v2.
 *
 * Uso:
 *   node scripts/rekey-byok-v2-to-v1.mjs                 # dry-run (padrão)
 *   node scripts/rekey-byok-v2-to-v1.mjs --apply         # grava as alterações
 *
 * Requer: DATABASE_URL, AUTH_SECRET (>=32 chars) e API_KEYS_ENCRYPTION_KEY.
 * Nunca imprime plaintext. Não deve ser executado contra produção sem backup
 * verificado e autorização explícita.
 *
 * A lógica de criptografia espelha src/server/security/crypto-core.ts.
 */
import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";
import pg from "pg";

const scrypt = promisify(scryptCallback);
const { Pool } = pg;

const SALT_V1 = Buffer.from("studyai-api-key-encryption-v1", "utf8");
const SALT_V2 = Buffer.from("studyai-api-key-encryption-v2", "utf8");

const apply = process.argv.includes("--apply");
const connectionString = process.env.DATABASE_URL?.trim();
const authSecret = process.env.AUTH_SECRET;
const v2Secret = process.env.API_KEYS_ENCRYPTION_KEY;

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

if (!connectionString) fail("DATABASE_URL não configurada.");
if (!authSecret || authSecret.length < 32) fail("AUTH_SECRET ausente ou com menos de 32 caracteres.");
if (!v2Secret) fail("API_KEYS_ENCRYPTION_KEY não configurada; não há v2 para decriptar.");

const ssl = process.env.DATABASE_SSL === "false"
  ? false
  : process.env.NODE_ENV === "production"
    ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
    : undefined;

const pool = new Pool({ connectionString, max: 1, ssl, connectionTimeoutMillis: 10_000 });

async function key(salt, secret) {
  return scrypt(secret, salt, 32);
}

async function decryptV2(payload) {
  const parts = payload.split(":");
  if (parts.length !== 5 || parts[0] !== "enc" || parts[1] !== "v2") {
    throw new Error("Envelope v2 inválido.");
  }
  const decipher = createDecipheriv("aes-256-gcm", await key(SALT_V2, v2Secret), Buffer.from(parts[2], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[3], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[4], "base64url")), decipher.final()]).toString("utf8");
}

async function encryptV1(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await key(SALT_V1, authSecret), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

async function main() {
  const client = await pool.connect();
  let migrated = 0;
  let skipped = 0;
  const failures = [];

  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT user_id, provider, encrypted_key FROM user_api_keys WHERE encrypted_key LIKE 'enc:v2:%' ORDER BY user_id, provider`
    );

    console.log(`${apply ? "APLICANDO" : "DRY-RUN"}: ${rows.length} registro(s) v2 encontrados.`);

    for (const row of rows) {
      try {
        const plaintext = await decryptV2(row.encrypted_key);
        const reencrypted = await encryptV1(plaintext);
        // Garante que o novo envelope volta ao texto original antes de gravar.
        const check = await decryptV1Check(reencrypted);
        if (check !== plaintext) throw new Error("round-trip divergente");
        if (apply) {
          await client.query(
            `UPDATE user_api_keys SET encrypted_key = $1, updated_at = NOW() WHERE user_id = $2 AND provider = $3`,
            [reencrypted, row.user_id, row.provider]
          );
        }
        migrated++;
      } catch (error) {
        skipped++;
        failures.push(`${row.provider} (${row.user_id}): ${error instanceof Error ? error.message : "erro"}`);
      }
    }

    if (apply && failures.length === 0) {
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
      if (apply) console.log("Nenhuma alteração foi gravada (rollback por falhas).");
    }

    console.log(apply && failures.length > 0 ? `Registros válidos (não gravados): ${migrated}` : `Reencriptados: ${migrated}`);
    console.log(`Falhas: ${skipped}`);
    for (const failure of failures) console.error(`  - ${failure}`);
    if (!apply) console.log("Nada foi gravado (dry-run). Use --apply após backup verificado.");
    process.exitCode = failures.length === 0 ? 0 : 1;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function decryptV1Check(payload) {
  const parts = payload.split(":");
  const decipher = createDecipheriv("aes-256-gcm", await key(SALT_V1, authSecret), Buffer.from(parts[2], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[3], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[4], "base64url")), decipher.final()]).toString("utf8");
}

try {
  await main();
} catch (error) {
  console.error(`✖ Reencriptação abortada: ${error instanceof Error ? error.message : "erro desconhecido"}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
