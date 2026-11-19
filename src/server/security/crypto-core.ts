import { createCipheriv, createDecipheriv, randomBytes, scrypt as scryptCallback } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const ENCRYPTION_SALT_V1 = Buffer.from("studyai-api-key-encryption-v1", "utf8");
const ENCRYPTION_SALT_V2 = Buffer.from("studyai-api-key-encryption-v2", "utf8");

export type ApiKeySecrets = {
  authSecret: string;
  apiKeysEncryptionKey?: string;
};

/**
 * Pure BYOK envelope encryption helpers.
 *
 * Kept free of server-only imports so the real v1/v2 implementation can be
 * exercised by tests. `Crypto.ts` binds these functions to the process env.
 */
async function encryptionKeyV1(authSecret: string): Promise<Buffer> {
  return scrypt(authSecret, ENCRYPTION_SALT_V1, 32) as Promise<Buffer>;
}

async function encryptionKeyV2(secrets: ApiKeySecrets): Promise<Buffer> {
  const apiKeySecret = secrets.apiKeysEncryptionKey;
  if (apiKeySecret) {
    return scrypt(apiKeySecret, ENCRYPTION_SALT_V2, 32) as Promise<Buffer>;
  }
  // Fallback to v1 key for backward compatibility during migration.
  return encryptionKeyV1(secrets.authSecret);
}

function seal(version: "v1" | "v2", key: Buffer, plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${version}:${iv.toString("base64url")}:${tag.toString("base64url")}:${ciphertext.toString("base64url")}`;
}

function open(key: Buffer, parts: string[]) {
  const iv = Buffer.from(parts[2], "base64url");
  const tag = Buffer.from(parts[3], "base64url");
  const ciphertext = Buffer.from(parts[4], "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

export async function encryptApiKey(plaintext: string, secrets: ApiKeySecrets): Promise<string> {
  if (secrets.apiKeysEncryptionKey) {
    return seal("v2", await encryptionKeyV2(secrets), plaintext);
  }
  return seal("v1", await encryptionKeyV1(secrets.authSecret), plaintext);
}

export async function decryptApiKey(payload: string, secrets: ApiKeySecrets): Promise<string> {
  const parts = payload.split(":");
  if (parts.length !== 5 || parts[0] !== "enc") throw new Error("Formato de segredo inválido.");

  if (parts[1] === "v1") {
    return open(await encryptionKeyV1(secrets.authSecret), parts);
  }

  if (parts[1] === "v2") {
    return open(await encryptionKeyV2(secrets), parts);
  }

  throw new Error(`Versão de criptografia não suportada: ${parts[1]}`);
}

export function getEncryptionVersion(payload: string): "v1" | "v2" | "unknown" {
  const parts = payload.split(":");
  if (parts.length !== 5 || parts[0] !== "enc") return "unknown";
  if (parts[1] === "v1") return "v1";
  if (parts[1] === "v2") return "v2";
  return "unknown";
}

export function isV1Encryption(payload: string): boolean {
  return getEncryptionVersion(payload) === "v1";
}

export function isV2Encryption(payload: string): boolean {
  return getEncryptionVersion(payload) === "v2";
}
